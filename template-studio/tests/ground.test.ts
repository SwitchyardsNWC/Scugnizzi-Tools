// What lies under the board (project/ground.ts).
//
// Defended: plain paper draws nothing; lines are one tile per image, firm every fifth, all sliding with the view;
// dots start half a step back so they land on the crossings; the mat is six images; the step grows ×5 and ×20 as
// the board zooms out; and each ground brings its own opacity.

import { describe, expect, it } from 'vitest';

import { DEFAULT_CANVAS_SETTINGS } from '../src/app/canvas-settings.ts';
import { fineStep, underStyle } from '../src/project/ground.ts';

const settings = (patch: Partial<typeof DEFAULT_CANVAS_SETTINGS> = {}) => ({ ...DEFAULT_CANVAS_SETTINGS, ...patch });

describe('the ground under the board', () => {
  it('is nothing for plain paper', () => {
    expect(underStyle(settings({ ground: 'none' }), { x: 10, y: 20, z: 1 })).toBeNull();
  });

  it('draws lines one tile per image, firm every fifth, sliding with the view', () => {
    const style = underStyle(settings({ ground: 'lines', gridStep: 24 }), { x: 10, y: -20, z: 1 })!;
    expect(style.backgroundSize).toBe('24px 24px, 24px 24px, 120px 120px, 120px 120px');
    expect(style.backgroundPosition).toBe('10px -20px, 10px -20px, 10px -20px, 10px -20px');
    expect(style.opacity).toBe(DEFAULT_CANVAS_SETTINGS.groundOpacity.lines);
  });

  it('starts dot tiles half a step back so the dots sit on the crossings', () => {
    const style = underStyle(settings({ ground: 'dots', gridStep: 24 }), { x: 0, y: 0, z: 1 })!;
    expect(style.backgroundSize).toBe('120px 120px, 24px 24px');
    expect(style.backgroundPosition).toBe('-60px -60px, -12px -12px');
    expect(style.opacity).toBe(DEFAULT_CANVAS_SETTINGS.groundOpacity.dots);
  });

  it('draws the mat as six images at its own opacity', () => {
    const style = underStyle(settings({ ground: 'mat', gridStep: 16, groundOpacity: { lines: 0.5, dots: 0.6, mat: 0.3 } }), { x: 0, y: 0, z: 2 })!;
    expect(style.backgroundSize.split(', ')).toEqual(['160px 160px', '160px 160px', '160px 160px', '160px 160px', '32px 32px', '32px 32px']);
    expect(style.backgroundPosition.split(', ')).toHaveLength(6);
    expect(style.opacity).toBe(0.3);
  });

  it('steps up as the board zooms out so the pattern never crowds', () => {
    expect(fineStep(24, 1)).toBe(24);
    expect(fineStep(24, 0.5)).toBe(12);
    expect(fineStep(24, 0.3)).toBeCloseTo(36);
    expect(fineStep(24, 0.1)).toBeCloseTo(48);
  });
});
