// Effects on a freeform page, and the shared Riso press they print with.
//
// The press is `effects/riso.js`, lifted out of the separator tool without changing a calculation.
// What is defended here is the one property that makes an effect part of a recipe: the same picture,
// settings and seed print the same bytes, every time, on every machine.

import { describe, expect, it } from 'vitest';

import { Riso } from '../src/effects/riso.ts';
import { misregister, normalizeRiso, readSavedRisoPresets, risoStep, setEffects, withoutSavedRisoPreset, withSavedRisoPreset } from '../src/model/effects.ts';
import { freeformSvg } from '../src/compile/freeform.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { recipeHash } from '../src/model/freeform.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import type { FreeformBlock, Template } from '../src/model/types.ts';

const picture = (w: number, h: number) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const q = (y * w + x) * 4;
      data[q] = (x / w) * 255;
      data[q + 1] = (y / h) * 255;
      data[q + 2] = 128;
      data[q + 3] = 255;
    }
  return Riso.prepare(data, w, h);
};

const page = (over: Partial<FreeformBlock> = {}): FreeformBlock => ({
  id: 'f',
  type: 'freeform',
  alt: 'A page',
  width: 200,
  height: 100,
  background: null,
  layers: [{ kind: 'rect', id: 'l1', x: 10, y: 10, width: 50, height: 50, fill: 'navy', stroke: null, strokeWidth: 0, radius: 0 }],
  src: '',
  align: 'center',
  ...over,
});

const doc = (block: FreeformBlock): Template =>
  ({
    schema: SCHEMA_VERSION,
    id: 't',
    name: 'T',
    hubspotLabel: 'T',
    pageBackground: '#fff',
    forceLight: true,
    preview: { company: 'C', address: 'A', city: 'C', state: 'S', zip: 'Z' },
    sections: [{ id: 's', theme: 'cream', bandColor: null, containerColor: null, textColor: null, linkColor: null, padTop: 0, padBottom: 0, rows: [{ id: 'r', mobile: 'stack', columns: [{ id: 'c', span: 12, padTop: 0, padBottom: 0, align: 'left', blocks: [block] }] }] }],
  }) as unknown as Template;
const blockOf = (t: Template) => t.sections[0]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock;

describe('the shared Riso press', () => {
  it('prints the same bytes for the same picture, settings and seed', () => {
    for (let preset = 0; preset < Riso.PRESETS.length; preset += 1) {
      const step = risoStep(preset, 7);
      const a = Riso.render(picture(64, 40), step, step.seed);
      const b = Riso.render(picture(64, 40), step, step.seed);
      expect(a.length).toBe(64 * 40 * 4);
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    }
  });

  it('prints differently with another seed, and opaque whatever it was given', () => {
    const step = risoStep(2, 1);
    const a = Riso.render(picture(64, 40), step, 1);
    const b = Riso.render(picture(64, 40), step, 2);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    for (let q = 3; q < a.length; q += 4) expect(a[q]).toBe(255);
  });

  it('keeps a screen the same size on the page when the picture is drawn at 2×', () => {
    const f1 = Riso.fields(40, 20, 3, 1);
    const f2 = Riso.fields(40, 20, 3, 2);
    expect(f1.unit).toBe(1);
    expect(f2.unit).toBe(2);
    const step = risoStep(0, 3);
    expect(Buffer.from(Riso.render(picture(40, 20), step, 3, 1)).equals(Buffer.from(Riso.render(picture(40, 20), step, 3, 2)))).toBe(false);
  });

  it('offsets every ink after the first, within the range, from the seed', () => {
    const step = risoStep(1, 5);
    const once = misregister(step, 2);
    expect(misregister(step, 2)).toEqual(once);
    expect(once.inks[0]).toMatchObject({ dx: 0, dy: 0 });
    for (const ink of once.inks) expect(Math.abs(ink.dx) <= 2 && Math.abs(ink.dy) <= 2).toBe(true);
    expect(once.press.misreg).toBe(2);
  });
});

describe('effects on a freeform page', () => {
  it('are part of the recipe, and a page without them hashes as it always did', () => {
    const plain = page();
    expect(recipeHash({ ...plain, effects: [] })).toBe(recipeHash(plain));
    expect(recipeHash({ ...plain, effects: [risoStep(0)] })).not.toBe(recipeHash(plain));
    expect(recipeHash({ ...plain, effects: [risoStep(0, 2)] })).not.toBe(recipeHash({ ...plain, effects: [risoStep(0, 1)] }));
  });

  it('are added and taken away as a list', () => {
    const on = setEffects(doc(page()), 'f', [risoStep(1)]);
    expect(blockOf(on).effects).toHaveLength(1);
    const off = setEffects(on, 'f', undefined);
    expect('effects' in blockOf(off)).toBe(false);
  });

  it('trust nothing that comes back from the tool', () => {
    expect(normalizeRiso(null)).toBeNull();
    expect(normalizeRiso({ effect: 'ink-bleed', inks: [{}] })).toBeNull();
    expect(normalizeRiso({ effect: 'riso', inks: [] })).toBeNull();
    const step = normalizeRiso({
      effect: 'riso',
      inks: [{ color: '#FF48B0', source: 'mids', cell: 900, density: -4, screen: 'confetti' }, {}, {}, {}],
      press: { paper: 'not a colour', grain: 3 },
      seed: 'twelve',
    });
    expect(step).not.toBeNull();
    expect(step!.inks).toHaveLength(3);
    expect(step!.inks[0]).toMatchObject({ color: '#ff48b0', source: 'mids', cell: 24, density: 0, screen: 'dot' });
    expect(step!.press).toMatchObject({ paper: '#f6f2e8', grain: 1 });
    expect(step!.seed).toBe(1);
  });
});

describe('invert, and looks saved to the project', () => {
  it('inverts a layer through one shared filter, and draws uninverted pages as before', () => {
    const plain = freeformSvg(page(), DEFAULT_DESIGN_SYSTEM);
    expect(plain).not.toContain('sy-invert');
    const base = page().layers[0]!;
    const svg = freeformSvg(page({ layers: [{ ...base, invert: true }, { ...base, id: 'l2', invert: true }] }), DEFAULT_DESIGN_SYSTEM);
    expect(svg.match(/<filter id="sy-invert"/g)).toHaveLength(1);
    expect(svg.match(/filter="url\(#sy-invert\)"/g)).toHaveLength(2);
    expect(recipeHash(page({ layers: [{ ...base, invert: true }] }))).not.toBe(recipeHash(page()));
  });

  it('saves a look by name, replaces one of the same name, and reads the list back checked', () => {
    const raw = withSavedRisoPreset(null, '  Night swim ', risoStep(1, 9), 'p1', 5);
    const again = withSavedRisoPreset(raw, 'night swim', risoStep(2, 4), 'p2', 6);
    const list = readSavedRisoPresets(again);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'p2', name: 'night swim' });
    expect(list[0]!.step.seed).toBe(4);
    expect(readSavedRisoPresets('{"presets":[{"name":"broken"},{"name":"ok","inks":[{"color":"#ff48b0"}],"press":{}}]}').map((p) => p.name)).toEqual(['ok']);
    expect(readSavedRisoPresets('not json')).toEqual([]);
    expect(readSavedRisoPresets(withoutSavedRisoPreset(again, 'p2'))).toEqual([]);
  });
});
