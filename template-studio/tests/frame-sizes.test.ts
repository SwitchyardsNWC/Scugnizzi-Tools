// Frame sizes and starters: every starter fits inside every size, and scales with the frame.

import { describe, expect, it } from 'vitest';

import { freeformSvg } from '../src/compile/freeform.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { EMAIL_MAX, FRAME_MAX, FRAME_SIZES, sizeOf, STARTERS, starterOf } from '../src/model/frame-sizes.ts';
import { layerBox } from '../src/model/freeform.ts';
import type { FreeformBlock } from '../src/model/types.ts';

describe('frame sizes and starters', () => {
  it('names each size once, and every one fits a Freeform frame', () => {
    expect(new Set(FRAME_SIZES.map((s) => s.key)).size).toBe(FRAME_SIZES.length);
    for (const s of FRAME_SIZES) expect(s.width <= FRAME_MAX.width && s.height <= FRAME_MAX.height, s.key).toBe(true);
    expect(FRAME_SIZES.filter((s) => s.group === 'Email').every((s) => s.width <= EMAIL_MAX.width)).toBe(true);
    expect(sizeOf(1080, 1920)?.label).toBe('Instagram story');
    expect(sizeOf(1, 1)).toBeUndefined();
  });

  it('lays every starter out inside every size, with unique layer ids, and draws it', () => {
    for (const st of STARTERS)
      for (const size of FRAME_SIZES) {
        const layers = st.layers(size.width, size.height, DEFAULT_DESIGN_SYSTEM);
        expect(new Set(layers.map((l) => l.id)).size, `${st.key} ${size.key}`).toBe(layers.length);
        for (const l of layers) {
          const b = layerBox(l, 1);
          expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= size.width + 0.5 && b.y <= size.height, `${st.key} ${size.key} ${l.id}`).toBe(true);
        }
        const svg = freeformSvg({ id: 'f', type: 'freeform', width: size.width, height: size.height, background: null, layers } as unknown as FreeformBlock, DEFAULT_DESIGN_SYSTEM);
        expect(svg.startsWith('<svg')).toBe(true);
      }
  });

  it('scales type with the frame’s short side', () => {
    const size = (w: number, h: number) => (starterOf('headline').layers(w, h, DEFAULT_DESIGN_SYSTEM)[1] as { size: number }).size;
    expect(size(1080, 1080)).toBeCloseTo(size(560, 280) * (1080 / 280), -1);
    expect(starterOf('nope').key).toBe('blank');
  });
});
