// The Switchyards email design system, as Template Studio tokens, and its blocks as sections the palette can place.
//
// Source: the "Switchyards Email" design system (2026-09-18), which codifies the Basic Template Email Standards
// (9.9.26). Three colours, seven text styles, ten measurements and two radii; one column, 600px, cream ground,
// navy type, red for anything you can click. Jared: "let's create a new one based off of the switchyards email
// design system. add any of the design systems components that could be used as blocks. like the multiple footer
// or masthead options."
//
// Everything here is built from the blocks the app already has, on this system's tokens: a header is a top bar on
// the navy preset over a 6px red stripe; the Callout is a heading and a line in a column with a navy fill and 8px
// corners; the four footers are the legal block's four layouts (compile/blocks/legal.ts). So the palette's
// Switchyards group needs no block type of its own, and every piece keeps the inspector it already has.
//
// The pictures are the ones the standard email ships with, on HubSpot's own files: the navy lockup, the badge row,
// the sign-off drawing. The cream lockup for the lockup bar is not hosted anywhere yet; that block is an image the
// team picks in HubSpot, and its summary says which file. Pure.

import { DEFAULT_DESIGN_SYSTEM, bandedPreset, colorOf, firstPreset, theme as themeTokens, type DesignSystem } from './design-system.ts';
import { bodyFieldName, sequentialIds } from './ids.ts';
import { SCHEMA_VERSION } from './schema.ts';
import type { Block, Column, LegalLayout, Lock, Preview, Section, Template } from './types.ts';

export const SY_SITE = 'https://www.switchyards.com/';
/** The one social address in hand. YouTube and LinkedIn are fields in the footer's inspector, blank until someone knows them. */
export const SY_SOCIAL = { instagram: 'https://instagram.com/switchyards' } as const;

/** The pictures the standard email already ships with, on HubSpot's files. */
export const SY_ASSETS = {
  /** The arched lockup in navy, for cream: the Logo block and the letterhead footer. */
  lockupNavy: 'https://hs-50604449.f.hubspotemail.net/hub/50604449/hubfs/SYLogo_Header_Outlined.png?width=350&upscale=true&name=SYLogo_Header_Outlined.png',
  /** The badge row: Int'l Assoc. of Clubkeeps, NWCA, Scugnizzi Approved, SY. */
  seals: 'https://hs-50604449.f.hubspotemail.net/hub/50604449/hubfs/sy-logo-lockup@2x.png?width=360&upscale=true&name=sy-logo-lockup@2x.png',
  /** The sign-off drawing with the handwriting. */
  signOff: 'https://hs-50604449.f.hubspotemail.net/hub/50604449/hubfs/Seeyouaroundtheclub.png?width=560&upscale=true&name=Seeyouaroundtheclub.png',
} as const;

/** The words that never change. */
export const SY_COPY = {
  tagline: '“The World’s First Neighborhood Work Club”',
  notice: 'Please consider the environment and do not print this email. Nobody prints emails.',
  mark: '© Switchyards U.S.A.',
  signOff: '<p>See you around the club,<br>-Switchyards</p>',
} as const;

const PREVIEW: Preview = { company: 'SWITCHYARDS U.S.A.', address: '151 Ted Turner Dr NW', city: 'Atlanta', state: 'GA', zip: '30303' };

/**
 * The system as tokens. Line heights are the system's pixel pairs as percentages: 36/40, 22/26, 18/22, 18/26,
 * 12/16, 13/17. Headings carry no margin, because in this system every text sits in its own cell and the cell's
 * padding is the spacing. The two button roles are the outline (primary) and the solid (secondary); full width
 * is the block's alignment. The `callout` preset is the card's: cream container, cream type, for a column filled
 * navy. The breakpoint is the system's 620.
 */
export function switchyardsDesignSystem(): DesignSystem {
  const base = DEFAULT_DESIGN_SYSTEM;
  const sans = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  return {
    ...base,
    colors: { navy: '#011272', red: '#d20000', cream: '#f7f6f3' },
    richText: { ...base.richText, listLineHeight: 144, quoteBar: 2, quoteColor: 'red', quoteInset: 20, quoteItalic: false, ruleWidth: 2, ruleColor: 'red' },
    image: { radius: 0, borderWidth: 0, borderColor: 'navy', defaultWidth: 560 },
    buttons: {
      primary: { fill: 'cream', ink: 'red', border: 'red', radius: 25, padY: 10, padX: 20, size: 18, mobileSize: 0, borderWidth: 2 },
      secondary: { fill: 'navy', ink: 'cream', border: 'navy', radius: 25, padY: 10, padX: 20, size: 18, mobileSize: 0, borderWidth: 2 },
    },
    themes: {
      cream: { band: null, container: 'cream', text: 'navy', link: 'red', button: 'primary' },
      navy: { band: 'navy', container: null, text: 'cream', link: 'cream', button: 'secondary' },
      callout: { band: null, container: 'cream', text: 'cream', link: 'cream', button: 'secondary' },
    },
    type: {
      h1: { size: 36, lineHeight: 111, weight: 'bold', mobileSize: 30, marginBottom: 0 },
      h2: { size: 22, lineHeight: 118, weight: 'bold', mobileSize: 22, marginBottom: 0 },
      h3: { size: 18, lineHeight: 122, weight: 'bold', mobileSize: 18, marginBottom: 0 },
      h4: { size: 18, lineHeight: 122, weight: 'bold', mobileSize: 18, marginBottom: 0 },
      h5: { size: 13, lineHeight: 131, weight: 'bold', mobileSize: 13, marginBottom: 0, uppercase: true, letterSpacing: 1 },
      h6: { size: 13, lineHeight: 131, weight: 'normal', mobileSize: 13, marginBottom: 0 },
      body: { size: 18, lineHeight: 144, weight: 'normal', mobileSize: 18, marginBottom: 10 },
      topbar: { size: 12, lineHeight: 133, weight: 'bold', mobileSize: 12, marginBottom: 0, uppercase: true, letterSpacing: 0.24 },
    },
    space: { s: 10, m: 20, l: 40 },
    containerWidth: 600,
    pagePadding: 20,
    blockGap: 10,
    pageBackground: '#f7f6f3',
    pageBorderWidth: 0,
    pageBorderColor: 'navy',
    pageMargin: 0,
    fontStack: sans,
    fonts: { ...base.fonts, helvetica: sans },
    mobileBreakpoint: 620,
  };
}

// --- building sections on a system ------------------------------------------------------------------------------

/** Ids, field names and sections for one template or one placement, on the system the template has. */
class Maker {
  readonly id: () => string;
  private readonly taken = new Set<string>();
  constructor(readonly ds: DesignSystem) {
    this.id = sequentialIds();
  }
  /** An editable lock, with a field name of its own in this template. */
  open(label: string): Lock {
    const stem = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
    let field = stem;
    for (let n = 2; this.taken.has(field); n += 1) field = `${stem}_${n}`;
    this.taken.add(field);
    return { editable: true, label, field };
  }
  fixed(label: string): Lock {
    return { editable: false, label, field: '' };
  }
  /** A body's lock: HubSpot's `email_body` for the first one in a template, the label's slug after that (ids.ts). */
  body(label: string): Lock {
    return { editable: true, label, field: bodyFieldName(label, this.taken) };
  }
  /** The system's preset by name when it has one, else the nearest thing it does have. */
  preset(wanted: 'cream' | 'navy'): string {
    if (this.ds.themes[wanted]) return wanted;
    return wanted === 'navy' ? bandedPreset(this.ds) : firstPreset(this.ds);
  }
  /** The name of a palette colour, when the system has it; else the fallback. */
  color(wanted: string, fallback: string): string {
    return colorOf(this.ds, wanted) ? wanted : fallback;
  }
  column(blocks: Block[], extra: Partial<Column> = {}): Column {
    return { id: this.id(), span: 12, padTop: 10, padBottom: 10, align: 'left', ...extra, blocks };
  }
  section(preset: string, columns: Column[], extra: Partial<Section> = {}): Section {
    const t = themeTokens(this.ds, preset);
    return {
      id: this.id(),
      theme: preset,
      bandColor: t.band,
      containerColor: t.container,
      textColor: t.text,
      linkColor: t.link,
      padTop: 0,
      padBottom: 0,
      ...extra,
      rows: [{ id: this.id(), mobile: 'stack', columns }],
    };
  }
  /** One block alone in a section on a preset, with the column's padding. */
  one(preset: 'cream' | 'navy', block: Block, column: Partial<Column> = {}, extra: Partial<Section> = {}): Section {
    return this.section(this.preset(preset), [this.column([block], column)], extra);
  }
  /** The 6px red rule under a header and over a footer; the 28px band that closes the masthead and the ledger. */
  rule(height: number): Section {
    return this.section(this.preset('cream'), [this.column([{ id: this.id(), type: 'stripes', stripes: [{ color: this.color('red', this.ds.richText.ruleColor ?? 'red'), height }] }], { padTop: 0, padBottom: 0 })]);
  }
  /** A picture the team picks in HubSpot: absent from the send until they do. */
  picture(label: string, width: number, column: Partial<Column>, preset: 'cream' | 'navy' = 'cream'): Section {
    return this.one(preset, { id: this.id(), type: 'image', lock: this.open(label), mode: 'module', src: '', alt: '', href: '', width, align: 'center', optional: true }, column);
  }
  /** A picture the template carries itself. */
  fixedPicture(label: string, src: string, alt: string, href: string, width: number, column: Partial<Column>): Section {
    return this.one('cream', { id: this.id(), type: 'image', lock: this.fixed(label), mode: 'static', src, alt, href, width, align: 'center', optional: false }, column);
  }
  copy(html: string, label: string, column: Partial<Column> = {}, editable = true): Section {
    return this.one('cream', { id: this.id(), type: 'richtext', lock: editable ? this.body(label) : this.fixed(label), html, align: 'left' }, column);
  }
  heading(text: string, level: 'h1' | 'h2' | 'h3', label: string, column: Partial<Column> = {}): Section {
    return this.one('cream', { id: this.id(), type: 'heading', lock: this.open(label), text, level, align: 'left' }, column);
  }
  button(text: string, style: 'primary' | 'secondary', align: 'center' | 'full' = 'center'): Section {
    return this.one(
      'cream',
      { id: this.id(), type: 'button', lock: this.open('Button text (blank to hide)'), link: this.open('Button link'), text, href: SY_SITE, style, align },
      { padTop: 10, padBottom: 10, align: 'center' },
    );
  }

  // --- the system's blocks ---

  headerA(): Section[] {
    return [
      this.one('navy', { id: this.id(), type: 'topbar', lock: this.open('Top bar tagline'), text: SY_COPY.tagline, align: 'center' }, { padTop: 14, padBottom: 14, align: 'center' }),
      this.rule(6),
    ];
  }
  headerB(): Section[] {
    return [this.picture('Lockup, cream', 175, { padTop: 30, padBottom: 30, align: 'center' }, 'navy'), this.rule(6)];
  }
  logo(): Section[] {
    return [this.fixedPicture('Logo', SY_ASSETS.lockupNavy, 'Switchyards', SY_SITE, 175, { padTop: 40, padBottom: 40, align: 'center' })];
  }
  hero(): Section[] {
    return [this.picture('Hero graphic', 600, { padTop: 0, padBottom: 20, padLeft: 0, padRight: 0, align: 'center' })];
  }
  callout(headline: string, line: string): Section[] {
    const preset = this.ds.themes['callout'] ? 'callout' : this.preset('cream');
    const banded = themeTokens(this.ds, this.preset('navy'));
    const fill = colorOf(this.ds, 'navy') ? 'navy' : (this.ds.themes[this.preset('navy')]?.band ?? 'navy');
    const section = this.section(preset, [
      this.column(
        [
          { id: this.id(), type: 'heading', lock: this.open('Callout headline'), text: headline, level: 'h2', align: 'center' },
          { id: this.id(), type: 'richtext', lock: this.open('Callout line'), html: `<p>${line}</p>`, align: 'center' },
        ],
        { padTop: 20, padBottom: 20, align: 'center', fill, borderRadius: 8, borderPad: 40, gap: 10 },
      ),
    ]);
    // On a system without the callout preset the type still has to read on the fill: the banded preset's ink.
    if (preset !== 'callout') {
      section.textColor = banded.text;
      section.linkColor = banded.link;
    }
    return [section];
  }
  imageCaption(): Section[] {
    return [
      this.picture('Photo', 600, { padTop: 20, padBottom: 0, padLeft: 0, padRight: 0, align: 'center' }),
      this.copy('<p><small>Logan Square, June.</small></p>', 'Caption', { padTop: 6, padBottom: 20 }),
    ];
  }
  stamp(): Section[] {
    return [this.picture('Mark or seal', 240, { padTop: 20, padBottom: 20, align: 'center' })];
  }
  signOff(): Section[] {
    return [
      this.copy(SY_COPY.signOff, 'Sign-off', { padTop: 10, padBottom: 10 }, false),
      this.fixedPicture('Sign-off drawing', SY_ASSETS.signOff, 'See you around the club', '', 280, { padTop: 20, padBottom: 30, align: 'center' }),
    ];
  }
  /**
   * The letterhead's head, for a letter from a person: the red rule, then the navy lockup at 120px on cream. Its
   * foot is `footer('letterhead')`; the two are separate blocks, since a letter's body comes between them.
   */
  letterheadHeader(): Section[] {
    return [this.rule(6), this.fixedPicture('Letterhead', SY_ASSETS.lockupNavy, 'Switchyards', SY_SITE, 120, { padTop: 30, padBottom: 20, align: 'center' })];
  }
  footer(layout: Exclude<LegalLayout, 'classic'>): Section[] {
    const letter = layout === 'letterhead';
    const pad = layout === 'stub' ? 20 : 40;
    const block: Block = {
      id: this.id(),
      type: 'legal',
      layout,
      // The letterhead's lockup is its header's; the foot opens on a hairline instead.
      logoSrc: letter ? '' : SY_ASSETS.seals,
      logoWidth: letter ? 120 : 180,
      note: SY_COPY.notice,
      noteLock: this.fixed('Legal note'),
      mark: SY_COPY.mark,
      instagram: SY_SOCIAL.instagram,
    };
    const legal = this.one(letter ? 'cream' : 'navy', block, { padTop: 0, padBottom: 0, align: layout === 'ledger' ? 'left' : 'center' }, { padTop: pad, padBottom: pad, domId: 'section-legal' });
    if (letter) return [legal, this.rule(6)];
    return [this.rule(6), legal, ...(layout === 'masthead' || layout === 'ledger' ? [this.rule(28)] : [])];
  }
}

/** One of the system's blocks, as the palette offers it: what it is called, what it is for, and how to make it on a system. */
export interface SyBlock {
  id: string;
  name: string;
  summary: string;
  make(ds: DesignSystem): Section[];
}

const block = (id: string, name: string, summary: string, make: (m: Maker) => Section[]): SyBlock => ({ id, name, summary, make: (ds) => make(new Maker(ds)) });

/**
 * The Switchyards email system's blocks the palette offers, in the order they usually appear. The tagline and
 * lockup headers are not among them: they open the two starters and are not for placing mid-email. Jared,
 * 2026-09-18: "footer letterhead block is supposed to be a header and footer seperated, not one block. you can
 * get rid of header lockup, Header tagline, Details, Schedule, Secondary image, Pair."
 */
export const SY_BLOCKS: SyBlock[] = [
  block('header-letterhead', 'Header · Letterhead', 'For a letter from a person: the red rule, then the navy lockup at 120px on cream. Pairs with the letterhead footer, with the letter between them.', (m) => m.letterheadHeader()),
  block('logo', 'Logo', 'The arched lockup on cream at 175px, 40px above and below. Under the tagline header.', (m) => m.logo()),
  block('hero', 'Hero image', 'The one big graphic, edge to edge at 600px, square corners, 20px below. The team picks it in HubSpot.', (m) => m.hero()),
  block('callout', 'Callout', 'A navy card with the one line the reader should leave with, and one supporting line. One per email, never beside the button.', (m) => m.callout('3 clubs, 3 neighborhoods, Chicago.', 'Memberships drop October 22.')),
  block('image-caption', 'Image + caption', 'A photo edge to edge with a one-line caption in small type: a place and a time.', (m) => m.imageCaption()),
  block('stamp', 'Stamp', 'A small mark centred at 240px: a seal, a badge, a monogram.', (m) => m.stamp()),
  block('sign-off', 'Sign-off', '“See you around the club, -Switchyards” and the drawing. Every email closes with it.', (m) => m.signOff()),
  block('footer-a', 'Footer · Masthead', 'The default footer, centred like a dateline: seals between hairlines, name and address, the notice, then the © mark and the legal links. Closes with the red band.', (m) => m.footer('masthead')),
  block('footer-b', 'Footer · Ledger', 'Two columns: identity on the left, an index of links on the right, each on its own hairline. For a text-heavy email with links worth repeating.', (m) => m.footer('ledger')),
  block('footer-c', 'Footer · Stub', 'One row, seals left and legal right, then one typed line. For short operational sends, with the lockup header.', (m) => m.footer('stub')),
  block('footer-letterhead', 'Footer · Letterhead', 'The letterhead’s foot, on cream: a hairline, the address and the notice, a hairline, the legal links in red and the © mark, then the rule.', (m) => m.footer('letterhead')),
];

// --- the two templates ------------------------------------------------------------------------------------------

function template(name: string, ds: DesignSystem, id: () => string, sections: Section[]): Template {
  return { schema: SCHEMA_VERSION, id: id(), name, hubspotLabel: name, pageBackground: ds.pageBackground, forceLight: true, ds, preview: PREVIEW, sections };
}

/** The standard send: tagline header, logo, hero, one heading, the copy, one outline button, the sign-off, the masthead footer. */
export function switchyardsTemplate(): Template {
  const ds = switchyardsDesignSystem();
  const m = new Maker(ds);
  const sections = [
    ...m.headerA(),
    ...m.logo(),
    ...m.hero(),
    m.heading('Big news: we’re opening 2 more clubs in Chicago.', 'h1', 'Headline'),
    m.copy(
      '<p>The <a href="https://www.switchyards.com/">Logan Square</a> club we opened in June made one thing very clear: <strong>Chicago is a Switchyards town.</strong> The energy, our members, the waitlist, the way this city just <em>gets</em> what we’re building. We knew we had to keep going.</p>',
      'First paragraph',
    ),
    m.copy('<p>So we went looking for another great space. But then we found two. A pair of perfect gems, one in <strong>Lincoln Park</strong> and one in <strong>Fulton Market</strong>. We’re launching both in October.</p>', 'Second paragraph'),
    m.button('Watch the video.', 'primary'),
    ...m.signOff(),
    ...m.footer('masthead'),
  ];
  return template('Switchyards email', ds, m.id, sections);
}

/** The short send, for one fact: lockup header, hero, heading, one paragraph, the Callout, one solid button, the sign-off, the stub footer. */
export function switchyardsShortTemplate(): Template {
  const ds = switchyardsDesignSystem();
  const m = new Maker(ds);
  const sections = [
    ...m.headerB(),
    ...m.hero(),
    m.heading('Memberships drop October 22.', 'h1', 'Headline'),
    m.copy('<p>Both Chicago clubs open on <strong>October 26</strong>. Memberships go first to the waitlist, then to everyone, and they go quickly.</p>', 'Paragraph'),
    ...m.callout('3 clubs, 3 neighborhoods, Chicago.', 'Memberships drop October 22.'),
    m.button('Grab a membership.', 'secondary'),
    ...m.signOff(),
    ...m.footer('stub'),
  ];
  return template('Switchyards short', ds, m.id, sections);
}
