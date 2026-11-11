// Snapping and smart guides for the freeform canvas: what a box being moved or resized lines up with.
//
// Jared asked for the canvas to feel like Figma or Canva; the plan named snapping and alignment guides as
// the thing that makes it so. A dragged box's edges and centre are pulled to the page's edges and centre and
// to every other layer's edges and centres, when they come within a few screen pixels. The lines it
// snapped to come back too, so the canvas can draw them while the drag lasts.
//
// Pure: boxes in, an offset and guides out. The canvas decides the threshold (screen pixels over zoom) and
// whether snapping is on (the Canvas menu, and holding ⌘ or Ctrl while dragging to set it aside).

import { layerBox, type Box } from './freeform.ts';
import type { FreeformLayer } from './types.ts';

/** A guide to draw: a vertical line at `at` (axis x) or a horizontal one (axis y), from `from` to `to`. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** Which lines of a box take part: its two edges and its centre, on each axis. */
const xs = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
const ys = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];

/**
 * The box a layer covers on the page, rotation included: the bounds of its rotated corners. A text
 * layer's height is measured by the canvas and passed in.
 */
export function boundsOf(l: FreeformLayer, textHeight?: number): Box {
  const b = layerBox(l, textHeight);
  const angle = l.rotation ?? 0;
  if (!angle) return b;
  const a = (angle * Math.PI) / 180;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const pts = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ].map(([x, y]) => [cx + (x! - cx) * cos - (y! - cy) * sin, cy + (x! - cx) * sin + (y! - cy) * cos] as const);
  const x1 = Math.min(...pts.map((p) => p[0]));
  const y1 = Math.min(...pts.map((p) => p[1]));
  return { x: x1, y: y1, width: Math.max(...pts.map((p) => p[0])) - x1, height: Math.max(...pts.map((p) => p[1])) - y1 };
}

/** The bounds of several layers together, rotation included. */
export function boundsOfLayers(layers: FreeformLayer[], heights: Record<string, number> = {}): Box {
  const all = layers.map((l) => boundsOf(l, heights[l.id]));
  if (all.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.min(...all.map((b) => b.x));
  const y = Math.min(...all.map((b) => b.y));
  return { x, y, width: Math.max(...all.map((b) => b.x + b.width)) - x, height: Math.max(...all.map((b) => b.y + b.height)) - y };
}

/** What a box can snap to: the page's edges and centre, and every other box. */
export function snapTargets(page: { width: number; height: number }, others: Box[]): Box[] {
  return [{ x: 0, y: 0, width: page.width, height: page.height }, ...others];
}

/**
 * The nearest line on one axis, within the threshold: how far to move, and the target value. Ties go to
 * the first found, which is the page, so the page's edges and centre win over a layer's at the same place.
 */
function nearest(mine: number[], theirs: number[], threshold: number): { shift: number; at: number } | null {
  let best: { shift: number; at: number } | null = null;
  for (const t of theirs) {
    for (const m of mine) {
      const d = t - m;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.shift))) best = { shift: d, at: t };
    }
  }
  return best;
}

/** The guides for a snapped box: one line per value it now shares with a target, spanning both. */
function guidesFor(box: Box, targets: Box[], xAt: number | null, yAt: number | null): Guide[] {
  const out: Guide[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (xAt !== null) {
    let from = box.y;
    let to = box.y + box.height;
    for (const t of targets) if (xs(t).some((v) => near(v, xAt))) ((from = Math.min(from, t.y)), (to = Math.max(to, t.y + t.height)));
    out.push({ axis: 'x', at: xAt, from, to });
  }
  if (yAt !== null) {
    let from = box.x;
    let to = box.x + box.width;
    for (const t of targets) if (ys(t).some((v) => near(v, yAt))) ((from = Math.min(from, t.x)), (to = Math.max(to, t.x + t.width)));
    out.push({ axis: 'y', at: yAt, from, to });
  }
  return out;
}

/** A box being moved: the offset that lines it up with the nearest target on each axis, and the guides. */
export function snapMove(box: Box, targets: Box[], threshold: number): SnapResult {
  const theirsX = targets.flatMap(xs);
  const theirsY = targets.flatMap(ys);
  const nx = nearest(xs(box), theirsX, threshold);
  const ny = nearest(ys(box), theirsY, threshold);
  const dx = nx?.shift ?? 0;
  const dy = ny?.shift ?? 0;
  const moved = { ...box, x: box.x + dx, y: box.y + dy };
  return { dx, dy, guides: guidesFor(moved, targets, nx ? nx.at : null, ny ? ny.at : null) };
}

/**
 * A box being resized from a handle: only the edges the handle moves are pulled, so the opposite edge
 * stays where it is. `handle` is a compass point: n, ne, e, se, s, sw, w, nw.
 */
export function snapResize(box: Box, handle: string, targets: Box[], threshold: number): { box: Box; guides: Guide[] } {
  const theirsX = targets.flatMap(xs);
  const theirsY = targets.flatMap(ys);
  let { x, y, width, height } = box;
  let xAt: number | null = null;
  let yAt: number | null = null;
  if (handle.includes('e')) {
    const n = nearest([x + width], theirsX, threshold);
    if (n) ((width = Math.max(1, n.at - x)), (xAt = n.at));
  } else if (handle.includes('w')) {
    const n = nearest([x], theirsX, threshold);
    if (n) ((width = Math.max(1, x + width - n.at)), (x = n.at), (xAt = n.at));
  }
  if (handle.includes('s')) {
    const n = nearest([y + height], theirsY, threshold);
    if (n) ((height = Math.max(1, n.at - y)), (yAt = n.at));
  } else if (handle.includes('n')) {
    const n = nearest([y], theirsY, threshold);
    if (n) ((height = Math.max(1, y + height - n.at)), (y = n.at), (yAt = n.at));
  }
  const out = { x, y, width, height };
  return { box: out, guides: guidesFor(out, targets, xAt, yAt) };
}
