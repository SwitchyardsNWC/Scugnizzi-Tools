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
import { ImageEffects, type ImageEffectKind } from '../effects/image.ts';
import { InkBleed } from '../effects/ink.ts';
import type { EffectKind, EffectStep, FreeformBlock, FreeformLayer, RisoInk, RisoPress, RisoStep, Template } from './types.ts';

/** Where Freeform leaves the picture and the settings for the Riso tool. */
export const HANDOFF_RISO = 'scuggnizzi.handoff.riso';
/** Where the Riso tool leaves the settings it sends back. */
export const HANDOFF_RISO_RETURN = 'scuggnizzi.handoff.riso.return';

export const RISO_PRESETS = Riso.PRESETS;
export const RISO_SWATCHES = Riso.SWATCHES;

/** A Riso step from one of the tool's presets. */
export function risoStep(preset = 0, seed = 1): RisoStep {
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
export function normalizeRiso(value: unknown): RisoStep | null {
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
  step: RisoStep;
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
export function withSavedRisoPreset(raw: string | null, name: string, step: RisoStep, id: string, now = Date.now()): string {
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
export function misregister(step: RisoStep, misreg: number, seed = step.seed): RisoStep {
  const m = Math.max(0, Math.min(3, misreg));
  return { ...step, seed, press: { ...step.press, misreg: m }, inks: Riso.misregister(step.inks, m, seed) };
}

// --- the stack ----------------------------------------------------------------------------------------
//
// Jared: "rework the effects system". Effects are a stack now, on the whole page or on one layer: each step
// can be switched off, turned down, moved or removed, and Riso is one step among the image effects ported
// from the Image Effects tool (effects/image.js). A layer's stack runs on that layer alone, inside its own
// shape, before it is laid over the layers below; the page's runs last, on everything.

/** Every step the Add menu offers, in its order. */
export const EFFECT_KINDS: EffectKind[] = ['adjust', 'duotone', 'halftone', 'posterize', 'grain', 'texture', 'blur', 'sharpen', 'vignette', 'ink', 'riso'];

export const EFFECT_LABELS: Record<EffectKind, string> = { ...ImageEffects.LABELS, riso: 'Riso print', ink: 'Ink bleed' };

export const EFFECT_HELP: Record<EffectKind, string> = {
  adjust: 'Exposure, white balance, brightness, contrast, saturation and vibrance.',
  duotone: 'Two colours: the darks become one, the lights the other, blended evenly.',
  halftone: 'Print screens: one ink, or CMYK. Tones come out true from a distance.',
  posterize: 'A few flat levels of each colour, with print dithering if you like.',
  grain: 'Film grain with a size, gentler in deep shadow and bright highlight.',
  texture: 'Paper, canvas, fibre, concrete or crosshatch laid over it.',
  blur: 'Soft focus. On a layer it softens the edges too.',
  sharpen: 'Crisper detail, leaving flat areas and grain alone.',
  vignette: 'Darker towards the edges, like a lens.',
  riso: 'Printed through the Riso press in one to three inks.',
  ink: 'Ink that spreads, wears and drifts: photocopy, fax, ribbon or rubber stamp.',
};

/** A new step of a kind, at its defaults. Steps with grain take the seed given. */
export function newStep(kind: EffectKind, seed = 1): EffectStep {
  if (kind === 'riso') return risoStep(0, seed);
  if (kind === 'ink') return inkStep(0, seed);
  const d = ImageEffects.DEFAULTS[kind as ImageEffectKind];
  return { effect: kind, ...structuredClone(d), ...(kind === 'grain' || kind === 'texture' ? { seed } : {}) } as EffectStep;
}

/** Steps that do something: not switched off and not at no strength. */
export function liveSteps(steps: EffectStep[] | undefined): EffectStep[] {
  return (steps ?? []).filter((s) => !s.off && (s.strength === undefined || s.strength > 0));
}

/** Whether a picture needs printing: its page, or any layer in it, has a step that does something. */
export function hasEffects(block: Pick<FreeformBlock, 'effects' | 'layers'>): boolean {
  return liveSteps(block.effects).length > 0 || block.layers.some((l) => liveSteps(l.effects).length > 0);
}

/** A layer's effects replaced. None removes the field, so a layer without effects is the layer it was. */
export function withLayerEffects(layer: FreeformLayer, effects: EffectStep[] | undefined): FreeformLayer {
  const { effects: _old, ...rest } = layer;
  void _old;
  return (effects && effects.length ? { ...rest, effects } : rest) as FreeformLayer;
}

/** Moves step `from` to `to` in the list. */
export function moveStep(steps: EffectStep[], from: number, to: number): EffectStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return steps;
  const out = [...steps];
  const [s] = out.splice(from, 1);
  out.splice(to, 0, s!);
  return out;
}

/**
 * Looks: whole stacks applied in one go. The Image Effects tool's presets, as it tuned them, and the
 * press's. Applying a look replaces the stack; every step is then its own to change.
 */
export const LOOKS: Array<{ name: string; desc: string; steps: () => EffectStep[] }> = [
  {
    name: 'Film noir',
    desc: 'Black and bone, grain, paper, dark corners',
    steps: () => [
      { effect: 'duotone', shadow: '#080808', highlight: '#ddd4c4' },
      { effect: 'texture', kind: 'paper', amount: 18, scale: 60, blend: 'multiply' },
      { effect: 'grain', amount: 55, mono: 90, seed: 1 },
      { effect: 'vignette', amount: 80, spread: 90 },
    ],
  },
  {
    name: 'Newsprint',
    desc: 'Soft halftone on warm stock, light grain',
    steps: () => [
      { effect: 'blur', radius: 1 },
      { effect: 'halftone', spacing: 5, angle: 45, shape: 'circle', contrast: 7, ink: '#1a1410', paper: '#f2ead8' },
      { effect: 'texture', kind: 'paper', amount: 28, scale: 45, blend: 'multiply' },
      { effect: 'grain', amount: 18, mono: 100, seed: 1 },
    ],
  },
  {
    name: 'Dirty 35mm',
    desc: 'Heavy colour grain, concrete, vignette',
    steps: () => [
      { effect: 'texture', kind: 'concrete', amount: 22, scale: 35, blend: 'overlay' },
      { effect: 'grain', amount: 78, mono: 60, seed: 1 },
      { effect: 'vignette', amount: 62, spread: 80 },
    ],
  },
  {
    name: 'Screen print',
    desc: 'Navy on marigold, posterized, coarse dots',
    steps: () => [
      { effect: 'duotone', shadow: '#0d1a33', highlight: '#f0c040' },
      { effect: 'posterize', levels: 4, gamma: 6 },
      { effect: 'halftone', spacing: 7, angle: 30, shape: 'circle', contrast: 8, ink: '#0d1a33', paper: '#f0c040' },
    ],
  },
  {
    name: 'Four-colour print',
    desc: 'CMYK screens at press angles, a little dot gain, on uncoated stock',
    steps: () => [
      { effect: 'adjust', brightness: 0, contrast: 10, saturation: 0, vibrance: 20 },
      { effect: 'halftone', spacing: 5, angle: 45, shape: 'circle', contrast: 5, ink: '#000000', paper: '#f7f3ea', mode: 'cmyk', gain: 15 },
      { effect: 'texture', kind: 'paper', amount: 15, scale: 50, blend: 'multiply', seed: 1 },
    ],
  },
  ...InkBleed.PRESETS.map((p, i) => ({ name: p.name, desc: `Ink bleed: ${p.desc}`, steps: () => [inkStep(i, 1) as EffectStep] })),
  ...RISO_PRESETS.map((p, i) => ({ name: p.name, desc: `Riso: ${p.desc}`, steps: () => [risoStep(i, 1) as EffectStep] })),
];

/** A short line about a stack, for a layer's row and the email's Inspector: "Duotone, Grain". */
export function stackSummary(steps: EffectStep[] | undefined): string {
  return liveSteps(steps)
    .map((s) => EFFECT_LABELS[s.effect])
    .join(', ');
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX6.test(v) ? v.toLowerCase() : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/**
 * A step from outside (a pasted layer, a frame from another tab), checked: every number clamped to its
 * dial's range and anything unknown dropped. Null when it is not a step this build knows.
 */
export function normalizeStep(value: unknown): EffectStep | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const base = { ...(v['off'] === true ? { off: true } : {}), ...(typeof v['strength'] === 'number' ? { strength: num(v['strength'], 0, 1, 1) } : {}) };
  switch (v['effect']) {
    case 'riso': {
      const r = normalizeRiso(v);
      return r ? { ...r, ...base } : null;
    }
    case 'adjust':
      return {
        effect: 'adjust',
        exposure: num(v['exposure'], -3, 3, 0),
        brightness: num(v['brightness'], -100, 100, 0),
        contrast: num(v['contrast'], -100, 100, 0),
        saturation: num(v['saturation'], -100, 100, 0),
        vibrance: num(v['vibrance'], -100, 100, 0),
        temperature: num(v['temperature'], -100, 100, 0),
        tint: num(v['tint'], -100, 100, 0),
        ...base,
      };
    case 'duotone':
      return { effect: 'duotone', shadow: hex(v['shadow'], '#1a0533'), highlight: hex(v['highlight'], '#e8e0d8'), balance: num(v['balance'], -100, 100, 0), ...base };
    case 'posterize':
      return { effect: 'posterize', levels: Math.round(num(v['levels'], 2, 12, 4)), gamma: num(v['gamma'], 1, 10, 5), dither: oneOf(v['dither'], ['none', 'ordered', 'diffusion'] as const, 'none'), ...base };
    case 'sharpen':
      return { effect: 'sharpen', amount: num(v['amount'], 0, 200, 80), radius: num(v['radius'], 0.3, 5, 1), threshold: num(v['threshold'], 0, 50, 2), ...base };
    case 'halftone':
      return {
        effect: 'halftone',
        spacing: num(v['spacing'], 2, 40, 8),
        angle: num(v['angle'], 0, 180, 45),
        shape: oneOf(v['shape'], ['circle', 'square', 'diamond', 'line', 'ellipse'] as const, 'circle'),
        contrast: num(v['contrast'], 1, 10, 5),
        ink: hex(v['ink'], '#000000'),
        paper: hex(v['paper'], '#ffffff'),
        mode: oneOf(v['mode'], ['mono', 'cmyk'] as const, 'mono'),
        gain: num(v['gain'], 0, 100, 0),
        ...base,
      };
    case 'grain':
      return { effect: 'grain', amount: num(v['amount'], 0, 100, 40), mono: num(v['mono'], 0, 100, 80), size: num(v['size'], 0.5, 4, 1), seed: Math.max(1, Math.round(num(v['seed'], 1, 1e9, 1))), ...base };
    case 'texture':
      return {
        effect: 'texture',
        kind: oneOf(v['kind'], ['paper', 'canvas', 'fibers', 'concrete', 'crosshatch'] as const, 'paper'),
        amount: num(v['amount'], 0, 100, 35),
        scale: num(v['scale'], 5, 100, 50),
        blend: oneOf(v['blend'], ['multiply', 'overlay', 'soft-light', 'hard-light', 'screen'] as const, 'multiply'),
        seed: Math.max(1, Math.round(num(v['seed'], 1, 1e9, 1))),
        ...base,
      };
    case 'blur':
      return { effect: 'blur', radius: num(v['radius'], 0, 40, 3), ...base };
    case 'ink': {
      const d = InkBleed.DEFAULTS;
      const f = (k: keyof typeof d) => num(v[k], 0, 1, d[k]);
      return {
        effect: 'ink',
        spread: num(v['spread'], 0, 3, d.spread),
        rough: f('rough'),
        soft: num(v['soft'], 0, 3, d.soft),
        fade: f('fade'),
        grit: f('grit'),
        stamp: f('stamp'),
        elong: f('elong'),
        jitter: f('jitter'),
        smudge: f('smudge'),
        grain: f('grain'),
        dust: f('dust'),
        speckle: f('speckle'),
        streaks: f('streaks'),
        seed: Math.max(1, Math.round(num(v['seed'], 1, 1e9, 1))),
        ...base,
      };
    }
    case 'vignette':
      return { effect: 'vignette', amount: num(v['amount'], 0, 100, 70), spread: num(v['spread'], 5, 130, 85), feather: num(v['feather'], 0, 100, 60), roundness: num(v['roundness'], 0, 100, 0), ...base };
    default:
      return null;
  }
}

/**
 * The stack with its Riso step replaced, keeping where it sits and whether it is on and how strong; with
 * none, the step goes on the end. How the Riso tool's settings come back without touching the other steps.
 */
export function withRisoStep(steps: EffectStep[] | undefined, step: RisoStep): EffectStep[] {
  const list = steps ?? [];
  const at = list.findIndex((s) => s.effect === 'riso');
  if (at < 0) return [...list, step];
  const old = list[at]!;
  return list.map((s, i) => (i === at ? { ...step, ...(old.off ? { off: true } : {}), ...(old.strength !== undefined ? { strength: old.strength } : {}) } : s));
}

/** An ink bleed step from one of the tool's looks. */
export function inkStep(preset = 0, seed = 1): EffectStep {
  const p = InkBleed.PRESETS[preset] ?? InkBleed.PRESETS[0]!;
  return { effect: 'ink', ...p.apply, seed };
}
