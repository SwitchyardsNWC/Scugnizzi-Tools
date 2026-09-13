// Making a template of your own.
//
// The app used to open on the standard email and stop there: every new block arrived on the
// shipped cream preset whatever the template's system said, the top bar and the footer drew a
// preset called navy whatever their section said, and there was no way to start from nothing.
// These are the rules that make a *custom* template possible, and the bugs each of them replaced.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { createSection } from '../src/model/catalog.ts';
import { bandedPreset, DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import {
  addFont,
  addSection,
  addColumnsAt,
  allBlocks,
  colorUsage,
  designSystemOf,
  duplicateTemplate,
  fontUsage,
  hubspotFields,
  removeColor,
  removeFont,
  renameColor,
  setValue,
} from '../src/model/edit.ts';
import { sequentialIds } from '../src/model/ids.ts';
import { templateFileName } from '../src/model/serialize.ts';
import { blankTemplate, cardDesignSystem, cardTemplate } from '../src/model/starters.ts';
import type { Template } from '../src/model/types.ts';
import { declaredFields } from './structure.ts';

const hubl = (t: Template) => compile(t, { mode: 'hubl', date: '2026-01-01' });
const clean = (t: Template) => errorsIn(lint({ ...hubl(t), mode: 'hubl', template: t }));

describe('the starters', () => {
  it('both compile clean, which is the whole bar for a starting point', () => {
    expect(clean(blankTemplate())).toEqual([]);
    expect(clean(cardTemplate())).toEqual([]);
  });

  it('blank is the one block a template cannot ship without', () => {
    // HubSpot refuses a template with no unsubscribe link (learnings 1.8). A page with nothing on
    // it is a page that cannot ship, so "blank" is the footer and nothing else.
    const types = allBlocks(blankTemplate()).map((b) => b.type);
    expect(types).toEqual(['legal']);
    expect(hubl(blankTemplate()).html).toContain('{{ unsubscribe_link');
  });

  it('the card email carries its own design system and is built from it', () => {
    const t = cardTemplate();
    const ds = designSystemOf(t);
    expect(t.ds).toBeDefined();
    // Monospace, named as a stack the system holds rather than typed onto anything.
    expect(ds.fonts['mono']).toContain('Menlo');
    expect(ds.fontStack).toBe(ds.fonts['mono']);
    // The cards are column boxes in the palette's ink — the probe's look, as tokens.
    const boxed = t.sections.flatMap((s) => s.rows.flatMap((r) => r.columns)).filter((c) => (c.borderWidth ?? 0) > 0);
    expect(boxed.length).toBeGreaterThanOrEqual(3);
    for (const c of boxed) expect(c.borderColor).toBe('ink');
    // And the output is set in it, drawn in it, and framed in it.
    const html = hubl(t).html;
    expect(html).toContain('font-family:Menlo, Consolas, Courier New, monospace');
    expect(html).toContain('border:2px solid #111111');
    expect(html).not.toContain('#011272');
  });

  it('the card email has a divider and a footer on its own dark preset', () => {
    const t = cardTemplate();
    expect(allBlocks(t).some((b) => b.type === 'divider')).toBe(true);
    const footer = t.sections.find((s) => s.domId === 'section-legal')!;
    expect(footer.theme).toBe('ink');
    expect(footer.bandColor).toBe('#111111');
    // Left-aligned, which the footer honours now — it used to be right whatever the column said.
    expect(hubl(t).html).toMatch(/hse-footer[^>]*>[\s\S]*?<td align="left"/);
  });

  it('gives every editable field a unique name', () => {
    const names = declaredFields(hubl(cardTemplate()).html).map((f) => f.name);
    expect(names.length).toBeGreaterThan(4);
    expect(new Set(names).size).toBe(names.length);
    // And the editability view agrees with the output about the order.
    expect(hubspotFields(cardTemplate()).map((f) => f.field)).toEqual(names);
  });

  it('the card system prefers a banded preset for the furniture', () => {
    expect(bandedPreset(cardDesignSystem())).toBe('ink');
    expect(bandedPreset(DEFAULT_DESIGN_SYSTEM)).toBe('navy');
    // A system with no band at all still answers with a preset it has.
    expect(bandedPreset({ ...DEFAULT_DESIGN_SYSTEM, themes: { paper: { band: null, container: null, text: 'navy', link: 'red', button: 'primary' } } })).toBe('paper');
  });
});

describe('new blocks follow the template’s own system', () => {
  it('a block added to the card email lands on its first preset, not on cream', () => {
    // The bug: `createSection` read the shipped defaults, so a heading dropped into a template on
    // another palette arrived on cream with navy text — the one section that ignored the system,
    // and it was every new one.
    const t = addSection(cardTemplate(), 'heading', null);
    const added = t.sections.at(-1)!;
    expect(added.theme).toBe('white');
    expect(added.containerColor).toBe('#ffffff');
    expect(added.textColor).toBe('#111111');
  });

  it('a top bar or footer added to it lands on the banded preset', () => {
    const t = addSection(addSection(cardTemplate(), 'topbar', null), 'legal', null);
    const [topbar, legal] = t.sections.slice(-2);
    expect(topbar!.theme).toBe('ink');
    expect(legal!.theme).toBe('ink');
    expect(hubl(t).html).not.toContain('#011272');
  });

  it('a row of columns lands on the first preset by name', () => {
    const t = addColumnsAt(cardTemplate(), 0);
    expect(t.sections[0]!.theme).toBe('white');
  });

  it('createSection with no system still gives the shipped values', () => {
    const s = createSection('heading', { id: sequentialIds(), taken: new Set() });
    expect(s.theme).toBe('cream');
    const furniture = createSection('legal', { id: sequentialIds(), taken: new Set() });
    expect(furniture.theme).toBe('navy');
    expect(furniture.bandColor).toBe('#011272');
  });
});

describe('the top bar and the footer draw their section', () => {
  it('follow a preset change like any other block', () => {
    // Pick the card email's footer and move it to the light preset: the band goes, the ink comes.
    const t = cardTemplate();
    const footer = t.sections.find((s) => s.domId === 'section-legal')!;
    const block = footer.rows[0]!.columns[0]!.blocks[0]!;
    const moved = setValue(t, { kind: 'block', sectionId: footer.id, blockId: block.id }, 'section.theme', 'white');
    const after = moved.sections.find((s) => s.domId === 'section-legal')!;
    expect(after.bandColor).toBeNull();
    expect(after.textColor).toBe('#111111');
    const html = hubl(moved).html;
    expect(html).toContain('id="section-legal" style="padding:0; max-width:600px; margin:0 auto"');
    expect(html).not.toContain('#section-legal { background-color');
  });

  it('emit the footer’s phone rule in the footer’s own band colour, and only with a band', () => {
    const html = hubl(cardTemplate()).html;
    expect(html).toContain('#section-legal { background-color:#111111 !important }');
    expect(html).toContain('#section-legal .hse-column-container { padding-top:0px !important');
  });
});

describe('the divider', () => {
  const withDivider = (color: string | null, width = 100): Template => {
    const t = blankTemplate();
    const id = sequentialIds(50);
    return {
      ...t,
      sections: [
        {
          id: id(),
          theme: 'cream',
          bandColor: null,
          containerColor: '#f7f6f3',
          textColor: '#011272',
          linkColor: '#d10000',
          padTop: 0,
          padBottom: 0,
          rows: [{ id: id(), mobile: 'stack', columns: [{ id: id(), span: 12, padTop: 10, padBottom: 10, align: 'left', blocks: [{ id: 'dv', type: 'divider', height: 3, color, width, align: 'right' }] }] }],
        },
        ...t.sections,
      ],
    };
  };

  it('is a bar, not a border, so Word draws it', () => {
    const html = hubl(withDivider('navy')).html;
    // The colour pass appends its dark-mode class to the cell, which is the point of drawing the
    // rule as a background: it gets the same protection every other painted cell gets.
    expect(html).toContain('<td height="3" bgcolor="#011272" style="height:3px; line-height:3px; font-size:0; background-color:#011272; mso-line-height-rule:exactly" class="sy-bg-011272">&nbsp;</td>');
  });

  it('follows the system’s rule colour when it names none', () => {
    const html = hubl(withDivider(null)).html;
    expect(html).toContain('bgcolor="#d10000"');
  });

  it('places a narrow one with the align attribute, which Outlook honours', () => {
    const html = hubl(withDivider('navy', 40)).html;
    expect(html).toContain('<table role="presentation" width="40%" align="right"');
    // Full width has nothing to place, so it says nothing.
    expect(hubl(withDivider('navy', 100)).html).toContain('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse">');
  });

  it('sits inside the page gutter, where the stripes do not', () => {
    const html = hubl(withDivider('navy')).html;
    const at = html.indexOf('bgcolor="#011272"');
    expect(html.lastIndexOf('class="hs_padded"', at)).toBeGreaterThan(-1);
  });

  it('is counted by the palette, and carried by a rename or a replace', () => {
    const t = withDivider('navy');
    expect(colorUsage(designSystemOf(t), 'navy', t)).toContain('1 divider');
    const renamed = renameColor(t, 'navy', 'Ink');
    expect(allBlocks(renamed).find((b) => b.type === 'divider')).toMatchObject({ color: 'ink' });
    const replaced = removeColor(t, 'navy', 'red');
    expect(allBlocks(replaced).find((b) => b.type === 'divider')).toMatchObject({ color: 'red' });
  });

  it('passes the linter on its own', () => {
    expect(clean(withDivider(null))).toEqual([]);
  });
});

describe('fonts', () => {
  it('adds a stack under a safe key, and a role can name it', () => {
    const t = addFont(blankTemplate(), 'My Mono', 'Menlo, monospace');
    const ds = designSystemOf(t);
    expect(ds.fonts['mymono']).toBe('Menlo, monospace');
    const set = setValue(t, { kind: 'template' }, 'ds.type.h1.font', 'mymono');
    expect(hubl({ ...set, sections: addSection(set, 'heading', null).sections }).html).toContain('font-family:Menlo, monospace');
  });

  it('refuses to remove a stack a role names, and says which', () => {
    const t = setValue(addFont(blankTemplate(), 'Mono', 'Menlo, monospace'), { kind: 'template' }, 'ds.type.h2.font', 'mono');
    expect(fontUsage(designSystemOf(t), 'mono')).toEqual(['h2']);
    expect(removeFont(t, 'mono')).toBe(t);
    const freed = setValue(t, { kind: 'template' }, 'ds.type.h2.font', undefined);
    expect(designSystemOf(removeFont(freed, 'mono')).fonts['mono']).toBeUndefined();
  });

  it('counts the email’s own font as a use', () => {
    const t = setValue(addFont(blankTemplate(), 'Mono', 'Menlo, monospace'), { kind: 'template' }, 'ds.fontStack', 'Menlo, monospace');
    expect(fontUsage(designSystemOf(t), 'mono')).toEqual(['the email’s font']);
  });

  it('ignores a blank stack', () => {
    const t = blankTemplate();
    expect(addFont(t, 'Nothing', '   ')).toBe(t);
  });
});

describe('files', () => {
  it('a new template never saves over a file that exists', () => {
    // On a synced folder that overwrite reaches everybody before anybody notices.
    const t = { ...blankTemplate(), name: 'Standard email' };
    expect(templateFileName(t)).toBe('standard-email.template.json');
    expect(templateFileName(t, ['standard-email.template.json'])).toBe('standard-email-2.template.json');
    expect(templateFileName(t, ['standard-email.template.json', 'Standard-Email-2.template.json'])).toBe('standard-email-3.template.json');
  });

  it('a copy is a new template with the same fields', () => {
    const t = cardTemplate();
    const copy = duplicateTemplate(t, 'Card email copy');
    expect(copy.id).not.toBe(t.id);
    expect(copy.name).toBe('Card email copy');
    expect(copy.hubspotLabel).toBe('Card email copy');
    expect(copy.ds).toEqual(t.ds);
    // The team's emails are bound to the original's field names; the copy keeps them rather than
    // minting `headline_2` for the same headline.
    expect(hubspotFields(copy).map((f) => f.field)).toEqual(hubspotFields(t).map((f) => f.field));
  });
});
