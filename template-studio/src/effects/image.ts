// The typed door to the shared image effects, `effects/image.js` at the repo root.
//
// A plain script for the same reason as the Riso press beside it: the single-file tools can load it with a
// <script> tag. Importing it here runs it once and it sets `globalThis.ImageEffects`; this file gives that
// global its types. DOM-free, so the model and the tests can use it under Node.

import '../../../effects/image.js';
import type { EffectKind, EffectStep } from '../model/types.ts';

export type ImageEffectKind = Exclude<EffectKind, 'riso'>;

export interface ImageEffectsApi {
  version: number;
  DEFAULTS: Record<ImageEffectKind, Record<string, unknown>>;
  LABELS: Record<ImageEffectKind, string>;
  SHAPES: string[];
  TEXTURES: string[];
  BLENDS: string[];
  /** One step on RGBA bytes, in place. `unit` is image pixels per page pixel. */
  apply(step: EffectStep, data: Uint8ClampedArray, width: number, height: number, unit?: number): Uint8ClampedArray;
}

export const ImageEffects = (globalThis as unknown as { ImageEffects: ImageEffectsApi }).ImageEffects;
