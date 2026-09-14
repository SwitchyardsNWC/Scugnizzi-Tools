// Constants, easing, geometry and the small pure helpers the surface draws with.

import { siteOf } from '../../model/edit.ts';
import { groupOfKey, membersOf } from '../../model/freeform.ts';
import type { FreeformBlock, FreeformLayer, Template } from '../../model/types.ts';
import type { Point } from './types.ts';

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

/** The id of the last layer of a freeform block in a template — the one just added. */
export function lastLayerId(template: Template, blockId: string): string | null {
  const s = siteOf(template, blockId);
  const b = s?.column.blocks[s.index];
  if (!b || b.type !== 'freeform') return null;
  return b.layers[b.layers.length - 1]?.id ?? null;
}
