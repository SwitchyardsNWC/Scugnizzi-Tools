// The footer's social icons, and the ledger with its socials first (Jared, 2026-09-29).
//
// Defended: every icon the compiler can name is a file that exists in email-assets/social, so moving one fails here
// rather than blanking a sent email; icons are pictures an email client can fetch, with the network's name as alt
// text; the tone follows the band, so the cream letterhead never gets off-white icons it cannot be read on; phones
// keep icons in a row; a footer that asks for neither option is the footer it always was; the ledger can put its
// socials above the legal links; and the preview maps the published address onto a local copy without the export
// ever doing so.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { servedIconBase, withServedIcons } from '../src/app/local-assets.ts';
import { iconToneFor, isLightColour, SOCIAL_ICON_BASE, SOCIAL_ICONS, socialIconUrl, type IconTone } from '../src/model/social-icons.ts';
import { footerSections, switchyardsDesignSystem, switchyardsTemplate } from '../src/model/switchyards.ts';
import { allBlocks } from '../src/model/edit.ts';
import type { LegalBlock, LegalLayout, SocialName, Template } from '../src/model/types.ts';

const NETWORKS = Object.keys(SOCIAL_ICONS) as SocialName[];
const TONES: IconTone[] = ['offwhite', 'navy'];

/** The standard email with its footer swapped for one the test shapes. */
const withFooter = (shape: Partial<LegalBlock>): Template => {
  const t = switchyardsTemplate();
  const legal = allBlocks(t).find((b) => b.type === 'legal') as LegalBlock;
  Object.assign(legal, { linkedin: 'https://www.linkedin.com/company/switchyards', ...shape });
  return t;
};
/** The standard email with its footer replaced by one of the footer's types, on the band that type is built on. */
const withPaletteFooter = (layout: Exclude<LegalLayout, 'classic'>, shape: Partial<LegalBlock>, options: Pick<LegalBlock, 'socialsFirst'> = {}): Template => {
  const t = switchyardsTemplate();
  // The standard email ends on the masthead footer's three sections: its rule, the footer, and the closing band.
  t.sections = [...t.sections.slice(0, -3), ...footerSections(layout, switchyardsDesignSystem(), options)];
  const legal = allBlocks(t).find((b) => b.type === 'legal') as LegalBlock;
  Object.assign(legal, { linkedin: 'https://www.linkedin.com/company/switchyards', ...shape });
  return t;
};
const hubl = (t: Template) => compile(t, { mode: 'hubl', date: '2026-09-29' });
const footerOf = (html: string) => html.slice(html.indexOf('id="section-legal"'));
const iconsIn = (html: string) => [...footerOf(html).matchAll(/<img\b[^>]*email-assets\/social\/[^>]*>/g)].map((m) => m[0]);

describe('the icon files', () => {
  it('exist for every network in every tone, so a rename fails here and not in somebody’s inbox', () => {
    for (const name of NETWORKS) {
      for (const tone of TONES) {
        const url = socialIconUrl(name, tone);
        expect(url.startsWith(SOCIAL_ICON_BASE), url).toBe(true);
        const onDisk = fileURLToPath(new URL(`../../email-assets/social/${url.slice(SOCIAL_ICON_BASE.length)}`, import.meta.url));
        expect(existsSync(onDisk), onDisk).toBe(true);
      }
    }
  });

  it('are addressed absolutely over https, because an email has no page to resolve against', () => {
    expect(SOCIAL_ICON_BASE).toMatch(/^https:\/\/[^/]+\/.+\/$/);
  });
});

describe('which tone a footer gets', () => {
  it('reads the band from the footer’s text colour', () => {
    expect(isLightColour('#f7f6f3')).toBe(true);
    expect(isLightColour('#fff')).toBe(true);
    expect(isLightColour('#011272')).toBe(false);
    expect(isLightColour('#d20000')).toBe(false);
    // Light words mean a dark band, which means the off-white icons.
    expect(iconToneFor('#f7f6f3')).toBe('offwhite');
    expect(iconToneFor('#011272')).toBe('navy');
    // Anything unreadable reads as the dark band, which is where every footer but the letterhead sits.
    expect(isLightColour('navy')).toBe(false);
  });
});

describe('icons instead of names', () => {
  it('draws each set network as a linked picture with its name as the alt text', () => {
    const html = hubl(withFooter({ layout: 'ledger', socialIcons: true })).html;
    const icons = iconsIn(html);
    expect(icons.length).toBe(3);
    for (const [i, name] of NETWORKS.entries()) {
      expect(icons[i]).toContain(`alt="${name}"`);
      expect(icons[i]).toContain(`width="${SOCIAL_ICONS[name].width}"`);
      expect(icons[i]).toContain('height="20"');
    }
    // No names left as words beside them.
    expect(footerOf(html)).not.toMatch(/>Instagram</);
    expect(footerOf(html)).not.toMatch(/>YouTube</);
  });

  it('gives the dark bands off-white icons and the cream letterhead navy ones', () => {
    // Each footer as the palette builds it, on its own band — the tone is read off the band, not the layout's name.
    for (const [id, options] of [['masthead', {}], ['ledger', {}], ['ledger', { socialsFirst: true }], ['stub', {}]] as const) {
      const icons = iconsIn(hubl(withPaletteFooter(id, { socialIcons: true }, options)).html);
      expect(icons.length, id).toBeGreaterThan(0);
      for (const tag of icons) expect(tag, id).toContain('-offwhite.png');
    }
    const letter = iconsIn(hubl(withPaletteFooter('letterhead', { socialIcons: true })).html);
    expect(letter.length).toBeGreaterThan(0);
    for (const tag of letter) expect(tag).toContain('-navy.png');
  });

  it('follows the band rather than the layout, so a letterhead moved onto navy gets off-white icons', () => {
    // The standard email's footer sits on navy; renaming its layout does not repaint the band under it.
    for (const tag of iconsIn(hubl(withFooter({ layout: 'letterhead', socialIcons: true })).html)) expect(tag).toContain('-offwhite.png');
  });

  it('spaces icons with a gap phones leave alone, rather than the dot phones hide to stack names', () => {
    const foot = footerOf(hubl(withFooter({ layout: 'masthead', socialIcons: true })).html);
    const line = foot.slice(foot.indexOf('email-assets/social/instagram'), foot.indexOf('email-assets/social/linkedin'));
    expect(line).not.toContain('sy-sep');
    expect(line).toContain('&nbsp;&nbsp;&nbsp;&nbsp;');
  });

  it('passes the linter, alt text and all', () => {
    const out = hubl(withFooter({ layout: 'ledger', socialIcons: true }));
    const findings = lint({ tree: out.tree, registry: out.registry, html: out.html, bytes: out.bytes });
    expect(errorsIn(findings)).toEqual([]);
    expect(findings.filter((f) => f.rule === 'image-alt')).toEqual([]);
  });

  it('changes nothing for a footer that does not ask', () => {
    const before = hubl(withFooter({ layout: 'ledger' })).html;
    expect(iconsIn(before)).toEqual([]);
    expect(hubl(withFooter({ layout: 'ledger', socialIcons: false })).html).toBe(before);
  });
});

describe('the ledger with its socials first', () => {
  const order = (html: string) => {
    const foot = footerOf(html);
    return { socials: foot.indexOf('>Instagram<'), unsubscribe: foot.indexOf('>Unsubscribe<') };
  };

  it('puts the social row above Unsubscribe when asked, and below it otherwise', () => {
    const first = order(hubl(withFooter({ layout: 'ledger', socialsFirst: true })).html);
    expect(first.socials).toBeGreaterThan(-1);
    expect(first.socials).toBeLessThan(first.unsubscribe);
    const usual = order(hubl(withFooter({ layout: 'ledger' })).html);
    expect(usual.socials).toBeGreaterThan(usual.unsubscribe);
  });

  it('is what the ledger builds with the switch on, and it still carries every legal link', () => {
    // A card of its own until 2026-09-30, when the footers became one block with a type; now it is the ledger's
    // "Socials above the legal links" switch.
    const legal = footerSections('ledger', switchyardsDesignSystem(), { socialsFirst: true })
      .flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)))
      .find((b) => b.type === 'legal') as LegalBlock;
    expect(legal).toMatchObject({ layout: 'ledger', socialsFirst: true });
    expect(legal.socialIcons).toBeUndefined();
    const html = hubl(withFooter({ ...legal })).html;
    expect(html).toContain('{{ unsubscribe_link_all }}');
    expect(html).toContain('{{ unsubscribe_link }}');
  });

  it('is ignored by the layouts that give the socials a line of their own', () => {
    for (const layout of ['masthead', 'stub', 'letterhead'] as const) {
      expect(hubl(withFooter({ layout, socialsFirst: true })).html, layout).toBe(hubl(withFooter({ layout })).html);
    }
  });
});

describe('the preview’s copy of the icons', () => {
  const email = `<img src="${SOCIAL_ICON_BASE}instagram-offwhite.png">`;

  it('points a local canvas at this machine’s copy, from any page of the tools', () => {
    expect(servedIconBase('http://localhost:63352/template-studio/dist/index.html')).toBe('http://localhost:63352/email-assets/social/');
    expect(servedIconBase('http://localhost:63352/template-studio/dist/project.html?x=1')).toBe('http://localhost:63352/email-assets/social/');
    expect(withServedIcons(email, 'http://localhost:63352/email-assets/social/')).toBe('<img src="http://localhost:63352/email-assets/social/instagram-offwhite.png">');
  });

  it('does nothing on the published site, where the two addresses are the same', () => {
    const live = servedIconBase('https://switchyardsnwc.github.io/Scugnizzi-Tools/template-studio/dist/index.html');
    expect(live).toBe(SOCIAL_ICON_BASE);
    expect(withServedIcons(email, live)).toBe(email);
  });

  it('never reaches the export, which is compiled on its own and names the published address', () => {
    const out = hubl(withFooter({ layout: 'ledger', socialIcons: true })).html;
    expect(out).toContain(SOCIAL_ICON_BASE);
    expect(out).not.toContain('localhost');
  });
});
