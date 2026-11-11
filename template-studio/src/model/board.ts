// Several frames on one canvas, as in a design tool: each frame has a place on the board, and the one being
// edited is drawn live while the rest are drawn as they are.
//
// Jared asked for "multiple frames on the canvas", the Figma board way: frames sit where they are put, are
// dragged by their names, and a click on one edits it. Places are kept on the frame's entry in the index
// (frame-store.ts). A frame that has none yet, an old one or a new one, goes to the right of the others.
//
// Pure: frames and sizes in, places out.

export interface BoardFrame {
  key: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface Placed {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The space between frames set down by the board. */
export const BOARD_GAP = 80;

/** Every frame with a place: its own, or the next one along the row, to the right of what is there. */
export function placeOnBoard(frames: BoardFrame[], gap = BOARD_GAP): Placed[] {
  const placed = frames.filter((f) => f.x !== undefined && f.y !== undefined) as Placed[];
  let right = placed.length ? Math.max(...placed.map((f) => f.x + f.width)) + gap : 0;
  const top = placed.length ? Math.min(...placed.map((f) => f.y)) : 0;
  return frames.map((f) => {
    if (f.x !== undefined && f.y !== undefined) return { key: f.key, x: f.x, y: f.y, width: f.width, height: f.height };
    const at = { key: f.key, x: right, y: top, width: f.width, height: f.height };
    right += f.width + gap;
    return at;
  });
}

/** The frame under a point on the board, topmost (last) first. */
export function frameAt(frames: Placed[], p: { x: number; y: number }): Placed | null {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i]!;
    if (p.x >= f.x && p.x <= f.x + f.width && p.y >= f.y && p.y <= f.y + f.height) return f;
  }
  return null;
}

/** The box around every frame, for fitting the whole board in view. */
export function boardBounds(frames: Placed[]): { x: number; y: number; width: number; height: number } | null {
  if (frames.length === 0) return null;
  const x = Math.min(...frames.map((f) => f.x));
  const y = Math.min(...frames.map((f) => f.y));
  return { x, y, width: Math.max(...frames.map((f) => f.x + f.width)) - x, height: Math.max(...frames.map((f) => f.y + f.height)) - y };
}

/**
 * The view that keeps the board still on screen when another frame becomes the one edited. The canvas draws the
 * edited frame at its own origin, so the view moves by however far the frames are apart.
 */
export function viewAcross(view: { z: number; x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) {
  return { z: view.z, x: view.x + (to.x - from.x) * view.z, y: view.y + (to.y - from.y) * view.z };
}
