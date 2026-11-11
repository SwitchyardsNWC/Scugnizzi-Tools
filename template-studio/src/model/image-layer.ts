// Pictures on the freeform canvas, placed the way a layout tool places them: a frame, and the picture inside
// it filled, fitted or stretched, zoomed, and kept on a focal point when cropped; with rounded corners or cut
// to an ellipse.
//
// Jared asked for "crop and mask inside a shape, fill or fit, rounded corners, focal point". Pure geometry:
// the renderer draws from it and the canvas's crop drag moves the focus with it.

import type { FreeformLayer } from './types.ts';

export type ImageLayer = Extract<FreeformLayer, { kind: 'image' }>;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const MAX_ZOOM = 5;

/** Whether the picture is placed by the frame alone (nothing to crop, no natural size), as images always were. */
export function isPlainImage(l: ImageLayer): boolean {
  return !l.natural && (l.fit ?? 'fill') === 'fill' && l.focusX === undefined && l.focusY === undefined && (l.zoom ?? 1) === 1;
}

/**
 * Where the whole picture is drawn, which the frame then clips: its size from `fit` and `zoom`, its place so the
 * focal point stays put as it overflows. Null when the picture's own size is not known.
 */
export function imagePlacement(l: ImageLayer): { x: number; y: number; width: number; height: number } | null {
  const n = l.natural;
  if (!n || n.width <= 0 || n.height <= 0) return null;
  const W = Math.max(1, l.width);
  const H = Math.max(1, l.height);
  const fit = l.fit ?? 'fill';
  if (fit === 'stretch') return { x: l.x, y: l.y, width: W, height: H };
  const base = fit === 'fit' ? Math.min(W / n.width, H / n.height) : Math.max(W / n.width, H / n.height);
  const s = base * Math.max(1, Math.min(MAX_ZOOM, l.zoom ?? 1));
  const dw = n.width * s;
  const dh = n.height * s;
  const fx = clamp01(l.focusX ?? 0.5);
  const fy = clamp01(l.focusY ?? 0.5);
  return { x: l.x - (dw - W) * fx, y: l.y - (dh - H) * fy, width: dw, height: dh };
}

/**
 * The focal point after the picture is dragged by (dx, dy) inside its frame, as in a crop. Dragging right shows
 * more of the left, so the focus moves the other way, by the share of the overflow the drag covers.
 */
export function focusAfterDrag(l: ImageLayer, start: { x: number; y: number }, dx: number, dy: number): { focusX: number; focusY: number } {
  const p = imagePlacement(l);
  if (!p) return { focusX: start.x, focusY: start.y };
  const ox = p.width - l.width;
  const oy = p.height - l.height;
  return {
    focusX: Math.abs(ox) > 0.5 ? Math.round(clamp01(start.x - dx / ox) * 1000) / 1000 : start.x,
    focusY: Math.abs(oy) > 0.5 ? Math.round(clamp01(start.y - dy / oy) * 1000) / 1000 : start.y,
  };
}

/** The frame resized to the picture's own shape at its current width, as "fit frame to picture" does. */
export function frameToPicture(l: ImageLayer): ImageLayer {
  const n = l.natural;
  if (!n || n.width <= 0) return l;
  return { ...l, height: Math.round((l.width * n.height) / n.width), fit: 'fill', zoom: undefined, focusX: undefined, focusY: undefined };
}
