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

describe('image effects', () => {
  const kinds = EFFECT_KINDS.filter((k) => k !== 'riso');

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

  it('mixes by strength, and does nothing when off or at none', () => {
    const full = run({ effect: 'duotone', shadow: '#000000', highlight: '#ffffff' });
    const half = run({ effect: 'duotone', shadow: '#000000', highlight: '#ffffff', strength: 0.5 });
    const src = picture(W, H);
    const i = (10 * W + 30) * 4;
    expect(half[i]).toBe(Math.round(src[i]! + (full[i]! - src[i]!) * 0.5));
    expect(same(run({ ...newStep('grain'), off: true }), src)).toBe(true);
    expect(same(run({ ...newStep('grain'), strength: 0 }), src)).toBe(true);
  });

  it('turns duotone darks and lights into the two colours', () => {
    const d = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    ImageEffects.apply({ effect: 'duotone', shadow: '#102030', highlight: '#f0e0d0' }, d, 2, 1, 1);
    expect([...d]).toEqual([16, 32, 48, 255, 240, 224, 208, 255]);
  });

  it('posterizes to the levels asked for', () => {
    const out = run({ effect: 'posterize', levels: 2, gamma: 5 });
    const values = new Set<number>();
    for (let i = 0; i < out.length; i += 4) values.add(out[i]!);
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255]);
  });

  it('draws halftone only in its ink and paper, and grain one per page pixel at 2×', () => {
    const ht = run({ effect: 'halftone', spacing: 6, angle: 45, shape: 'circle', contrast: 5, ink: '#000000', paper: '#ffffff' });
    for (let i = 0; i < ht.length; i += 4) expect(ht[i]).toBe(ht[i + 1]);
    const d = new Uint8ClampedArray(4 * 4 * 4).fill(128);
    ImageEffects.apply({ effect: 'grain', amount: 100, mono: 100, seed: 5 }, d, 4, 4, 2);
    expect(d[0]).toBe(d[4]);
    expect(d[0]).toBe(d[4 * 4]);
  });

  it('darkens the corners and leaves the middle with a vignette', () => {
    const d = new Uint8ClampedArray(21 * 21 * 4).fill(200);
    ImageEffects.apply({ effect: 'vignette', amount: 100, spread: 60 }, d, 21, 21, 1);
    expect(d[(10 * 21 + 10) * 4]).toBe(200);
    expect(d[0]).toBeLessThan(60);
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
