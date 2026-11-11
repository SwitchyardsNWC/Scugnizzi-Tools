// Every place a palette colour can be named, as one walk.
//
// A colour is referenced by *name* (learnings 3.12), which is what makes renaming one a real operation rather
// than a text edit. Miss a reference and the thing pointing at it resolves to nothing: `colorOf` returns null
// for a name the palette lacks, and the card, the mark or the hairline quietly loses its colour in the export.
//
// There used to be two lists: one in `colorUsage`, which counts, and one in `repoint`, which rewrites. They
// drifted. Both knew presets, type roles, buttons, stripes and dividers; neither knew a card's fill, a brand
// mark, a freeform drawing, the rich-text and image tokens, the page border, the footer's colours or the brand
// presets. So a colour used only by a card fill read as unused, deleting it left the card naming nothing, and
// a rename left the card on the old name. One walk with two endings is the fix: whatever this visits is
// counted *and* carried, and a field it does not visit is neither, visibly, in one place (learnings 3.103).
//
// Pure. Every walk returns the same object for any part it did not change, so an untouched document is the
// document it was.

import { DEFAULT_CANVAS_TYPE, type ColorRef, type DesignSystem } from './design-system.ts';
import type { Block, FreeformLayer, Template } from './types.ts';

/**
 * Kinds of reference the document holds many of, counted rather than listed. "4 stripes" is something a
 * designer can act on; sixteen lines naming block ids is not. In the order the panel lists them.
 */
export const COUNTED = {
  stripe: ['stripe', 'stripes'],
  divider: ['divider', 'dividers'],
  fill: ['card fill', 'card fills'],
  border: ['box border', 'box borders'],
  brand: ['brand mark', 'brand marks'],
  background: ['freeform background', 'freeform backgrounds'],
  layer: ['freeform layer', 'freeform layers'],
  footer: ['footer', 'footers'],
} as const satisfies Record<string, readonly [string, string]>;

export type CountedKind = keyof typeof COUNTED;

/**
 * Where one reference sits: a line of its own in the panel, or one more of a kind it counts. `id` is what is
 * counted, so a rectangle whose fill and stroke both name the colour is one freeform layer, not two.
 */
export type RefSite = { label: string } | { count: CountedKind; id: string };

/** Sees one named reference and returns what it should be. Handing back the same value changes nothing. */
export type RefVisit = (ref: string, site: RefSite) => ColorRef;

/** One field through `visit`, or the same object when the field is not a name or `visit` kept it. */
function field<T extends object>(obj: T, key: string, site: RefSite, visit: RefVisit): T {
  const was = (obj as Record<string, unknown>)[key];
  if (typeof was !== 'string') return obj;
  const now = visit(was, site);
  return now === was ? obj : { ...obj, [key]: now };
}

/** Several fields of one object, in order. */
function fields<T extends object>(obj: T, keys: readonly string[], site: (key: string) => RefSite, visit: RefVisit): T {
  return keys.reduce((acc, key) => field(acc, key, site(key), visit), obj);
}

/** `fn` over a list, and the same list back when it changed nothing. */
function mapSame<T>(items: T[], fn: (item: T, index: number) => T): T[] {
  let out: T[] | undefined;
  items.forEach((item, i) => {
    const next = fn(item, i);
    if (next !== item) (out ??= items.slice())[i] = next;
  });
  return out ?? items;
}

/** `fn` over a record's values, and the same record back when it changed nothing. Order is kept either way. */
function mapRecord<T>(record: Record<string, T>, fn: (value: T, key: string) => T): Record<string, T> {
  let out: Record<string, T> | undefined;
  for (const [key, value] of Object.entries(record)) {
    const next = fn(value, key);
    if (next !== value) (out ??= { ...record })[key] = next;
  }
  return out ?? record;
}

/**
 * Every reference in a design system.
 *
 * Brand presets are walked as the system has them, which for a system that never set any is the shipped set:
 * the Shop sign is red whether or not anybody wrote `canvasType`. So `canvasType` is written only when one of
 * them changed. Writing it on every walk would freeze the shipped presets into every file that was renamed in.
 */
export function walkSystem(ds: DesignSystem, visit: RefVisit): DesignSystem {
  const labelled = (label: string): RefSite => ({ label });

  const themes = mapRecord(ds.themes, (t, name) =>
    fields(t, ['band', 'container', 'text', 'link'], (slot) => labelled(`${name} preset · ${slot}`), visit),
  );
  const type = mapRecord(ds.type, (role, name) => field(role, 'color', labelled(`${name} · colour`), visit));
  const buttons = mapRecord(ds.buttons, (b, name) =>
    fields(b, ['fill', 'ink', 'border'], (slot) => labelled(`${name} button · ${slot}`), visit),
  );
  const richText = fields(
    ds.richText,
    ['quoteColor', 'ruleColor'],
    (key) => labelled(key === 'quoteColor' ? 'rich text · quote bar' : 'rich text · rule'),
    visit,
  );
  const image = field(ds.image, 'borderColor', labelled('images · border'), visit);
  const pageBorderColor = typeof ds.pageBorderColor === 'string' ? visit(ds.pageBorderColor, labelled('page · border')) : ds.pageBorderColor;

  // Partial and optional (footer-style.ts): a system that says nothing has nothing here to name a colour.
  const footer = ds.footer
    ? fields(ds.footer, ['hairlineColor', 'linkColor'], (key) => labelled(key === 'hairlineColor' ? 'footer · hairline' : 'footer · link'), visit)
    : undefined;

  const shipped = ds.canvasType ?? DEFAULT_CANVAS_TYPE;
  const canvasType = mapRecord(shipped, (preset, key) => {
    const name = `${preset.label || key} brand preset`;
    let out = field(preset, 'color', labelled(`${name} · colour`), visit);
    for (const part of ['stroke', 'shadow', 'highlight'] as const) {
      const was = out[part];
      if (!was) continue;
      const now = field(was, 'color', labelled(`${name} · ${part}`), visit);
      if (now !== was) out = { ...out, [part]: now };
    }
    // The old single effect's colour. Nothing writes it, but `normalizePreset` still reads it from an old file.
    return field(out, 'effectColor', labelled(`${name} · effect`), visit);
  });

  if (
    themes === ds.themes &&
    type === ds.type &&
    buttons === ds.buttons &&
    richText === ds.richText &&
    image === ds.image &&
    pageBorderColor === ds.pageBorderColor &&
    footer === ds.footer &&
    canvasType === shipped
  ) {
    return ds;
  }
  return {
    ...ds,
    themes,
    type,
    buttons,
    richText,
    image,
    pageBorderColor,
    ...(footer ? { footer } : {}),
    ...(canvasType !== shipped ? { canvasType } : {}),
  };
}

/**
 * Every reference in the document. What a section holds resolved (band, container, text, link) is not here:
 * those are hexes, re-resolved from the preset by `recolor`. Neither is a drag and drop area's background,
 * which goes to HubSpot as written and is a hex for that reason.
 *
 * `settle` sees each block this changed, before and after, and may adjust it further. The caller's, because
 * what a changed name means for a rendered picture depends on whether the pixels changed.
 */
export function walkDocument(template: Template, visit: RefVisit, settle?: (before: Block, after: Block) => Block): Template {
  const sections = mapSame(template.sections, (section) => {
    const rows = mapSame(section.rows, (row) => {
      const columns = mapSame(row.columns, (column) => {
        const site = (key: string): RefSite => ({ count: key === 'fill' ? 'fill' : 'border', id: column.id });
        const boxed = fields(column, ['fill', 'borderColor'], site, visit);
        const blocks = mapSame(boxed.blocks, (block) => {
          const next = walkBlock(block, visit);
          return next !== block && settle ? settle(block, next) : next;
        });
        return blocks === boxed.blocks ? boxed : { ...boxed, blocks };
      });
      return columns === row.columns ? row : { ...row, columns };
    });
    return rows === section.rows ? section : { ...section, rows };
  });
  return sections === template.sections ? template : { ...template, sections };
}

function walkBlock(block: Block, visit: RefVisit): Block {
  switch (block.type) {
    case 'stripes': {
      // Each stripe counts, as it always has: "4 stripes" across two blocks.
      const stripes = mapSame(block.stripes, (s, i) => field(s, 'color', { count: 'stripe', id: `${block.id}:${i}` }, visit));
      return stripes === block.stripes ? block : { ...block, stripes };
    }
    case 'divider':
      return field(block, 'color', { count: 'divider', id: block.id }, visit);
    case 'brand':
      return field(block, 'color', { count: 'brand', id: block.id }, visit);
    case 'legal': {
      // This footer's own departures from Design › Footer. Absent keys follow the system, which is walked there.
      if (!block.style) return block;
      const style = fields(block.style, ['hairlineColor', 'linkColor'], () => ({ count: 'footer', id: block.id }), visit);
      return style === block.style ? block : { ...block, style };
    }
    case 'freeform': {
      const ground = field(block, 'background', { count: 'background', id: block.id }, visit);
      const layers = mapSame(ground.layers, (layer) => walkLayer(layer, { count: 'layer', id: `${block.id}/${layer.id}` }, visit));
      return layers === ground.layers ? ground : { ...ground, layers };
    }
    default:
      return block;
  }
}

/**
 * A layer's paints, and the colour on any run of its words. Every kind that paints names it `color`, `fill` or
 * `stroke`, so a new kind is covered by using one of them. A run's highlight is a hex and is not a reference.
 */
function walkLayer(layer: FreeformLayer, site: RefSite, visit: RefVisit): FreeformLayer {
  const painted = fields(layer, ['color', 'fill', 'stroke'], () => site, visit);
  if (!('styles' in painted) || !painted.styles) return painted;
  const styles = mapSame(painted.styles, (range) => field(range, 'color', site, visit));
  return styles === painted.styles ? painted : { ...painted, styles };
}

/** The panel's list: every labelled reference in order, then each counted kind as "1 stripe" or "4 stripes". */
export function describeUses(listed: string[], counted: Map<CountedKind, Set<string>>): string[] {
  const out = [...listed];
  for (const [kind, [one, many]] of Object.entries(COUNTED) as Array<[CountedKind, readonly [string, string]]>) {
    const n = counted.get(kind)?.size ?? 0;
    if (n) out.push(`${n} ${n === 1 ? one : many}`);
  }
  return out;
}
