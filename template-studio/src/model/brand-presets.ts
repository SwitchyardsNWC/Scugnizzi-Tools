// Brand presets: adding, changing, copying and deleting the design system's type for the canvas, and
// saving a tweaked text layer back as one (design-system.ts › CanvasTextStyle).
//
// Pure, like the rest of the model. The presets live in the template's design system, so every edit
// here is a new template, one undo step, and the same file the Design panel writes.

import { allBlocks, designSystemOf } from './edit.ts';
import { canvasTypeOf, type CanvasTextStyle } from './design-system.ts';
import { updateLayer } from './freeform.ts';
import { textStyleOf } from './canvas-text.ts';
import type { FreeformLayer, Template } from './types.ts';

type TextLayer = Extract<FreeformLayer, { kind: 'text' }>;
export type Presets = Record<string, CanvasTextStyle>;

/** The template with these presets in its design system. */
export function withPresets(template: Template, presets: Presets): Template {
  return { ...template, ds: { ...designSystemOf(template), canvasType: presets } };
}

/** A key for a new preset from its name, never one already taken. */
export function presetKey(presets: Presets, label: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'preset';
  let key = base;
  for (let n = 2; presets[key]; n++) key = `${base}-${n}`;
  return key;
}

/** A name not already used, ignoring case: "Kicker" becomes "Kicker 2". */
export function freshLabel(presets: Presets, label: string): string {
  const taken = new Set(Object.values(presets).map((p) => p.label.trim().toLowerCase()));
  const clean = label.trim().slice(0, 40) || 'New preset';
  if (!taken.has(clean.toLowerCase())) return clean;
  let n = 2;
  while (taken.has(`${clean} ${n}`.toLowerCase())) n++;
  return `${clean} ${n}`;
}

export function addPreset(presets: Presets, style: CanvasTextStyle): { presets: Presets; key: string } {
  const label = freshLabel(presets, style.label);
  const key = presetKey(presets, label);
  return { presets: { ...presets, [key]: { ...style, label } }, key };
}

export function updatePreset(presets: Presets, key: string, change: Partial<CanvasTextStyle>): Presets {
  const old = presets[key];
  if (!old) return presets;
  const next = { ...old, ...change };
  // A part set to undefined is a part switched off, so it leaves the file rather than sitting there empty.
  for (const k of Object.keys(next) as Array<keyof CanvasTextStyle>) if (next[k] === undefined) delete next[k];
  return { ...presets, [key]: next };
}

export function removePreset(presets: Presets, key: string): Presets {
  const { [key]: _gone, ...rest } = presets;
  void _gone;
  return rest;
}

/** A copy placed right after the original, under "<name> copy". */
export function duplicatePreset(presets: Presets, key: string): { presets: Presets; key: string } {
  const old = presets[key];
  if (!old) return { presets, key };
  const label = freshLabel(presets, `${old.label} copy`);
  const copyKey = presetKey(presets, label);
  const out: Presets = {};
  for (const [k, v] of Object.entries(presets)) {
    out[k] = v;
    if (k === key) out[copyKey] = { ...structuredClone(old), label };
  }
  return { presets: out, key: copyKey };
}

/** How many text layers in the template use a preset: what deleting it would set back to plain. */
export function presetUses(template: Template, key: string): number {
  let n = 0;
  for (const block of allBlocks(template)) if (block.type === 'freeform') n += block.layers.filter((l) => l.kind === 'text' && l.look === key).length;
  return n;
}

/** The layer's own departures from its preset. */
export function hasTweaks(layer: TextLayer): boolean {
  return layer.size !== undefined || layer.letterSpacing !== undefined || layer.lineHeight !== undefined || layer.font !== undefined || layer.weight !== undefined || layer.italic !== undefined || layer.textCase !== undefined;
}

/** The preset the layer is in, with its own tweaks folded in. */
export function presetFromLayer(layer: TextLayer, presets: Presets): CanvasTextStyle | null {
  const base = layer.look ? presets[layer.look] : undefined;
  if (!base) return null;
  return {
    ...structuredClone(base),
    ...(layer.size !== undefined ? { size: layer.size } : {}),
    ...(layer.letterSpacing !== undefined ? { letterSpacing: layer.letterSpacing } : {}),
    ...(layer.lineHeight !== undefined ? { lineHeight: layer.lineHeight } : {}),
    ...(layer.font !== undefined ? { font: layer.font } : {}),
  };
}

const CLEARED = { size: undefined, letterSpacing: undefined, lineHeight: undefined, font: undefined, amount: undefined };

/**
 * A tweaked layer saved back into the design system. `update` rewrites its preset, so every layer in it
 * follows; `new` makes a preset of its own under `label` and moves the layer onto it. Either way the
 * layer's tweaks are folded in and cleared, so what it shows does not change.
 */
export function savePresetFromLayer(template: Template, blockId: string, layer: TextLayer, mode: 'update' | 'new', label?: string): { template: Template; key: string } | null {
  const ds = designSystemOf(template);
  const presets = canvasTypeOf(ds);
  // Plain words can become a preset too: their role's type, with their tweaks, and nothing on.
  const plain = (): CanvasTextStyle => {
    const t = textStyleOf(layer, ds);
    return {
      label: 'New preset',
      ...(layer.font ? { font: layer.font } : {}),
      size: t.size,
      weight: t.weight,
      lineHeight: t.lineHeight,
      ...(t.uppercase ? { uppercase: true } : {}),
      ...(t.letterSpacing ? { letterSpacing: t.letterSpacing } : {}),
      color: layer.color,
    };
  };
  const style = layer.look ? presetFromLayer(layer, presets) : mode === 'new' ? plain() : null;
  if (!style) return null;
  let next: Presets;
  let key = layer.look ?? '';
  if (mode === 'update') next = { ...presets, [key]: style };
  else ({ presets: next, key } = addPreset(presets, { ...style, label: label ?? style.label }));
  const withStyle = withPresets(template, next);
  return { template: updateLayer(withStyle, blockId, layer.id, { ...CLEARED, look: key }), key };
}
