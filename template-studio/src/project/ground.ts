// What lies under the board (canvas-settings.ts › ground), as the sizes and offsets that keep it fixed to the paper.
//
// Jared: "create a couple other background types. cutting mat, dot grid, and give opacity controls for them all."
// The CSS (project.css, `.pb-under-*`) draws each ground as a stack of repeating images: hairlines, dots, or a
// mat's lines and diagonals. This sizes those tiles to the zoom and slides them with the view, so the pattern
// is part of the paper and not of the window, and hands over the ground's own opacity. Pure.

import type { CanvasSettings } from '../app/canvas-settings.ts';

export interface View {
  x: number;
  y: number;
  z: number;
}

/** A type alias, not an interface, so it passes as inline style without an index signature of its own. */
export type UnderStyle = {
  backgroundSize: string;
  backgroundPosition: string;
  opacity: number;
};

/** The fine step on screen: the board's step at this zoom, ×5 and ×20 as the board zooms out so the pattern never crowds. */
export const fineStep = (step: number, z: number): number => step * z * (z < 0.2 ? 20 : z < 0.45 ? 5 : 1);

/**
 * How much of the ground's own opacity shows at this zoom: all of it from 60% up, then less as the board zooms out,
 * down to about a third. Zoomed out, the cards are small and the pattern behind them would otherwise compete.
 */
export const groundFade = (z: number): number => (z >= 0.6 ? 1 : Math.max(0.35, (z - 0.2) / 0.4));

const square = (n: number) => `${n}px ${n}px`;
const same = <T,>(value: T, n: number): T[] => Array.from({ length: n }, () => value);

/**
 * The inline style for the ground layer, one size and position per image its class draws, or null for plain paper.
 * The firm line, and the bigger dot, is every fifth step. A dot sits at the centre of its tile, so dot tiles start
 * half a step back and the dots land where the lines would cross, which is where snap puts things.
 */
export function underStyle(settings: Pick<CanvasSettings, 'ground' | 'groundOpacity' | 'gridStep'>, view: View): UnderStyle | null {
  if (settings.ground === 'none') return null;
  const fine = fineStep(settings.gridStep, view.z);
  const major = fine * 5;
  const at = `${view.x}px ${view.y}px`;
  const opacity = settings.groundOpacity[settings.ground] * groundFade(view.z);
  switch (settings.ground) {
    case 'lines':
      return { backgroundSize: [square(fine), square(fine), square(major), square(major)].join(', '), backgroundPosition: same(at, 4).join(', '), opacity };
    case 'dots':
      return {
        backgroundSize: [square(major), square(fine)].join(', '),
        backgroundPosition: [`${view.x - major / 2}px ${view.y - major / 2}px`, `${view.x - fine / 2}px ${view.y - fine / 2}px`].join(', '),
        opacity,
      };
    case 'mat':
      // Firm lines, the two diagonals through their crossings, then the fine lines: six images, the first on top.
      return { backgroundSize: [...same(square(major), 4), square(fine), square(fine)].join(', '), backgroundPosition: same(at, 6).join(', '), opacity };
  }
}
