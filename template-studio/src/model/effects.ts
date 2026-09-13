// Effects on a freeform page: the steps, the changes to them, and the hand-off to the tools they come from.
//
// Jared: "what about adding a way to take a freeform frame and editing it in inkbleed or riso. or
// allowing those effects to be used in freeform?" Both, through one module: the press in
// `effects/riso.js` prints on the canvas, and the separator tool opens the same picture with every dial
// and sends its settings back (docs/freeform-and-effects.md).
//
// Pure, like the rest of the model. Running a step needs pixels, which is the app's (picture.ts).

import { Riso } from '../effects/riso.ts';
import { withFreeform } from './freeform.ts';
import type { EffectStep, RisoInk, RisoPress, Template } from './types.ts';

/** Where Freeform leaves the picture and the settings for the Riso tool. */
export const HANDOFF_RISO = 'scuggnizzi.handoff.riso';
/** Where the Riso tool leaves the settings it sends back. */
export const HANDOFF_RISO_RETURN = 'scuggnizzi.handoff.riso.return';

export const RISO_PRESETS = Riso.PRESETS;
export const RISO_SWATCHES = Riso.SWATCHES;

/** A Riso step from one of the tool's presets. */
export function risoStep(preset = 0, seed = 1): EffectStep {
  const p = RISO_PRESETS[preset] ?? RISO_PRESETS[0]!;
  return { effect: 'riso', inks: p.apply.inks.map((ink) => ({ ...ink })), press: { ...p.apply.press }, seed };
}

/** Replaces a page's effects. None at all removes the field, so a page without effects is the page it was. */
export function setEffects(template: Template, blockId: string, effects: EffectStep[] | undefined): Template {
  return withFreeform(template, blockId, (block) => {
    const { effects: _old, ...rest } = block;
    void _old;
    return effects && effects.length ? { ...rest, effects } : rest;
  });
}

const HEX = /^#[0-9a-f]{6}$/i;
const SOURCES: RisoInk['source'][] = ['lum', 'shadows', 'mids', 'highlights', 'red', 'green', 'blue', 'sat', 'flat'];
const SCREENS: RisoInk['screen'][] = ['dot', 'line', 'grain'];

const clampTo = (value: unknown, lo: number, hi: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;

/**
 * A Riso step as it comes back from the tool, checked. It arrives through the browser's storage from
 * another page, so nothing about its shape is trusted: every number is clamped to the range of the
 * tool's own slider and anything missing takes the tool's default. Null when it is not a step at all.
 */
export function normalizeRiso(value: unknown): EffectStep | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { effect?: unknown; inks?: unknown; press?: unknown; seed?: unknown };
  if (v.effect !== 'riso' || !Array.isArray(v.inks) || v.inks.length === 0) return null;
  const d = Riso.INK_DEFAULT;
  const inks: RisoInk[] = v.inks.slice(0, 3).map((raw) => {
    const i = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      color: typeof i['color'] === 'string' && HEX.test(i['color']) ? i['color'].toLowerCase() : d.color,
      source: SOURCES.includes(i['source'] as RisoInk['source']) ? (i['source'] as RisoInk['source']) : d.source,
      invert: i['invert'] === true,
      density: clampTo(i['density'], 0, 2, d.density),
      contrast: clampTo(i['contrast'], 0.2, 3, d.contrast),
      lift: clampTo(i['lift'], 0, 0.6, d.lift),
      screen: SCREENS.includes(i['screen'] as RisoInk['screen']) ? (i['screen'] as RisoInk['screen']) : d.screen,
      cell: clampTo(i['cell'], 2, 24, d.cell),
      angle: clampTo(i['angle'], 0, 180, d.angle),
      opacity: clampTo(i['opacity'], 0, 1, d.opacity),
      dx: clampTo(i['dx'], -3, 3, 0),
      dy: clampTo(i['dy'], -3, 3, 0),
    };
  });
  const p = (v.press && typeof v.press === 'object' ? v.press : {}) as Record<string, unknown>;
  const base = RISO_PRESETS[0]!.apply.press;
  const press: RisoPress = {
    paper: typeof p['paper'] === 'string' && HEX.test(p['paper']) ? p['paper'].toLowerCase() : base.paper,
    grain: clampTo(p['grain'], 0, 1, base.grain),
    soak: clampTo(p['soak'], 0, 1, base.soak),
    spread: clampTo(p['spread'], 0, 1, base.spread),
    dither: clampTo(p['dither'], 0, 1, base.dither),
    misreg: clampTo(p['misreg'], 0, 3, base.misreg),
  };
  const seed = Math.max(1, Math.round(clampTo(v.seed, 1, 1e9, 1)));
  return { effect: 'riso', inks, press, seed };
}

// --- looks saved to the project -------------------------------------------------------------------------
//
// Jared: "add the option to save a riso preset in the riso editor, and those presets get saved to the
// project and show in freeform." Until the project folder exists (docs/projects.md), the project's
// shared place is this site's storage, which every tool on the origin reads: one list under one key,
// shaped so it can move into the folder as `presets/riso.json` unchanged. The Riso tool writes the same
// shape inline (riso/riso.html, "Presets and reset").

export const RISO_PROJECT_PRESETS = 'scuggnizzi.project.riso-presets';

export interface SavedRisoPreset {
  id: string;
  name: string;
  step: EffectStep;
}

/** The saved looks, each checked like a step back from the tool. Anything unreadable is left out, never fatal. */
export function readSavedRisoPresets(raw: string | null): SavedRisoPreset[] {
  let list: unknown[] = [];
  try {
    const value = raw ? (JSON.parse(raw) as { presets?: unknown }) : null;
    if (value && Array.isArray(value.presets)) list = value.presets;
  } catch {
    return [];
  }
  return list.flatMap((p) => {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const name = typeof o['name'] === 'string' ? o['name'].trim().slice(0, 40) : '';
    const step = normalizeRiso({ effect: 'riso', inks: o['inks'], press: o['press'], seed: o['seed'] });
    return name && step ? [{ id: typeof o['id'] === 'string' ? o['id'] : name, name, step }] : [];
  });
}

/** The stored list with a look saved under a name. A look already under that name, in any case, is replaced. */
export function withSavedRisoPreset(raw: string | null, name: string, step: EffectStep, id: string, now = Date.now()): string {
  let list: unknown[] = [];
  try {
    const value = raw ? (JSON.parse(raw) as { presets?: unknown }) : null;
    if (value && Array.isArray(value.presets)) list = value.presets;
  } catch {
    list = [];
  }
  const clean = name.trim().slice(0, 40) || 'Untitled look';
  const nameOf = (p: unknown) => (p && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string' ? (p as { name: string }).name.trim().toLowerCase() : '');
  const kept = list.filter((p) => nameOf(p) !== clean.toLowerCase());
  return JSON.stringify({ version: 1, presets: [...kept, { id, name: clean, inks: step.inks, press: step.press, seed: step.seed, savedAt: now }] });
}

export function withoutSavedRisoPreset(raw: string | null, id: string): string {
  let list: unknown[] = [];
  try {
    const value = raw ? (JSON.parse(raw) as { presets?: unknown }) : null;
    if (value && Array.isArray(value.presets)) list = value.presets;
  } catch {
    list = [];
  }
  return JSON.stringify({ version: 1, presets: list.filter((p) => !(p && typeof p === 'object' && (p as { id?: unknown }).id === id)) });
}

/** New offsets for every ink after the first, within the press's misregistration range, from the seed. */
export function misregister(step: EffectStep, misreg: number, seed = step.seed): EffectStep {
  const m = Math.max(0, Math.min(3, misreg));
  return { ...step, seed, press: { ...step.press, misreg: m }, inks: Riso.misregister(step.inks, m, seed) };
}
