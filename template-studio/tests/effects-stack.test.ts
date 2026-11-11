// The effects stack: the image effects ported from the Image Effects tool, and the stack that runs them.
// Defended: every effect is deterministic, so a recipe makes the same picture every time; an effect keeps
// the picture's transparency (blur excepted), so an effect on one layer stays inside it; strength mixes;
// a switched-off or zero-strength step does nothing; layer effects count as effects; steps from outside
// are checked; the Riso tool's return keeps the rest of the stack.

import { describe, expect, it } from 'vitest';

import { ImageEffects } from '../src/effects/image.ts';
import { EFFECT_KINDS, hasEffects, LOOKS, moveStep, newStep, normalizeStep, risoStep, stackSummary, withLayerEffects, withRisoStep } from '../src/model/effects.ts';
import { recipeHash } from '../src/model/freeform.ts';
import type { EffectStep, FreeformBlock, FreeformLayer } from '../src/model/types.ts';

/** A small test picture: a gradient left to right, a colour shift top to bottom, a clear corner. */
function picture(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] = Math.round((x / (w - 1)) * 255);
      d[i + 1] = Math.round((y / (h - 1)) * 255);
      d[i + 2] = 120;
      d[i + 3] = x < 4 && y < 4 ? 0 : 255;
    }
  return d;
}
const W = 40;
const H = 24;
const run = (step: EffectStep, unit = 1) => ImageEffects.apply(step, picture(W, H), W, H, unit);
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => Buffer.from(a).equals(Buffer.from(b));
const dec = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const enc = (l: number) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
const flat = (w: number, h: number, v: number) => {
  const d = new Uint8ClampedArray(w * h * 4).fill(v);
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  return d;
};
/** The average light of one channel, as an sRGB level: what a screened picture looks like from across the room. */
const seenFromAfar = (d: Uint8ClampedArray, channel = 0) => {
  let acc = 0;
  for (let i = channel; i < d.length; i += 4) acc += dec(d[i]!);
  return Math.round(enc(acc / (d.length / 4)));
};

describe('image effects', () => {
  // Riso and ink bleed have engines of their own (effects/riso.js, effects/ink.js), tested beside them.
  const kinds = EFFECT_KINDS.filter((k) => k !== 'riso' && k !== 'ink');

  it('every effect changes the picture, and does it the same way every time', () => {
    for (const kind of kinds) {
      const step = kind === 'adjust' ? { effect: 'adjust' as const, brightness: 20, contrast: 30, saturation: -40 } : newStep(kind, 7);
      const a = run(step);
      expect(same(a, picture(W, H)), kind).toBe(false);
      expect(same(a, run(step)), kind).toBe(true);
    }
  });

  it('keeps the picture’s transparency, except blur, which softens it', () => {
    for (const kind of kinds) {
      const out = run(newStep(kind, 3));
      if (kind === 'blur') expect(out[3]).toBeGreaterThan(0);
      else expect(out[3], kind).toBe(0);
    }
  });

  it('mixes by strength in linear light, and does nothing when off or at none', () => {
    const full = run({ effect: 'duotone', shadow: '#000000', highlight: '#ffffff' });
    const half = run({ effect: 'duotone', shadow: '#000000', highlight: '#ffffff', strength: 0.5 });
    const src = picture(W, H);
    const i = (10 * W + 30) * 4;
    expect(Math.abs(enc((dec(src[i]!) + dec(full[i]!)) / 2) - half[i]!)).toBeLessThanOrEqual(1);
    expect(same(run({ ...newStep('grain'), off: true }), src)).toBe(true);
    expect(same(run({ ...newStep('grain'), strength: 0 }), src)).toBe(true);
  });

  it('turns duotone darks and lights into the two colours, and the balance moves the middle', () => {
    const d = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    ImageEffects.apply({ effect: 'duotone', shadow: '#102030', highlight: '#f0e0d0' }, d, 2, 1, 1);
    for (const [got, want] of [[d[0], 16], [d[1], 32], [d[2], 48], [d[4], 240], [d[5], 224], [d[6], 208]]) expect(Math.abs(got! - want!)).toBeLessThanOrEqual(1);
    const grey = () => new Uint8ClampedArray([128, 128, 128, 255]);
    const mid = (balance: number) => ImageEffects.apply({ effect: 'duotone', shadow: '#000000', highlight: '#ffffff', balance }, grey(), 1, 1, 1)[0]!;
    expect(mid(100)).toBeLessThan(mid(0));
    expect(mid(-100)).toBeGreaterThan(mid(0));
  });

  it('posterizes to the levels asked for', () => {
    const out = run({ effect: 'posterize', levels: 2, gamma: 5 });
    const values = new Set<number>();
    for (let i = 0; i < out.length; i += 4) values.add(out[i]!);
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255]);
  });

  it('draws halftone only in its ink and paper, with tones true from a distance', () => {
    const ht = run({ effect: 'halftone', spacing: 6, angle: 45, shape: 'circle', contrast: 5, ink: '#000000', paper: '#ffffff' });
    for (let i = 0; i < ht.length; i += 4) expect(ht[i]).toBe(ht[i + 1]);
    // A flat tone, screened, averages back to itself: the dot area is worked out in light, not guessed.
    for (const v of [40, 128, 210]) {
      const d = flat(64, 64, v);
      ImageEffects.apply({ effect: 'halftone', spacing: 8, angle: 45, shape: 'circle', contrast: 5, ink: '#000000', paper: '#ffffff' }, d, 64, 64, 1);
      expect(Math.abs(seenFromAfar(d) - v), `tone ${v}`).toBeLessThanOrEqual(3);
    }
  });

  it('separates CMYK into four inks, and leaves white paper white', () => {
    const d = new Uint8ClampedArray(32 * 32 * 4);
    for (let i = 0; i < 32 * 32; i++) d.set([200, 40, 60, 255], i * 4);
    ImageEffects.apply({ effect: 'halftone', spacing: 6, angle: 45, shape: 'circle', contrast: 5, ink: '#000000', paper: '#ffffff', mode: 'cmyk' }, d, 32, 32, 1);
    expect(seenFromAfar(d, 0)).toBeGreaterThan(seenFromAfar(d, 1) + 40);
    const white = flat(16, 16, 255);
    ImageEffects.apply({ effect: 'halftone', spacing: 6, angle: 45, shape: 'circle', contrast: 5, ink: '#000000', paper: '#ffffff', mode: 'cmyk' }, white, 16, 16, 1);
    expect(seenFromAfar(white)).toBe(255);
  });

  it('keeps grain the same size on the page at 2×', () => {
    const one = flat(8, 8, 128);
    const two = flat(16, 16, 128);
    ImageEffects.apply({ effect: 'grain', amount: 100, mono: 100, seed: 5, size: 2 }, one, 8, 8, 1);
    ImageEffects.apply({ effect: 'grain', amount: 100, mono: 100, seed: 5, size: 2 }, two, 16, 16, 2);
    expect(Math.abs(one[(2 * 8 + 3) * 4]! - two[(4 * 16 + 6) * 4]!)).toBeLessThanOrEqual(2);
  });

  it('dithers posterize the same way every time, and diffusion keeps the average tone', () => {
    const grad = () => {
      const d = new Uint8ClampedArray(64 * 8 * 4);
      for (let i = 0; i < 64 * 8; i++) d.set([((i % 64) * 4) | 0, ((i % 64) * 4) | 0, ((i % 64) * 4) | 0, 255], i * 4);
      return d;
    };
    const a = ImageEffects.apply({ effect: 'posterize', levels: 2, gamma: 5, dither: 'diffusion' }, grad(), 64, 8, 1);
    expect(same(a, ImageEffects.apply({ effect: 'posterize', levels: 2, gamma: 5, dither: 'diffusion' }, grad(), 64, 8, 1))).toBe(true);
    const mean = (d: Uint8ClampedArray) => d.filter((_, i) => i % 4 === 0).reduce((x, y) => x + y, 0) / (d.length / 4);
    expect(Math.abs(mean(a) - mean(grad()))).toBeLessThan(6);
    expect(Math.abs(mean(ImageEffects.apply({ effect: 'posterize', levels: 2, gamma: 5 }, grad(), 64, 8, 1)) - mean(grad()))).toBeGreaterThan(Math.abs(mean(a) - mean(grad())));
  });

  it('blurs in linear light, so the line between red and green does not go dark', () => {
    const d = new Uint8ClampedArray(20 * 4 * 4);
    for (let i = 0; i < 20 * 4; i++) d.set(i % 20 < 10 ? [255, 0, 0, 255] : [0, 255, 0, 255], i * 4);
    ImageEffects.apply({ effect: 'blur', radius: 3 }, d, 20, 4, 1);
    const i = (1 * 20 + 10) * 4;
    // Averaged as sRGB bytes the seam would be about 128, 128: muddy. In light it is brighter.
    expect(d[i]! + d[i + 1]!).toBeGreaterThan(300);
  });

  it('sharpens edges and leaves flat areas alone', () => {
    const d = new Uint8ClampedArray(20 * 4 * 4);
    for (let i = 0; i < 20 * 4; i++) d.set(i % 20 < 10 ? [80, 80, 80, 255] : [170, 170, 170, 255], i * 4);
    ImageEffects.apply({ effect: 'sharpen', amount: 150, radius: 1.5, threshold: 2 }, d, 20, 4, 1);
    expect(d[(1 * 20 + 9) * 4]).toBeLessThan(80);
    expect(d[(1 * 20 + 10) * 4]).toBeGreaterThan(170);
    expect(d[(1 * 20 + 2) * 4]).toBe(80);
  });

  it('darkens towards the edges in stops, and leaves the middle', () => {
    const d = flat(21, 21, 200);
    ImageEffects.apply({ effect: 'vignette', amount: 100, spread: 60, feather: 60 }, d, 21, 21, 1);
    expect(d[(10 * 21 + 10) * 4]).toBe(200);
    // Two and a half stops down at the corner.
    expect(Math.abs(d[0]! - Math.round(enc(dec(200) / Math.pow(2, 2.5))))).toBeLessThanOrEqual(2);
  });

  it('leaves a picture byte for byte as it was when a step changes nothing', () => {
    const src = picture(W, H);
    expect(same(run({ effect: 'adjust', brightness: 0, contrast: 0, saturation: 0 }), src)).toBe(true);
  });
});

describe('the stack', () => {
  const rect = (extra: Partial<FreeformLayer> = {}) => ({ kind: 'rect', id: 'r', x: 0, y: 0, width: 10, height: 10, fill: null, stroke: null, strokeWidth: 0, radius: 0, ...extra }) as FreeformLayer;
  const block = (layers: FreeformLayer[], effects?: EffectStep[]) => ({ id: 'f', type: 'freeform', width: 100, height: 50, background: null, layers, ...(effects ? { effects } : {}) }) as unknown as FreeformBlock;

  it('counts a layer’s effects as effects, and not ones that are off', () => {
    expect(hasEffects(block([rect()]))).toBe(false);
    expect(hasEffects(block([rect({ effects: [newStep('blur')] })]))).toBe(true);
    expect(hasEffects(block([rect({ effects: [{ ...newStep('blur'), off: true }] })]))).toBe(false);
    expect(hasEffects(block([rect()], [{ ...newStep('grain'), strength: 0 }]))).toBe(false);
  });

  it('makes a layer’s effects part of the recipe, and none leaves no field', () => {
    const plain = rect();
    const with_ = withLayerEffects(plain, [newStep('duotone')]);
    expect(recipeHash(block([with_]))).not.toBe(recipeHash(block([plain])));
    expect('effects' in withLayerEffects(with_, [])).toBe(false);
  });

  it('moves steps, and summarises the live ones', () => {
    const list = [newStep('adjust'), newStep('grain'), { ...newStep('blur'), off: true }];
    expect(moveStep(list, 0, 1).map((s) => s.effect)).toEqual(['grain', 'adjust', 'blur']);
    expect(stackSummary(list)).toBe('Adjust, Grain');
  });

  it('brings the Riso tool’s settings back into their own step, keeping the rest', () => {
    const list: EffectStep[] = [newStep('duotone'), { ...risoStep(0, 1), strength: 0.6 }, newStep('grain')];
    const back = withRisoStep(list, risoStep(2, 9));
    expect(back.map((s) => s.effect)).toEqual(['duotone', 'riso', 'grain']);
    expect(back[1]).toMatchObject({ seed: 9, strength: 0.6 });
    expect(withRisoStep([newStep('blur')], risoStep(0, 1)).map((s) => s.effect)).toEqual(['blur', 'riso']);
  });

  it('checks a step from outside: clamps numbers, drops what it does not know', () => {
    expect(normalizeStep({ effect: 'blur', radius: 900, strength: 3 })).toEqual({ effect: 'blur', radius: 40, strength: 1 });
    expect(normalizeStep({ effect: 'halftone', shape: 'star', ink: 'red' })).toMatchObject({ shape: 'circle', ink: '#000000' });
    expect(normalizeStep({ effect: 'sparkle' })).toBeNull();
  });

  it('ships looks whose every step is a step', () => {
    for (const look of LOOKS) for (const s of look.steps()) expect(normalizeStep(s), look.name).not.toBeNull();
  });
});
