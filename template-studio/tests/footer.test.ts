// One footer, five types (model/footer.ts).
//
// Jared, 2026-09-30: "the blocks panel is looking bad. trim the fat. make just one footer block, you drop than choose
// the type. kill the stamp block."
//
// Defended: the palette offers one footer, which lands as the masthead; choosing a type rebuilds the footer's band
// and the rules that are its own, and nothing else — not the header's rule, not the email above it; what somebody
// set on the old footer comes along, and the old type's defaults do not; the note keeps its HubSpot field; every
// type compiles clean; and a round trip comes back to the shape it left.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { allBlocks } from '../src/model/edit.ts';
import { FOOTER_TYPES, footerExtent, setFooterType } from '../src/model/footer.ts';
import { blankTemplate } from '../src/model/starters.ts';
import { SY_BLOCKS, SY_COPY, switchyardsTemplate } from '../src/model/switchyards.ts';
import type { LegalBlock, LegalLayout, Section, Template } from '../src/model/types.ts';

const legalOf = (t: Template) => allBlocks(t).find((b) => b.type === 'legal') as LegalBlock;
const onlyBlock = (s: Section) => s.rows[0]!.columns[0]!.blocks[0]!;
/** The footer's run of sections, as what each one holds: `stripes:6`, `legal:masthead`. */
const shapeOf = (t: Template) => {
  const legal = legalOf(t);
  const at = t.sections.findIndex((s) => s.rows.some((r) => r.columns.some((c) => c.blocks.some((b) => b.id === legal.id))));
  const { from, to } = footerExtent(t, t.sections[at]!.id)!;
  return t.sections.slice(from, to + 1).map((s) => {
    const b = onlyBlock(s);
    return b.type === 'stripes' ? `stripes:${b.stripes.map((x) => x.height).join('+')}` : b.type === 'legal' ? `legal:${b.layout ?? 'classic'}` : b.type;
  });
};
const to = (t: Template, type: LegalLayout) => setFooterType(t, legalOf(t).id, type).template;
const errors = (t: Template) => {
  const out = compile(t, { mode: 'hubl', date: '2026-09-30' });
  return errorsIn(lint({ ...out, mode: 'hubl', template: t }));
};

describe('the one footer', () => {
  it('is the only footer the palette offers, and it lands as the masthead', () => {
    const footers = SY_BLOCKS.filter((b) => b.make(switchyardsTemplate().ds!).some((s) => onlyBlock(s).type === 'legal'));
    expect(footers.map((b) => b.name)).toEqual(['Footer']);
    const legal = footers[0]!.make(switchyardsTemplate().ds!).map(onlyBlock).find((b) => b.type === 'legal') as LegalBlock;
    expect(legal.layout).toBe('masthead');
    expect(SY_BLOCKS.some((b) => b.id === 'stamp')).toBe(false);
  });

  it('offers five types, the masthead first', () => {
    expect(FOOTER_TYPES.map((t) => t.id)).toEqual(['masthead', 'ledger', 'stub', 'letterhead', 'classic']);
  });
});

describe('choosing a footer’s type', () => {
  it('rebuilds the band and its own rules, for every type', () => {
    const t = switchyardsTemplate();
    expect(shapeOf(t)).toEqual(['stripes:6', 'legal:masthead', 'stripes:28']);
    expect(shapeOf(to(t, 'ledger'))).toEqual(['stripes:6', 'legal:ledger', 'stripes:28']);
    expect(shapeOf(to(t, 'stub'))).toEqual(['stripes:6', 'legal:stub']);
    expect(shapeOf(to(t, 'letterhead'))).toEqual(['legal:letterhead', 'stripes:6']);
    expect(shapeOf(to(t, 'classic'))).toEqual(['legal:classic']);
  });

  it('touches nothing above the footer, the header’s own rule included', () => {
    const t = switchyardsTemplate();
    const before = t.sections.length - 3;
    for (const type of ['ledger', 'stub', 'letterhead', 'classic'] as const) {
      const next = to(t, type);
      expect(next.sections.slice(0, before), type).toEqual(t.sections.slice(0, before));
    }
  });

  it('adds the rules a Switchyards type owns to a footer that had none', () => {
    const t = blankTemplate();
    expect(shapeOf(t)).toEqual(['legal:classic']);
    expect(shapeOf(to(t, 'masthead'))).toEqual(['stripes:6', 'legal:masthead', 'stripes:28']);
  });

  it('comes back to the shape it left', () => {
    const t = switchyardsTemplate();
    const round = to(to(to(t, 'letterhead'), 'classic'), 'masthead');
    expect(shapeOf(round)).toEqual(shapeOf(t));
    const { id: _a, noteLock: _b, ...was } = legalOf(t);
    const { id: _c, noteLock: _d, ...now } = legalOf(round);
    expect(now).toEqual(was);
  });

  it('starts from the new type’s own words and picture', () => {
    const ledger = legalOf(to(switchyardsTemplate(), 'ledger'));
    expect(ledger.note).toBe(SY_COPY.ledgerNote);
    const letter = legalOf(to(switchyardsTemplate(), 'letterhead'));
    expect(letter.logoSrc).toBe('');
    expect(letter.logoWidth).toBe(120);
    const classic = legalOf(to(switchyardsTemplate(), 'classic'));
    expect(classic.note).toBe('');
    expect(classic.mark).toBeUndefined();
  });

  it('carries what somebody set on the old one', () => {
    const t = switchyardsTemplate();
    Object.assign(legalOf(t), {
      note: 'Our own words.',
      instagram: 'https://instagram.com/elsewhere',
      linkedin: 'https://www.linkedin.com/company/switchyards',
      socialIcons: true,
      hidePreferences: true,
    });
    for (const type of ['ledger', 'stub', 'letterhead', 'classic'] as const) {
      const legal = legalOf(to(t, type));
      // Absent is classic, which is what every footer from before layouts existed says.
      expect(legal.layout ?? 'classic', type).toBe(type);
      expect(legal, type).toMatchObject({
        note: 'Our own words.',
        instagram: 'https://instagram.com/elsewhere',
        linkedin: 'https://www.linkedin.com/company/switchyards',
        socialIcons: true,
        hidePreferences: true,
      });
    }
  });

  it('keeps the note’s HubSpot field, so an email bound to it stays bound', () => {
    const t = switchyardsTemplate();
    legalOf(t).noteLock = { editable: true, label: 'Legal note', field: 'legal_note' };
    const next = to(t, 'ledger');
    expect(legalOf(next).noteLock).toEqual({ editable: true, label: 'Legal note', field: 'legal_note' });
  });

  it('keeps a band somebody narrowed narrow, and leaves the rules running to the edge', () => {
    const t = switchyardsTemplate();
    const band = t.sections.find((s) => onlyBlock(s).type === 'legal')!;
    delete band.bleed;
    const next = to(t, 'ledger');
    const sections = next.sections.slice(-3);
    expect(sections.map((s) => Boolean(s.bleed))).toEqual([true, false, true]);
    // And the next change still finds the rules.
    expect(shapeOf(to(next, 'stub'))).toEqual(['stripes:6', 'legal:stub']);
  });

  it('returns the new footer’s block and section, and nothing when there is nothing to do', () => {
    const t = switchyardsTemplate();
    const legal = legalOf(t);
    const done = setFooterType(t, legal.id, 'ledger');
    expect(legalOf(done.template).id).toBe(done.blockId);
    expect(done.template.sections.some((s) => s.id === done.sectionId && onlyBlock(s).id === done.blockId)).toBe(true);
    expect(setFooterType(t, legal.id, 'masthead').template).toBe(t);
    expect(setFooterType(t, 'nope', 'ledger').template).toBe(t);
  });

  it('compiles clean as every type', () => {
    for (const type of FOOTER_TYPES.map((f) => f.id)) {
      expect(errors(to(switchyardsTemplate(), type)), type).toEqual([]);
      expect(errors(to(blankTemplate(), type)), type).toEqual([]);
    }
  });
});
