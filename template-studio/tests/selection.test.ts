// Multi-select on the freeform canvas: keys, Shift toggling, the selection box, align and distribute between
// things, grouping, and deleting or copying several at once.

import { describe, expect, it } from 'vitest';

import { selectionOf } from '../src/app/surface-tools.tsx';
import { groupKey } from '../src/model/freeform.ts';
import { alignUnits, allUnits, distributeUnits, duplicateUnits, groupUnits, keyOf, marqueeUnits, removeUnits, toggleUnit, unitsOf } from '../src/model/selection.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import type { FreeformBlock, FreeformLayer, Template } from '../src/model/types.ts';

const rect = (id: string, x: number, y: number, w = 20, h = 20, extra: Partial<FreeformLayer> = {}) =>
  ({ kind: 'rect', id, x, y, width: w, height: h, fill: null, stroke: null, strokeWidth: 0, radius: 0, ...extra }) as FreeformLayer;
const block = (layers: FreeformLayer[]) => ({ id: 'f', type: 'freeform', width: 400, height: 200, background: null, layers }) as unknown as FreeformBlock;
const tpl = (b: FreeformBlock): Template =>
  ({
    schema: SCHEMA_VERSION,
    id: 't',
    name: 'T',
    hubspotLabel: 'T',
    pageBackground: '#fff',
    forceLight: true,
    preview: { company: 'C', address: 'A', city: 'C', state: 'S', zip: 'Z' },
    sections: [{ id: 's', theme: 'cream', bandColor: null, containerColor: null, textColor: null, linkColor: null, padTop: 0, padBottom: 0, rows: [{ id: 'r', mobile: 'stack', columns: [{ id: 'c', span: 12, padTop: 0, padBottom: 0, align: 'left', blocks: [b] }] }] }],
  }) as unknown as Template;
const layersOf = (t: Template) => (t.sections[0]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock).layers;
const at = (ls: FreeformLayer[], id: string) => ls.find((l) => l.id === id) as Extract<FreeformLayer, { kind: 'rect' }>;

describe('multi-select', () => {
  const b = block([rect('a', 0, 0), rect('b', 100, 50), rect('p1', 200, 0, 10, 10, { group: 'g1' }), rect('p2', 220, 20, 10, 10, { group: 'g1' })]);

  it('toggles units in and out with Shift, and collapses to one key at one', () => {
    let key = toggleUnit('a', 'b');
    expect(unitsOf(key)).toEqual(['a', 'b']);
    key = toggleUnit(key, groupKey('g1'));
    expect(selectionOf(b, key)).toMatchObject({ multi: true, many: true });
    expect(selectionOf(b, key)!.layers.map((l) => l.id)).toEqual(['a', 'b', 'p1', 'p2']);
    expect(toggleUnit(toggleUnit(key, 'b'), groupKey('g1'))).toBe('a');
    expect(toggleUnit('a', 'a')).toBeNull();
  });

  it('picks what a selection box touches, a drawing as one', () => {
    expect(marqueeUnits(b, { x: -5, y: -5, width: 120, height: 60 })).toEqual(['a', 'b']);
    expect(marqueeUnits(b, { x: 215, y: 15, width: 3, height: 3 })).toEqual([groupKey('g1')]);
    expect(allUnits(b)).toEqual(['a', 'b', groupKey('g1')]);
  });

  it('aligns things to each other, moving a drawing as one', () => {
    const out = alignUnits(b, ['a', 'b', groupKey('g1')], 'right');
    expect(at(out, 'a').x).toBe(210);
    expect(at(out, 'b').x).toBe(210);
    expect([at(out, 'p1').x, at(out, 'p2').x]).toEqual([200, 220]);
    const top = alignUnits(b, ['a', 'b'], 'middle');
    expect([at(top, 'a').y, at(top, 'b').y]).toEqual([25, 25]);
  });

  it('spaces three or more evenly, keeping the first and last', () => {
    const c = block([rect('a', 0, 0), rect('b', 30, 0), rect('c', 180, 0)]);
    const out = distributeUnits(c, ['c', 'a', 'b'], 'x');
    expect([at(out, 'a').x, at(out, 'b').x, at(out, 'c').x]).toEqual([0, 90, 180]);
    expect(distributeUnits(c, ['a', 'b'], 'x').map((l) => (l as { x: number }).x)).toEqual([0, 30]);
  });

  it('groups several things together in the stack, and the group stays picked', () => {
    const c = block([rect('a', 0, 0), rect('x', 0, 0), rect('b', 0, 0)]);
    const made = groupUnits(tpl(c), 'f', c, ['a', 'b'])!;
    const ls = layersOf(made.template);
    expect(ls.map((l) => l.id)).toEqual(['x', 'a', 'b']);
    expect(new Set(ls.filter((l) => l.id !== 'x').map((l) => l.group)).size).toBe(1);
    expect(made.key).toBe(groupKey(ls[1]!.group!));
    expect(groupUnits(tpl(c), 'f', c, ['a'])).toBeNull();
  });

  it('removes and copies several at once, a drawing staying a drawing', () => {
    expect(layersOf(removeUnits(tpl(b), 'f', b, ['a', groupKey('g1')])).map((l) => l.id)).toEqual(['b']);
    const copy = duplicateUnits(tpl(b), 'f', b, ['a', groupKey('g1')]);
    const ls = layersOf(copy.template);
    expect(ls.length).toBe(7);
    const units = unitsOf(copy.key);
    expect(units.length).toBe(2);
    const copiedDrawing = ls.filter((l) => l.group && l.group !== 'g1');
    expect(copiedDrawing.length).toBe(2);
    expect(keyOf(['a', 'a'])).toBe('a');
  });
});
