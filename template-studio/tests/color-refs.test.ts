// Every place a palette colour or a font can be named, and what renaming or removing one does to it
// (model/color-refs.ts, learnings 3.103).
//
// The bug: a column's fill set to `card`, then the palette entry renamed to Callout. Usage came back empty,
// the fill stayed `card`, and the export lost #123456, because the card's wrapper is only drawn when its
// fill resolves. Presets, roles, buttons, stripes and dividers were walked; a dozen other references were
// not. So this file is one table, one row per kind of reference, and every row is put through the same
// four questions: does the palette see it, does a rename carry it, does a bare delete refuse, and does a
// replace move it. A kind added to the model without a row here is the gap this was written to close.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { canvasTypeSampleSvg, freeformSvg } from '../src/compile/freeform.ts';
import { DEFAULT_CANVAS_TYPE, type CanvasTextStyle, type DesignSystem } from '../src/model/design-system.ts';
import {
  addColor,
  addFont,
  addSection,
  allBlocks,
  colorUsage,
  designSystemOf,
  fontUsage,
  removeColor,
  removeFont,
  renameColor,
} from '../src/model/edit.ts';
import { isRendered, pictureHash } from '../src/model/freeform.ts';
import { importV1 } from '../src/model/import-v1.ts';
import type { Block, Column, FreeformLayer, Template } from '../src/model/types.ts';
import fixture from '../reference/v1-standard-email.design.json';

const CARD = '#123456';
const NAVY = '#011272';

const html = (t: Template) => compile(t, { mode: 'hubl', date: '2026-01-01' }).html;
const preview = (t: Template) => compile(t, { mode: 'preview', date: '2026-01-01' }).html;

/** The standard email with one more palette entry, `card`, that nothing names yet. */
const withCard = (): Template => addColor(importV1(fixture as never).template, 'Card', CARD);

const withDs = (t: Template, change: (ds: DesignSystem) => DesignSystem): Template => ({ ...t, ds: change(designSystemOf(t)) });

/** A new section of one block type, and that block changed by `fn`. */
function adding<T extends Block['type']>(t: Template, type: T, fn: (b: Extract<Block, { type: T }>) => Block): Template {
  const next = addSection(t, type, null);
  const added = next.sections.find((s) => !t.sections.includes(s))!;
  return {
    ...next,
    sections: next.sections.map((s) =>
      s !== added
        ? s
        : {
            ...s,
            rows: s.rows.map((r) => ({
              ...r,
              columns: r.columns.map((c) => ({ ...c, blocks: c.blocks.map((b) => (b.type === type ? fn(b as Extract<Block, { type: T }>) : b)) })),
            })),
          },
    ),
  };
}

/** A new heading section whose column is changed by `fn`: a card is a column with a fill. */
function boxed(t: Template, fn: (c: Column) => Column): Template {
  const next = addSection(t, 'heading', null);
  const added = next.sections.find((s) => !t.sections.includes(s))!;
  return {
    ...next,
    sections: next.sections.map((s) => (s !== added ? s : { ...s, rows: s.rows.map((r) => ({ ...r, columns: r.columns.map(fn) })) })),
  };
}

/** Every block of a type in the template, changed by `fn`. */
function each<T extends Block['type']>(t: Template, type: T, fn: (b: Extract<Block, { type: T }>) => Block): Template {
  return {
    ...t,
    sections: t.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({
        ...r,
        columns: r.columns.map((c) => ({ ...c, blocks: c.blocks.map((b) => (b.type === type ? fn(b as Extract<Block, { type: T }>) : b)) })),
      })),
    })),
  };
}

const columns = (t: Template): Column[] => t.sections.flatMap((s) => s.rows.flatMap((r) => r.columns));
const firstOf = <T extends Block['type']>(t: Template, type: T) => allBlocks(t).find((b) => b.type === type) as Extract<Block, { type: T }>;
const freeform = (t: Template) => firstOf(t, 'freeform');
const drawn = (t: Template) => freeformSvg(freeform(t), designSystemOf(t));

/** A freeform block holding one layer. */
const drawing = (t: Template, layer: FreeformLayer) => adding(t, 'freeform', (b) => ({ ...b, layers: [layer] }));

/** The footer as one of the Switchyards types, which are the ones that read Design › Footer. */
const masthead = (t: Template) => each(t, 'legal', (b) => ({ ...b, layout: 'masthead' }));

/** The system's brand presets, with one of the shipped ones changed. */
const preset = (key: string, change: Partial<CanvasTextStyle>) => (ds: DesignSystem): DesignSystem => ({
  ...ds,
  canvasType: { ...DEFAULT_CANVAS_TYPE, [key]: { ...DEFAULT_CANVAS_TYPE[key]!, ...change } },
});

interface Kind {
  name: string;
  /** The standard email with `card` named in exactly one place of this kind. */
  place(t: Template): Template;
  /** What that place names now. */
  read(t: Template): unknown;
  /** How the palette reports it. */
  use: string;
  /** Where the colour reaches: the export, the preview, or the picture a freeform block is drawn into. */
  shows(t: Template): string;
}

const KINDS: Kind[] = [
  {
    name: 'a card’s fill',
    place: (t) => boxed(t, (c) => ({ ...c, fill: 'card', borderRadius: 8 })),
    read: (t) => columns(t).find((c) => c.fill !== undefined)?.fill,
    use: '1 card fill',
    shows: html,
  },
  {
    name: 'a box’s border',
    place: (t) => boxed(t, (c) => ({ ...c, borderWidth: 2, borderColor: 'card' })),
    read: (t) => columns(t).find((c) => c.borderColor !== undefined)?.borderColor,
    use: '1 box border',
    shows: html,
  },
  {
    name: 'a brand mark',
    place: (t) => adding(t, 'brand', (b) => ({ ...b, color: 'card' })),
    read: (t) => firstOf(t, 'brand').color,
    use: '1 brand mark',
    shows: preview,
  },
  {
    name: 'a freeform background',
    place: (t) => adding(t, 'freeform', (b) => ({ ...b, background: 'card' })),
    read: (t) => freeform(t).background,
    use: '1 freeform background',
    shows: drawn,
  },
  {
    name: 'a freeform text layer’s colour',
    place: (t) => drawing(t, { kind: 'text', id: 'l1', text: 'Hi', role: 'h2', color: 'card', x: 0, y: 0, width: 200, align: 'left' }),
    read: (t) => (freeform(t).layers[0] as { color: unknown }).color,
    use: '1 freeform layer',
    shows: drawn,
  },
  {
    name: 'a freeform shape’s fill',
    place: (t) => drawing(t, { kind: 'rect', id: 'l1', x: 0, y: 0, width: 40, height: 40, fill: 'card', stroke: null, strokeWidth: 0, radius: 0 }),
    read: (t) => (freeform(t).layers[0] as { fill: unknown }).fill,
    use: '1 freeform layer',
    shows: drawn,
  },
  {
    name: 'a freeform line’s stroke',
    place: (t) => drawing(t, { kind: 'line', id: 'l1', x1: 0, y1: 0, x2: 40, y2: 40, stroke: 'card', strokeWidth: 2 }),
    read: (t) => (freeform(t).layers[0] as { stroke: unknown }).stroke,
    use: '1 freeform layer',
    shows: drawn,
  },
  {
    name: 'a note’s paper',
    place: (t) => drawing(t, { kind: 'sticky', id: 'l1', text: 'Hi', role: 'body', color: null, fill: 'card', x: 0, y: 0, width: 120, height: 120 }),
    read: (t) => (freeform(t).layers[0] as { fill: unknown }).fill,
    use: '1 freeform layer',
    shows: drawn,
  },
  {
    name: 'a mark on the canvas',
    place: (t) => drawing(t, { kind: 'mark', id: 'l1', mark: 'sy', color: 'card', x: 0, y: 0, width: 60, height: 60 }),
    read: (t) => (freeform(t).layers[0] as { color: unknown }).color,
    use: '1 freeform layer',
    shows: drawn,
  },
  {
    name: 'a run of words in a freeform layer',
    place: (t) =>
      drawing(t, { kind: 'text', id: 'l1', text: 'Hello there', role: 'h2', color: null, x: 0, y: 0, width: 200, align: 'left', styles: [{ from: 0, to: 5, color: 'card' }] }),
    read: (t) => (freeform(t).layers[0] as { styles: Array<{ color: unknown }> }).styles[0]!.color,
    use: '1 freeform layer',
    shows: drawn,
  },
  {
    name: 'the quote bar',
    place: (t) => withDs(t, (ds) => ({ ...ds, richText: { ...ds.richText, quoteColor: 'card' } })),
    read: (t) => designSystemOf(t).richText.quoteColor,
    use: 'rich text · quote bar',
    shows: html,
  },
  {
    name: 'the rule',
    place: (t) => withDs(t, (ds) => ({ ...ds, richText: { ...ds.richText, ruleColor: 'card' } })),
    read: (t) => designSystemOf(t).richText.ruleColor,
    use: 'rich text · rule',
    shows: html,
  },
  {
    name: 'the image border',
    place: (t) => withDs(t, (ds) => ({ ...ds, image: { ...ds.image, borderWidth: 2, borderColor: 'card' } })),
    read: (t) => designSystemOf(t).image.borderColor,
    use: 'images · border',
    shows: html,
  },
  {
    name: 'the page border',
    place: (t) => withDs(t, (ds) => ({ ...ds, pageBorderWidth: 2, pageBorderColor: 'card' })),
    read: (t) => designSystemOf(t).pageBorderColor,
    use: 'page · border',
    shows: html,
  },
  {
    name: 'Design › Footer’s hairline',
    place: (t) => withDs(masthead(t), (ds) => ({ ...ds, footer: { hairlineColor: 'card' } })),
    read: (t) => designSystemOf(t).footer?.hairlineColor,
    use: 'footer · hairline',
    shows: html,
  },
  {
    name: 'Design › Footer’s link',
    place: (t) => withDs(masthead(t), (ds) => ({ ...ds, footer: { linkColor: 'card' } })),
    read: (t) => designSystemOf(t).footer?.linkColor,
    use: 'footer · link',
    shows: html,
  },
  {
    name: 'one footer’s own hairline',
    place: (t) => each(masthead(t), 'legal', (b) => ({ ...b, style: { hairlineColor: 'card' } })),
    read: (t) => firstOf(t, 'legal').style?.hairlineColor,
    use: '1 footer',
    shows: html,
  },
  {
    name: 'one footer’s own link',
    place: (t) => each(masthead(t), 'legal', (b) => ({ ...b, style: { linkColor: 'card' } })),
    read: (t) => firstOf(t, 'legal').style?.linkColor,
    use: '1 footer',
    shows: html,
  },
  {
    name: 'a brand preset’s ink',
    place: (t) => withDs(t, preset('retro', { color: 'card' })),
    read: (t) => designSystemOf(t).canvasType?.['retro']?.color,
    use: 'Shop sign brand preset · colour',
    shows: (t) => canvasTypeSampleSvg(designSystemOf(t), 'retro'),
  },
  {
    name: 'a brand preset’s stroke',
    place: (t) => withDs(t, preset('marker', { stroke: { color: 'card', width: 2 } })),
    read: (t) => designSystemOf(t).canvasType?.['marker']?.stroke?.color,
    use: 'Letterhead brand preset · stroke',
    shows: (t) => canvasTypeSampleSvg(designSystemOf(t), 'marker'),
  },
  {
    name: 'a brand preset’s shadow',
    place: (t) => withDs(t, preset('marker', { shadow: { color: 'card', x: 2, y: 2, blur: 0 } })),
    read: (t) => designSystemOf(t).canvasType?.['marker']?.shadow?.color,
    use: 'Letterhead brand preset · shadow',
    shows: (t) => canvasTypeSampleSvg(designSystemOf(t), 'marker'),
  },
  {
    name: 'a brand preset’s highlight',
    place: (t) => withDs(t, preset('marker', { highlight: { color: 'card', cover: 40 } })),
    read: (t) => designSystemOf(t).canvasType?.['marker']?.highlight?.color,
    use: 'Letterhead brand preset · highlight',
    // A highlight band has no SVG equivalent (compile/freeform.ts), so the picture is the text layer drawn in it.
    shows: (t) => drawn(drawing(t, { kind: 'text', id: 'l1', text: 'Hi', role: 'h2', color: null, x: 0, y: 0, width: 200, align: 'left', look: 'marker' })),
  },
];

describe.each(KINDS)('$name', (kind) => {
  const t = kind.place(withCard());

  it('reaches the output, so the checks below are about something', () => {
    expect(kind.read(t)).toBe('card');
    expect(kind.shows(t)).toContain(CARD);
  });

  it('is counted by the palette', () => {
    expect(colorUsage(designSystemOf(t), 'card', t)).toEqual([kind.use]);
  });

  it('is carried by a rename, and the output does not move', () => {
    const renamed = renameColor(t, 'card', 'Callout');
    expect(kind.read(renamed)).toBe('callout');
    expect(colorUsage(designSystemOf(renamed), 'card', renamed)).toEqual([]);
    expect(colorUsage(designSystemOf(renamed), 'callout', renamed)).toEqual([kind.use]);
    expect(kind.shows(renamed)).toContain(CARD);
  });

  it('keeps a bare delete from leaving it naming nothing', () => {
    expect(designSystemOf(removeColor(t, 'card')).colors['card']).toBe(CARD);
  });

  it('is moved by a replace, and the output moves with it', () => {
    const replaced = removeColor(t, 'card', 'navy');
    expect(designSystemOf(replaced).colors['card']).toBeUndefined();
    expect(kind.read(replaced)).toBe('navy');
    expect(colorUsage(designSystemOf(replaced), 'card', replaced)).toEqual([]);
    expect(kind.shows(replaced)).not.toContain(CARD);
    expect(kind.shows(replaced)).toContain(NAVY);
  });
});

describe('the walk', () => {
  it('counts a layer once, however many of its paints name the colour', () => {
    const t = drawing(withCard(), { kind: 'rect', id: 'l1', x: 0, y: 0, width: 40, height: 40, fill: 'card', stroke: 'card', strokeWidth: 2, radius: 0 });
    expect(colorUsage(designSystemOf(t), 'card', t)).toEqual(['1 freeform layer']);
  });

  it('lists the system first and then each counted kind, in one line the panel can read', () => {
    let t = boxed(withCard(), (c) => ({ ...c, fill: 'card' }));
    t = boxed(t, (c) => ({ ...c, fill: 'card' }));
    t = withDs(t, (ds) => ({ ...ds, pageBorderColor: 'card' }));
    expect(colorUsage(designSystemOf(t), 'card', t)).toEqual(['page · border', '2 card fills']);
  });

  it('reads the shipped brand presets when the system never set any, and writes them only when one changed', () => {
    // The Shop sign is red whether or not anybody wrote `canvasType`. Before, renaming red left it naming
    // nothing, and the preset fell back to the ink.
    const t = importV1(fixture as never).template;
    expect(designSystemOf(t).canvasType).toBeUndefined();
    expect(colorUsage(designSystemOf(t), 'red', t)).toContain('Shop sign brand preset · colour');
    const renamed = renameColor(t, 'red', 'Brand');
    expect(designSystemOf(renamed).canvasType?.['retro']?.color).toBe('brand');
    expect(canvasTypeSampleSvg(designSystemOf(renamed), 'retro')).toContain('#d10000');
    // A colour no preset names leaves the shipped set where it was: not frozen into the file.
    expect(designSystemOf(renameColor(t, 'navy', 'Ink')).canvasType).toBeUndefined();
  });

  it('carries the old single effect’s colour, which an old file can still hold', () => {
    const t = withDs(withCard(), preset('marker', { effect: 'outline', effectColor: 'card', amount: 50 }));
    expect(colorUsage(designSystemOf(t), 'card', t)).toEqual(['Letterhead brand preset · effect']);
    expect(designSystemOf(renameColor(t, 'card', 'Callout')).canvasType?.['marker']?.effectColor).toBe('callout');
  });

  it('keeps a rendered picture current through a rename, which moves no pixel', () => {
    // The picture's hash covers its recipe, names included. Without this, renaming a colour would call every
    // freeform block and brand mark naming it stale, and ask for a picture that would come out the same.
    const placed = adding(drawing(withCard(), { kind: 'mark', id: 'l1', mark: 'sy', color: 'card', x: 0, y: 0, width: 60, height: 60 }), 'brand', (b) => ({ ...b, color: 'card' }));
    const t = each(each(placed, 'freeform', (b) => ({ ...b, src: 'drawn.png', renderedHash: pictureHash(b) })), 'brand', (b) => ({ ...b, src: 'mark.png', renderedHash: pictureHash(b) }));
    expect(isRendered(freeform(t))).toBe(true);
    expect(isRendered(firstOf(t, 'brand'))).toBe(true);

    const renamed = renameColor(t, 'card', 'Callout');
    expect(isRendered(freeform(renamed))).toBe(true);
    expect(isRendered(firstOf(renamed, 'brand'))).toBe(true);

    // A replace changes the colour, so the picture is stale and the checks say so.
    const replaced = removeColor(t, 'card', 'navy');
    expect(isRendered(freeform(replaced))).toBe(false);
    expect(isRendered(firstOf(replaced, 'brand'))).toBe(false);
  });

  it('keeps a picture stale that was stale before, rename or not', () => {
    const t = each(adding(withCard(), 'brand', (b) => ({ ...b, color: 'card' })), 'brand', (b) => ({ ...b, src: 'old.png', renderedHash: 'nope' }));
    expect(isRendered(firstOf(renameColor(t, 'card', 'Callout'), 'brand'))).toBe(false);
  });

  it('leaves the document alone when nothing in it names the colour', () => {
    const t = withCard();
    const renamed = renameColor(t, 'card', 'Callout');
    expect(allBlocks(renamed)).toEqual(allBlocks(t));
  });
});

describe('fonts', () => {
  const mono = () => addFont(withCard(), 'Mono', 'Menlo, monospace');

  it('counts the shipped brand presets, and keeps their face from being removed', () => {
    const t = withCard();
    expect(fontUsage(designSystemOf(t), 'georgia', t)).toEqual(['Display serif brand preset', 'Supper club brand preset']);
    expect(removeFont(t, 'georgia')).toBe(t);
  });

  it('counts a brand preset the system wrote', () => {
    const t = withDs(mono(), preset('marker', { font: 'mono' }));
    expect(fontUsage(designSystemOf(t), 'mono', t)).toEqual(['Letterhead brand preset']);
    expect(removeFont(t, 'mono')).toBe(t);
  });

  const LAYERS: Array<[string, FreeformLayer]> = [
    ['a text layer’s face', { kind: 'text', id: 'l1', text: 'Hi', role: 'h2', color: null, x: 0, y: 0, width: 200, align: 'left', font: 'mono' }],
    ['a note’s face', { kind: 'sticky', id: 'l1', text: 'Hi', role: 'body', color: null, fill: null, x: 0, y: 0, width: 120, height: 120, font: 'mono' }],
    ['a run of words', { kind: 'text', id: 'l1', text: 'Hello there', role: 'h2', color: null, x: 0, y: 0, width: 200, align: 'left', styles: [{ from: 0, to: 5, font: 'mono' }] }],
  ];

  it.each(LAYERS)('counts %s, and refuses to remove the stack under it', (_name, layer) => {
    const t = drawing(mono(), layer);
    expect(fontUsage(designSystemOf(t), 'mono', t)).toEqual(['1 freeform layer']);
    // Without the document the system alone cannot see it, which is why removal passes the template.
    expect(fontUsage(designSystemOf(t), 'mono')).toEqual([]);
    expect(removeFont(t, 'mono')).toBe(t);
  });

  it('removes the stack once nothing names it', () => {
    const t = mono();
    expect(designSystemOf(removeFont(t, 'mono')).fonts['mono']).toBeUndefined();
  });

  it('counts a layer once, however many of its runs name the font', () => {
    const t = drawing(mono(), {
      kind: 'text',
      id: 'l1',
      text: 'Hello there',
      role: 'h2',
      color: null,
      x: 0,
      y: 0,
      width: 200,
      align: 'left',
      font: 'mono',
      styles: [
        { from: 0, to: 2, font: 'mono' },
        { from: 3, to: 5, font: 'mono' },
      ],
    });
    expect(fontUsage(designSystemOf(t), 'mono', t)).toEqual(['1 freeform layer']);
  });
});
