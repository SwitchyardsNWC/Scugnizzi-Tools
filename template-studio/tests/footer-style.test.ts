// Design control over the footers (model/footer-style.ts).
//
// Jared, 2026-11-11: "I want more design control over footers." Design › Footer sets the look for every footer on
// a system, a footer can depart from any of it, and its arrangement — alignment, the parts it shows, where the
// socials sit — is its own. Links are underlined by default, at his choice.
//
// Defended: the defaults draw the footer as it was, links aside; every token reaches all four Switchyards types; a
// footer's own value beats the system's; the classic footer ignores all of it; the parts HubSpot needs can never be
// hidden; a centred masthead stays centred on a phone; the stub's typed line breaks between its parts; a change of
// type keeps the arrangement; a system file carries the tokens; every option compiles clean.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { CATALOG } from '../src/model/catalog.ts';
import { allBlocks } from '../src/model/edit.ts';
import { setFooterType } from '../src/model/footer.ts';
import { DEFAULT_FOOTER_STYLE, footerStyleOf, systemFooterStyle } from '../src/model/footer-style.ts';
import { importDesignSystem } from '../src/model/import-system.ts';
import { serializeDesignSystem } from '../src/model/serialize.ts';
import { SY_ASSETS, SY_COPY, SY_SOCIAL, switchyardsTemplate } from '../src/model/switchyards.ts';
import type { FooterStyle } from '../src/model/footer-style.ts';
import type { LegalBlock, LegalLayout, Template } from '../src/model/types.ts';

const SYSTEM_TYPES = ['masthead', 'ledger', 'stub', 'letterhead'] as const;
const legalOf = (t: Template) => allBlocks(t).find((b) => b.type === 'legal') as LegalBlock;

/** The standard email, its footer turned to `type`, with these on the block and these in Design › Footer. */
function made(type: LegalLayout, block: Partial<LegalBlock> = {}, system?: Partial<FooterStyle>): Template {
  let t = switchyardsTemplate();
  if (type !== 'masthead') t = setFooterType(t, legalOf(t).id, type).template;
  Object.assign(legalOf(t), block);
  return system ? { ...t, ds: { ...t.ds!, footer: system } } : t;
}
const html = (t: Template) => compile(t, { mode: 'preview', date: '2026-11-11' }).html;
/** The footer's band and what follows it. */
const footer = (t: Template) => {
  const out = html(t);
  return out.slice(out.indexOf('id="section-legal"'));
};
const errors = (t: Template) => {
  const out = compile(t, { mode: 'hubl', date: '2026-11-11' });
  return errorsIn(lint({ ...out, mode: 'hubl', template: t }));
};
const unsubscribeTag = (f: string) => /<a [^>]*>Unsubscribe<\/a>/.exec(f)?.[0] ?? '';

describe('the defaults', () => {
  it('are the literals the renderer used to carry, with links underlined', () => {
    expect(systemFooterStyle(switchyardsTemplate().ds!)).toEqual(DEFAULT_FOOTER_STYLE);
    for (const type of SYSTEM_TYPES) {
      const f = footer(made(type));
      expect(f, type).toContain('font-size:13px; line-height:17px');
      expect(unsubscribeTag(f), type).toContain('text-decoration:underline');
    }
    expect(footer(made('masthead'))).toContain('border-top:1px solid #f7f6f3');
  });

  it('can be turned back to plain links', () => {
    expect(unsubscribeTag(footer(made('masthead', {}, { linkUnderline: false })))).toContain('text-decoration:none');
  });
});

describe('Design › Footer', () => {
  it('reaches every Switchyards type', () => {
    for (const type of SYSTEM_TYPES) {
      const f = footer(made(type, {}, { smallSize: 15, hairlineColor: 'red', hairlineWidth: 2, linkColor: 'red' }));
      expect(f, type).toContain('font-size:15px; line-height:20px');
      expect(f, type).toContain('2px solid #d20000');
      expect(unsubscribeTag(f), type).toContain('color:#d20000');
    }
  });

  it('takes the hairlines out, and the ledger’s phone divider with them', () => {
    for (const type of SYSTEM_TYPES) {
      const t = made(type, {}, { hairlines: false });
      expect(footer(t), type).not.toMatch(/border-(top|bottom|left):1px solid/);
    }
    expect(html(made('ledger', {}, { hairlines: false }))).toContain('.sy-ledger { border-left:0 !important; border-top:0 !important');
  });

  it('sizes the name, the mark and the icons', () => {
    const f = footer(made('masthead', { socialIcons: true }, { nameSize: 26, markSize: 11, markCaps: false, markTracking: 0, iconSize: 30 }));
    expect(f).toContain('font-size:26px');
    expect(f).toContain('font-size:11px; line-height:14px; font-weight:bold');
    expect(f).toContain('letter-spacing:0px; white-space:nowrap');
    expect(f).not.toContain('text-transform:uppercase');
    expect(f).toMatch(/width="30" height="30"/);
    // YouTube's artwork is wider than tall and keeps its proportions: 23 at 20, so 35 at 30.
    expect(f).toMatch(/width="35" height="30"/);
  });

  it('scales the gaps between parts with the density', () => {
    expect(footer(made('masthead'))).toContain('padding:14px 0; border-top');
    expect(footer(made('masthead', {}, { density: 'tight' }))).toContain('padding:8px 0; border-top');
    expect(footer(made('masthead', {}, { density: 'airy' }))).toContain('padding:21px 0; border-top');
  });

  it('gives way to a footer’s own value, key by key', () => {
    const ds = { ...switchyardsTemplate().ds!, footer: { smallSize: 15, density: 'airy' as const } };
    expect(footerStyleOf(ds, { style: { smallSize: 11 } })).toMatchObject({ smallSize: 11, density: 'airy' });
    expect(footerStyleOf(ds, { style: { smallSize: undefined } }).smallSize).toBe(15);
    const f = footer(made('ledger', { style: { smallSize: 11 } }, { smallSize: 15 }));
    expect(f).toContain('font-size:11px; line-height:14px');
    expect(f).not.toContain('font-size:15px');
  });

  it('survives a hand-edited file', () => {
    const ds = { ...switchyardsTemplate().ds!, footer: { smallSize: 'big', density: 'huge', hairlineWidth: 99, nameSize: -4 } as unknown as Partial<FooterStyle> };
    expect(systemFooterStyle(ds)).toMatchObject({ smallSize: 13, density: 'regular', hairlineWidth: 4, nameSize: 10 });
  });

  it('leaves the classic footer exactly as it was', () => {
    const plain = footer(made('classic'));
    expect(footer(made('classic', {}, { smallSize: 18, hairlines: false, linkUnderline: false, density: 'airy' }))).toBe(plain);
    expect(footer(made('classic', { style: { smallSize: 18 }, align: 'left', socialsAt: 'above' }))).toBe(plain);
  });

  it('travels in a system file', () => {
    const ds = { ...switchyardsTemplate().ds!, footer: { smallSize: 14, hairlines: false } };
    const back = importDesignSystem(serializeDesignSystem(ds)).ds;
    expect(back.footer).toEqual({ smallSize: 14, hairlines: false });
  });
});

describe('arrangement', () => {
  it('sets the masthead and the letterhead left, centre or right', () => {
    expect(footer(made('masthead'))).toContain('text-align:center; padding:20px 0 0');
    expect(footer(made('masthead', { align: 'left' }))).toContain('text-align:left; padding:20px 0 0');
    expect(footer(made('letterhead', { align: 'right' }))).toMatch(/align="right" style="[^"]*text-align:right; padding:20px 0 0/);
  });

  it('keeps a centred masthead’s colophon centred on a phone', () => {
    const out = html(made('masthead'));
    expect(out).toContain('td.sy-al-center { text-align:center !important }');
    expect(footer(made('masthead'))).toContain('class="sy-stack sy-al-center"');
    expect(footer(made('masthead', { align: 'left' }))).not.toContain('sy-al-');
  });

  it('leaves out the parts it is told to, and keeps what they held', () => {
    for (const type of SYSTEM_TYPES) {
      const f = footer(made(type, { hide: ['logo', 'note', 'socials', 'mark'] }));
      expect(f, type).not.toContain(SY_ASSETS.seals);
      expect(f, type).not.toContain(SY_COPY.notice);
      expect(f, type).not.toContain(SY_COPY.ledgerNote);
      expect(f, type).not.toContain(SY_SOCIAL.instagram);
      expect(f, type).not.toContain('DETTAGLI');
      expect(f, type).not.toMatch(/Dettagli/i);
    }
    const t = made('masthead', { hide: ['note'] });
    expect(legalOf(t).note).toBe(SY_COPY.notice);
  });

  it('never hides what HubSpot needs: the name, the address and Unsubscribe', () => {
    for (const type of [...SYSTEM_TYPES, 'classic'] as const) {
      const t = made(type, { hide: ['logo', 'note', 'socials', 'mark'] });
      const out = compile(t, { mode: 'hubl', date: '2026-11-11' }).html;
      for (const token of ['site_settings.company_name', 'site_settings.company_street_address_1', 'site_settings.company_city', 'unsubscribe_link_all']) {
        expect(out, `${type} ${token}`).toContain(token);
      }
    }
  });

  it('drops a hidden note’s HubSpot field rather than declaring one nobody sees', () => {
    const open = { editable: true, label: 'Legal note', field: 'legal_note' };
    expect(compile(made('masthead', { noteLock: open }), { mode: 'hubl', date: '2026-11-11' }).html).toContain('legal_note');
    expect(compile(made('masthead', { noteLock: open, hide: ['note'] }), { mode: 'hubl', date: '2026-11-11' }).html).not.toContain('legal_note');
  });

  it('gives the classic footer its logo and note switches', () => {
    const logo = 'https://example.com/logo.png';
    expect(footer(made('classic', { logoSrc: logo }))).toContain(logo);
    expect(footer(made('classic', { logoSrc: logo, hide: ['logo'] }))).not.toContain(logo);
    expect(footer(made('classic', { note: 'Words of our own.', hide: ['note'] }))).not.toContain('Words of our own.');
  });

  it('puts the socials above or below the legal links, on every type', () => {
    const order = (t: Template) => {
      const f = footer(t);
      return f.indexOf(SY_SOCIAL.instagram) < f.indexOf('>Unsubscribe<') ? 'above' : 'below';
    };
    // Where each type puts them when nobody says.
    expect(order(made('masthead'))).toBe('above');
    expect(order(made('ledger'))).toBe('below');
    expect(order(made('ledger', { socialsFirst: true }))).toBe('above');
    expect(order(made('stub'))).toBe('below');
    expect(order(made('letterhead'))).toBe('below');
    for (const type of SYSTEM_TYPES) {
      expect(order(made(type, { socialsAt: 'above' })), type).toBe('above');
      expect(order(made(type, { socialsAt: 'below' })), type).toBe('below');
    }
    expect(order(made('ledger', { socialsFirst: true, socialsAt: 'below' }))).toBe('below');
  });

  it('breaks the stub’s typed line between its parts, never inside one', () => {
    const f = footer(made('stub'));
    expect(f).toMatch(/<span style="white-space:nowrap">SWITCHYARDS U\.S\.A\.<\/span>/);
    expect(f).toMatch(/<span style="white-space:nowrap">151 Ted Turner Dr NW<\/span>, <span style="white-space:nowrap">Atlanta, GA&nbsp;30303<\/span>/);
    expect(f).toMatch(/text-transform:uppercase; white-space:nowrap">&quot;Dettagli E Pulizia&quot;/);
  });

  it('comes along when the type changes', () => {
    const arranged = { align: 'left' as const, hide: ['mark' as const], socialsAt: 'below' as const, style: { smallSize: 14 } };
    const t = made('masthead', arranged);
    for (const type of ['ledger', 'stub', 'letterhead', 'classic'] as const) {
      expect(legalOf(setFooterType(t, legalOf(t).id, type).template), type).toMatchObject(arranged);
    }
  });
});

describe('the inspector', () => {
  const groups = CATALOG.legal.groups;
  const shown = (block: LegalBlock) => groups.filter((g) => !g.show || g.show(block)).flatMap((g) => g.controls.filter((c) => !c.show || c.show(block)).map((c) => c.path));

  it('offers the classic footer only what it draws', () => {
    const classic = shown(legalOf(made('classic')));
    for (const path of ['block.mark', 'block.instagram', 'block.socialIcons', 'block.socialsAt', 'block.align', 'block.style']) expect(classic, path).not.toContain(path);
    expect(classic).toContain('column.align');
    expect(classic).toContain('block.hide');
  });

  it('offers alignment where it does something, and the column’s nowhere it does nothing', () => {
    for (const type of SYSTEM_TYPES) {
      const paths = shown(legalOf(made(type)));
      expect(paths, type).not.toContain('column.align');
      expect(paths.includes('block.align'), type).toBe(type === 'masthead' || type === 'letterhead');
      expect(paths, type).toContain('block.style');
    }
  });
});

describe('every option', () => {
  it('compiles clean, on every type', () => {
    const busy: Partial<LegalBlock> = { align: 'right', hide: ['logo', 'mark'], socialsAt: 'above', socialIcons: true, style: { density: 'tight', linkUnderline: false } };
    for (const type of [...SYSTEM_TYPES, 'classic'] as const) {
      expect(errors(made(type, busy, { smallSize: 15, hairlines: false, linkColor: 'red', density: 'airy' })), type).toEqual([]);
    }
  });
});

describe('editing', () => {
  it('sets a footer’s first own value and the system’s first footer token, though neither group exists yet', async () => {
    const { setValue } = await import('../src/model/edit.ts');
    const t = switchyardsTemplate();
    const legal = legalOf(t);
    const at = t.sections.find((s) => s.rows.some((r) => r.columns.some((c) => c.blocks.includes(legal))))!;
    const selection = { kind: 'block' as const, sectionId: at.id, blockId: legal.id };
    expect(legal.style).toBeUndefined();
    expect(t.ds!.footer).toBeUndefined();
    const own = setValue(t, selection, 'block.style.density', 'airy');
    expect(legalOf(own).style).toEqual({ density: 'airy' });
    const sys = setValue(t, selection, 'ds.footer.hairlines', false);
    expect(sys.ds!.footer).toEqual({ hairlines: false });
  });
});
