// Several blocks in one column — a group.
//
// A column has always held a list of blocks. What this file defends is what the compiler now makes
// of a column holding more than one: **one cell** — one gutter, one box, one `hs_padded` — with the
// blocks in rows inside it, rather than one padded cell per block. The card starter is why: a card
// is a box around a heading, its copy and its button, and the first renderer drew three boxes
// because every block drew its own cell (learnings 3.59).
//
// The other half is the two operations that make and unmake one, and the drop that means "beside".

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { branchVariables } from '../src/compile/branches.ts';
import { DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import { addBlockToColumn, convertBlock, duplicateBlock, groupIntoStack, isStack, moveBlockInto, readValue, resolve, setRowColumns, setValue, shareSpans, splitStack, stackOf } from '../src/model/edit.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import type { Block, Column, Section, Template } from '../src/model/types.ts';

const lock = (label: string, field: string) => ({ editable: field !== '', label, field });

const heading = (id: string, text: string, field = ''): Block => ({ id, type: 'heading', lock: lock('Headline', field), text, level: 'h2', align: 'left' });
const copy = (id: string, html: string, field = ''): Block => ({ id, type: 'richtext', lock: lock('Copy', field), html, align: 'left' });
const button = (id: string, text: string): Block => ({ id, type: 'button', lock: lock('Label', ''), link: lock('Link', ''), text, href: 'https://x.test/', style: 'primary', align: 'left' });
const spacer = (id: string, height: number): Block => ({ id, type: 'spacer', height });
const topbar = (id: string): Block => ({ id, type: 'topbar', lock: lock('Tagline', ''), text: 'A TAGLINE' });
const stripes = (id: string): Block => ({ id, type: 'stripes', stripes: [{ color: 'redBright', height: 4 }] });

const column = (id: string, blocks: Block[], extra: Partial<Column> = {}): Column => ({
  id,
  span: 12,
  padTop: 10,
  padBottom: 10,
  align: 'left',
  ...extra,
  blocks,
});

const section = (id: string, columns: Column[], extra: Partial<Section> = {}): Section => {
  const t = theme(DEFAULT_DESIGN_SYSTEM, 'cream');
  return {
    id,
    theme: 'cream',
    bandColor: t.band,
    containerColor: t.container,
    textColor: t.text,
    linkColor: t.link,
    padTop: 0,
    padBottom: 0,
    ...extra,
    rows: [{ id: `${id}-row`, mobile: 'stack', columns }],
  };
};

const doc = (sections: Section[]): Template => ({
  schema: SCHEMA_VERSION,
  id: 'tpl',
  name: 'Stacks',
  hubspotLabel: 'Stacks',
  pageBackground: '#f7f6f3',
  forceLight: true,
  preview: { company: 'SWITCHYARDS U.S.A.', address: '151 Ted Turner Dr SE', city: 'Atlanta', state: 'GA', zip: '30303' },
  sections,
});

const out = (t: Template, annotate = false) => compile(t, { mode: 'hubl', date: '2026-01-01', annotate }).html;
const count = (s: string, needle: string) => s.split(needle).length - 1;

const card = () => doc([section('s1', [column('c1', [heading('h', 'Card'), copy('p', '<p>Copy.</p>'), button('b', 'Go')], { borderWidth: 2, borderColor: 'navy', borderPad: 12 })])]);

describe('a column holding several blocks renders as one cell', () => {
  it('draws one band, one padded cell and one box around all of them', () => {
    const html = out(card());
    expect(count(html, 'class="hse-section')).toBe(1);
    expect(count(html, 'class="hs_padded')).toBe(1);
    expect(count(html, 'border:2px solid #011272')).toBe(1);
    // And the blocks are all inside that box, in order.
    const box = html.indexOf('border:2px solid #011272');
    for (const word of ['Card', 'Copy.', 'Go']) expect(html.indexOf(word)).toBeGreaterThan(box);
    expect(html.indexOf('Card')).toBeLessThan(html.indexOf('Copy.'));
    expect(html.indexOf('Copy.')).toBeLessThan(html.indexOf('Go'));
  });

  it('puts the gap under every block but the last, from the design system', () => {
    const html = out(card());
    expect(count(html, 'padding:0 0 16px')).toBe(2);
    // The rows carry only the gap. The gutter and the vertical padding are the outer cell's.
    expect(html).toContain('padding:10px 20px 10px');
  });

  it('takes a gap of the column’s own over the system’s', () => {
    const t = card();
    t.sections[0]!.rows[0]!.columns[0]!.gap = 4;
    const html = out(t);
    expect(count(html, 'padding:0 0 4px')).toBe(2);
    expect(html).not.toContain('padding:0 0 16px');
  });

  it('leaves no gap either side of a spacer, so a spacer is exactly the space it says', () => {
    const t = doc([section('s1', [column('c1', [heading('h', 'A'), spacer('sp', 40), button('b', 'Go')])])]);
    const html = out(t);
    expect(html).not.toContain('padding:0 0 16px');
    expect(html).toContain('height:40px; line-height:40px');
  });

  it('wears hs_padded once — the rows inside never do', () => {
    // HubSpot's own phone rule on `.hs_padded` is `!important` and drags every cell wearing it out
    // to the gutter. A row inside the group wearing it would be inset twice on every phone.
    const html = out(card());
    expect(count(html, 'class="hs_padded')).toBe(1);
    expect(html).not.toMatch(/<td class="[^"]*hs_padded[^"]*"[^>]*style="[^"]*padding:0 0 16px/);
  });

  it('keeps the rich text class on its own row, where the inlined rules match', () => {
    const html = out(card());
    expect(html).toMatch(/<td class="sy-rich sy-rtl-[0-9a-f]+/);
  });

  it('hoists every field declaration ahead of the band', () => {
    const t = doc([section('s1', [column('c1', [heading('h', 'A', 'head'), copy('p', '<p>B</p>', 'body')])])]);
    const html = out(t);
    const band = html.indexOf('<div class="hse-section');
    expect(html.indexOf('{% text "head"')).toBeLessThan(band);
    expect(html.indexOf('{% rich_text "body"')).toBeLessThan(band);
    expect(errorsIn(lint({ ...compile(t, { mode: 'hubl' }), mode: 'hubl', template: t })).filter((f) => f.rule !== 'can-spam')).toEqual([]);
  });

  it('collapses one blank block’s row and leaves the rest of the group standing', () => {
    const t = doc([section('s1', [column('c1', [heading('h', 'A', 'head'), copy('p', '<p>B</p>', 'body')])])]);
    expect(branchVariables(compile(t, { mode: 'hubl' }).tree)).toHaveLength(2);
    const without = compile(t, { mode: 'preview', branch: { head: false, body: true } }).html;
    expect(without).not.toContain('>A<');
    expect(without).toContain('B');
    expect(count(without, 'class="hse-section')).toBe(1);
  });

  it('still draws a lone block exactly as it always did', () => {
    const one = doc([section('s1', [column('c1', [heading('h', 'Alone')])])]);
    const html = out(one);
    expect(count(html, 'class="hs_padded')).toBe(1);
    expect(html).not.toContain('padding:0 0 16px');
    expect(html).toContain('padding:10px 20px 10px');
  });

  it('gives a block that draws its own band a band of its own, even in a column with others', () => {
    // A document from before groups, with the stripes and a heading sharing a column, renders each
    // the way it did: the stripes cannot join a cell, and the heading alone is not a group.
    const t = doc([section('s1', [column('c1', [stripes('t'), heading('h', 'After the stripes')])])]);
    const html = out(t);
    expect(count(html, 'class="hse-section')).toBe(2);
    expect(html).toContain('#d20000');
    expect(html).toContain('After the stripes');
    expect(html).not.toContain('padding:0 0 16px');
  });

  it('lets the top bar share a cell, so a tagline and a link can sit in two columns', () => {
    const bar = (id: string, text: string, align: 'left' | 'right', href?: string): Block => ({ id, type: 'topbar', lock: lock('Tagline', ''), text, align, ...(href ? { href } : {}) });
    const t = doc([section('s1', [column('c1', [bar('a', 'THE CLUB', 'left')], { span: 6 }), column('c2', [bar('b', 'View in browser', 'right', 'https://x.test/view')], { span: 6 })])]);
    const html = out(t);
    expect(count(html, 'class="sy-col"')).toBe(2);
    expect(html).toContain('text-align:left');
    expect(html).toContain('<a href="https://x.test/view"');
    // Alone in its section it is the band it always was, centred, byte for byte.
    const alone = doc([section('s1', [column('c1', [topbar('t')])])]);
    expect(out(alone)).toContain('text-align:center');
    expect(count(out(alone), 'class="hs_padded')).toBe(0);
  });

  it('stacks inside a column of a multi-column row the same way', () => {
    const t = doc([section('s1', [column('c1', [heading('h', 'L1'), copy('p', '<p>L2</p>')], { span: 6 }), column('c2', [heading('r', 'R')], { span: 6 })])]);
    const html = out(t);
    expect(count(html, 'class="sy-col"')).toBe(2);
    // The left column: one padded cell with a gap row inside. The right: one padded cell, plain.
    expect(count(html, 'class="hs_padded')).toBe(2);
    expect(count(html, 'padding:0 0 16px')).toBe(1);
  });

  it('marks the group’s cell for the canvas, and never for an export', () => {
    expect(out(card(), true)).toContain('data-sy-column="c1"');
    expect(out(card())).not.toContain('data-sy-');
    // A column cell of a row carries its section too, so a click on the gap selects the row.
    const two = doc([section('s1', [column('c1', [heading('h', 'L')], { span: 6 }), column('c2', [], { span: 6 })])]);
    expect(out(two, true)).toMatch(/<td class="sy-col" data-sy-column="c2" data-sy-section="s1"/);
    expect(out(two)).not.toContain('data-sy-section');
    // A block that draws its own band is flagged, so the canvas offers only the sections beside it.
    const t = doc([section('s1', [column('c1', [stripes('t')])])]);
    expect(out(t, true)).toContain('data-sy-band=""');
    expect(out(card(), true)).not.toContain('data-sy-band');
  });
});

describe('grouping and ungrouping', () => {
  const three = () =>
    doc([
      section('s1', [column('c1', [heading('h', 'A')], { padTop: 24, borderWidth: 1 })]),
      section('s2', [column('c2', [copy('p', '<p>B</p>')], { padTop: 0, padBottom: 0 })], { theme: 'navy' }),
      section('s3', [column('c3', [button('b', 'Go')], { padBottom: 32 })]),
    ]);

  it('merges a run of sections into the first one’s column, in order', () => {
    const next = groupIntoStack(three(), ['h', 'b'])!;
    expect(next).not.toBeNull();
    expect(next.sections).toHaveLength(1);
    const col = next.sections[0]!.rows[0]!.columns[0]!;
    expect(col.blocks.map((b) => b.id)).toEqual(['h', 'p', 'b']);
    expect(isStack(next.sections[0]!)).toBe(true);
    // The first section's look survives; the outer rhythm is the run's.
    expect(next.sections[0]!.theme).toBe('cream');
    expect(col.borderWidth).toBe(1);
    expect(col.padTop).toBe(24);
    expect(col.padBottom).toBe(32);
  });

  it('takes whole sections: one block of a group brings the group', () => {
    const grouped = groupIntoStack(three(), ['h', 'p'])!;
    const again = groupIntoStack(grouped, ['p', 'b'])!;
    expect(again.sections[0]!.rows[0]!.columns[0]!.blocks.map((b) => b.id)).toEqual(['h', 'p', 'b']);
  });

  it('refuses one block, a run with a band-drawing block between, columns in it, or a block that draws its own band', () => {
    const t = three();
    expect(groupIntoStack(t, ['h'])).toBeNull();
    // The section between two selected ones comes along, so stripes between them stop the run.
    const gapped = doc([t.sections[0]!, section('x', [column('cx', [stripes('t')])]), t.sections[2]!]);
    expect(groupIntoStack(gapped, ['h', 'b'])).toBeNull();
    const withBar = doc([t.sections[0]!, section('x', [column('cx', [stripes('t')])])]);
    expect(groupIntoStack(withBar, ['h', 't'])).toBeNull();
    const withColumns = doc([t.sections[0]!, section('x', [column('ca', [heading('q', 'Q')], { span: 6 }), column('cb', [], { span: 6 })])]);
    expect(groupIntoStack(withColumns, ['h', 'q'])).toBeNull();
  });

  it('splits a group back into sections that keep the look', () => {
    const grouped = groupIntoStack(three(), ['h', 'b'])!;
    grouped.sections[0]!.rows[0]!.columns[0]!.gap = 12;
    const split = splitStack(grouped, 's1')!;
    expect(split.sections).toHaveLength(3);
    expect(split.sections.map((s) => s.rows[0]!.columns[0]!.blocks[0]!.id)).toEqual(['h', 'p', 'b']);
    // Every piece is on the group's preset, with the gap reproduced as space below.
    for (const s of split.sections) expect(s.theme).toBe('cream');
    const pads = split.sections.map((s) => [s.rows[0]!.columns[0]!.padTop, s.rows[0]!.columns[0]!.padBottom]);
    expect(pads).toEqual([
      [24, 12],
      [0, 12],
      [0, 32],
    ]);
    // New ids where there have to be, the block ids untouched.
    expect(new Set(split.sections.map((s) => s.id)).size).toBe(3);
    expect(splitStack(split, split.sections[1]!.id)).toBeNull();
  });

  it('names the group a block is in', () => {
    const grouped = groupIntoStack(three(), ['h', 'b'])!;
    expect(stackOf(grouped, 'p')?.id).toBe('s1');
    expect(stackOf(three(), 'p')).toBeNull();
  });

  it('resolves the column when the group itself is selected, so its spacing can be edited', () => {
    const grouped = groupIntoStack(three(), ['h', 'b'])!;
    expect(resolve(grouped, { kind: 'section', sectionId: 's1' }).column?.id).toBe('c1');
    const next = setValue(grouped, { kind: 'section', sectionId: 's1' }, 'column.gap', 8);
    expect(readValue(next, { kind: 'section', sectionId: 's1' }, 'column.gap')).toBe(8);
    expect(out(next)).toContain('padding:0 0 8px');
  });

  it('duplicates a lone block as a sibling section, and a grouped block beside itself in the group', () => {
    // ⌘D on a lone block has always looked like a second band under the first. Putting the copy in
    // the same column would now make a group of the two — one cell, one gap — which is not that.
    const lone = doc([section('s1', [column('c1', [heading('h', 'A', 'head')])])]);
    const next = duplicateBlock(lone, 'h');
    expect(next.sections).toHaveLength(2);
    expect(isStack(next.sections[0]!)).toBe(false);
    expect(next.sections[1]!.rows[0]!.columns[0]!.blocks).toHaveLength(1);
    // Inside a group the copy joins the group, directly below.
    const grouped = groupIntoStack(three(), ['h', 'b'])!;
    const again = duplicateBlock(grouped, 'p');
    expect(again.sections).toHaveLength(1);
    expect(again.sections[0]!.rows[0]!.columns[0]!.blocks.map((b) => b.type)).toEqual(['heading', 'richtext', 'richtext', 'button']);
  });

  it('turns a block into another kind, keeping the words, the alignment and the HubSpot field', () => {
    const t = doc([section('s1', [column('c1', [heading('h', 'Read all about it', 'head')])])]);
    const asText = convertBlock(t, 'h', 'richtext');
    const text = asText.sections[0]!.rows[0]!.columns[0]!.blocks[0]!;
    expect(text.type).toBe('richtext');
    expect(text.id).toBe('h');
    expect(text.type === 'richtext' && text.html).toBe('<p>Read all about it</p>');
    expect('lock' in text && text.lock.field).toBe('head');
    // And back, from the markup's words.
    const asButton = convertBlock(asText, 'h', 'button');
    const button = asButton.sections[0]!.rows[0]!.columns[0]!.blocks[0]!;
    expect(button.type === 'button' && button.text).toBe('Read all about it');
    expect(button.type === 'button' && button.align).toBe('left');
    // The same kind, or a kind that cannot share a cell, is left alone.
    expect(convertBlock(t, 'h', 'heading')).toBe(t);
    expect(convertBlock(t, 'h', 'stripes')).toBe(t);
  });

  it('shares a row by percentages when a divider is dragged, and the compiler follows', () => {
    const two = doc([section('s1', [column('c1', [heading('h', 'L')], { span: 6 }), column('c2', [heading('r', 'R')], { span: 6 })])]);
    const html = out(setRowColumns(two, 's1-row', [42, 58]));
    expect(html).toContain('width="42%"');
    expect(html).toContain('width="58%"');
  });

  it('rebalances the other columns when one share is typed', () => {
    expect(shareSpans([6, 6], 0, 30)).toEqual([30, 70]);
    expect(shareSpans([18, 62, 20], 0, 40)).toEqual([40, 45, 15]);
    // Nothing below a tenth, and a share that leaves no room for the rest is clamped.
    expect(shareSpans([6, 6], 1, 2)).toEqual([90, 10]);
    expect(shareSpans([4, 4, 4], 0, 95)).toEqual([80, 10, 10]);
    expect(shareSpans([12], 0, 50)).toEqual([12]);
  });

  it('will not put a block that draws its own band into a column', () => {
    const t = doc([section('s1', [column('c1', [heading('h', 'A'), copy('p', '<p>B</p>')])]), section('s2', [column('c2', [stripes('t')])])]);
    expect(moveBlockInto(t, 't', 'c1', 1)).toBe(t);
    expect(addBlockToColumn(t, 'c1', 'legal', 1)).toBe(t);
  });
});

describe('rendering a grouped block as a picture', () => {
  it('finds a cell of its own inside the block marker, though only the group wears hs_padded', () => {
    const html = out(card(), true);
    const start = html.indexOf('data-sy-block="h"');
    const marked = html.slice(start, html.indexOf('data-sy-block="p"'));
    expect(start).toBeGreaterThan(-1);
    expect(marked).not.toContain('hs_padded');
    // The render's fallback: the marker is a <td>, or holds one.
    const tag = html.slice(html.lastIndexOf('<', start), start);
    expect(tag.startsWith('<td') || marked.includes('<td')).toBe(true);
  });
});
