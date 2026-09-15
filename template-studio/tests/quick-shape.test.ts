// Quick shapes (model/quick-shape.ts).
//
// Defended: a wobbly line snaps to a line, level or upright when it nearly was; a loop drawn as a
// rectangle snaps to a rectangle at its tilt, and one drawn as a circle to an ellipse; three corners make
// a triangle; and a scribble, an open arc, a pentagon or a speck stay freehand.

import { describe, expect, it } from 'vitest';

import { addQuickShape } from '../src/model/freeform.ts';
import { quickShape } from '../src/model/quick-shape.ts';
import { createSection } from '../src/model/catalog.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { blankTemplate } from '../src/model/starters.ts';
import type { FreeformBlock } from '../src/model/types.ts';

/** Deterministic wobble, so the fixtures are the same every run. */
const noise = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648 - 0.5;
  };
};

const flat = (pts: Array<[number, number]>) => pts.flatMap(([x, y]) => [x, y]);

/** Points along a polygon's edges, `per` on each side, jittered by up to `wobble`, then closed near the start. */
function polygon(corners: Array<[number, number]>, per: number, wobble: number, seed = 1): number[] {
  const r = noise(seed);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < corners.length; i++) {
    const [ax, ay] = corners[i]!;
    const [bx, by] = corners[(i + 1) % corners.length]!;
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push([ax + (bx - ax) * t + r() * wobble, ay + (by - ay) * t + r() * wobble]);
    }
  }
  out.push([corners[0]![0] + r() * wobble, corners[0]![1] + r() * wobble]);
  return flat(out);
}

function rotated(corners: Array<[number, number]>, degrees: number, about: [number, number]): Array<[number, number]> {
  const a = (degrees * Math.PI) / 180;
  return corners.map(([x, y]) => [about[0] + (x - about[0]) * Math.cos(a) - (y - about[1]) * Math.sin(a), about[1] + (x - about[0]) * Math.sin(a) + (y - about[1]) * Math.cos(a)]);
}

function ellipse(cx: number, cy: number, rx: number, ry: number, n: number, wobble: number, seed = 2): number[] {
  const r = noise(seed);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([cx + rx * Math.cos(t) + r() * wobble, cy + ry * Math.sin(t) + r() * wobble]);
  }
  out.push([cx + rx + r() * wobble, cy + r() * wobble]);
  return flat(out);
}

describe('quick shapes', () => {
  it('snap a wobbly line to a line, and a nearly level or upright one to exactly that', () => {
    const r = noise(3);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 30; i++) pts.push([10 + i * 6, 40 + r() * 3 + i * 0.02]);
    expect(quickShape(flat(pts))).toEqual({ kind: 'line', x1: 10, y1: expect.any(Number), x2: 190, y2: expect.any(Number) });
    const level = quickShape(flat(pts)) as { y1: number; y2: number };
    expect(level.y1).toBe(level.y2);
    const up: Array<[number, number]> = [];
    for (let i = 0; i <= 30; i++) up.push([50 + r() * 3, 10 + i * 5]);
    const upright = quickShape(flat(up)) as { x1: number; x2: number };
    expect(upright.x1).toBe(upright.x2);
    const slanted = quickShape(flat(pts.map(([x, y]) => [x, y + (x - 10) * 0.7]))) as { kind: string; x1: number; x2: number; y1: number; y2: number };
    expect(slanted.kind).toBe('line');
    expect(slanted.y2).toBeGreaterThan(slanted.y1 + 100);
  });

  it('snap a rectangle at its tilt, and a level one to level', () => {
    const level = quickShape(polygon([[100, 100], [300, 100], [300, 220], [100, 220]], 18, 2.5));
    expect(level).toMatchObject({ kind: 'rect', rotation: 0 });
    const box = level as { x: number; y: number; width: number; height: number };
    expect(Math.abs(box.x - 100)).toBeLessThan(4);
    expect(Math.abs(box.width - 200)).toBeLessThan(6);
    expect(Math.abs(box.height - 120)).toBeLessThan(6);

    const tilted = quickShape(polygon(rotated([[100, 100], [300, 100], [300, 220], [100, 220]], 20, [200, 160]), 18, 2.5));
    expect(tilted).toMatchObject({ kind: 'rect' });
    const t = tilted as { rotation: number; width: number; height: number };
    expect(Math.abs(t.rotation - 20)).toBeLessThanOrEqual(2);
    expect(t.width).toBeGreaterThan(t.height);
  });

  it('snap a circle to an ellipse, and a squashed one keeps its proportions', () => {
    expect(quickShape(ellipse(200, 200, 80, 80, 60, 3))).toMatchObject({ kind: 'ellipse', rotation: 0 });
    const oval = quickShape(ellipse(200, 200, 120, 60, 60, 3)) as { kind: string; width: number; height: number };
    expect(oval.kind).toBe('ellipse');
    expect(oval.width / oval.height).toBeGreaterThan(1.7);
    expect(oval.width / oval.height).toBeLessThan(2.3);
  });

  it('snap three corners to a triangle, closed', () => {
    const tri = quickShape(polygon([[100, 250], [300, 250], [200, 80]], 24, 2));
    expect(tri).toMatchObject({ kind: 'triangle' });
    const pts = (tri as { points: number[] }).points;
    expect(pts).toHaveLength(8);
    expect(pts.slice(0, 2)).toEqual(pts.slice(6, 8));
  });

  it('leave a scribble, an open arc, a pentagon and a speck alone', () => {
    const r = noise(9);
    const scribble: Array<[number, number]> = [];
    for (let i = 0; i < 60; i++) scribble.push([100 + r() * 200, 100 + r() * 200]);
    expect(quickShape(flat(scribble))).toBeNull();
    const arc: Array<[number, number]> = [];
    for (let i = 0; i <= 30; i++) arc.push([200 + 100 * Math.cos((i / 30) * Math.PI), 200 - 100 * Math.sin((i / 30) * Math.PI)]);
    expect(quickShape(flat(arc))).toBeNull();
    const pent: Array<[number, number]> = [];
    for (let i = 0; i < 5; i++) pent.push([200 + 100 * Math.cos((i / 5) * Math.PI * 2), 200 + 100 * Math.sin((i / 5) * Math.PI * 2)]);
    expect(quickShape(polygon(pent, 16, 1))).toBeNull();
    expect(quickShape(polygon([[0, 0], [8, 0], [8, 8], [0, 8]], 6, 0.2))).toBeNull();
    expect(quickShape([1, 2, 3, 4])).toBeNull();
  });

  it('become layers that keep the pen’s colour and width, in the drawing’s group', () => {
    const ids = { id: () => 'b1', taken: new Set<string>() };
    const template = { ...blankTemplate(), sections: [createSection('freeform', ids, DEFAULT_DESIGN_SYSTEM)] };
    const blockId = (template.sections[0]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock).id;
    const layers = (t: typeof template) => (t.sections[0]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock).layers;
    const before = layers(template).length;
    const withRect = addQuickShape(template, blockId, { kind: 'rect', x: 10, y: 20, width: 100, height: 50, rotation: 15 }, 'accent', 6, 'g1', 'marker');
    expect(layers(withRect)[before]).toMatchObject({ kind: 'rect', x: 10, y: 20, width: 100, height: 50, rotation: 15, fill: null, stroke: 'accent', strokeWidth: 6, group: 'g1' });
    const withLevel = addQuickShape(template, blockId, { kind: 'ellipse', x: 0, y: 0, width: 40, height: 40, rotation: 0 }, null, 2.5);
    expect(layers(withLevel)[before]).not.toHaveProperty('rotation');
    const withLine = addQuickShape(template, blockId, { kind: 'line', x1: 0, y1: 0, x2: 50, y2: 0 }, null, 2.5, 'g1');
    expect(layers(withLine)[before]).toMatchObject({ kind: 'line', x2: 50, strokeWidth: 2.5, group: 'g1' });
    const withTri = addQuickShape(template, blockId, { kind: 'triangle', points: [0, 0, 50, 0, 25, 40, 0, 0] }, null, 6, 'g1', 'marker');
    expect(layers(withTri)[before]).toMatchObject({ kind: 'path', points: [0, 0, 50, 0, 25, 40, 0, 0], brush: 'marker', group: 'g1' });
  });
});
