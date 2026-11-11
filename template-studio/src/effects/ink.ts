// The typed door to the ink bleed engine, `effects/ink.js` at the repo root: a plain script that sets
// `globalThis.InkBleed`, like the Riso press and the image effects beside it. DOM-free.

import '../../../effects/ink.js';
import type { EffectStep } from '../model/types.ts';

export type InkStep = Extract<EffectStep, { effect: 'ink' }>;
export type InkSettings = Omit<InkStep, 'effect' | 'seed' | 'off' | 'strength'>;

export interface InkBleedApi {
  version: number;
  DEFAULTS: InkSettings & { seed: number };
  PRESETS: Array<{ name: string; desc: string; apply: InkSettings }>;
  /** One ink step on RGBA bytes, in place. `unit` is image pixels per page pixel. */
  apply(step: InkStep, data: Uint8ClampedArray, width: number, height: number, unit?: number): Uint8ClampedArray;
}

export const InkBleed = (globalThis as unknown as { InkBleed: InkBleedApi }).InkBleed;
