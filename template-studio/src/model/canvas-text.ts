// Type on the freeform canvas: what a text layer actually looks like once its style and its own
// tweaks are resolved, and the slash commands that change it while you type.
//
// Jared: "it should be intuitive controls, example text has same slash commands for styles. plus a
// mini menu to controls spacing/tweak effects." So a text layer on the canvas answers to `/` the way
// rich text does in the email, and the mini menu over a picked layer writes `TextTweaks`.
//
// Pure: the compiler draws with `textStyleOf`, the canvas's text field sizes itself with it, and the
// tests check both against the same numbers.

import { canvasTypeOf, colorOf, fontOf, typeOf, type CanvasEffect, type ColorRef, type DesignSystem } from './design-system.ts';
import { MARKS } from './marks.ts';
import { STICKY_COLORS } from './freeform.ts';
import type { FreeformLayer } from './types.ts';

type TextLayer = Extract<FreeformLayer, { kind: 'text' }>;
type StickyLayer = Extract<FreeformLayer, { kind: 'sticky' }>;

export interface ResolvedText {
  font: string;
  size: number;
  weight: 'normal' | 'bold';
  /** Percent. */
  lineHeight: number;
  italic: boolean;
  uppercase: boolean;
  letterSpacing: number;
  /** The style's own colour, before the layer's. Null is the ink. */
  color: ColorRef;
  effect: CanvasEffect;
  effectColor: ColorRef;
  amount: number;
}

/** A text or sticky layer's type, its style first and its tweaks over it. */
export function textStyleOf(layer: TextLayer | StickyLayer, ds: DesignSystem): ResolvedText {
  const look = layer.kind === 'text' && layer.look ? canvasTypeOf(ds)[layer.look] : undefined;
  const role = typeOf(ds, layer.role);
  const base: ResolvedText = look
    ? {
        font: (look.font && ds.fonts[look.font]) || ds.fontStack,
        size: look.size,
        weight: look.weight,
        lineHeight: look.lineHeight,
        italic: Boolean(look.italic),
        uppercase: Boolean(look.uppercase),
        letterSpacing: look.letterSpacing ?? 0,
        color: look.color,
        effect: look.effect,
        effectColor: look.effectColor,
        amount: look.amount,
      }
    : {
        font: fontOf(ds, layer.role),
        size: role.size,
        weight: role.weight,
        lineHeight: role.lineHeight,
        italic: false,
        // A note is handwriting on paper: its words stay as typed whatever the role says.
        uppercase: layer.kind === 'text' && Boolean(role.uppercase),
        letterSpacing: layer.kind === 'text' ? (role.letterSpacing ?? 0) : 0,
        color: null,
        effect: 'none',
        effectColor: null,
        amount: 0,
      };
  // A face of its own, from the design system's fonts, over whatever the style or role set.
  const face = layer.font ? ds.fonts[layer.font] : undefined;
  if (face) base.font = face;
  if (layer.kind === 'sticky') return layer.size ? { ...base, size: layer.size } : base;
  return {
    ...base,
    ...(layer.size !== undefined ? { size: layer.size } : {}),
    ...(layer.letterSpacing !== undefined ? { letterSpacing: layer.letterSpacing } : {}),
    ...(layer.lineHeight !== undefined ? { lineHeight: layer.lineHeight } : {}),
    ...(layer.amount !== undefined ? { amount: layer.amount } : {}),
  };
}

/** What the effect's amount does, in words, for the slider that sets it. Null when there is no effect. */
export function amountLabel(effect: CanvasEffect): string | null {
  switch (effect) {
    case 'outline':
      return 'Outline';
    case 'shadow':
      return 'Shadow';
    case 'highlight':
      return 'Highlight';
    case 'sticker':
      return 'Border';
    case 'wobble':
      return 'Wobble';
    case 'arc':
      return 'Bend';
    default:
      return null;
  }
}

// --- names ------------------------------------------------------------------------------------------

export const LAYER_NAMES: Record<FreeformLayer['kind'], string> = { text: 'Text', image: 'Image', rect: 'Box', ellipse: 'Ellipse', line: 'Line', path: 'Stroke', sticky: 'Note', mark: 'Stamp' };

/** What the layer list calls a layer: its words, its mark, or its kind. */
export function layerName(l: FreeformLayer): string {
  if (l.kind === 'text' || l.kind === 'sticky') return l.text.trim().split(/\r?\n/)[0]!.slice(0, 32) || LAYER_NAMES[l.kind];
  if (l.kind === 'mark') return MARKS.find((m) => m.key === l.mark)?.name ?? 'Stamp';
  if (l.kind === 'image') return l.src.split('/').pop()?.slice(0, 32) || 'Image';
  return LAYER_NAMES[l.kind];
}

// --- slash commands -----------------------------------------------------------------------------------

export type CommandGroup = 'Style' | 'Font' | 'Size' | 'Spacing' | 'Align' | 'Note' | 'Colour';

export interface CanvasCommand {
  id: string;
  label: string;
  group: CommandGroup;
  keywords: string[];
  hint: string;
  /** The change it makes to the layer, given the layer as it is. */
  patch: Record<string, unknown>;
  /** For the menu's little preview: a canvas type style (null is plain), or a colour swatch. */
  look?: string | null;
  swatch?: string;
  /** For a font: the stack, so the menu can show the face itself. */
  fontStack?: string;
}

const SIZES: Array<[string, string, number | null, string[]]> = [
  ['small', 'Small', 0.6, ['tiny', 'sm']],
  ['medium', 'Medium', null, ['normal', 'reset', 'md', 'default']],
  ['large', 'Large', 1.5, ['big', 'lg']],
  ['huge', 'Huge', 2.2, ['xl', 'giant', 'massive']],
];

const NOTE_NAMES = ['Yellow', 'Pink', 'Blue', 'Green', 'Purple', 'Orange'];

/** Every command a text or sticky layer answers to, in the order the menu lists them. */
export function canvasCommands(layer: TextLayer | StickyLayer, ds: DesignSystem): CanvasCommand[] {
  const out: CanvasCommand[] = [];
  // Sizes are relative to the style without the layer's own size, so "Large" twice is still Large.
  const plainSize = textStyleOf({ ...layer, size: undefined } as TextLayer | StickyLayer, ds).size;

  if (layer.kind === 'text') {
    out.push({ id: 'style-plain', label: 'Plain', group: 'Style', keywords: ['heading', 'normal', 'none', 'reset'], hint: 'The heading role from Design › Type.', patch: { look: undefined, amount: undefined }, look: null });
    for (const [key, style] of Object.entries(canvasTypeOf(ds))) {
      out.push({ id: `style-${key}`, label: style.label, group: 'Style', keywords: [key, style.effect, 'style', 'look'], hint: `Canvas type: ${style.label}.`, patch: { look: key, amount: undefined }, look: key });
    }
  }
  for (const [id, label, factor, keywords] of SIZES) {
    out.push({
      id: `size-${id}`,
      label,
      group: 'Size',
      keywords: [...keywords, 'size', 'scale'],
      hint: factor ? `${Math.round(plainSize * factor)}px.` : 'The style’s own size.',
      patch: { size: factor ? Math.round(plainSize * factor) : undefined },
    });
  }
  if (layer.kind === 'text') {
    out.push(
      { id: 'spacing-tight', label: 'Tight', group: 'Spacing', keywords: ['tracking', 'letters', 'condensed', 'kern'], hint: 'Letters closer, lines closer.', patch: { letterSpacing: -1, lineHeight: 90 } },
      { id: 'spacing-normal', label: 'Normal spacing', group: 'Spacing', keywords: ['tracking', 'reset', 'default'], hint: 'The style’s own spacing.', patch: { letterSpacing: undefined, lineHeight: undefined } },
      { id: 'spacing-wide', label: 'Wide', group: 'Spacing', keywords: ['tracking', 'spaced', 'airy', 'loose'], hint: 'Letters apart, lines apart.', patch: { letterSpacing: 4, lineHeight: 130 } },
      { id: 'align-left', label: 'Align left', group: 'Align', keywords: ['left', 'start'], hint: 'Lines start on the left.', patch: { align: 'left' } },
      { id: 'align-center', label: 'Align center', group: 'Align', keywords: ['center', 'centre', 'middle'], hint: 'Lines centred in the layer.', patch: { align: 'center' } },
      { id: 'align-right', label: 'Align right', group: 'Align', keywords: ['right', 'end'], hint: 'Lines end on the right.', patch: { align: 'right' } },
    );
  }
  if (layer.kind === 'sticky') {
    STICKY_COLORS.forEach((hex, i) => {
      const name = NOTE_NAMES[i] ?? `Note ${i + 1}`;
      out.push({ id: `note-${i}`, label: `${name} note`, group: 'Note', keywords: [name.toLowerCase(), 'paper', 'note', 'colour', 'color'], hint: 'The note’s paper.', patch: { fill: hex }, swatch: hex });
    });
  }
  // The design system's installed faces, so a picture never names one the render cannot draw.
  out.push({
    id: 'font-style',
    label: 'Style’s font',
    group: 'Font',
    keywords: ['font', 'face', 'typeface', 'reset', 'default'],
    hint: 'The face the style or role sets.',
    patch: { font: undefined },
    fontStack: textStyleOf({ ...layer, font: undefined } as TextLayer | StickyLayer, ds).font,
  });
  for (const [key, stack] of Object.entries(ds.fonts)) {
    out.push({ id: `font-${key}`, label: title(key), group: 'Font', keywords: [key, 'font', 'face', 'typeface'], hint: stack, patch: { font: key }, fontStack: stack });
  }
  for (const name of Object.keys(ds.colors)) {
    const hex = colorOf(ds, name);
    if (!hex) continue;
    out.push({ id: `colour-${name}`, label: title(name), group: 'Colour', keywords: [name, 'colour', 'color', 'ink'], hint: `${name}, from the design system.`, patch: { color: name }, swatch: hex });
  }
  return out;
}

const title = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/**
 * The commands matching what follows the `/`, best first. The same ranking the email's slash menu
 * uses — the label's start, then a word's start, then a keyword, then anywhere, then a subsequence.
 */
export function filterCommands(items: CanvasCommand[], query: string): CanvasCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const score = (item: CanvasCommand) => {
    const label = item.label.toLowerCase();
    if (label.startsWith(q)) return 100;
    if (label.split(/\s+/).some((w) => w.startsWith(q))) return 80;
    if (item.group.toLowerCase().startsWith(q)) return 70;
    if (item.keywords.some((k) => k.toLowerCase().startsWith(q))) return 60;
    if (label.includes(q)) return 40;
    let i = 0;
    for (const c of label) if (c === q[i]) i += 1;
    return i === q.length ? 10 : 0;
  };
  return items
    .map((item, order) => ({ item, s: score(item), order }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.order - b.order)
    .map((x) => x.item);
}

/**
 * The `/query` before the caret: where it starts, and what has been typed. The slash has to open a
 * word — a date like 3/4 is not a command — and the query stops at whitespace.
 */
export function slashAt(text: string, caret: number): { at: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('/');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  return /\s/.test(query) ? null : { at, query };
}
