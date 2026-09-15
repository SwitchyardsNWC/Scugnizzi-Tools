// Quick shapes: hold the pen still at the end of a stroke and it snaps to what it was trying to be.
//
// Procreate calls this QuickShape. A freehand loop that is really a rectangle, an ellipse or a
// triangle, or a wobbly line, is recognised and replaced by the clean shape, at the tilt it was
// drawn. Anything the classifier is not sure about stays freehand, which is the right failure: a
// scribble should never turn into a box.
//
// The classifier follows Canvas Kit by yaye.work (github.com/yaye-work/canvas-kit, MIT), adapted to
// this canvas's flat point lists and its rotated rectangle and ellipse layers. The ideas that carry
// the weight: the minimum-area *rotated* bounding box, so a tilted rectangle still reads as one; the
// radial spread and the edge hug, which tell a rectangle from an ellipse where the area ratio alone
// cannot; and corner counting on a resampled loop for the triangle.
//
// Pure. Points are surface coordinates as x,y pairs, the way path layers keep them.

export type QuickShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'rect' | 'ellipse'; x: number; y: number; width: number; height: number; rotation: number }
  /** Three corners, as x,y pairs, closed by repeating the first. */
  | { kind: 'triangle'; points: number[] };

/** How long the pen must sit still before lifting to trigger a snap. */
export const QUICK_SHAPE_HOLD_MS = 160;
/** Screen pixels of wobble allowed while "holding still": a hand on glass jitters more than it feels. */
export const QUICK_SHAPE_JITTER_PX = 10;

type XY = [number, number];

const toPairs = (points: number[]): XY[] => {
  const out: XY[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push([points[i]!, points[i + 1]!]);
  return out;
};

/** Uniform arc-length resample of a closed loop (the closing segment counts). */
function resampleClosed(pts: XY[], n: number): XY[] {
  const src: XY[] = [...pts, pts[0]!];
  const cum = [0];
  for (let i = 1; i < src.length; i++) cum.push(cum[i - 1]! + Math.hypot(src[i]![0] - src[i - 1]![0], src[i]![1] - src[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  const out: XY[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * total;
    while (j < src.length - 2 && cum[j + 1]! < d) j++;
    const t = (d - cum[j]!) / Math.max(1e-9, cum[j + 1]! - cum[j]!);
    out.push([src[j]![0] + (src[j + 1]![0] - src[j]![0]) * t, src[j]![1] + (src[j + 1]![1] - src[j]![1]) * t]);
  }
  return out;
}

/**
 * Sharp turning-angle peaks on the resampled loop: the physical corners. When there are exactly three
 * and their triangle covers about the stroke's own area (a circle with three noise spikes triangulates
 * to only ~0.4 of its area), the corners come back too, in stroke order.
 */
function strokeCorners(pts: XY[], area: number): { count: number; tri: XY[] | null } {
  const N = 128;
  // Turning measured over ±K samples: a circle's base turn at this window is 2π·2K/N ≈ 0.49 rad,
  // safely under the 0.7 corner threshold.
  const K = 5;
  const rs = resampleClosed(pts, N);
  const turn: number[] = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const p0 = rs[(i - K + N) % N]!;
    const p1 = rs[i]!;
    const p2 = rs[(i + K) % N]!;
    const a1 = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    turn[i] = Math.abs(d);
  }
  // Strongest corners first, each suppressing an N/8 neighbourhood so one corner counts once.
  const byStrength = [...turn.keys()].sort((x, y) => turn[y]! - turn[x]!);
  const picked: number[] = [];
  const minSep = N / 8;
  for (const i of byStrength) {
    if (turn[i]! < 0.7) break;
    if (picked.every((p) => Math.min(Math.abs(p - i), N - Math.abs(p - i)) > minSep)) picked.push(i);
  }
  if (picked.length !== 3) return { count: picked.length, tri: null };
  picked.sort((x, y) => x - y);
  const tri = picked.map((i) => rs[i]!);
  let area2 = 0;
  for (let i = 0; i < 3; i++) {
    const [x1, y1] = tri[i]!;
    const [x2, y2] = tri[(i + 1) % 3]!;
    area2 += x1 * y2 - x2 * y1;
  }
  const triArea = Math.abs(area2) / 2;
  if (triArea < 0.72 * area || triArea > 1.35 * area) return { count: 3, tri: null };
  return { count: 3, tri };
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * What a freehand stroke was trying to be: a line, a triangle, an ellipse or a rectangle, at the angle
 * it was drawn; or null when it does not confidently match any of them.
 */
export function quickShape(points: number[]): QuickShape | null {
  const raw = toPairs(points);
  if (raw.length < 8) return null;
  // Drop the dwell tail: points bunched where the pen sat still would skew the fits.
  const pts = raw.slice();
  while (pts.length > 8 && Math.hypot(pts[pts.length - 1]![0] - pts[pts.length - 2]![0], pts[pts.length - 1]![1] - pts[pts.length - 2]![1]) < 0.5) pts.pop();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (Math.hypot(maxX - minX, maxY - minY) < 24) return null; // too small to mean anything

  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) pathLen += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  if (pathLen <= 0) return null;
  const [sx, sy] = pts[0]!;
  const [ex, ey] = pts[pts.length - 1]!;
  const chord = Math.hypot(ex - sx, ey - sy);

  // --- a line: barely any detour, every point near the start-to-end chord ---
  if (chord / pathLen > 0.9) {
    let maxDev = 0;
    for (const [x, y] of pts) maxDev = Math.max(maxDev, Math.abs((ey - sy) * x - (ex - sx) * y + ex * sy - ey * sx) / chord);
    if (maxDev / chord >= 0.08) return null;
    // Within four degrees of level or upright, it meant to be.
    const angle = Math.atan2(ey - sy, ex - sx);
    const near = (a: number) => Math.abs(Math.abs(angle) - a) < (4 * Math.PI) / 180;
    if (near(0) || near(Math.PI)) return { kind: 'line', x1: round(sx), y1: round(sy), x2: round(ex), y2: round(sy) };
    if (near(Math.PI / 2)) return { kind: 'line', x1: round(sx), y1: round(sy), x2: round(sx), y2: round(ey) };
    return { kind: 'line', x1: round(sx), y1: round(sy), x2: round(ex), y2: round(ey) };
  }

  // --- a closed loop? It came back near where it started. ---
  if (chord > 0.25 * pathLen) return null;

  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    area2 += x1 * y2 - x2 * y1;
  }
  const area = Math.abs(area2) / 2;

  // --- a triangle: three sharp corners joined by straight-ish sides ---
  const { count: cornerPeaks, tri } = strokeCorners(pts, area);
  if (cornerPeaks >= 5) return null; // a pentagon or more stays freehand
  if (tri) return { kind: 'triangle', points: [...tri, tri[0]!].flatMap(([x, y]) => [round(x), round(y)]) };

  // The minimum-area rotated bounding box, brute-forced in 2° steps. Against its own minimum box a
  // rectangle covers about all of the area and an ellipse π/4 ≈ 0.785, at any tilt; the axis-aligned
  // box misses tilted rectangles, which a 10° tilt already drops into ellipse range.
  let bestArea = Infinity;
  let bestTheta = 0;
  let bU = 0;
  let bV = 0;
  let bMinU = 0;
  let bMinV = 0;
  for (let deg = 0; deg < 90; deg += 2) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    let mnU = Infinity;
    let mxU = -Infinity;
    let mnV = Infinity;
    let mxV = -Infinity;
    for (const [x, y] of pts) {
      const u = x * c + y * s;
      const v = -x * s + y * c;
      mnU = Math.min(mnU, u);
      mxU = Math.max(mxU, u);
      mnV = Math.min(mnV, v);
      mxV = Math.max(mxV, v);
    }
    const boxArea = (mxU - mnU) * (mxV - mnV);
    if (boxArea < bestArea) {
      bestArea = boxArea;
      bestTheta = t;
      bU = (mxU - mnU) / 2;
      bV = (mxV - mnV) / 2;
      bMinU = mnU;
      bMinV = mnV;
    }
  }
  if (bestArea <= 0) return null;
  const areaRatio = area / bestArea;
  if (areaRatio < 0.62) return null; // too hollow to be a rectangle or an ellipse
  const cos = Math.cos(bestTheta);
  const sin = Math.sin(bestTheta);
  const cu = bMinU + bU;
  const cv = bMinV + bV;
  const a = Math.max(1e-6, bU);
  const b = Math.max(1e-6, bV);

  // Radial spread in the box frame: an ellipse's points sit at a near-constant normalised radius; a
  // rectangle's corners spike to ~1.41 while its edge midpoints sit at 1. Blobs scatter wider still.
  const rr = pts.map(([x, y]) => Math.hypot((x * cos + y * sin - cu) / a, (-x * sin + y * cos - cv) / b));
  const mean = rr.reduce((s, r) => s + r, 0) / rr.length;
  const spread = Math.sqrt(rr.reduce((s, r) => s + (r - mean) * (r - mean), 0) / rr.length) / mean;

  // Edge hug: how far each point sits from the nearest box edge, normalised. A rectangle rides the
  // edges the whole way; an ellipse pulls away between its four touch points. The whole stroke votes,
  // so one wobbly bulge cannot flip the verdict.
  let edgeGap = 0;
  for (const [x, y] of pts) {
    const nu = Math.abs((x * cos + y * sin - cu) / a);
    const nv = Math.abs((-x * sin + y * cos - cv) / b);
    edgeGap += 1 - Math.min(1, Math.max(nu, nv));
  }
  edgeGap /= pts.length;

  const isEllipse = cornerPeaks < 4 && spread < 0.12 && edgeGap > 0.065 && areaRatio < 0.88;
  const isRect = !isEllipse && edgeGap < 0.055 && areaRatio > 0.72;
  if (!isEllipse && !isRect) return null;

  // The box as a layer: its centre in world coordinates, its size, and its tilt. A tilt past 45° is
  // the same box turned the other way with its sides swapped, and one under 3° was meant to be level.
  const cx = cu * cos - cv * sin;
  const cy = cu * sin + cv * cos;
  let width = 2 * bU;
  let height = 2 * bV;
  let rotation = (bestTheta * 180) / Math.PI;
  if (rotation > 45) {
    rotation -= 90;
    [width, height] = [height, width];
  }
  if (Math.abs(rotation) < 3) rotation = 0;
  // A circle has no angle: its minimum box is the same size at every tilt, and the one found is noise.
  if (isEllipse && Math.abs(width - height) / Math.max(width, height) < 0.12) rotation = 0;
  return { kind: isEllipse ? 'ellipse' : 'rect', x: round(cx - width / 2), y: round(cy - height / 2), width: round(width), height: round(height), rotation: Math.round(rotation) };
}
