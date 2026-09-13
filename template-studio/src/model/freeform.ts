// The freeform block's recipe: what a layer is, how one changes, and the hash that says whether the
// picture the email carries is the picture the recipe describes.
//
// Pure and DOM-free like the rest of the model. Drawing the recipe is the compiler's
// (compile/freeform.ts); turning the drawing into pixels is the app's (rasterise.ts).

import type { ColorRef } from './design-system.ts';
import type { Align } from './types.ts';
import type { Block, BrandBlock, FreeformBlock, FreeformLayer, Template } from './types.ts';
import { MARKS, markOf } from './marks.ts';

export type LayerKind = FreeformLayer['kind'];

/**
 * A short, stable hash of everything that decides the picture. Not cryptographic — it only has to
 * change when the recipe does, and be the same for the same recipe on every machine.
 */
export function recipeHash(block: FreeformBlock): string {
  return hashOf(JSON.stringify({ w: block.width, h: block.height, bg: block.background, layers: block.layers }));
}

/** What decides a brand block's picture: the mark, its width and its colour. */
export function markHash(block: BrandBlock): string {
  return hashOf(JSON.stringify({ mark: block.mark, w: block.width, color: block.color }));
}

/** The hash a picture block's rendering is compared against, whichever kind it is. */
export function pictureHash(block: FreeformBlock | BrandBlock): string {
  return block.type === 'brand' ? markHash(block) : recipeHash(block);
}

/** The picture the block carries was made from the recipe it has now. */
export function isRendered(block: FreeformBlock | BrandBlock): boolean {
  return Boolean(block.src) && block.renderedHash === pictureHash(block);
}

function hashOf(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The next layer id in a block: readable, unique within the block, which is all it has to be. */
export function newLayerId(block: FreeformBlock): string {
  const used = new Set(block.layers.map((l) => l.id));
  let n = block.layers.length + 1;
  while (used.has(`l${n}`)) n += 1;
  return `l${n}`;
}

/**
 * A new layer of a kind, placed where it will be seen: inset from the corner, a sensible size for
 * the surface, and one step further in than the last layer of the same kind so two do not land on
 * top of each other.
 */
export function defaultLayer(kind: LayerKind, block: FreeformBlock): FreeformLayer {
  const id = newLayerId(block);
  const same = block.layers.filter((l) => l.kind === kind).length;
  const step = (same % 6) * 16;
  const x = 24 + step;
  const y = 24 + step;
  const w = Math.max(40, Math.round(block.width * 0.5));
  const h = Math.max(24, Math.round(block.height * 0.4));
  switch (kind) {
    case 'text':
      return { kind, id, text: 'Text', role: 'h2', color: null, x, y, width: Math.max(80, block.width - x - 24), align: 'left' as Align };
    case 'image':
      return { kind, id, src: '', x, y, width: w, height: h, opacity: 1 };
    case 'rect':
      return { kind, id, x, y, width: w, height: h, fill: null, stroke: null, strokeWidth: 2, radius: 0 };
    case 'ellipse':
      return { kind, id, x, y, width: w, height: h, fill: null, stroke: null, strokeWidth: 2 };
    case 'line':
      return { kind, id, x1: x, y1: y, x2: x + w, y2: y + h, stroke: null, strokeWidth: 3 };
    case 'path':
      return { kind, id, points: [], stroke: null, strokeWidth: 3 };
    case 'sticky':
      return { kind, id, text: '', role: 'body', color: null, fill: STICKY_COLORS[0]!, x, y, width: 180, height: 180 };
    case 'mark': {
      const m = MARKS[0]!;
      return { kind, id, mark: m.key, color: null, x, y, width: 96, height: Math.round(96 / m.ratio) };
    }
  }
}

/** Applies a change to one freeform block, wherever it is. Anything else is left alone. */
export function withFreeform(template: Template, blockId: string, fn: (block: FreeformBlock) => FreeformBlock): Template {
  let touched = false;
  const map = (block: Block): Block => {
    if (block.id !== blockId || block.type !== 'freeform') return block;
    const next = fn(block);
    touched = next !== block;
    return next;
  };
  const next: Template = {
    ...template,
    sections: template.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({ ...r, columns: r.columns.map((c) => ({ ...c, blocks: c.blocks.map(map) })) })),
    })),
  };
  return touched ? next : template;
}

export function addLayer(template: Template, blockId: string, kind: LayerKind): Template {
  return withFreeform(template, blockId, (block) => ({ ...block, layers: [...block.layers, defaultLayer(kind, block)] }));
}

export function updateLayer(template: Template, blockId: string, layerId: string, patch: Record<string, unknown>): Template {
  return withFreeform(template, blockId, (block) => ({
    ...block,
    layers: block.layers.map((l) => (l.id === layerId ? ({ ...l, ...patch } as FreeformLayer) : l)),
  }));
}

export function removeLayer(template: Template, blockId: string, layerId: string): Template {
  return withFreeform(template, blockId, (block) => ({ ...block, layers: block.layers.filter((l) => l.id !== layerId) }));
}

/** Moves a layer up or down the stack. Positive is towards the top — drawn later, over the rest. */
export function reorderLayer(template: Template, blockId: string, layerId: string, delta: number): Template {
  return withFreeform(template, blockId, (block) => {
    const from = block.layers.findIndex((l) => l.id === layerId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= block.layers.length) return block;
    const layers = [...block.layers];
    const [moved] = layers.splice(from, 1);
    layers.splice(to, 0, moved!);
    return { ...block, layers };
  });
}

/** A layer moved by a distance, whatever its kind: every point it has moves together. */
export function translateLayer(l: FreeformLayer, dx: number, dy: number): FreeformLayer {
  const r = (n: number) => Math.round(n * 10) / 10;
  switch (l.kind) {
    case 'line':
      return { ...l, x1: r(l.x1 + dx), y1: r(l.y1 + dy), x2: r(l.x2 + dx), y2: r(l.y2 + dy) };
    case 'path':
      return { ...l, points: l.points.map((v, i) => r(v + (i % 2 === 0 ? dx : dy))) };
    default:
      return { ...l, x: r(l.x + dx), y: r(l.y + dy) };
  }
}

/** Shifts a layer by a distance, whatever its kind: every point it has moves together. */
export function nudgeLayer(template: Template, blockId: string, layerId: string, dx: number, dy: number): Template {
  return withFreeform(template, blockId, (block) => ({
    ...block,
    layers: block.layers.map((l): FreeformLayer => (l.id === layerId ? translateLayer(l, dx, dy) : l)),
  }));
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The box a layer occupies before rotation. A text layer's height is not in the recipe — it is
 * however tall the words wrap to — so the editor measures it and passes it in; without it the
 * text is taken as one line of its role.
 */
export function layerBox(l: FreeformLayer, textHeight?: number): Box {
  switch (l.kind) {
    case 'text':
      return { x: l.x, y: l.y, width: l.width, height: Math.max(8, textHeight ?? 24) };
    case 'line':
      return { x: Math.min(l.x1, l.x2), y: Math.min(l.y1, l.y2), width: Math.max(1, Math.abs(l.x2 - l.x1)), height: Math.max(1, Math.abs(l.y2 - l.y1)) };
    case 'path': {
      const xs = l.points.filter((_, i) => i % 2 === 0);
      const ys = l.points.filter((_, i) => i % 2 === 1);
      if (xs.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
    }
    default:
      return { x: l.x, y: l.y, width: l.width, height: l.height };
  }
}

/**
 * The same layer fitted to a new box: shapes and images take it directly, text takes its left
 * edge and width, a line and a stroke are scaled into it point by point. Rotation is untouched —
 * the box is the unrotated one, which is what the editor's handles work in.
 */
export function withLayerBox(l: FreeformLayer, box: Box): FreeformLayer {
  const r = (n: number) => Math.round(n * 10) / 10;
  const from = layerBox(l);
  const sx = from.width > 0 ? box.width / from.width : 1;
  const sy = from.height > 0 ? box.height / from.height : 1;
  switch (l.kind) {
    case 'text':
      return { ...l, x: r(box.x), y: r(box.y), width: r(Math.max(10, box.width)) };
    case 'line':
      return {
        ...l,
        x1: r(box.x + (l.x1 - from.x) * sx),
        y1: r(box.y + (l.y1 - from.y) * sy),
        x2: r(box.x + (l.x2 - from.x) * sx),
        y2: r(box.y + (l.y2 - from.y) * sy),
      };
    case 'path':
      return { ...l, points: l.points.map((v, i) => r(i % 2 === 0 ? box.x + (v - from.x) * sx : box.y + (v - from.y) * sy)) };
    default:
      return { ...l, x: r(box.x), y: r(box.y), width: r(Math.max(1, box.width)), height: r(Math.max(1, box.height)) };
  }
}

/** A copy of a layer, a step down and right, on top of the stack. */
export function duplicateLayer(template: Template, blockId: string, layerId: string): Template {
  return withFreeform(template, blockId, (block) => {
    const source = block.layers.find((l) => l.id === layerId);
    if (!source) return block;
    return { ...block, layers: [...block.layers, { ...translateLayer(source, 16, 16), id: newLayerId(block) }] };
  });
}

/** A picture from the folder, dropped at a point: fitted to at most half the surface, centred on the drop. */
export function addImageLayerAt(template: Template, blockId: string, src: string, natural: { width: number; height: number }, at: { x: number; y: number } | null): Template {
  return withFreeform(template, blockId, (block) => {
    const max = Math.max(40, block.width / 2);
    const scale = Math.min(1, max / Math.max(1, natural.width), Math.max(40, block.height) / Math.max(1, natural.height));
    const width = Math.round(natural.width * scale);
    const height = Math.round(natural.height * scale);
    const centre = at ?? { x: block.width / 2, y: block.height / 2 };
    return {
      ...block,
      layers: [...block.layers, { kind: 'image', id: newLayerId(block), src, x: Math.round(centre.x - width / 2), y: Math.round(centre.y - height / 2), width, height, opacity: 1 }],
    };
  });
}

/** A shape drawn out by dragging: a rectangle, an ellipse or a line, from one corner to the other. */
export function addShapeAt(template: Template, blockId: string, kind: 'rect' | 'ellipse' | 'line', from: { x: number; y: number }, to: { x: number; y: number }, color: ColorRef = null): Template {
  return withFreeform(template, blockId, (block) => {
    const id = newLayerId(block);
    const r = (n: number) => Math.round(n);
    if (kind === 'line') {
      return { ...block, layers: [...block.layers, { kind, id, x1: r(from.x), y1: r(from.y), x2: r(to.x), y2: r(to.y), stroke: color, strokeWidth: 3 }] };
    }
    const x = r(Math.min(from.x, to.x));
    const y = r(Math.min(from.y, to.y));
    const width = Math.max(4, r(Math.abs(to.x - from.x)));
    const height = Math.max(4, r(Math.abs(to.y - from.y)));
    const shape: FreeformLayer =
      kind === 'rect'
        ? { kind, id, x, y, width, height, fill: color, stroke: null, strokeWidth: 2, radius: 0 }
        : { kind, id, x, y, width, height, fill: color, stroke: null, strokeWidth: 2 };
    return { ...block, layers: [...block.layers, shape] };
  });
}

/** A text layer at a point, in the heading role, ready to be typed into. */
export function addTextAt(template: Template, blockId: string, at: { x: number; y: number }, color: ColorRef = null, look?: string): Template {
  return withFreeform(template, blockId, (block) => ({
    ...block,
    layers: [...block.layers, { kind: 'text', id: newLayerId(block), text: 'Text', role: 'h2', color, x: Math.round(at.x), y: Math.round(at.y), width: Math.max(80, Math.round(block.width - at.x - 16)), align: 'left', ...(look ? { look } : {}) }],
  }));
}

/** A freehand stroke, as drawn: pairs of x and y in the surface's pixels. Fewer than two points is nothing. */
export function drawPath(template: Template, blockId: string, points: number[], stroke: ColorRef, strokeWidth: number, group?: string): Template {
  if (points.length < 4) return template;
  return withFreeform(template, blockId, (block) => ({
    ...block,
    layers: [...block.layers, { kind: 'path', id: newLayerId(block), points: points.map((v) => Math.round(v * 10) / 10), stroke, strokeWidth, ...(group ? { group } : {}) }],
  }));
}

/** The picture was drawn from the recipe as it stands: remember both. */
export function markRendered(template: Template, blockId: string, src: string): Template {
  return withFreeform(template, blockId, (block) => ({ ...block, src, renderedHash: recipeHash(block) }));
}

// --- sticky notes, stamps and colour ------------------------------------------------------------

type Point = { x: number; y: number };

/** Note colours, near enough to FigJam's. Hex, since a design system has no reason to carry a sticky-note yellow. */
export const STICKY_COLORS = ['#FFE58A', '#FFC6D9', '#C4E4FF', '#CDEFC6', '#E0D4FF', '#FFD2A8'];

/** A note centred on a point, empty, ready to be typed into. */
export function addStickyAt(template: Template, blockId: string, at: Point, fill: ColorRef): Template {
  const size = 180;
  return withFreeform(template, blockId, (block) => ({
    ...block,
    layers: [
      ...block.layers,
      { kind: 'sticky', id: newLayerId(block), text: '', role: 'body', color: null, fill: fill ?? STICKY_COLORS[0]!, x: Math.round(at.x - size / 2), y: Math.round(at.y - size / 2), width: size, height: size },
    ],
  }));
}

/** A brand mark stamped at a point, at its own proportions. The tilt is the caller's, so the recipe stays exact. */
export function addMarkAt(template: Template, blockId: string, key: string, at: Point, color: ColorRef, rotation = 0): Template {
  const mark = markOf(key);
  const width = 88;
  const height = Math.round(width / mark.ratio);
  return withFreeform(template, blockId, (block) => ({
    ...block,
    layers: [...block.layers, { kind: 'mark', id: newLayerId(block), mark: mark.key, color, x: Math.round(at.x - width / 2), y: Math.round(at.y - height / 2), width, height, ...(rotation ? { rotation } : {}) }],
  }));
}

/** A layer in a colour, by whichever property that kind is coloured by. A picture has none. */
export function paintOne(l: FreeformLayer, color: ColorRef): FreeformLayer {
  switch (l.kind) {
    case 'text':
    case 'mark':
      return { ...l, color };
    case 'sticky':
      return { ...l, fill: color ?? STICKY_COLORS[0]! };
    case 'rect':
    case 'ellipse':
      return { ...l, fill: color };
    case 'line':
    case 'path':
      return { ...l, stroke: color };
    case 'image':
      return l;
  }
}

export function paintLayer(template: Template, blockId: string, layerId: string, color: ColorRef): Template {
  return withFreeform(template, blockId, (block) => ({ ...block, layers: block.layers.map((l) => (l.id === layerId ? paintOne(l, color) : l)) }));
}

// --- groups ----------------------------------------------------------------------------------------
//
// Strokes drawn in one marker session share a group, so a doodle is one thing: it moves, scales,
// colours, copies and deletes together, and the layer list shows it as one row. The editors name a
// picked group `group:<id>`; a group with one member is just that layer.

export const groupKey = (id: string): string => `group:${id}`;
export const groupOfKey = (key: string | null | undefined): string | null => (key && key.startsWith('group:') ? key.slice(6) : null);
export const membersOf = (block: FreeformBlock, group: string): FreeformLayer[] => block.layers.filter((l) => l.group === group);

export function newGroupId(block: FreeformBlock): string {
  const used = new Set(block.layers.map((l) => l.group).filter((g): g is string => Boolean(g)));
  let n = used.size + 1;
  while (used.has(`g${n}`)) n += 1;
  return `g${n}`;
}

/** The box around several layers, unrotated. */
export function groupBox(layers: FreeformLayer[], heights: Record<string, number> = {}): Box {
  if (layers.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const l of layers) {
    const b = layerBox(l, heights[l.id]);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width);
    y2 = Math.max(y2, b.y + b.height);
  }
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

/** Layers swapped in by id, wherever they sit in the stack. */
export function replaceLayers(template: Template, blockId: string, next: FreeformLayer[]): Template {
  const byId = new Map(next.map((l) => [l.id, l]));
  return withFreeform(template, blockId, (block) => ({ ...block, layers: block.layers.map((l) => byId.get(l.id) ?? l) }));
}

/** Several layers scaled together from one box into another, each keeping its place inside it. */
export function scaleLayers(layers: FreeformLayer[], from: Box, to: Box): FreeformLayer[] {
  const sx = from.width > 0 ? to.width / from.width : 1;
  const sy = from.height > 0 ? to.height / from.height : 1;
  return layers.map((l) => {
    const b = layerBox(l);
    return withLayerBox(l, { x: to.x + (b.x - from.x) * sx, y: to.y + (b.y - from.y) * sy, width: b.width * sx, height: b.height * sy });
  });
}

export function updateMembers(template: Template, blockId: string, group: string, fn: (l: FreeformLayer) => FreeformLayer): Template {
  return withFreeform(template, blockId, (block) => ({ ...block, layers: block.layers.map((l) => (l.group === group ? fn(l) : l)) }));
}

export function paintGroup(template: Template, blockId: string, group: string, color: ColorRef): Template {
  return updateMembers(template, blockId, group, (l) => paintOne(l, color));
}

export function removeGroup(template: Template, blockId: string, group: string): Template {
  return withFreeform(template, blockId, (block) => ({ ...block, layers: block.layers.filter((l) => l.group !== group) }));
}

export function ungroupLayers(template: Template, blockId: string, group: string): Template {
  return updateMembers(template, blockId, group, (l) => {
    const { group: _gone, ...rest } = l;
    void _gone;
    return rest as FreeformLayer;
  });
}

/** A copy of a group, a step down and right, as a new group on top of the stack. */
export function duplicateGroup(template: Template, blockId: string, group: string): Template {
  return withFreeform(template, blockId, (block) => {
    const members = membersOf(block, group);
    if (members.length === 0) return block;
    const gid = newGroupId(block);
    let layers = block.layers;
    for (const m of members) layers = [...layers, { ...translateLayer(m, 16, 16), id: newLayerId({ ...block, layers }), group: gid }];
    return { ...block, layers };
  });
}

export type LayerItem = { kind: 'layer'; layer: FreeformLayer } | { kind: 'group'; id: string; layers: FreeformLayer[] };

/** The stack as a list shows it, bottom to top: a group of more than one gathered where its first member sits. */
export function groupRuns(layers: FreeformLayer[]): LayerItem[] {
  const counts = new Map<string, number>();
  for (const l of layers) if (l.group) counts.set(l.group, (counts.get(l.group) ?? 0) + 1);
  const seen = new Set<string>();
  const out: LayerItem[] = [];
  for (const l of layers) {
    if (l.group && (counts.get(l.group) ?? 0) > 1) {
      if (seen.has(l.group)) continue;
      seen.add(l.group);
      out.push({ kind: 'group', id: l.group, layers: layers.filter((x) => x.group === l.group) });
    } else out.push({ kind: 'layer', layer: l });
  }
  return out;
}

// --- the canvas's own clipboard --------------------------------------------------------------------
//
// A copy inside the canvas is a copy of layers, never of the block around them: "if i'm in the
// canvas and use copy paste it's effecting the parent block. This should feel like it's own
// experience" (learnings 3.68). Its own marker, so an email clipboard never pastes in here and this
// one never pastes into the email.

const LAYER_CLIP = 'template-studio-layers';

export function layerClipText(layers: FreeformLayer[]): string {
  return JSON.stringify({ [LAYER_CLIP]: 1, layers });
}

export function parseLayerClip(text: string): FreeformLayer[] | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown> | null;
    if (!value || value[LAYER_CLIP] !== 1 || !Array.isArray(value['layers'])) return null;
    const layers = (value['layers'] as unknown[]).filter(
      (l): l is FreeformLayer => Boolean(l) && typeof l === 'object' && typeof (l as { kind?: unknown }).kind === 'string' && typeof (l as { id?: unknown }).id === 'string',
    );
    return layers.length ? layers : null;
  } catch {
    return null;
  }
}

/** Layers from the clipboard, offset, with ids of their own and groups of their own. */
export function pasteLayers(template: Template, blockId: string, layers: FreeformLayer[], offset: number): Template {
  return withFreeform(template, blockId, (block) => {
    const groups = new Map<string, string>();
    let next = block.layers;
    for (const l of layers) {
      let group: string | undefined;
      if (l.group) {
        if (!groups.has(l.group)) groups.set(l.group, newGroupId({ ...block, layers: next }));
        group = groups.get(l.group);
      }
      const { group: _source, ...rest } = l;
      void _source;
      const copy = { ...translateLayer(rest as FreeformLayer, offset, offset), id: newLayerId({ ...block, layers: next }), ...(group ? { group } : {}) } as FreeformLayer;
      next = [...next, copy];
    }
    return { ...block, layers: next };
  });
}
