// The everyday layout moves: arrange in the stack, flip, hide and lock, copy and paste a look, Alt-drag copies.
//

import { describe, expect, it } from 'vitest';

import { groupKey } from '../src/model/freeform.ts';
import { allUnits, marqueeUnits } from '../src/model/selection.ts';
import { arrangeUnits, canArrange, copyInPlace, flipLayers, styleOf, toggleFlag, withStyle } from '../src/model/arrange.ts';
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
const ids = (t: Template) => layersOf(t).map((l) => l.id);

describe('arrange', () => {
  const b = block([rect('a', 0, 0), rect('b', 0, 0), rect('p1', 0, 0, 10, 10, { group: 'g' }), rect('p2', 0, 0, 10, 10, { group: 'g' }), rect('c', 0, 0)]);

  it('brings to front and sends to back, keeping order among the moved', () => {
    expect(ids(arrangeUnits(tpl(b), 'f', ['a', 'b'], 'front'))).toEqual(['p1', 'p2', 'c', 'a', 'b']);
    expect(ids(arrangeUnits(tpl(b), 'f', ['c'], 'back'))).toEqual(['c', 'a', 'b', 'p1', 'p2']);
  });

  it('steps a group past its neighbour as one', () => {
    expect(ids(arrangeUnits(tpl(b), 'f', [groupKey('g')], 'forward'))).toEqual(['a', 'b', 'c', 'p1', 'p2']);
    expect(ids(arrangeUnits(tpl(b), 'f', [groupKey('g')], 'backward'))).toEqual(['a', 'p1', 'p2', 'b', 'c']);
  });

  it('leaves a thing at the edge where it is, and says so', () => {
    const t = tpl(b);
    expect(arrangeUnits(t, 'f', ['c'], 'forward')).toBe(t);
    expect(canArrange(b, ['c'], 'front')).toBe(false);
    expect(canArrange(b, ['c'], 'back')).toBe(true);
    expect(canArrange(b, ['a', 'b'], 'backward')).toBe(false);
    expect(canArrange(b, ['a', 'b'], 'forward')).toBe(true);
  });
});

describe('flip', () => {
  it('mirrors several things across their shared middle, and turns each over', () => {
    const out = flipLayers([rect('a', 0, 0, 20, 20), rect('b', 80, 0, 20, 20, { rotation: 30 })], 'x', { x: 0, y: 0, width: 100, height: 20 });
    expect(at(out, 'a').x).toBe(80);
    expect(at(out, 'b').x).toBe(0);
    expect(at(out, 'a').flipX).toBe(true);
    expect(at(out, 'b').rotation).toBe(330);
  });

  it('flipping twice gives back the start', () => {
    const box = { x: 0, y: 0, width: 100, height: 60 };
    const once = flipLayers([rect('a', 10, 5, 20, 20)], 'y', box);
    const twice = flipLayers(once, 'y', box);
    expect(at(twice, 'a')).toEqual(rect('a', 10, 5, 20, 20));
  });
});

describe('hide and lock', () => {
  const b = block([rect('a', 0, 0), rect('b', 100, 0, 20, 20, { locked: true }), rect('c', 200, 0, 20, 20, { hidden: true })]);

  it('turns all on when any is off, and all off when every one is on', () => {
    expect(toggleFlag(b, ['a', 'b'], 'locked').every((l) => l.locked)).toBe(true);
    expect(toggleFlag(b, ['b'], 'locked').some((l) => l.locked)).toBe(false);
  });

  it('keeps locked and hidden things out of select-all and the selection box', () => {
    expect(allUnits(b)).toEqual(['a']);
    expect(marqueeUnits(b, { x: 0, y: 0, width: 400, height: 40 })).toEqual(['a']);
  });
});

describe('copy and paste style', () => {
  it('lays only what a kind has onto it', () => {
    const style = styleOf(rect('a', 0, 0, 20, 20, { fill: 'Ink', radius: 8, opacity: 0.5 } as Partial<FreeformLayer>));
    const text = { kind: 'text', id: 't', text: 'Hi', role: 'body', color: null, x: 0, y: 0, width: 100, align: 'left' } as FreeformLayer;
    const [box, words] = withStyle([rect('b', 50, 50), text], style);
    expect(at([box!], 'b')).toMatchObject({ fill: 'Ink', radius: 8, opacity: 0.5, x: 50 });
    expect(words).toMatchObject({ opacity: 0.5 });
    expect(words).not.toHaveProperty('fill');
  });
});

describe('Alt-drag', () => {
  it('copies in place, on top, and hands back the copies to move', () => {
    const b = block([rect('a', 10, 10), rect('b', 50, 10)]);
    const made = copyInPlace(tpl(b), 'f', b, ['a']);
    expect(layersOf(made.template)).toHaveLength(3);
    expect(made.layers).toHaveLength(1);
    expect(made.layers[0]).toMatchObject({ x: 10, y: 10 });
    expect(made.layers[0]!.id).not.toBe('a');
    expect(made.key).toBe(made.layers[0]!.id);
  });
});
