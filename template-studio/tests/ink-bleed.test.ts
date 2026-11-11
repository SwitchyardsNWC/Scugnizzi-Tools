// Ink bleed as an effect: the ink bleed tool's press, on a layer or on a page.
// Defended: the same step makes the same bytes; a page keeps its paper and its ink's colour; a layer's ink can
// spread past its shape but keeps its colour; stamp and smudge take ink away; every look is a step.

import { describe, expect, it } from 'vitest';

import { InkBleed } from '../src/effects/ink.ts';
import { inkStep, LOOKS, newStep, normalizeStep } from '../src/model/effects.ts';

const W = 120;
const H = 60;
type Ink = Extract<ReturnType<typeof inkStep>, { effect: 'ink' }>;
/** Bars of ink: navy on cream for a page, red on clear for a layer. */
function picture(opaque: boolean): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inside = x > 20 && x < 100 && y > 15 && y < 45 && ((x >> 3) & 1) === 0;
      if (opaque) d.set(inside ? [1, 18, 114, 255] : [247, 246, 243, 255], i);
      else d.set([210, 0, 0, inside ? 255 : 0], i);
    }
  return d;
}
const run = (opaque: boolean, extra: Partial<Ink> = {}) => InkBleed.apply({ ...(inkStep(0, 3) as Ink), ...extra }, picture(opaque), W, H, 2);
const at = (d: Uint8ClampedArray, x: number, y: number) => [...d.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];

describe('ink bleed', () => {
  it('makes the same bytes for the same step', () => {
    expect(Buffer.from(run(true)).equals(Buffer.from(run(true)))).toBe(true);
    expect(Buffer.from(run(true, { seed: 4 })).equals(Buffer.from(run(true)))).toBe(false);
  });

  it('keeps a page’s paper light and its ink navy', () => {
    const d = run(true, { dust: 0, speckle: 0, streaks: 0, grain: 0, elong: 0, jitter: 0 });
    const paper = at(d, 4, 4);
    expect(paper[0]).toBeGreaterThan(235);
    const ink = at(d, 35, 30);
    expect(ink[2]! - ink[0]!).toBeGreaterThan(40);
    expect(ink[0]).toBeLessThan(120);
  });

  it('spreads a layer’s ink past its shape, in its own colour', () => {
    const d = run(false, { spread: 2, soft: 1, rough: 0, fade: 0, grit: 0, elong: 0, jitter: 0 });
    // The bar starts at x 32: ink reaches a few pixels before it.
    expect(at(d, 30, 30)[3]).toBeGreaterThan(0);
    const mid = at(d, 35, 30);
    expect(mid[0]! > mid[1]! + 100).toBe(true);
  });

  it('takes ink away with a stamp, and leaves a picture with no ink alone', () => {
    const sum = (d: Uint8ClampedArray) => d.reduce((a, v, i) => (i % 4 === 3 ? a + v : a), 0);
    expect(sum(run(false, { stamp: 1, elong: 0, jitter: 0 }))).toBeLessThan(sum(run(false, { stamp: 0, elong: 0, jitter: 0 })));
    const empty = new Uint8ClampedArray(W * H * 4);
    InkBleed.apply(inkStep(0, 1) as Ink, empty, W, H, 2);
    expect(empty.every((v) => v === 0)).toBe(true);
  });

  it('is a step like the rest: made, checked, and offered as looks', () => {
    expect(newStep('ink').effect).toBe('ink');
    expect(normalizeStep({ effect: 'ink', spread: 9, stamp: -1 })).toMatchObject({ effect: 'ink', spread: 3, stamp: 0 });
    const names = LOOKS.map((l) => l.name);
    for (const p of InkBleed.PRESETS) expect(names).toContain(p.name);
  });
});
