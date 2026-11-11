// Fixes from a review of the compiler and the editor, 2026-11-11. One describe per defect, each with the repro
// that showed it: a test that failed before its fix and passes after.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { lint } from '../src/compile/lint.ts';
import { DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import {
  addBlockToColumn,
  addSection,
  allBlocks,
  backToText,
  duplicateBlock,
  hubspotFields,
  moveBlockToSection,
  renderAsImage,
  setRowColumns,
  setValue,
  siteOf,
} from '../src/model/edit.ts';
import { patternFromSection } from '../src/model/patterns.ts';
import { fromContentEditable } from '../src/model/sanitise.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import { blankTemplate } from '../src/model/starters.ts';
import { typedValue } from '../src/app/dial-value.ts';
import type { Block, Column, Template } from '../src/model/types.ts';

const hubl = (t: Template) => compile(t, { mode: 'hubl', date: '2026-11-11' });
const findings = (t: Template, withTemplate = true) => {
  const out = hubl(t);
  return lint({ tree: out.tree, registry: out.registry, html: out.html, bytes: out.bytes, mode: 'hubl', ...(withTemplate ? { template: t } : {}) });
};
const rules = (t: Template, rule: string) => findings(t).filter((f) => f.rule === rule);

const heading = (id: string, text: string): Block => ({ id, type: 'heading', lock: { editable: false, label: 'Headline', field: '' }, text, level: 'h2', align: 'left' });
const column = (id: string, blocks: Block[], extra: Partial<Column> = {}): Column => ({ id, span: 6, padTop: 10, padBottom: 10, align: 'left', ...extra, blocks });

/** One section on cream holding one row of the given columns, set to stack on phones. */
function rowOf(columns: Column[], extra: Partial<Template> = {}): Template {
  const t = theme(DEFAULT_DESIGN_SYSTEM, 'cream');
  return {
    schema: SCHEMA_VERSION,
    id: 'tpl',
    name: 'Row',
    hubspotLabel: 'Row',
    pageBackground: '#f7f6f3',
    forceLight: true,
    preview: { company: 'SWITCHYARDS U.S.A.', address: '151 Ted Turner Dr SE', city: 'Atlanta', state: 'GA', zip: '30303' },
    ...extra,
    sections: [
      { id: 's1', theme: 'cream', bandColor: t.band, containerColor: t.container, textColor: t.text, linkColor: t.link, padTop: 0, padBottom: 0, rows: [{ id: 'r1', mobile: 'stack', columns }] },
      ...blankTemplate().sections.map((s) => ({ ...s, id: `legal-${s.id}` })),
    ],
  };
}

/** How many classes a selector carries: the number that decides between two `!important` rules here. */
const classCount = (selector: string) => (selector.match(/\.[A-Za-z0-9_-]+/g) ?? []).length;

describe('a link pasted or edited inline keeps its query string', () => {
  it('leaves an escaped ampersand escaped once, however many edits it goes through', () => {
    // What a browser's innerHTML hands back for a link with a query string: the `&` as `&amp;`.
    const once = '<p><a href="https://x.com/?utm_source=a&amp;utm_medium=b">Read</a></p>';
    let html = once;
    for (let i = 0; i < 3; i += 1) html = fromContentEditable(html);
    expect(html).toContain('href="https://x.com/?utm_source=a&amp;utm_medium=b"');
    expect(html).not.toContain('&amp;amp;');
  });

  it('still escapes a bare ampersand', () => {
    expect(fromContentEditable('<p><a href="https://x.com/?a=1&b=2">x</a></p>')).toContain('href="https://x.com/?a=1&amp;b=2"');
  });
});

describe('Hide on phones in a row that stacks', () => {
  it('outranks the stacking rule, so the column actually goes', () => {
    const html = hubl(rowOf([column('c1', [heading('b1', 'Copy')]), column('c2', [heading('b2', 'Decoration')], { hideOnPhone: true })])).html;
    const stack = /([^{}]*\.sy-row-stack \.sy-col)\s*\{\s*display:block !important/.exec(html)?.[1]?.trim() ?? '';
    const hide = /([^{}]*\.sy-col-hide)\s*\{\s*display:none !important/.exec(html)?.[1]?.trim() ?? '';
    expect(stack).not.toBe('');
    expect(hide).not.toBe('');
    // Both are `!important`, so the one with more classes wins.
    expect(classCount(hide)).toBeGreaterThan(classCount(stack));
  });
});

describe('field names a copy cannot share', () => {
  it('a drag and drop area’s name is taken before a Text block is named', () => {
    let t = addSection(blankTemplate(), 'dndarea', null);
    t = addSection(t, 'richtext', null);
    const area = allBlocks(t).find((b) => b.type === 'dndarea');
    const text = allBlocks(t).find((b) => b.type === 'richtext');
    expect(area?.type === 'dndarea' && area.name).toBe('email_body');
    expect(text?.type === 'richtext' && text.lock.field).not.toBe('email_body');
  });

  it('a picture of text, duplicated and put back into words twice, declares two fields', () => {
    let t = addSection(blankTemplate(), 'heading', null);
    const h = allBlocks(t).find((b) => b.type === 'heading')!;
    t = renderAsImage(t, h.id, { src: 'https://example.com/h.png', alt: 'Heading', width: 300 });
    // Beside a second block, so ⌘D copies the block rather than its whole section.
    t = addBlockToColumn(t, siteOf(t, h.id)!.column.id, 'spacer');
    t = duplicateBlock(t, h.id);
    for (const img of allBlocks(t).filter((b) => b.type === 'image')) t = backToText(t, img.id);
    const names = hubspotFields(t).filter((f) => f.label === 'Headline').map((f) => f.field);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(rules(t, 'duplicate-field')).toEqual([]);
  });

  it('a locked heading, duplicated and then unlocked twice, declares two fields', () => {
    let t = addSection(blankTemplate(), 'heading', null);
    const h = allBlocks(t).find((b) => b.type === 'heading')!;
    const at = { kind: 'block' as const, sectionId: siteOf(t, h.id)!.section.id, blockId: h.id };
    t = setValue(t, at, 'block.lock.editable', false);
    t = duplicateBlock(t, h.id);
    for (const b of allBlocks(t).filter((x) => x.type === 'heading')) {
      t = setValue(t, { kind: 'block', sectionId: siteOf(t, b.id)!.section.id, blockId: b.id }, 'block.lock.editable', true);
    }
    const names = allBlocks(t).flatMap((b) => (b.type === 'heading' ? [b.lock.field] : []));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(rules(t, 'duplicate-field')).toEqual([]);
  });
});

describe('a block dragged out of a pattern', () => {
  it('lands in a section that is not an instance of it', () => {
    let t = addSection(blankTemplate(), 'heading', null);
    const h = allBlocks(t).find((b) => b.type === 'heading')!;
    t = addBlockToColumn(t, siteOf(t, h.id)!.column.id, 'richtext');
    t = addBlockToColumn(t, siteOf(t, h.id)!.column.id, 'button');
    t = patternFromSection(t, siteOf(t, h.id)!.section.id, 'CTA card', 'p1')!.template;
    const button = allBlocks(t).find((b) => b.type === 'button')!;
    t = moveBlockToSection(t, button.id, t.sections.length);
    expect(siteOf(t, button.id)!.section.pattern).toBeUndefined();
    // The section it left is still the pattern's.
    expect(siteOf(t, h.id)!.section.pattern).toEqual({ id: 'p1', version: 1 });
  });
});

describe('Force light off', () => {
  it('does not report the dark layers it asked not to have', () => {
    const t = rowOf([column('c1', [heading('b1', 'A')]), column('c2', [heading('b2', 'B')])], { forceLight: false });
    expect(rules(t, 'dark-mode-coverage')).toEqual([]);
  });

  it('still checks them with Force light on, and without a template', () => {
    const t = rowOf([column('c1', [heading('b1', 'A')]), column('c2', [heading('b2', 'B')])], { forceLight: false });
    // From the command line there is no template to ask, so the check runs as it always has.
    expect(findings(t, false).some((f) => f.rule === 'dark-mode-coverage')).toBe(true);
    expect(rules({ ...t, forceLight: true }, 'dark-mode-coverage')).toEqual([]);
  });
});

describe('a spacer at zero', () => {
  it('is zero pixels, not twenty', () => {
    let t = addSection(blankTemplate(), 'spacer', null);
    const s = allBlocks(t).find((b) => b.type === 'spacer')!;
    t = setValue(t, { kind: 'block', sectionId: siteOf(t, s.id)!.section.id, blockId: s.id }, 'block.height', 0);
    const html = hubl(t).html;
    expect(html).toContain('height="0"');
    expect(html).not.toContain('height="20"');
  });
});

describe('a column added to a row', () => {
  it('takes column one’s padding and alignment, and not its Hide on phones, box or fill', () => {
    const first = column('c1', [heading('b1', 'A')], { hideOnPhone: true, borderWidth: 2, fill: 'navy', padTop: 24, padLeft: 8, align: 'center' });
    const t = setRowColumns(rowOf([first, column('c2', [heading('b2', 'B')])]), 'r1', [4, 4, 4]);
    const added = t.sections[0]!.rows[0]!.columns[2]!;
    expect(added).toMatchObject({ padTop: 24, padBottom: 10, padLeft: 8, align: 'center', blocks: [] });
    expect(added.hideOnPhone).toBeUndefined();
    expect(added.borderWidth).toBeUndefined();
    expect(added.fill).toBeUndefined();
  });
});

describe('links lint reads as links', () => {
  it('accepts tel:, sms: and a scheme in capitals', () => {
    let t = addSection(blankTemplate(), 'button', null);
    const b = allBlocks(t).find((x) => x.type === 'button')!;
    const at = { kind: 'block' as const, sectionId: siteOf(t, b.id)!.section.id, blockId: b.id };
    t = setValue(t, at, 'block.link.editable', false);
    for (const href of ['tel:+14045550100', 'sms:+14045550100', 'HTTPS://www.switchyards.com/']) {
      expect(rules(setValue(t, at, 'block.href', href), 'relative-link'), href).toEqual([]);
    }
    expect(rules(setValue(t, at, 'block.href', 'www.switchyards.com/tour'), 'relative-link')).toHaveLength(1);
  });
});

describe('a dial cleared by hand', () => {
  it('lands on its minimum, unless it names what zero means', () => {
    expect(typedValue('', 20, 600)).toBe(20);
    expect(typedValue('  ', 1, 10)).toBe(1);
    expect(typedValue('', 0, 100, 'Level default')).toBe(0);
    expect(typedValue('', 20, 600, 'Auto')).toBe(0);
  });

  it('clamps a typed number and leaves an unreadable one alone', () => {
    expect(typedValue('9000', 20, 600)).toBe(600);
    expect(typedValue('103', 0, 200)).toBe(103);
    expect(typedValue('abc', 0, 200)).toBeNull();
  });
});
