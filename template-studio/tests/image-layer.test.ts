// Pictures in frames: fill, fit and stretch, zoom, focal point, the crop drag, corners and the ellipse mask.
// Defended: a picture placed the old way draws exactly as it did; the focal point holds the right part in view.

import { describe, expect, it } from 'vitest';

import { freeformSvg } from '../src/compile/freeform.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { focusAfterDrag, frameToPicture, imagePlacement, type ImageLayer } from '../src/model/image-layer.ts';
import type { FreeformBlock } from '../src/model/types.ts';

const pic = (extra: Partial<ImageLayer> = {}): ImageLayer => ({ kind: 'image', id: 'i', src: 'a.jpg', x: 10, y: 20, width: 200, height: 100, opacity: 1, natural: { width: 400, height: 400 }, ...extra });
const svg = (l: ImageLayer) => freeformSvg({ id: 'f', type: 'freeform', width: 400, height: 300, background: null, layers: [l] } as unknown as FreeformBlock, DEFAULT_DESIGN_SYSTEM);

describe('pictures in frames', () => {
  it('fills the frame by default, centred, and fits or stretches when asked', () => {
    expect(imagePlacement(pic())).toEqual({ x: 10, y: -30, width: 200, height: 200 });
    expect(imagePlacement(pic({ fit: 'fit' }))).toEqual({ x: 60, y: 20, width: 100, height: 100 });
    expect(imagePlacement(pic({ fit: 'stretch' }))).toEqual({ x: 10, y: 20, width: 200, height: 100 });
  });

  it('keeps the focal point in view, and zooms about it', () => {
    expect(imagePlacement(pic({ focusY: 0 }))!.y).toBe(20);
    expect(imagePlacement(pic({ focusY: 1 }))!.y).toBe(-80);
    expect(imagePlacement(pic({ zoom: 2 }))).toMatchObject({ width: 400, height: 400 });
  });

  it('moves the focus the other way to a crop drag, and stops at the edge', () => {
    expect(focusAfterDrag(pic(), { x: 0.5, y: 0.5 }, 0, 50)).toEqual({ focusX: 0.5, focusY: 0 });
    expect(focusAfterDrag(pic(), { x: 0.5, y: 0.5 }, 0, -500)).toEqual({ focusX: 0.5, focusY: 1 });
    // Across, a filled picture as wide as its frame has nothing to move.
    expect(focusAfterDrag(pic(), { x: 0.5, y: 0.5 }, 80, 0).focusX).toBe(0.5);
  });

  it('draws an old picture exactly as before, and a cropped, rounded or elliptical one clipped', () => {
    const old = svg(pic({ natural: undefined }));
    expect(old).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(old).not.toContain('clipPath');
    expect(svg(pic())).toMatch(/<clipPath id="sy-clip-i-10-20-200-100"><rect[^>]*\/><\/clipPath>/);
    expect(svg(pic({ radius: 12 }))).toContain('rx="12"');
    expect(svg(pic({ mask: 'ellipse' }))).toContain('<ellipse cx="110" cy="70" rx="100" ry="50"/>');
  });

  it('fits the frame to the picture’s own shape', () => {
    expect(frameToPicture(pic({ zoom: 2, focusX: 0 }))).toMatchObject({ width: 200, height: 200, fit: 'fill', zoom: undefined, focusX: undefined });
  });
});
