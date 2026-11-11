// The everyday moves of a layout tool on the freeform canvas: bring forward and send back, flip, hide and lock,
// and copying one layer's look onto others.
//
// Jared: "add multiple item select and other common design usage patterns and tools." Pure; the canvas binds
// them to the keys and the right-click menu a designer expects.

import { groupRuns, translateLayer, withFreeform } from './freeform.ts';
import { groupOfKey } from './freeform.ts';
import { duplicateUnits, unitLayers, unitsOf } from './selection.ts';
import type { FreeformBlock, FreeformLayer, Template } from './types.ts';

export type Arrange = 'front' | 'forward' | 'backward' | 'back';

/** Where a unit sits in the stack as the layers list counts it, bottom first. */
function indexOf(block: FreeformBlock, unit: string): number {
  const gid = groupOfKey(unit);
  return groupRuns(block.layers).findIndex((it) => (gid ? it.kind === 'group' && it.id === gid : it.kind === 'layer' && it.layer.id === unit));
}

/**
 * The units moved in the stack together, keeping their order among themselves: to the top or the bottom, or
 * one place up or down. A unit already at the edge stays, and the rest close up behind it.
 */
export function arrangeUnits(template: Template, blockId: string, units: string[], how: Arrange): Template {
  return withFreeform(template, blockId, (block) => {
    let items = groupRuns(block.layers);
    const picked = new Set(units);
    const keyOf = (it: (typeof items)[number]) => (it.kind === 'group' ? `group:${it.id}` : it.layer.id);
    const isPicked = (it: (typeof items)[number]) => picked.has(keyOf(it));
    if (how === 'front' || how === 'back') {
      const moving = items.filter(isPicked);
      const rest = items.filter((it) => !isPicked(it));
      items = how === 'front' ? [...rest, ...moving] : [...moving, ...rest];
    } else {
      const up = how === 'forward';
      const order = items.map((_, i) => i);
      if (up) order.reverse();
      for (const i of order) {
        const j = up ? i + 1 : i - 1;
        if (!isPicked(items[i]!) || j < 0 || j >= items.length || isPicked(items[j]!)) continue;
        [items[i], items[j]] = [items[j]!, items[i]!];
      }
    }
    const layers = items.flatMap((it) => (it.kind === 'layer' ? [it.layer] : it.layers));
    return layers.every((l, i) => l === block.layers[i]) ? block : { ...block, layers };
  });
}

/** Whether a unit can move further that way, for greying out the menu. */
export function canArrange(block: FreeformBlock, units: string[], how: Arrange): boolean {
  const n = groupRuns(block.layers).length;
  const at = units.map((u) => indexOf(block, u)).filter((i) => i >= 0);
  if (at.length === 0) return false;
  // Already packed against that edge: nothing to do.
  return how === 'front' || how === 'forward' ? !at.every((i) => i >= n - at.length) : !at.every((i) => i < at.length);
}

/** Every layer flipped across the centre of the box they cover together, so a group mirrors as one. */
export function flipLayers(layers: FreeformLayer[], axis: 'x' | 'y', box: { x: number; y: number; width: number; height: number }, heights: Record<string, number> = {}): FreeformLayer[] {
  const centre = axis === 'x' ? box.x + box.width / 2 : box.y + box.height / 2;
  return layers.map((l) => {
    // Its own centre mirrors across the shared one, and the layer itself turns over.
    const own = ownBox(l, heights[l.id]);
    const c = axis === 'x' ? own.x + own.width / 2 : own.y + own.height / 2;
    const d = 2 * (centre - c);
    const moved = axis === 'x' ? translateLayer(l, d, 0) : translateLayer(l, 0, d);
    const key = axis === 'x' ? 'flipX' : 'flipY';
    const next = { ...moved, [key]: !l[key] || undefined } as FreeformLayer;
    if (!next[key]) delete (next as unknown as Record<string, unknown>)[key];
    // A rotation mirrors too: across a vertical axis or a horizontal one, it turns the other way.
    if (l.rotation) (next as { rotation?: number }).rotation = (360 - l.rotation) % 360 || undefined;
    return next;
  });
}

function ownBox(l: FreeformLayer, textHeight?: number): { x: number; y: number; width: number; height: number } {
  switch (l.kind) {
    case 'text':
      return { x: l.x, y: l.y, width: l.width, height: textHeight ?? 24 };
    case 'line':
      return { x: Math.min(l.x1, l.x2), y: Math.min(l.y1, l.y2), width: Math.abs(l.x2 - l.x1), height: Math.abs(l.y2 - l.y1) };
    case 'path': {
      const xs = l.points.filter((_, i) => i % 2 === 0);
      const ys = l.points.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    default:
      return { x: l.x, y: l.y, width: l.width, height: l.height };
  }
}

/** Shown or hidden, locked or not, for every layer in the units: all on when any is off. */
export function toggleFlag(block: FreeformBlock, units: string[], flag: 'hidden' | 'locked'): FreeformLayer[] {
  const layers = units.flatMap((u) => unitLayers(block, u));
  const on = !layers.every((l) => l[flag]);
  return layers.map((l) => {
    const next = { ...l } as FreeformLayer & Record<string, unknown>;
    if (on) next[flag] = true;
    else delete next[flag];
    return next as FreeformLayer;
  });
}

/** What a layer looks like, apart from where it is and what it says: its colours, line, type and effects. */
export type LayerStyle = Partial<Record<string, unknown>>;
const STYLE_KEYS = ['color', 'fill', 'stroke', 'strokeWidth', 'radius', 'opacity', 'invert', 'effects', 'font', 'weight', 'italic', 'textCase', 'size', 'letterSpacing', 'lineHeight', 'look', 'brush', 'mask'] as const;

export function styleOf(l: FreeformLayer): LayerStyle {
  const out: LayerStyle = {};
  const src = l as unknown as Record<string, unknown>;
  for (const k of STYLE_KEYS) if (src[k] !== undefined) out[k] = structuredClone(src[k]);
  return out;
}

/** A copied look laid onto layers, each taking only what its kind has: a box takes a fill, text takes type. */
export function withStyle(layers: FreeformLayer[], style: LayerStyle): FreeformLayer[] {
  const has: Record<FreeformLayer['kind'], readonly string[]> = {
    text: ['color', 'opacity', 'invert', 'effects', 'font', 'weight', 'italic', 'textCase', 'size', 'letterSpacing', 'lineHeight', 'look'],
    sticky: ['color', 'fill', 'opacity', 'invert', 'effects', 'font', 'size'],
    rect: ['fill', 'stroke', 'strokeWidth', 'radius', 'opacity', 'invert', 'effects'],
    ellipse: ['fill', 'stroke', 'strokeWidth', 'opacity', 'invert', 'effects'],
    line: ['stroke', 'strokeWidth', 'opacity', 'invert', 'effects'],
    path: ['stroke', 'strokeWidth', 'opacity', 'invert', 'effects', 'brush'],
    mark: ['color', 'opacity', 'invert', 'effects'],
    image: ['opacity', 'invert', 'effects', 'radius', 'mask'],
  };
  return layers.map((l) => {
    const next = { ...l } as unknown as Record<string, unknown>;
    for (const k of has[l.kind]) if (k in style) next[k] = structuredClone(style[k]);
    return next as unknown as FreeformLayer;
  });
}

/** The units copied where they stand, for Alt-drag: returns the template, the copies' key and the copies. */
export function copyInPlace(template: Template, blockId: string, block: FreeformBlock, units: string[]): { template: Template; key: string | null; layers: FreeformLayer[] } {
  const made = duplicateUnits(template, blockId, block, units, 0);
  let layers: FreeformLayer[] = [];
  withFreeform(made.template, blockId, (b) => {
    layers = unitsOf(made.key).flatMap((u) => unitLayers(b, u));
    return b;
  });
  return { ...made, layers };
}
