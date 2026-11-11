// Snapping, smart guides and the properties panel's numbers on the freeform canvas.
// Defended: a box near a target snaps and says where; one beyond the threshold does not; resizing pulls only
// the moving edge; numbers set position and size for a layer and for a drawing; opacity leaves no field
// at full; aligning uses the turned box, so a rotated layer really meets the edge.

import { describe, expect, it } from 'vitest';

import { freeformSvg } from '../src/compile/freeform.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { alignToPage, geometryOf, withGeometry, withOpacity, withRotation } from '../src/model/properties.ts';
import { boundsOf, snapMove, snapResize, snapTargets } from '../src/model/snap.ts';
import type { FreeformBlock, FreeformLayer } from '../src/model/types.ts';

const rect = (id: string, x: number, y: number, width = 100, height = 50, extra: Partial<FreeformLayer> = {}): FreeformLayer =>
  ({ kind: 'rect', id, x, y, width, height, fill: null, stroke: null, strokeWidth: 0, radius: 0, ...extra }) as FreeformLayer;
const page = { width: 560, height: 280 };

describe('snapping', () => {
  it('pulls a box to the page centre and draws the guide', () => {
    const r = snapMove({ x: 227, y: 40, width: 100, height: 50 }, snapTargets(page, []), 6);
    expect(r.dx).toBe(3);
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([{ axis: 'x', at: 280, from: 0, to: 280 }]);
  });

  it('lines up with another layer’s edge, on both axes at once', () => {
    const other = { x: 300, y: 100, width: 80, height: 80 };
    const r = snapMove({ x: 296, y: 177, width: 50, height: 20 }, snapTargets(page, [other]), 6);
    expect([r.dx, r.dy]).toEqual([4, 3]);
    expect(r.guides.map((g) => g.axis)).toEqual(['x', 'y']);
  });

  it('leaves a box alone past the threshold', () => {
    expect(snapMove({ x: 20, y: 20, width: 100, height: 50 }, snapTargets(page, []), 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('resizes by pulling only the edge the handle moves', () => {
    const r = snapResize({ x: 10, y: 10, width: 545, height: 50 }, 'e', snapTargets(page, []), 6);
    expect(r.box).toEqual({ x: 10, y: 10, width: 550, height: 50 });
    const w = snapResize({ x: 4, y: 10, width: 100, height: 50 }, 'w', snapTargets(page, []), 6);
    expect(w.box).toEqual({ x: 0, y: 10, width: 104, height: 50 });
  });

  it('measures a turned layer by its turned corners', () => {
    const b = boundsOf(rect('a', 0, 0, 100, 100, { rotation: 45 }));
    expect(Math.round(b.width)).toBe(141);
  });
});

describe('properties', () => {
  it('reads and sets a layer’s numbers', () => {
    const l = rect('a', 10, 20);
    expect(geometryOf([l], false)).toMatchObject({ x: 10, y: 20, width: 100, height: 50, rotation: 0, opacity: 1, heightFixed: false });
    expect(withGeometry([l], false, { x: 40, width: 200 })[0]).toMatchObject({ x: 40, y: 20, width: 200, height: 50 });
  });

  it('scales a drawing’s strokes together', () => {
    const a = rect('a', 0, 0, 50, 50, { group: 'g' });
    const b = rect('b', 50, 50, 50, 50, { group: 'g' });
    const [a2, b2] = withGeometry([a, b], true, { width: 200, height: 200 });
    expect(a2).toMatchObject({ x: 0, y: 0, width: 100, height: 100 });
    expect(b2).toMatchObject({ x: 100, y: 100, width: 100, height: 100 });
    expect(geometryOf([a, b], true)!.rotation).toBeNull();
  });

  it('keeps text’s height its own', () => {
    const t = { kind: 'text', id: 't', text: 'Hi', role: 'h2', color: null, x: 0, y: 0, width: 200, align: 'left' } as FreeformLayer;
    expect(geometryOf([t], false, { t: 40 })).toMatchObject({ height: 40, heightFixed: true });
  });

  it('turns, and turning back to 0 leaves no field', () => {
    expect(withRotation(rect('a', 0, 0), -90).rotation).toBe(270);
    expect('rotation' in withRotation(rect('a', 0, 0, 10, 10, { rotation: 30 }), 360)).toBe(false);
  });

  it('fades any layer, and full opacity leaves the recipe as it was', () => {
    const l = rect('a', 0, 0);
    const faded = withOpacity([l], 0.5)[0]!;
    expect(faded.opacity).toBe(0.5);
    expect('opacity' in withOpacity([faded], 1)[0]!).toBe(false);
    const block = { id: 'f', type: 'freeform', width: 560, height: 280, background: null, layers: [faded] } as unknown as FreeformBlock;
    expect(freeformSvg(block, DEFAULT_DESIGN_SYSTEM)).toContain('opacity="0.5"');
    expect(freeformSvg({ ...block, layers: [l] }, DEFAULT_DESIGN_SYSTEM)).not.toContain('opacity="');
  });

  it('aligns to the page by the box a turned layer really covers', () => {
    const [right] = alignToPage([rect('a', 0, 0, 100, 50)], page, 'right');
    expect(right).toMatchObject({ x: 460 });
    const turned = rect('b', 100, 100, 100, 100, { rotation: 45 });
    const [left] = alignToPage([turned], page, 'left');
    expect(boundsOf(left!).x).toBeCloseTo(0, 0);
  });
});
