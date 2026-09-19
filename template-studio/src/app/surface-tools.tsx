// The surface's own vocabulary: its tools and their glyphs, the shapes of a drag, the constants of its
// geometry and motion, and the small pure helpers the canvas draws with. Moved out of Surface.tsx as they
// were (learnings 3.78); nothing here reads state.

import type { JSX } from 'preact';
import { groupOfKey, membersOf, type Box } from '../model/freeform.ts';
import type { QuickShape } from '../model/quick-shape.ts';
import type { PanTracker } from './inertia.ts';
import type { FreeformBlock, FreeformLayer } from '../model/types.ts';

export type Tool = 'select' | 'hand' | 'sticky' | 'rect' | 'ellipse' | 'line' | 'pen' | 'eraser' | 'text' | 'stamp';
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
/** `start` is the page sitting on the block; `enter` is the flight out; `exit` the flight home. */
export type Phase = 'start' | 'enter' | 'idle' | 'exit';
export type Point = { x: number; y: number };

export interface View {
  x: number;
  y: number;
  z: number;
}

export type Drag =
  | { kind: 'pan'; x: number; y: number; view: View; tracker: PanTracker }
  | { kind: 'move'; layers: FreeformLayer[]; x: number; y: number; moved: boolean }
  | { kind: 'resizeMany'; layers: FreeformLayer[]; handle: Handle; box: Box; x: number; y: number }
  | { kind: 'resize'; layer: FreeformLayer; handle: Handle; box: Box; x: number; y: number }
  | { kind: 'endpoint'; layer: FreeformLayer; which: 1 | 2 }
  | { kind: 'rotate'; layer: FreeformLayer; centre: Point }
  | { kind: 'create'; tool: 'rect' | 'ellipse' | 'line'; from: Point; to: Point }
  /** `still` is where the pen last stopped moving and since when; `snapped` the shape it would become if lifted now. */
  | { kind: 'pen'; points: number[]; still: { x: number; y: number; since: number } | null; snapped: QuickShape | null }
  | { kind: 'erase'; last: Point; session: string }
  | { kind: 'page'; axis: 'x' | 'y' | 'both'; width: number; height: number; x: number; y: number };

export const glyph = (...children: JSX.Element[]) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const TOOLS: Array<{ tool: Tool; label: string; key: string; help: string; icon: () => JSX.Element }> = [
  { tool: 'select', label: 'Select', key: 'V', help: 'Pick, move, resize and rotate.', icon: () => glyph(<path key="a" d="M6 3.5l12.5 7.2-5.6 1.4-2.6 5.4z" />) },
  {
    tool: 'hand',
    label: 'Hand',
    key: 'H',
    help: 'Drag to look around. Holding Space does the same with any tool.',
    icon: () =>
      glyph(
        <path key="a" d="M8.5 12.5V6.8a1.4 1.4 0 012.8 0v4.7" />,
        <path key="b" d="M11.3 11.2V5.4a1.4 1.4 0 012.8 0v5.8" />,
        <path key="c" d="M14.1 11.2V7a1.4 1.4 0 012.8 0v6.6a6 6 0 01-6 6h-.6a5.8 5.8 0 01-4.6-2.3l-2.3-3a1.4 1.4 0 012.1-1.8l1.7 1.7" />,
      ),
  },
  { tool: 'sticky', label: 'Sticky note', key: 'S', help: 'Click to drop a note, then type.', icon: () => glyph(<path key="a" d="M5 4.5h14v9.8L14.3 19.5H5z" />, <path key="b" d="M14 19.3v-5h5" />) },
  { tool: 'rect', label: 'Box', key: 'R', help: 'Drag out a box. Shift for a square.', icon: () => glyph(<rect key="a" x="4" y="6" width="16" height="12" rx="2.5" />) },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', help: 'Drag out an ellipse. Shift for a circle.', icon: () => glyph(<ellipse key="a" cx="12" cy="12" rx="8.2" ry="6.2" />) },
  { tool: 'line', label: 'Line', key: 'L', help: 'Drag from one end to the other.', icon: () => glyph(<path key="a" d="M5 19L19 5" />) },
  {
    tool: 'pen',
    label: 'Draw',
    key: 'P',
    help: 'Draw freehand with a pen, marker, highlighter or brush — pick one in the tray. Hold still at the end of a stroke and it snaps to a line, box, circle or triangle.',
    icon: () => glyph(<path key="a" d="M4.5 19.5l1-4L15.8 5.2a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L8.5 18.5z" />, <path key="b" d="M13.5 7.5l3 3" />),
  },
  {
    tool: 'eraser',
    label: 'Eraser',
    key: 'X',
    help: 'Rub out strokes. Cross a stroke in the middle and it becomes two.',
    icon: () =>
      glyph(
        <path key="a" d="M4.8 14.9l8.9-8.9a2 2 0 012.8 0l2.5 2.5a2 2 0 010 2.8L11.9 19.5H9.4z" />,
        <path key="b" d="M9 10.7l5.3 5.3" />,
        <path key="c" d="M12.5 19.5h7" />,
      ),
  },
  { tool: 'text', label: 'Text', key: 'T', help: 'Click to place words in the heading role.', icon: () => glyph(<path key="a" d="M6 6.5h12M12 6.5v12M9.5 18.5h5" />) },
  {
    tool: 'stamp',
    label: 'Stamp',
    key: 'E',
    help: 'Brand marks. Pick one from the tray and click to stamp, as many as you like.',
    icon: () => glyph(<circle key="a" cx="12" cy="9" r="4.6" />, <path key="b" d="M9.5 13.2L9 16.5h6l-.5-3.3" />, <path key="c" d="M6 19.5h12" />),
  },
];

/** With a pencil about, a finger on these tools pans instead of drawing: the pencil draws, the hand moves the page. */
export const DRAW_TOOLS = new Set<Tool>(['pen', 'eraser', 'rect', 'ellipse', 'line', 'text', 'sticky', 'stamp']);

export const POP: Keyframe[] = [{ scale: '0.2', opacity: 0 }, { scale: '1.14', opacity: 1, offset: 0.6 }, { scale: '0.97', offset: 0.82 }, { scale: '1', opacity: 1 }];
export const POOF: Keyframe[] = [{ scale: '1', opacity: 1 }, { scale: '1.12', opacity: 1, offset: 0.35 }, { scale: '0', opacity: 0 }];

/** What is picked: one layer, or a group (`group:<id>`) of more than one. */
export function selectionOf(block: FreeformBlock, key: string | null): { layers: FreeformLayer[]; group: string | null } | null {
  if (!key) return null;
  const gid = groupOfKey(key);
  if (gid) {
    const members = membersOf(block, gid);
    return members.length ? { layers: members, group: gid } : null;
  }
  const one = block.layers.find((l) => l.id === key);
  return one ? { layers: [one], group: null } : null;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const HANDLE = 9;
export const ACCENT = '#7b61ff';
/** The width the docked layers panel takes from the canvas, margins included. */
export const PANEL_ROOM = 300;
/** The eraser's radius on screen, whatever the zoom. */
export const ERASER = 11;

export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;
/** A little overshoot, so a flight lands rather than stops. */
export const easeOutBack = (t: number) => {
  const c1 = 1.18;
  return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function rotatePoint(p: Point, c: Point, angle: number): Point {
  const a = rad(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** A layer's own fields, for a patch: everything but the id and the kind. */
export function fields(l: FreeformLayer): Record<string, unknown> {
  const { id: _id, kind: _kind, ...rest } = l as unknown as { id: string; kind: string } & Record<string, unknown>;
  void _id;
  void _kind;
  return rest;
}


export const pairs = (points: number[]) => {
  const out: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push(`${points[i]},${points[i + 1]}`);
  return out.join(' ');
};

export function ghostShape(g: { tool: 'rect' | 'ellipse' | 'line'; from: Point; to: Point }) {
  const x = Math.min(g.from.x, g.to.x);
  const y = Math.min(g.from.y, g.to.y);
  const w = Math.abs(g.to.x - g.from.x);
  const h = Math.abs(g.to.y - g.from.y);
  if (g.tool === 'line') return <line x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y} stroke={ACCENT} stroke-width={2.5} stroke-linecap="round" />;
  const paint = { fill: 'rgba(123,97,255,0.1)', stroke: ACCENT, 'stroke-width': 2 };
  if (g.tool === 'ellipse') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...paint} />;
  return <rect x={x} y={y} width={w} height={h} rx={3} {...paint} />;
}

/** The shape a held stroke will become when the pen lifts, drawn dashed in the accent over the stroke. */
export function snappedGhost(s: QuickShape) {
  const paint = { fill: 'none', stroke: ACCENT, 'stroke-width': 2.5, 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const, 'stroke-dasharray': '7 5' };
  if (s.kind === 'line') return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...paint} />;
  if (s.kind === 'triangle') return <polyline points={pairs(s.points)} {...paint} />;
  const transform = s.rotation ? `rotate(${s.rotation} ${s.x + s.width / 2} ${s.y + s.height / 2})` : undefined;
  if (s.kind === 'ellipse') return <ellipse cx={s.x + s.width / 2} cy={s.y + s.height / 2} rx={s.width / 2} ry={s.height / 2} transform={transform} {...paint} />;
  return <rect x={s.x} y={s.y} width={s.width} height={s.height} transform={transform} {...paint} />;
}
