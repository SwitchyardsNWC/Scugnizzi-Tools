// What a new template starts as.
//
// The app used to open on the standard email and stop there: the only way to a template of your
// own was to delete every block of somebody else's. That is not "a designer builds a new template
// in under an hour" (brief.md), it is a designer un-building one first.
//
// Two starters live here, built from the model so they type-check against it — a fixture typed out
// as JSON is right on the day it is written and silently wrong from the first model change after
// (the reasoning behind `tools/make-baseline.ts`). The third starter, the standard email, is the
// v1 import and lives with the app, because the fixture it reads is a JSON file the model does not
// load itself.

import { createSection } from './catalog.ts';
import { DEFAULT_DESIGN_SYSTEM, theme as themeTokens, type DesignSystem } from './design-system.ts';
import { bodyFieldName, sequentialIds } from './ids.ts';
import { SCHEMA_VERSION } from './schema.ts';
import type { Block, Column, Lock, Preview, Section, Template } from './types.ts';

/** The sample values every starter previews the CAN-SPAM footer with. */
const PREVIEW: Preview = { company: 'SWITCHYARDS U.S.A.', address: '151 Ted Turner Dr SE', city: 'Atlanta', state: 'GA', zip: '30303' };

/**
 * Just the legal footer.
 *
 * "Blank" and honest: HubSpot will not publish a template without the unsubscribe block
 * (learnings 1.8), so a page with nothing on it is a page that cannot ship, and the one block a
 * template cannot be without is the one worth starting with. Everything else is a drag away.
 */
export function blankTemplate(): Template {
  const id = sequentialIds();
  const taken = new Set<string>();
  return {
    schema: SCHEMA_VERSION,
    id: id(),
    name: 'Untitled',
    hubspotLabel: 'Untitled',
    pageBackground: DEFAULT_DESIGN_SYSTEM.pageBackground,
    forceLight: true,
    preview: PREVIEW,
    sections: [createSection('legal', { id, taken }, DEFAULT_DESIGN_SYSTEM)],
  };
}

// --- the card email ----------------------------------------------------------------------------------
//
// The look of the Phase 0 probe (`probe/hubspot-probe.html`), which Jared asked to be able to build:
// a white page, a monospace face, and copy set inside black-bordered cards. It is here as a
// starter rather than as a template file for two reasons — a starter cannot go stale against the
// model, and the point of it is the *design system* as much as the blocks. Everything about the
// look is a token: the face is a stack the system names, the cards are column boxes in the palette's
// ink, and the rule between sections is the divider block on the system's rule colour.

/** A design system for the card look. Every value is a departure from the shipped one on purpose. */
export function cardDesignSystem(): DesignSystem {
  const base = DEFAULT_DESIGN_SYSTEM;
  const mono = 'Menlo, Consolas, Courier New, monospace';
  return {
    ...base,
    colors: {
      ink: '#111111',
      grey: '#555555',
      white: '#ffffff',
      rule: '#cccccc',
    },
    richText: { ...base.richText, listLineHeight: 150, quoteBar: 2, quoteColor: 'ink', quoteInset: 12, quoteItalic: false, ruleWidth: 1, ruleColor: 'rule' },
    image: { radius: 0, borderWidth: 2, borderColor: 'ink', defaultWidth: 560 },
    buttons: {
      primary: { fill: 'ink', ink: 'white', border: 'ink', radius: 0, padY: 10, padX: 16, size: 13, mobileSize: 0, borderWidth: 2 },
      secondary: { fill: 'white', ink: 'ink', border: 'ink', radius: 0, padY: 10, padX: 16, size: 13, mobileSize: 0, borderWidth: 2 },
    },
    themes: {
      white: { band: null, container: 'white', text: 'ink', link: 'ink', button: 'primary' },
      ink: { band: 'ink', container: null, text: 'white', link: 'white', button: 'secondary' },
    },
    type: {
      h1: { size: 17, lineHeight: 130, weight: 'bold', mobileSize: 17, marginBottom: 6 },
      h2: { size: 14, lineHeight: 130, weight: 'bold', mobileSize: 14, marginBottom: 8 },
      h3: { size: 13, lineHeight: 140, weight: 'bold', mobileSize: 13, marginBottom: 6 },
      h4: { size: 12, lineHeight: 140, weight: 'bold', mobileSize: 12, marginBottom: 6, uppercase: true, letterSpacing: 0.5 },
      h5: { size: 12, lineHeight: 140, weight: 'bold', mobileSize: 12, marginBottom: 6, uppercase: true, letterSpacing: 0.5 },
      h6: { size: 11, lineHeight: 140, weight: 'bold', mobileSize: 11, marginBottom: 6, uppercase: true, letterSpacing: 0.5 },
      body: { size: 13, lineHeight: 170, weight: 'normal', mobileSize: 13, marginBottom: 8 },
      topbar: { size: 11, lineHeight: 110, weight: 'bold', mobileSize: 10, marginBottom: 0, uppercase: true, letterSpacing: 1 },
    },
    pageBackground: '#ffffff',
    pageBorderColor: 'ink',
    fontStack: mono,
    fonts: { ...base.fonts, mono },
  };
}

export function cardTemplate(): Template {
  const ds = cardDesignSystem();
  const id = sequentialIds();
  const taken = new Set<string>();
  const field = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const open = (label: string): Lock => {
    const name = field(label);
    taken.add(name);
    return { editable: true, label, field: name };
  };
  /** The first body is HubSpot's `email_body` (ids.ts). */
  const body = (label: string): Lock => ({ editable: true, label, field: bodyFieldName(label, taken) });
  const fixed = (label: string): Lock => ({ editable: false, label, field: '' });

  const on = (preset: string, columns: Column[], extra: Partial<Section> = {}): Section => {
    const t = themeTokens(ds, preset);
    return {
      id: id(),
      theme: preset,
      bandColor: t.band,
      containerColor: t.container,
      textColor: t.text,
      linkColor: t.link,
      padTop: 0,
      padBottom: 0,
      ...extra,
      rows: [{ id: id(), mobile: 'stack', columns }],
    };
  };
  const column = (blocks: Block[], extra: Partial<Column> = {}): Column => ({
    id: id(),
    span: 12,
    padTop: 8,
    padBottom: 8,
    align: 'left',
    ...extra,
    blocks,
  });
  /** The card: a 2px box in the palette's ink, with the probe's 12px inset. */
  const card = (blocks: Block[]): Column => column(blocks, { borderWidth: 2, borderColor: 'ink', borderRadius: 0, borderPad: 12 });

  const heading = (text: string, level: 'h1' | 'h2', lock: Lock): Block => ({ id: id(), type: 'heading', lock, text, level, align: 'left' });
  const copy = (html: string, lock: Lock): Block => ({ id: id(), type: 'richtext', lock, html, align: 'left' });

  const sections: Section[] = [
    on('white', [column([heading('A card email', 'h1', open('Headline'))], { padTop: 24, padBottom: 0 })]),
    on('white', [
      column(
        [
          copy(
            '<p>Short copy under the headline. Everything below sits in a card: a box drawn in the palette’s ink, twelve pixels in from the words. The face is monospace, which is a stack the design system names — change it once in Design › Type and every card follows.</p>',
            body('Intro'),
          ),
        ],
        { padTop: 0, padBottom: 4 },
      ),
    ]),
    on('white', [card([copy('<h2>First card</h2><p>A card is a Text block with a border in its Appearance panel. Two blocks in one column share one box, which is how a card gets a button.</p>', open('First card'))])]),
    on('white', [
      card([
        copy('<h2>Second card</h2><p>This one has a button under the copy, inside the same box.</p>', open('Second card')),
        { id: id(), type: 'button', lock: open('Second card button (blank to hide)'), link: open('Second card link'), text: 'Read more', href: 'https://www.switchyards.com/', style: 'primary', align: 'left' },
      ]),
    ]),
    on('white', [card([copy('<h2>Third card</h2><p>Locked, so the template renders it and re-uploading fixes every future send (learnings 1.7).</p><ul><li>Lists keep the same face.</li><li>So do <a href="https://www.switchyards.com/">links</a>.</li></ul>', fixed('Third card'))])]),
    on('white', [column([{ id: id(), type: 'divider', height: 1, color: null, width: 100, align: 'center' }], { padTop: 12, padBottom: 4 })]),
    on('white', [
      column([copy('<p><small>A divider above, on the system’s rule colour. Small print here, and the footer on the dark preset below.</small></p>', fixed('Small print'))], {
        padTop: 0,
        padBottom: 16,
      }),
    ]),
    on(
      'ink',
      [column([{ id: id(), type: 'legal', logoSrc: '', logoWidth: 180, note: '', noteLock: fixed('Legal note') }], { padTop: 0, padBottom: 0, align: 'left' })],
      { padTop: 24, padBottom: 10, domId: 'section-legal' },
    ),
  ];

  return {
    schema: SCHEMA_VERSION,
    id: id(),
    name: 'Card email',
    hubspotLabel: 'Card email',
    pageBackground: '#ffffff',
    forceLight: true,
    ds,
    preview: PREVIEW,
    sections,
  };
}
