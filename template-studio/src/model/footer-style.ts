// How a footer looks, as tokens: set once in Design › Footer, overridden on one footer when it needs to.
//
// Jared, 2026-11-11: "I want more design control over footers." Asked where, he chose the Design panel with a
// per-footer override, the way the gutters already work; asked what, he chose all four groups: type, rules and
// spacing, arrangement, links. Arrangement is per footer (it lives on the block, model/types.ts) because it is a
// decision about one footer. Everything here is a decision about every footer on a system.
//
// These numbers were literals in compile/blocks/legal.ts. The defaults are those literals, so a system that says
// nothing draws the footer it drew before, with one exception he asked for: links are underlined. On the navy band
// the links and the text are both cream, and without the line nothing says which words can be clicked.
//
// The four Switchyards types read this. `classic` does not: it is the footer as it always was, byte for byte, and
// its links already carry the browser's own underline. Pure.

import type { ColorRef, DesignSystem } from './design-system.ts';
import type { LegalBlock } from './types.ts';

export type FooterDensity = 'tight' | 'regular' | 'airy';

export interface FooterStyle {
  /** The company name, in px. `null` follows Type › H3, which is what it always followed. */
  nameSize: number | null;
  /** The address, the note, the legal links and the social names, in px. The line height follows it (13 → 17). */
  smallSize: number;
  /** The colophon mark, in px. `null` follows the small type. */
  markSize: number | null;
  markCaps: boolean;
  /** Letter spacing on the mark, in px. */
  markTracking: number;
  /** The 1px lines between the footer's parts. Off removes every one; the red rules above and below are stripes and stay. */
  hairlines: boolean;
  hairlineWidth: number;
  /** A palette colour. `null` follows the footer's text colour, so the same footer reads on navy and on cream. */
  hairlineColor: ColorRef;
  /** The space between the footer's parts: the gaps around the seals, the name, the notice and the colophon. */
  density: FooterDensity;
  linkUnderline: boolean;
  /** A palette colour. `null` follows the preset's link colour. */
  linkColor: ColorRef;
  /** The social icons' height, in px. Each keeps its own proportions. */
  iconSize: number;
}

export const DEFAULT_FOOTER_STYLE: FooterStyle = {
  nameSize: null,
  smallSize: 13,
  markSize: null,
  markCaps: true,
  markTracking: 1,
  hairlines: true,
  hairlineWidth: 1,
  hairlineColor: null,
  density: 'regular',
  linkUnderline: true,
  linkColor: null,
  iconSize: 20,
};

/** How much each density scales the gaps between parts. Regular is 1, so the default is the footer as drawn. */
export const DENSITY: Record<FooterDensity, { name: string; scale: number }> = {
  tight: { name: 'Tight', scale: 0.6 },
  regular: { name: 'Regular', scale: 1 },
  airy: { name: 'Airy', scale: 1.5 },
};

export const FOOTER_STYLE_KEYS = Object.keys(DEFAULT_FOOTER_STYLE) as Array<keyof FooterStyle>;

/** Ranges for the numbers, shared by both panels and by the clamp below. */
export const FOOTER_RANGES = {
  nameSize: { min: 10, max: 40 },
  smallSize: { min: 9, max: 20 },
  markSize: { min: 8, max: 24 },
  markTracking: { min: 0, max: 6 },
  hairlineWidth: { min: 1, max: 4 },
  iconSize: { min: 12, max: 40 },
} as const;

const clamp = (n: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, n));

/** Only the keys a layer actually sets. `undefined` is "not set" in both layers; `null` is a value in the system's. */
function layer(raw: unknown): Partial<FooterStyle> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Partial<FooterStyle> = {};
  for (const key of FOOTER_STYLE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** What the design system says, before any one footer has its say. */
export function systemFooterStyle(ds: DesignSystem): FooterStyle {
  return sane({ ...DEFAULT_FOOTER_STYLE, ...layer(ds.footer) });
}

/** What one footer draws with: the shipped values, then the system's, then the footer's own. */
export function footerStyleOf(ds: DesignSystem, block?: Pick<LegalBlock, 'style'>): FooterStyle {
  return sane({ ...systemFooterStyle(ds), ...layer(block?.style) });
}

/** A hand-edited file can say anything; the compiler should not have to. */
function sane(s: FooterStyle): FooterStyle {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const nullable = (v: unknown, r: { min: number; max: number }) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, r) : null);
  return {
    nameSize: nullable(s.nameSize, FOOTER_RANGES.nameSize),
    smallSize: clamp(num(s.smallSize, DEFAULT_FOOTER_STYLE.smallSize), FOOTER_RANGES.smallSize),
    markSize: nullable(s.markSize, FOOTER_RANGES.markSize),
    markCaps: s.markCaps !== false,
    markTracking: clamp(num(s.markTracking, DEFAULT_FOOTER_STYLE.markTracking), FOOTER_RANGES.markTracking),
    hairlines: s.hairlines !== false,
    hairlineWidth: clamp(Math.round(num(s.hairlineWidth, 1)), FOOTER_RANGES.hairlineWidth),
    hairlineColor: typeof s.hairlineColor === 'string' && s.hairlineColor ? s.hairlineColor : null,
    density: s.density in DENSITY ? s.density : 'regular',
    linkUnderline: s.linkUnderline !== false,
    linkColor: typeof s.linkColor === 'string' && s.linkColor ? s.linkColor : null,
    iconSize: clamp(Math.round(num(s.iconSize, DEFAULT_FOOTER_STYLE.iconSize)), FOOTER_RANGES.iconSize),
  };
}

/** The small type's line height, in px: the system's 13/17 pair, kept in proportion. */
export const smallLineHeight = (size: number): number => Math.round((size * 17) / 13);

/** A footer's parts that can be left out. The name, the address and Unsubscribe cannot: HubSpot needs them (learnings 1.8). */
export type FooterPart = 'logo' | 'note' | 'socials' | 'mark';

export const FOOTER_PARTS: Array<{ id: FooterPart; name: string; help: string }> = [
  { id: 'logo', name: 'Logo', help: 'The picture: the badge row on navy, the lockup on a letterhead. Off keeps the address you gave it.' },
  { id: 'note', name: 'Note', help: 'The notice line. Off keeps the words for when it comes back.' },
  { id: 'socials', name: 'Socials', help: 'The social links. Off keeps the addresses.' },
  { id: 'mark', name: 'Mark', help: 'The colophon mark. Off keeps the words.' },
];

export const showsPart = (block: Pick<LegalBlock, 'hide'>, part: FooterPart): boolean => !block.hide?.includes(part);
