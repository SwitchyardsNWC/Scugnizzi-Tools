// Selecting several things on the freeform canvas, and what can be done to them together: align them to each
// other, space them evenly, group them, delete or copy them.
//
// Jared asked for multi-select ("Shift-click and drag a selection box, align and distribute between layers,
// group"). A selection is still one key, so everything that keeps "what is picked" keeps working: a layer's id,
// `group:<id>` for a drawing, and now `multi:<unit>|<unit>…` for several. A unit is a layer id or a group key, so
// a drawing picked with other things moves, aligns and spaces as one piece.
//
// Pure: keys and layers in, keys and templates out.

import { groupBox, groupKey, groupOfKey, membersOf, newGroupId, newLayerId, translateLayer, withFreeform } from './freeform.ts';
import { boundsOfLayers } from './snap.ts';
import type { Box } from './freeform.ts';
import type { FreeformBlock, FreeformLayer, Template } from './types.ts';

const MULTI = 'multi:';
const SEP = '|';

export const isMultiKey = (key: string | null | undefined): key is string => Boolean(key && key.startsWith(MULTI));

/** The units a key names: one for a layer or a drawing, several for a multi-selection. */
export function unitsOf(key: string | null | undefined): string[] {
  if (!key) return [];
  return isMultiKey(key) ? key.slice(MULTI.length).split(SEP).filter(Boolean) : [key];
}

/** The key for some units: none is null, one is that unit's own key, more is a multi-selection. */
export function keyOf(units: string[]): string | null {
  const unique = [...new Set(units)];
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0]!;
  return MULTI + unique.join(SEP);
}

/** The layers a unit stands for, in stack order. */
export function unitLayers(block: FreeformBlock, unit: string): FreeformLayer[] {
  const gid = groupOfKey(unit);
  if (gid) return membersOf(block, gid);
  const one = block.layers.find((l) => l.id === unit);
  return one ? [one] : [];
}

/** The unit a layer is picked as: its drawing when it has one of more than one stroke, else itself. */
export function unitOfLayer(block: FreeformBlock, layer: FreeformLayer): string {
  return layer.group && membersOf(block, layer.group).length > 1 ? groupKey(layer.group) : layer.id;
}

/** Shift-click: a unit in the selection comes out of it, one outside it goes in. */
export function toggleUnit(key: string | null, unit: string): string | null {
  const units = unitsOf(key);
  return keyOf(units.includes(unit) ? units.filter((u) => u !== unit) : [...units, unit]);
}

/** Every unit on the page that still exists, for ⌘A. */
export function allUnits(block: FreeformBlock): string[] {
  const out: string[] = [];
  for (const l of block.layers) {
    const u = unitOfLayer(block, l);
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The units a selection box touches, rotation included. */
export function marqueeUnits(block: FreeformBlock, box: Box, heights: Record<string, number> = {}): string[] {
  const out: string[] = [];
  for (const l of block.layers) {
    const u = unitOfLayer(block, l);
    if (out.includes(u)) continue;
    if (intersects(box, boundsOfLayers(unitLayers(block, u), heights))) out.push(u);
  }
  return out;
}

/** The box from two corners of a drag, either way round. */
export const boxFromCorners = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});

export type AlignEdge = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

/** The units moved so each meets the same edge or centre of the box they cover together. */
export function alignUnits(block: FreeformBlock, units: string[], edge: AlignEdge, heights: Record<string, number> = {}): FreeformLayer[] {
  const groups = units.map((u) => unitLayers(block, u)).filter((ls) => ls.length);
  const all = boundsOfLayers(groups.flat(), heights);
  return groups.flatMap((ls) => {
    const b = boundsOfLayers(ls, heights);
    let dx = 0;
    let dy = 0;
    if (edge === 'left') dx = all.x - b.x;
    else if (edge === 'centre') dx = all.x + all.width / 2 - (b.x + b.width / 2);
    else if (edge === 'right') dx = all.x + all.width - (b.x + b.width);
    else if (edge === 'top') dy = all.y - b.y;
    else if (edge === 'middle') dy = all.y + all.height / 2 - (b.y + b.height / 2);
    else dy = all.y + all.height - (b.y + b.height);
    return dx || dy ? ls.map((l) => translateLayer(l, dx, dy)) : ls;
  });
}

/**
 * The units spaced evenly, across or down: the first and last stay where they are, and every gap between
 * neighbours becomes the same. Needs three or more; fewer come back unchanged.
 */
export function distributeUnits(block: FreeformBlock, units: string[], axis: 'x' | 'y', heights: Record<string, number> = {}): FreeformLayer[] {
  const items = units
    .map((u) => unitLayers(block, u))
    .filter((ls) => ls.length)
    .map((ls) => ({ ls, b: boundsOfLayers(ls, heights) }));
  if (items.length < 3) return items.flatMap((i) => i.ls);
  const start = (b: Box) => (axis === 'x' ? b.x : b.y);
  const size = (b: Box) => (axis === 'x' ? b.width : b.height);
  items.sort((a, b) => start(a.b) - start(b.b));
  const first = items[0]!.b;
  const last = items[items.length - 1]!.b;
  const span = start(last) + size(last) - start(first);
  const gap = (span - items.reduce((n, i) => n + size(i.b), 0)) / (items.length - 1);
  let at = start(first);
  return items.flatMap(({ ls, b }) => {
    const d = at - start(b);
    at += size(b) + gap;
    if (Math.abs(d) < 0.01) return ls;
    return ls.map((l) => (axis === 'x' ? translateLayer(l, d, 0) : translateLayer(l, 0, d)));
  });
}

/**
 * Several units made into one group. Its members gather where the topmost of them sits in the stack, in the
 * order they had, so the group reads as one row in the layers panel. Returns the template and the group's key.
 */
export function groupUnits(template: Template, blockId: string, block: FreeformBlock, units: string[]): { template: Template; key: string } | null {
  const ids = new Set(units.flatMap((u) => unitLayers(block, u)).map((l) => l.id));
  if (ids.size < 2) return null;
  const gid = newGroupId(block);
  const next = withFreeform(template, blockId, (b) => {
    const members = b.layers.filter((l) => ids.has(l.id)).map((l) => ({ ...l, group: gid }));
    const topAt = Math.max(...b.layers.map((l, i) => (ids.has(l.id) ? i : -1)));
    const out: FreeformLayer[] = [];
    b.layers.forEach((l, i) => {
      if (!ids.has(l.id)) out.push(l);
      if (i === topAt) out.push(...members);
    });
    return { ...b, layers: out };
  });
  return { template: next, key: groupKey(gid) };
}

/** Every layer in the units taken off the page. */
export function removeUnits(template: Template, blockId: string, block: FreeformBlock, units: string[]): Template {
  const ids = new Set(units.flatMap((u) => unitLayers(block, u)).map((l) => l.id));
  return withFreeform(template, blockId, (b) => ({ ...b, layers: b.layers.filter((l) => !ids.has(l.id)) }));
}

/** A copy of the units, a step down and right, on top of the stack; drawings stay drawings. Returns the copies' key. */
export function duplicateUnits(template: Template, blockId: string, block: FreeformBlock, units: string[]): { template: Template; key: string | null } {
  let made: string[] = [];
  const next = withFreeform(template, blockId, (b) => {
    let layers = b.layers;
    made = [];
    for (const u of units) {
      const source = unitLayers(b, u);
      if (!source.length) continue;
      const gid = groupOfKey(u) ? newGroupId({ ...b, layers }) : null;
      const copies = source.map((l) => {
        const copy = { ...translateLayer(l, 16, 16), id: newLayerId({ ...b, layers }) } as FreeformLayer;
        layers = [...layers, gid ? { ...copy, group: gid } : (({ group: _g, ...rest }) => (void _g, rest as FreeformLayer))(copy)];
        return copy;
      });
      made.push(gid ? groupKey(gid) : copies[0]!.id);
    }
    return { ...b, layers };
  });
  return { template: next, key: keyOf(made) };
}

/** The unrotated box around a multi-selection, for its handles. */
export function unitsBox(block: FreeformBlock, units: string[], heights: Record<string, number> = {}): Box {
  return groupBox(units.flatMap((u) => unitLayers(block, u)), heights);
}
