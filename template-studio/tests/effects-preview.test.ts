import { describe, expect, it } from 'vitest';

import { DRAFT_SCALE, printPasses, sharpScale, SLOW_PRINT_MS } from '../src/app/effects-preview.ts';

describe('effects preview', () => {
  it('prints sharp at the screen’s resolution, 2× to 4×', () => {
    expect(sharpScale(0.5, 2)).toBe(2);
    expect(sharpScale(1.5, 2)).toBe(3);
    expect(sharpScale(4, 2)).toBe(4);
  });

  it('Full prints sharp once', () => {
    expect(printPasses('full', 5000, 3)).toEqual([expect.objectContaining({ scale: 3, draft: false })]);
  });

  it('Fast drafts and never sharpens', () => {
    expect(printPasses('fast', 10, 3)).toEqual([expect.objectContaining({ scale: DRAFT_SCALE, draft: true })]);
  });

  it('Auto drafts first when the last sharp print was slow, or untimed', () => {
    for (const ms of [null, SLOW_PRINT_MS + 1]) {
      const passes = printPasses('auto', ms, 3);
      expect(passes.map((p) => p.draft)).toEqual([true, false]);
      expect(passes[1]!.delay).toBeGreaterThan(passes[0]!.delay);
    }
  });

  it('Auto goes straight to sharp on a light page', () => {
    expect(printPasses('auto', 40, 2).map((p) => p.draft)).toEqual([false]);
  });
});
