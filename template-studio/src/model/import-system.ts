// A design system pasted in, turned into this project's own.
//
// Jared: "If it can import a claude design system for colors, type and general direction that would be ideal."
// A Claude design system is a published page, and a browser cannot fetch one across origins, so the input here is
// whatever a person can paste: the page itself, its CSS, a token file, or a `.system.json` this project wrote.
//
// Shaped like import-v1.ts, for the same reasons: it never throws, it returns a whole DesignSystem with partial
// results filled in from the defaults, and everything that did not come across is a warning a person can read.
// Pure and DOM-free — no DOMParser, so every shape is read with a string scanner the way sanitise.ts does it.
//
// WHAT IS DELIBERATELY NOT INFERRED. Each of these is a future "helpful" patch that would be a regression:
//  1. `mobileSize` is never raised. A phone size is a second tuned number (learnings 2.3, 2.13), and a web system
//     has no opinion about email on a phone. It is only clamped down, so it never exceeds the desktop size.
//  2. `marginBottom` never moves, except from a `.system.json` that states it. Email headings need margins tuned
//     for this stack; a web system's margins come from a different box model.
//  3. `body.size` never moves from an unnamed ladder of sizes. The body size sets the measure and the clip budget;
//     silently taking a web base of 16 would change every email. Only a source that names the role moves it.
//  4. `containerWidth` outside 320–700 is refused. A 1200px "container" is a page, not an email.
//  5. `mobileBreakpoint` is never read from a `@media` query. The artifact's own breakpoint describes the artifact.
//  6. A generic family is never appended to a stack. A silently-repaired serif is a wrong email nobody traces back.
//  7. A preset is emitted only when all four of its colour roles resolve. A half-built preset looks right in the
//     panel and is wrong in a send.

import {
  DEFAULT_DESIGN_SYSTEM,
  type ColorRef,
  type DesignSystem,
  type HeadingLevel,
  type ThemeTokens,
  type TypeStyle,
} from './design-system.ts';

export type SourceShape = 'system' | 'tokens' | 'css' | 'html' | 'text' | 'none';

export interface SystemImport {
  ds: DesignSystem;
  /** A name for the file, when the source gave one; '' when it did not. */
  name: string;
  shape: SourceShape;
  /** What did not come across, and what was inferred. Shown, never swallowed. */
  warnings: string[];
  /** Dotted paths that moved off the defaults: 'colors', 'type.h1.size', 'buttons.primary.radius'. */
  touched: string[];
}

/** A palette bigger than this is a catalogue, not a brand. */
const MAX_COLORS = 24;
/** What a pill becomes here. Both shipped systems use it. */
const PILL_RADIUS = 25;
const WIDTH_RANGE = { min: 320, max: 700 };
const SIZE_RANGE = { min: 8, max: 96 };
const RADIUS_MAX = 60;

// --- small pure helpers -------------------------------------------------------------------------------------

/**
 * A colour as this project stores one: lowercase `#rrggbb`, or null.
 *
 * Lowercased because the palette is matched by lowered hex in three places (import-v1, schema, the dark-mode
 * registry), and an uppercase entry would quietly become a second class for the same colour.
 */
export function normalizeHex(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    const d = hex[1]!;
    if (d.length === 3) return `#${d[0]!}${d[0]!}${d[1]!}${d[1]!}${d[2]!}${d[2]!}`;
    if (d.length === 4) return `#${d[0]!}${d[0]!}${d[1]!}${d[1]!}${d[2]!}${d[2]!}`;
    if (d.length === 6) return `#${d}`;
    if (d.length === 8) return `#${d.slice(0, 6)}`;
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (!rgb) return null;
  const part = (n: string) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0');
  return `#${part(rgb[1]!)}${part(rgb[2]!)}${part(rgb[3]!)}`;
}

/** Whether a colour was written with transparency, which email cannot rely on. */
export function hasAlpha(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (/^#?[0-9a-f]{8}$/.test(v.replace('#', '')) && v.replace('#', '').length === 8) return true;
  if (/^#?[0-9a-f]{4}$/.test(v.replace('#', '')) && v.replace('#', '').length === 4) return true;
  return /^rgba\(/.test(v);
}

/** Words that describe where a token lives rather than what it is. Dropped from the front of a name, never the end. */
const DROP = new Set([
  'color', 'colors', 'colour', 'colours', 'palette', 'token', 'tokens', 'global', 'theme', 'brand', 'core',
  'base', 'ref', 'sys', 'semantic', 'surface', 'design', 'system', 'ds', 'value', 'default', 'font', 'fonts',
  'size', 'sizes', 'type', 'text',
]);

/** A key from a token path, with the words that only say where it lives dropped from the front. */
export function shortName(raw: string, fallback: string): string {
  const parts = nameParts(raw);
  if (!parts.length) return fallback;
  let i = 0;
  while (i < parts.length - 1 && DROP.has(parts[i]!)) i += 1;
  return camel(parts.slice(i)) || fallback;
}

const camel = (parts: string[]): string =>
  parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');

/** A raw token path or CSS property split into its words, lowercased. */
export function nameParts(raw: string): string[] {
  return raw
    .replace(/^--/, '')
    .replace(/^\$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s/._-]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * A palette key from whatever the source called it. `--color-brand-navy` and `brand/navy` both want `navy`.
 * A name already taken by a different colour falls back to its fuller form, then to a number.
 */
export function tokenName(raw: string, taken: Map<string, string>, hex?: string): string {
  const parts = nameParts(raw);
  if (parts.length === 0) return unique('color', taken, hex);
  const full = camel(parts);
  let i = 0;
  while (i < parts.length - 1 && DROP.has(parts[i]!)) i += 1;
  let kept = parts.slice(i);
  // A name that is only a number is no name; put the word before it back.
  if (/^\d/.test(kept[0]!) && i > 0) kept = parts.slice(i - 1);
  const short = camel(kept) || 'color';
  const existing = taken.get(short);
  if (existing === undefined || (hex !== undefined && existing === hex)) return unique(short, taken, hex);
  const existingFull = taken.get(full);
  if (full !== short && (existingFull === undefined || (hex !== undefined && existingFull === hex))) return unique(full, taken, hex);
  return unique(short, taken, hex);
}

function unique(name: string, taken: Map<string, string>, hex?: string): string {
  const seen = taken.get(name);
  if (seen === undefined || (hex !== undefined && seen === hex)) return name;
  for (let n = 2; n < 100; n += 1) {
    const tried = `${name}${n}`;
    const at = taken.get(tried);
    if (at === undefined || (hex !== undefined && at === hex)) return tried;
  }
  return `${name}${Math.min(99, taken.size)}`;
}

// --- the repoint pass ---------------------------------------------------------------------------------------

/** Every place in a DesignSystem that names a colour, as a get/set pair over one system. */
function colorRefs(ds: DesignSystem): Array<{ path: string; get(): ColorRef; set(v: ColorRef): void }> {
  const out: Array<{ path: string; get(): ColorRef; set(v: ColorRef): void }> = [];
  for (const [name, theme] of Object.entries(ds.themes)) {
    for (const key of ['band', 'container', 'text', 'link'] as const) {
      out.push({
        path: `themes.${name}.${key}`,
        get: () => theme[key],
        set: (v) => {
          (theme as unknown as Record<string, unknown>)[key] = v;
        },
      });
    }
  }
  for (const [name, button] of Object.entries(ds.buttons)) {
    for (const key of ['fill', 'ink', 'border'] as const) {
      out.push({
        path: `buttons.${name}.${key}`,
        get: () => button[key],
        set: (v) => {
          (button as unknown as Record<string, unknown>)[key] = v;
        },
      });
    }
  }
  for (const key of ['quoteColor', 'ruleColor'] as const) {
    out.push({
      path: `richText.${key}`,
      get: () => ds.richText[key],
      set: (v) => {
        (ds.richText as unknown as Record<string, unknown>)[key] = v;
      },
    });
  }
  out.push({ path: 'image.borderColor', get: () => ds.image.borderColor, set: (v) => void ((ds.image as unknown as Record<string, unknown>)['borderColor'] = v) });
  for (const [name, style] of Object.entries(ds.type)) {
    out.push({
      path: `type.${name}.color`,
      get: () => style.color ?? null,
      set: (v) => {
        if (v === null) delete (style as unknown as Record<string, unknown>)['color'];
        else (style as unknown as Record<string, unknown>)['color'] = v;
      },
    });
  }
  out.push({ path: 'pageBorderColor', get: () => ds.pageBorderColor, set: (v) => void ((ds as unknown as Record<string, unknown>)['pageBorderColor'] = v) });
  return out;
}

/**
 * The load-bearing half of an import.
 *
 * Replacing `colors` leaves every preset, button, quote bar and border naming a palette entry that no longer
 * exists. `colorOf` returns null for a name the palette lacks, and `theme()` then falls text and link back to
 * black — so an import without this produces a system whose every heading is black on a band that vanished.
 *
 * A reference whose old name is gone keeps the colour it resolved to, as a literal. A literal is visible in the
 * panel as "Literal #hex", which is the honest report: the value survived, the name did not.
 */
export function repointRefs(ds: DesignSystem, beforeColors: Record<string, string>): { ds: DesignSystem; lost: string[] } {
  const lost = new Set<string>();
  /** The new palette, by lowered hex, so a colour that kept its value keeps a name too. */
  const byHex = new Map(Object.entries(ds.colors).map(([name, hex]) => [hex.toLowerCase(), name]));
  for (const ref of colorRefs(ds)) {
    const value = ref.get();
    if (value === null || value.startsWith('#')) continue;
    if (ds.colors[value] !== undefined) continue;
    const was = beforeColors[value];
    if (was === undefined) {
      ref.set(null);
      lost.add(value);
      continue;
    }
    const renamed = byHex.get(was.toLowerCase());
    ref.set(renamed ?? was.toLowerCase());
    lost.add(value);
  }
  return { ds, lost: [...lost].sort() };
}

// --- reading the paste --------------------------------------------------------------------------------------

/** What kind of thing was pasted. Recorded on the result, so a wrong guess is visible rather than silent. */
export function detectShape(source: string): SourceShape {
  const text = source.trim();
  if (!text) return 'none';
  const json = parseJson(text);
  if (json) return isSystemShape(json) ? 'system' : 'tokens';
  if (/<[a-z!][\s\S]*>/i.test(text)) return 'html';
  if (/--[\w-]+\s*:/.test(text) || /\{[^}]*:[^}]*\}/.test(text)) return 'css';
  if (/#[0-9a-f]{3,8}\b/i.test(text) || /\brgba?\(/i.test(text)) return 'text';
  return 'none';
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const SYSTEM_KEYS = ['colors', 'type', 'themes', 'buttons', 'richText', 'image', 'fontStack', 'fonts', 'containerWidth', 'pagePadding', 'mobileBreakpoint'];
const isSystemShape = (value: Record<string, unknown>): boolean => SYSTEM_KEYS.filter((k) => value[k] !== undefined).length >= 2;

/** Everything a shape can yield, before any of it becomes a DesignSystem. */
interface Harvest {
  colors: Array<{ name: string; raw: string; hex: string }>;
  fonts: Map<string, string>;
  /** By role name where the source named one, or `#<rank>` for an unnamed ladder. */
  sizes: Map<string, number>;
  /** Any other number with a unit, by slug: radii, widths, spacing. */
  lengths: Map<string, number>;
  /** Colour-ish declarations under a selector, for deriving presets. */
  blocks: Array<{ selector: string; props: Map<string, string> }>;
  name: string;
}

const emptyHarvest = (): Harvest => ({ colors: [], fonts: new Map(), sizes: new Map(), lengths: new Map(), blocks: [], name: '' });

/** `<style>` bodies, with comments and scripts taken out first so an artifact's own JS palette cannot leak in. */
function stylesOf(html: string): string {
  const withoutScripts = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ');
  const out: string[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutScripts))) out.push(m[1] ?? '');
  return out.join('\n');
}

/** The words a page shows, for the labels beside its swatches. */
function textOf(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Declaration blocks, as `selector { prop: value }` pairs. Comments are stripped first. */
function cssBlocks(css: string): Array<{ selector: string; props: Map<string, string> }> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out: Array<{ selector: string; props: Map<string, string> }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const selector = (m[1] ?? '').trim().split('\n').pop()!.trim();
    if (!selector || selector.startsWith('@')) continue;
    const props = new Map<string, string>();
    for (const decl of (m[2] ?? '').split(';')) {
      const at = decl.indexOf(':');
      if (at === -1) continue;
      const key = decl.slice(0, at).trim();
      const value = decl.slice(at + 1).trim();
      if (key && value) props.set(key, value);
    }
    if (props.size) out.push({ selector, props });
  }
  return out;
}

const BASE_SELECTOR = /^(:root|html|body|\*|\.theme-light|\[data-theme=["']?light["']?\])$/i;

/** A length in pixels, or null. `rem`/`em` are taken at 16. */
function pxOf(raw: string): number | null {
  const m = /(-?[\d.]+)\s*(px|rem|em|pt)?/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2] ?? 'px';
  if (unit === 'rem' || unit === 'em') return Math.round(n * 16);
  if (unit === 'pt') return Math.round((n * 4) / 3);
  return Math.round(n);
}

const FONT_KEYS = /(^|[\s/._-])font($|[\s/._-])|family/i;
const SIZE_KEYS = /(^|[\s/._-])(font-?size|size|text|type)($|[\s/._-])/i;

function harvestCss(css: string, into: Harvest): void {
  const blocks = cssBlocks(css);
  const vars = new Map<string, string>();
  for (const block of blocks) {
    for (const [key, value] of block.props) if (key.startsWith('--')) vars.set(key, value);
  }
  /** `var(--x)` resolved one hop, which is as far as a paste can honestly be followed. */
  const resolve = (value: string): string => {
    const m = /^var\(\s*(--[\w-]+)/.exec(value.trim());
    return m ? (vars.get(m[1]!) ?? value) : value;
  };
  for (const block of blocks) {
    const base = BASE_SELECTOR.test(block.selector);
    const colourish = new Map<string, string>();
    for (const [key, raw] of block.props) {
      const value = resolve(raw);
      if (!key.startsWith('--')) {
        if (/^(background|background-color|color|border-color)$/i.test(key)) colourish.set(key.toLowerCase(), value);
        continue;
      }
      if (!base) continue;
      const hex = normalizeHex(value);
      if (hex) {
        into.colors.push({ name: key, raw: value, hex });
        continue;
      }
      if (FONT_KEYS.test(key) && /[a-z]/i.test(value)) {
        into.fonts.set(shortName(key, 'body'), value.replace(/\s+/g, ' ').trim());
        continue;
      }
      const px = pxOf(value);
      if (px === null) continue;
      if (SIZE_KEYS.test(key)) into.sizes.set(camel(nameParts(key)), px);
      else into.lengths.set(camel(nameParts(key)), px);
    }
    if (colourish.size) into.blocks.push({ selector: block.selector, props: colourish });
  }
}

/** A token tree: leaves that are strings, or that carry `value` / `$value`. */
function harvestTokens(value: unknown, path: string[], into: Harvest): void {
  if (path.length > 8) return;
  if (typeof value === 'string') {
    addLeaf(path, value, undefined, into);
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const node = value as Record<string, unknown>;
  const leaf = node['$value'] ?? node['value'];
  if (leaf !== undefined && (typeof leaf === 'string' || typeof leaf === 'number' || Array.isArray(leaf))) {
    const kind = typeof node['$type'] === 'string' ? (node['$type'] as string) : typeof node['type'] === 'string' ? (node['type'] as string) : undefined;
    addLeaf(path, Array.isArray(leaf) ? leaf.join(', ') : String(leaf), kind, into);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    harvestTokens(child, [...path, key], into);
  }
}

function addLeaf(path: string[], raw: string, kind: string | undefined, into: Harvest): void {
  const key = path.join('/');
  const hex = normalizeHex(raw);
  if (kind === 'color' || (kind === undefined && hex)) {
    if (hex) into.colors.push({ name: key, raw, hex });
    return;
  }
  if (kind === 'fontFamily' || FONT_KEYS.test(key)) {
    if (/[a-z]/i.test(raw)) into.fonts.set(shortName(key, 'body'), raw.replace(/\s+/g, ' ').trim());
    return;
  }
  const px = pxOf(raw);
  if (px === null) return;
  if (kind === 'fontSize' || SIZE_KEYS.test(key)) into.sizes.set(camel(nameParts(key)), px);
  else into.lengths.set(camel(nameParts(key)), px);
}

/** Loose text: a hex, and the nearest words before it as its name. */
function harvestText(text: string, into: Harvest): void {
  const lines = text.split('\n');
  let label = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const re = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi;
    let m: RegExpExecArray | null;
    let found = false;
    while ((m = re.exec(trimmed))) {
      const hex = normalizeHex(m[1]!);
      if (!hex) continue;
      found = true;
      const before = trimmed.slice(0, m.index).replace(/[^A-Za-z0-9 _-]/g, ' ').trim();
      into.colors.push({ name: before || label || 'color', raw: m[1]!, hex });
    }
    if (!found) label = trimmed.replace(/[^A-Za-z0-9 _-]/g, ' ').trim().slice(0, 40);
  }
}

// --- roles ----------------------------------------------------------------------------------------------------

const LEVELS: HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

const ROLE_ALIASES: Array<[RegExp, string]> = [
  [/^(h1|heading1|title1|display|hero)$/, 'h1'],
  [/^(h2|heading2|title2)$/, 'h2'],
  [/^(h3|heading3|title3)$/, 'h3'],
  [/^(h4|heading4)$/, 'h4'],
  [/^(h5|heading5)$/, 'h5'],
  [/^(h6|heading6)$/, 'h6'],
  [/^(body|paragraph|p|base|bodybase|bodytext)$/, 'body'],
  [/^(topbar|eyebrow|overline)$/, 'topbar'],
];

const roleOf = (slug: string): string | null => ROLE_ALIASES.find(([re]) => re.test(slug))?.[1] ?? null;

// --- the import -------------------------------------------------------------------------------------------------

export const WARNINGS = {
  nothing: 'Nothing in the paste looked like colours, type or tokens. Nothing changed.',
  noPresets: 'A design system needs at least one background preset; kept the shipped ones.',
};

/**
 * A pasted design system as this project's own.
 *
 * `base` is what unstated values fall back to — the shipped defaults, or the system being replaced, so an import
 * that carries only a palette keeps everything else the designer already tuned.
 */
export function importDesignSystem(source: string, base: DesignSystem = DEFAULT_DESIGN_SYSTEM): SystemImport {
  const warnings: string[] = [];
  const touched: string[] = [];
  const shape = detectShape(source);
  const ds = structuredClone(base);
  if (shape === 'none') return { ds, name: '', shape, warnings: [WARNINGS.nothing], touched };

  // 1. A `.system.json` is taken key by key, each validated on its own.
  if (shape === 'system') {
    const raw = parseJson(source)!;
    const name = typeof raw['name'] === 'string' ? (raw['name'] as string) : '';
    applySystemJson(raw, ds, warnings, touched);
    return { ds, name, shape, warnings, touched };
  }

  // 2. Harvest the raw facts for this shape. No model objects yet.
  const harvest = emptyHarvest();
  if (shape === 'tokens') harvestTokens(parseJson(source), [], harvest);
  else if (shape === 'css') harvestCss(source, harvest);
  else if (shape === 'html') {
    harvestCss(stylesOf(source), harvest);
    harvestText(textOf(source), harvest);
    harvest.name = (/<title[^>]*>([^<]{1,80})</i.exec(source)?.[1] ?? '').trim();
  } else harvestText(source, harvest);

  if (harvest.colors.length === 0 && harvest.fonts.size === 0 && harvest.sizes.size === 0) {
    return { ds, name: harvest.name, shape, warnings: [WARNINGS.nothing], touched };
  }

  // 3. The palette: named, de-duped by hex, capped.
  const taken = new Map<string, string>();
  const palette: Record<string, string> = {};
  const byHex = new Map<string, string>();
  const dropped: string[] = [];
  for (const found of harvest.colors) {
    if (hasAlpha(found.raw)) {
      warnings.push(`${found.raw} carries transparency, which email cannot rely on; kept ${found.hex}.`);
    }
    const already = byHex.get(found.hex);
    if (already) continue;
    if (Object.keys(palette).length >= MAX_COLORS) {
      dropped.push(found.hex);
      continue;
    }
    const key = tokenName(found.name, taken, found.hex);
    taken.set(key, found.hex);
    palette[key] = found.hex;
    byHex.set(found.hex, key);
  }
  if (dropped.length) warnings.push(`${harvest.colors.length} colours is more than a palette. Kept the first ${MAX_COLORS}; left out ${dropped.length} more.`);

  // 4 and 5. The new palette, and every reference repointed onto it before anything else reads them.
  if (Object.keys(palette).length) {
    const before = ds.colors;
    ds.colors = palette;
    touched.push('colors');
    const { lost } = repointRefs(ds, before);
    if (lost.length) warnings.push(`The palette no longer has ${lost.join(', ')}. What named them kept the colours they resolved to.`);
  }

  // 6. Fonts. Stacks are kept verbatim; a stack is never repaired.
  if (harvest.fonts.size) {
    ds.fonts = { ...ds.fonts };
    for (const [key, stack] of harvest.fonts) ds.fonts[key] = stack;
    touched.push('fonts');
    const bodyKey = ['body', 'base', 'default', 'text', 'sans', 'ui'].find((k) => harvest.fonts.has(k));
    const first = [...harvest.fonts.entries()][0]!;
    const stack = bodyKey ? harvest.fonts.get(bodyKey)! : first[1];
    ds.fontStack = stack;
    touched.push('fontStack');
    if (!bodyKey) warnings.push(`No body font was named; "${stack}" was taken as the email's default.`);
    const headingKey = ['heading', 'headings', 'display', 'title', 'titles'].find((k) => harvest.fonts.has(k));
    if (headingKey && harvest.fonts.get(headingKey) !== ds.fontStack) {
      for (const level of LEVELS) {
        ds.type[level] = { ...(ds.type[level] ?? ds.type['body']!), font: headingKey };
        touched.push(`type.${level}.font`);
      }
    }
  }

  // 7. Type. A named role moves that role; an unnamed ladder only ever fills headings.
  applySizes(harvest, ds, warnings, touched);

  // 8. General direction, each range-guarded.
  applyDirection(harvest, ds, palette, warnings, touched);

  // 9. Presets, only from an explicit pair, and only when every role resolves.
  applyPresets(harvest, ds, byHex, warnings, touched);

  return { ds, name: harvest.name, shape, warnings, touched };
}

function applySizes(harvest: Harvest, ds: DesignSystem, warnings: string[], touched: string[]): void {
  const named = new Map<string, number>();
  const ladder: number[] = [];
  for (const [slug, px] of harvest.sizes) {
    if (px < SIZE_RANGE.min || px > SIZE_RANGE.max) continue;
    const parts = nameParts(slug);
    const role = roleOf(camel(parts)) ?? roleOf(parts[parts.length - 1] ?? '') ?? null;
    if (role) named.set(role, px);
    else ladder.push(px);
  }
  for (const [role, px] of named) {
    const style: TypeStyle = { ...(ds.type[role] ?? ds.type['body']!), size: px };
    if (style.mobileSize > px) {
      style.mobileSize = px;
      warnings.push(`${role}: the phone size was larger than ${px}px, so it was brought down to match.`);
    }
    ds.type[role] = style;
    touched.push(`type.${role}.size`);
  }
  if (named.size > 0 || ladder.length === 0) return;
  const rungs = [...new Set(ladder)].sort((a, b) => b - a);
  const fill = rungs.length >= 6 ? 6 : rungs.length >= 4 ? 3 : 1;
  for (let i = 0; i < fill; i += 1) {
    const level = LEVELS[i]!;
    const px = rungs[i]!;
    const style: TypeStyle = { ...ds.type[level]!, size: px, mobileSize: Math.min(ds.type[level]!.mobileSize, px) };
    ds.type[level] = style;
    touched.push(`type.${level}.size`);
  }
  if (fill < 6) warnings.push(`${rungs.length} sizes with no role names: ${LEVELS.slice(0, fill).join(', ')} were set and the rest kept their own. Body is never taken from a ladder.`);
  else if (rungs.length > 6) warnings.push(`${rungs.length} sizes with no role names: the six largest became h1 to h6.`);
}

function pick(lengths: Map<string, number>, names: string[]): { key: string; px: number } | null {
  for (const want of names) {
    for (const [slug, px] of lengths) {
      if (nameParts(slug).join('') === want) return { key: slug, px };
    }
  }
  return null;
}

function applyDirection(harvest: Harvest, ds: DesignSystem, palette: Record<string, string>, warnings: string[], touched: string[]): void {
  // A page background, named.
  for (const want of ['pagebackground', 'pagebg', 'background', 'bg', 'canvas', 'paper']) {
    const hit = harvest.colors.find((c) => nameParts(c.name).join('') === want);
    if (!hit) continue;
    ds.pageBackground = hit.hex;
    touched.push('pageBackground');
    break;
  }
  // Button shape. A pill becomes this project's pill rather than a number no client honours.
  const pill = /^(9999|999|100)$/;
  const buttonRadius = pick(harvest.lengths, ['buttonradius', 'radiusbutton', 'btnradius']);
  const general = pick(harvest.lengths, ['radius', 'borderradius', 'radiusmd', 'cornerradius']);
  const radius = buttonRadius ?? general;
  if (radius && radius.px >= 0 && radius.px <= RADIUS_MAX) {
    const value = pill.test(String(radius.px)) ? PILL_RADIUS : radius.px;
    for (const key of Object.keys(ds.buttons)) {
      ds.buttons[key] = { ...ds.buttons[key]!, radius: value };
      touched.push(`buttons.${key}.radius`);
    }
    if (!buttonRadius) warnings.push('No button radius was given; the general radius was used.');
  } else if (radius) {
    for (const key of Object.keys(ds.buttons)) {
      ds.buttons[key] = { ...ds.buttons[key]!, radius: PILL_RADIUS };
      touched.push(`buttons.${key}.radius`);
    }
    warnings.push(`Pill buttons: radius set to ${PILL_RADIUS}px, which is this project's pill.`);
  }
  const imageRadius = pick(harvest.lengths, ['imageradius', 'radiusimage', 'radiusmedia']) ?? general;
  if (imageRadius && imageRadius.px >= 0 && imageRadius.px <= RADIUS_MAX) {
    ds.image = { ...ds.image, radius: imageRadius.px };
    touched.push('image.radius');
  }
  // The email's width, refused outside the range an email lives in.
  const width = pick(harvest.lengths, ['containerwidth', 'maxwidth', 'contentwidth', 'emailwidth', 'container']);
  if (width) {
    if (width.px >= WIDTH_RANGE.min && width.px <= WIDTH_RANGE.max) {
      ds.containerWidth = width.px;
      touched.push('containerWidth');
    } else {
      warnings.push(`${width.px}px is a page, not an email, so the width stayed at ${ds.containerWidth}px.`);
    }
  }
  const gutter = pick(harvest.lengths, ['pagepadding', 'gutter', 'containerpadding', 'spacingmd']);
  if (gutter && gutter.px >= 0 && gutter.px <= 80) {
    ds.pagePadding = gutter.px;
    touched.push('pagePadding');
  }
}

const BG_KEYS = ['background', 'background-color'];

function applyPresets(harvest: Harvest, ds: DesignSystem, byHex: Map<string, string>, warnings: string[], touched: string[]): void {
  const made: Record<string, ThemeTokens> = {};
  const nameFor = (raw: string | undefined): ColorRef => {
    if (!raw) return null;
    const hex = normalizeHex(raw);
    if (!hex) return null;
    return byHex.get(hex) ?? hex;
  };
  for (const block of harvest.blocks) {
    const bg = nameFor(BG_KEYS.map((k) => block.props.get(k)).find(Boolean));
    const ink = nameFor(block.props.get('color'));
    if (!bg || !ink) continue;
    const base = BASE_SELECTOR.test(block.selector);
    const key = base ? 'page' : (camel(nameParts(block.selector.replace(/[^\w-]/g, ' '))) || 'band');
    if (made[key]) continue;
    made[key] = base
      ? { band: null, container: bg, text: ink, link: ink, button: 'primary' }
      : { band: bg, container: null, text: ink, link: ink, button: 'secondary' };
  }
  if (!Object.keys(made).length) return;
  ds.themes = { ...ds.themes, ...made };
  touched.push('themes');
}

/** A `.system.json`, key by key. A key that is not the right shape is dropped and named. */
function applySystemJson(raw: Record<string, unknown>, ds: DesignSystem, warnings: string[], touched: string[]): void {
  const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const keep = <K extends keyof DesignSystem>(key: K, ok: (v: unknown) => boolean, what: string) => {
    const value = raw[key as string];
    if (value === undefined) return;
    if (!ok(value)) {
      warnings.push(`"${String(key)}" is not ${what}; kept the shipped value.`);
      return;
    }
    (ds as unknown as Record<string, unknown>)[key as string] = value;
    touched.push(String(key));
  };
  // The palette lands first but is repointed last, after every other key this file carries has landed: a file
  // that brings its own presets names its own colours, and repointing before they arrive would rewrite the
  // presets it was about to replace.
  const beforeColors = ds.colors;
  let replacedPalette = false;
  if (isObject(raw['colors'])) {
    const palette: Record<string, string> = {};
    for (const [name, value] of Object.entries(raw['colors'])) {
      const hex = typeof value === 'string' ? normalizeHex(value) : null;
      if (hex) palette[name] = hex;
      else warnings.push(`"${name}" is not a colour; left out.`);
    }
    if (Object.keys(palette).length) {
      ds.colors = palette;
      touched.push('colors');
      replacedPalette = true;
    }
  } else if (raw['colors'] !== undefined) warnings.push('"colors" is not a palette; kept the shipped one.');

  if (isObject(raw['themes'])) {
    if (Object.keys(raw['themes']).length === 0) warnings.push(WARNINGS.noPresets);
    else keep('themes', isObject, 'a set of presets');
  } else if (raw['themes'] !== undefined) warnings.push('"themes" is not a set of presets; kept the shipped ones.');

  keep('type', (v) => isObject(v) && Object.keys(v).length > 0, 'a type scale');
  keep('buttons', (v) => isObject(v) && Object.keys(v).length > 0, 'a set of button variants');
  keep('richText', isObject, 'list and quote values');
  keep('image', isObject, 'image values');
  keep('fonts', isObject, 'a set of font stacks');
  keep('fontStack', (v) => typeof v === 'string' && v.trim().length > 0, 'a font stack');
  keep('pageBackground', (v) => typeof v === 'string', 'a colour');
  keep('pageBorderColor', (v) => typeof v === 'string' || v === null, 'a colour');
  for (const key of ['containerWidth', 'pagePadding', 'blockGap', 'pageMargin', 'pageBorderWidth', 'mobileBreakpoint', 'textPadX', 'textPadY'] as const) {
    keep(key, (v) => typeof v === 'number' && Number.isFinite(v), 'a number');
  }
  if (typeof ds.containerWidth === 'number' && (ds.containerWidth < WIDTH_RANGE.min || ds.containerWidth > WIDTH_RANGE.max)) {
    warnings.push(`${ds.containerWidth}px is a page, not an email, so the width stayed at ${DEFAULT_DESIGN_SYSTEM.containerWidth}px.`);
    ds.containerWidth = DEFAULT_DESIGN_SYSTEM.containerWidth;
  }
  if (replacedPalette) {
    const { lost } = repointRefs(ds, beforeColors);
    if (lost.length) warnings.push(`The palette no longer has ${lost.join(', ')}. What named them kept the colours they resolved to.`);
  }
}
