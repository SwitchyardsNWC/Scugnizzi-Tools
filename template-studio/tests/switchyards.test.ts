// The Switchyards email system as tokens, blocks and two starters (model/switchyards.ts), and the footer layouts
// they rest on (compile/blocks/legal.ts).
//
// Defended: the tokens are the system's; both starters compile clean and in the system's order; every block the
// palette offers places into a blank template and compiles clean, with field names that collide with nothing;
// every footer layout carries HubSpot's company, address and both unsubscribe links, and the classic layout is
// untouched; a filled column paints its card.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { hostOf, noteHtml, socialLinks } from '../src/compile/blocks/legal.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { allBlocks, cloneSection, freshIds, hubspotFields, takenFieldNames } from '../src/model/edit.ts';
import { blankTemplate } from '../src/model/starters.ts';
import { SY_BLOCKS, SY_COPY, switchyardsDesignSystem, switchyardsShortTemplate, switchyardsTemplate } from '../src/model/switchyards.ts';
import type { LegalBlock, Template } from '../src/model/types.ts';

const hubl = (t: Template) => compile(t, { mode: 'hubl', date: '2026-09-18' });
const clean = (t: Template) => errorsIn(lint({ ...hubl(t), mode: 'hubl', template: t }));

describe('the Switchyards email system', () => {
  it('is three colours, Helvetica, 18 on 26, and a 620 breakpoint', () => {
    const ds = switchyardsDesignSystem();
    expect(ds.colors).toEqual({ navy: '#011272', red: '#d20000', cream: '#f7f6f3' });
    expect(ds.type['body']).toMatchObject({ size: 18, lineHeight: 144 });
    expect(ds.type['h1']).toMatchObject({ size: 36, mobileSize: 30 });
    expect(ds.buttons['primary']).toMatchObject({ fill: 'cream', ink: 'red', radius: 25 });
    expect(ds.buttons['secondary']).toMatchObject({ fill: 'navy', ink: 'cream' });
    expect(ds.mobileBreakpoint).toBe(620);
    expect(ds.fontStack).toContain('Helvetica Neue');
  });

  it('both starters compile clean, in the system’s order', () => {
    const standard = switchyardsTemplate();
    const short = switchyardsShortTemplate();
    expect(clean(standard)).toEqual([]);
    expect(clean(short)).toEqual([]);
    expect(allBlocks(standard).map((b) => b.type)).toEqual(['topbar', 'stripes', 'image', 'image', 'heading', 'richtext', 'richtext', 'button', 'richtext', 'image', 'stripes', 'legal', 'stripes']);
    const legal = allBlocks(standard).find((b) => b.type === 'legal') as LegalBlock;
    expect(legal.layout).toBe('masthead');
    expect((allBlocks(short).find((b) => b.type === 'legal') as LegalBlock).layout).toBe('stub');
    const html = hubl(standard).html;
    expect(html).toContain(SY_COPY.notice);
    expect(html).toContain('See you around the club,');
    expect(html).toContain('{{ unsubscribe_link_all }}');
    expect(html).toContain('{{ unsubscribe_link }}');
  });

  it('field names collide with nothing, and every editable thing is a field', () => {
    const t = switchyardsTemplate();
    const names = hubspotFields(t).filter((f) => f.editable).map((f) => f.field);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('headline');
    expect(names).toContain('hero_graphic');
  });

  it('offers these blocks and no others, the letterhead as a header and a footer', () => {
    expect(SY_BLOCKS.map((b) => b.id)).toEqual(['header-letterhead', 'logo', 'hero', 'callout', 'image-caption', 'stamp', 'sign-off', 'footer-a', 'footer-b', 'footer-c', 'footer-letterhead']);
    const ds = switchyardsDesignSystem();
    const head = SY_BLOCKS.find((b) => b.id === 'header-letterhead')!.make(ds);
    const foot = SY_BLOCKS.find((b) => b.id === 'footer-letterhead')!.make(ds);
    expect(head.flatMap((s) => s.rows[0]!.columns[0]!.blocks.map((b) => b.type))).toEqual(['stripes', 'image']);
    expect(foot.flatMap((s) => s.rows[0]!.columns[0]!.blocks.map((b) => b.type))).toEqual(['legal', 'stripes']);
    const legal = foot[0]!.rows[0]!.columns[0]!.blocks[0] as LegalBlock;
    expect(legal).toMatchObject({ layout: 'letterhead', logoSrc: '' });
  });

  it('every block the palette offers places into a blank template and compiles clean', () => {
    for (const block of SY_BLOCKS) {
      const base = blankTemplate();
      const ids = freshIds(base);
      const taken = takenFieldNames(base);
      const made = block.make(switchyardsDesignSystem()).map((s) => cloneSection(s, ids, taken));
      const t: Template = { ...base, ds: switchyardsDesignSystem(), sections: [...made, ...base.sections] };
      expect(clean(t), block.id).toEqual([]);
      const names = hubspotFields(t).filter((f) => f.editable).map((f) => f.field);
      expect(new Set(names).size, block.id).toBe(names.length);
    }
  });

  it('paints the Callout as a navy card with 8px corners and cream type', () => {
    const t = switchyardsTemplate();
    const callout = SY_BLOCKS.find((b) => b.id === 'callout')!.make(switchyardsDesignSystem());
    const html = hubl({ ...t, sections: callout }).html;
    expect(html).toContain('background-color:#011272');
    expect(html).toContain('border-radius:8px');
    expect(html).toContain('3 clubs, 3 neighborhoods, Chicago.');
    expect(html).toMatch(/color:#f7f6f3[^>]*>[^<]*3 clubs|3 clubs[\s\S]{0,400}color:#f7f6f3/);
  });
});

describe('the footer layouts', () => {
  const footerHtml = (layout: LegalBlock['layout']) => {
    const t = switchyardsTemplate();
    const legal = allBlocks(t).find((b) => b.type === 'legal') as LegalBlock;
    legal.layout = layout;
    return hubl(t).html;
  };

  it('every layout carries the company, the address and both legal links', () => {
    for (const layout of ['masthead', 'ledger', 'stub', 'letterhead', 'classic'] as const) {
      const html = footerHtml(layout);
      expect(html, layout).toContain('{{ site_settings.company_name }}');
      expect(html, layout).toContain('{{ site_settings.company_street_address_1 }}');
      expect(html, layout).toContain('{{ unsubscribe_link_all }}');
      expect(html, layout).toContain('{{ unsubscribe_link }}');
      expect(html, layout).toContain('data-unsubscribe="true"');
    }
  });

  it('draws its structure in hairlines, and names the social links that are set', () => {
    expect(footerHtml('masthead')).toContain('border-top:1px solid #f7f6f3');
    expect(footerHtml('masthead')).toContain('© Switchyards U.S.A.');
    expect(footerHtml('masthead')).toContain('>Instagram<');
    expect(footerHtml('masthead')).not.toContain('>YouTube<');
    const ledger = footerHtml('ledger');
    expect(ledger).toContain('sy-ledger');
    expect(ledger).toContain('href="https://instagram.com/switchyards"');
    // All the socials on one row of the index: two legal rows, one social row, then the mark.
    const t = switchyardsTemplate();
    const legal = allBlocks(t).find((b) => b.type === 'legal') as LegalBlock;
    Object.assign(legal, { layout: 'ledger', youtube: 'https://youtube.com/@x', linkedin: 'https://linkedin.com/company/x' });
    const html = hubl(t).html;
    expect((html.match(/padding:12px 0; border-bottom:1px solid #f7f6f3/g) ?? []).length).toBe(3);
    expect(html).toMatch(/<td[^>]*>(?:(?!<\/td>).)*Instagram(?:(?!<\/td>).)*YouTube(?:(?!<\/td>).)*LinkedIn(?:(?!<\/td>).)*<\/td>/);
    expect(footerHtml('stub')).toContain('&nbsp;&middot;&nbsp;');
    expect(footerHtml('letterhead')).toContain('>Instagram<');
    expect(hostOf('https://www.switchyards.com/')).toBe('switchyards.com');
    expect(socialLinks({ instagram: ' https://instagram.com/x ', youtube: '', linkedin: 'https://linkedin.com/company/x' }).map((l) => l.name)).toEqual(['Instagram', 'LinkedIn']);
  });

  it('takes the note as HTML when it is written as HTML, and as friendly text otherwise', () => {
    expect(noteHtml('Nobody prints emails.', '#d20000')).toBe('Nobody prints emails.');
    expect(noteHtml('Line one\nline two', '#d20000')).toBe('Line one<br>line two');
    expect(noteHtml('<a href="https://x.test">Read this</a> and <em>that</em>', '#d20000')).toBe('<a href="https://x.test">Read this</a> and <em>that</em>');
    const t = switchyardsTemplate();
    const legal = allBlocks(t).find((b) => b.type === 'legal') as LegalBlock;
    legal.note = 'Please consider the environment. <a href="https://www.switchyards.com/">Read why.</a>';
    expect(hubl(t).html).toContain('<a href="https://www.switchyards.com/">Read why.</a>');
  });

  it('runs the band to the window edge when a section asks, and keeps it at the email’s width otherwise', () => {
    const t = switchyardsTemplate();
    const legalSection = t.sections.find((s) => s.rows[0]!.columns[0]!.blocks[0]!.type === 'legal')!;
    const before = hubl(t).html;
    legalSection.bleed = true;
    const after = hubl(t).html;
    // The outer band loses its width; the column inside keeps its 600.
    const tagOf = (html: string) => /<div[^>]*id="section-legal"[^>]*>/.exec(html)?.[0] ?? '';
    expect(tagOf(before)).toContain('max-width:600px');
    expect(tagOf(after)).not.toContain('max-width:600px');
    expect(after).toContain('max-width:600px');
    expect(after).toContain('width="100%" style="width:100%" bgcolor="#011272"');
    // The top bar and the stripes take the same switch and stay whole.
    t.sections[0]!.bleed = true;
    t.sections[1]!.bleed = true;
    const bled = hubl(t).html;
    expect(bled.split('hse-section').length).toBe(before.split('hse-section').length);
    expect((bled.match(/width="100%" style="width:100%"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('stacks on a phone: the colophon row drops, the links grow a tap pad, the ledger divider turns', () => {
    const html = footerHtml('ledger');
    expect(html).toContain('.sy-stack { display:block !important');
    expect(html).toContain('.sy-tap { display:inline-block !important; padding:12px 0 !important }');
    expect(html).toContain('.sy-ledger { border-left:0 !important');
    expect(html).toContain('.sy-tap + .sy-sep + .sy-tap { display:block !important }');
  });

  it('leaves the classic footer as it was: no mark, no hairlines, the old links', () => {
    const html = footerHtml('classic');
    expect(html).not.toContain('sy-stack');
    expect(html).not.toContain('© Switchyards U.S.A.');
    expect(html).toContain('Manage Preferences');
  });
});
