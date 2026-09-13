// The typed door to the shared Riso press, `effects/riso.js` at the repo root.
//
// That file is a plain script rather than an ES module so the single-file tools can load it with a
// <script> tag from a plain static server. Importing it here runs it once, and it sets
// `globalThis.RisoEngine`; this file gives that global its types. It is DOM-free, so the model and the
// tests can use it under Node.

import '../../../effects/riso.js';
import type { RisoInk, RisoPress } from '../model/types.ts';

export interface RisoSource {
  w: number;
  h: number;
  data: Uint8ClampedArray;
  lum: Float32Array;
  sat: Float32Array;
}

export interface RisoFields {
  seed: number;
  w: number;
  h: number;
  unit: number;
  W: Float32Array;
  B: Float32Array;
  P: Float32Array;
}

export interface RisoSettings {
  inks: RisoInk[];
  press: RisoPress;
}

export interface RisoEngineApi {
  version: number;
  PX_PER_MM: number;
  SWATCHES: Array<[string, string]>;
  INK_DEFAULT: RisoInk;
  PRESETS: Array<{ name: string; desc: string; apply: RisoSettings }>;
  inkName(hex: string): string;
  mulberry32(seed: number): () => number;
  prepare(data: Uint8ClampedArray, w: number, h: number): RisoSource;
  fields(w: number, h: number, seed: number, unit?: number): RisoFields;
  coverage(src: RisoSource, ink: RisoInk, press: RisoPress, fields: RisoFields, unit?: number): Float32Array;
  composite(src: RisoSource, inks: RisoInk[], press: RisoPress, covs: Float32Array[], fields: RisoFields, unit?: number): Uint8ClampedArray<ArrayBuffer>;
  separation(cov: Float32Array, w: number, h: number): Uint8ClampedArray<ArrayBuffer>;
  /** Everything at once. `unit` is image pixels per press pixel: 2 for a picture drawn at 2×. */
  render(src: RisoSource, settings: RisoSettings, seed: number, unit?: number): Uint8ClampedArray<ArrayBuffer>;
  misregister(inks: RisoInk[], misreg: number, seed: number): RisoInk[];
}

export const Riso = (globalThis as unknown as { RisoEngine: RisoEngineApi }).RisoEngine;
