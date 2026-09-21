// One snapshot per block type, in every theme (acceptance.md §1).
//
// These are not here to be read — they are here so that a change to a shared primitive shows up as
// a diff in every block it touches, rather than in whichever one someone happened to look at. The
// interesting assertions are the explicit ones underneath; the snapshots catch everything else.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import type { Align, Block, Template } from '../src/model/types.ts';

const THEMES = ['cream', 'navy', 'offwhite'] as const;

/** A template holding exactly one block, so a snapshot shows that block and nothing else. */
function only(block: Block, themeName: (typeof THEMES)[number] = 'cream'): Template {
  const t = theme(DEFAULT_DESIGN_SYSTEM, themeName);
  return {
    schema: SCHEMA_VERSION,
    id: 'tpl',
    name: 'One block',
    hubspotLabel: 'One block',
    pageBackground: '#f7f6f3',
    forceLight: true,
    preview: { company: 'SWITCHYARDS U.S.A.', address: '151 Ted Turner Dr SE', city: 'Atlanta', state: 'GA', zip: '30303' },
    sections: [
      {
        id: 's1',
        bandColor: t.band,
        containerColor: t.container,
        textColor: t.text,
        linkColor: t.link,
        padTop: 0,
        padBottom: 0,
        rows: [
          {
            id: 'r1',
            mobile: 'stack',
            columns: [
              { id: 'c1', span: 12, padTop: 10, padBottom: 10, padLeft: 20, padRight: 20, align: 'left' as Align, blocks: [block] },
            ],
          },
        ],
      },
    ],
  };
}

const lock = (label: string, field: string, editable = true) => ({ editable, label, field });

/**
 * The body plus the phone-width rules the block contributed — the two parts a block actually
 * writes. The rest of the head is 30KB of boilerplate that would drown every diff.
 */
function snapshotOf(html: string): string {
  const body = html.slice(html.indexOf('<div id="hs_cos_wrapper_main">'), html.indexOf('</div>\n</td></tr></tbody></table>'));
  const start = html.indexOf('/* Phone sizes for headings');
  const mobile = start === -1 ? '' : html.slice(start, html.indexOf('}', html.indexOf('.sy-rich p, .sy-rich li', start)) + 1);
  return `${body}\n\n--- phone ---\n${mobile}`;
}

const SAMPLES: Array<[string, Block]> = [
  ['heading', { id: 'b', type: 'heading', lock: lock('Headline', 'headline'), text: 'HEADING ONE', level: 'h1', align: 'left' }],
  ['richtext', { id: 'b', type: 'richtext', lock: lock('Body', 'body'), html: '<p>Copy.</p>', align: 'left' }],
  ['button', { id: 'b', type: 'button', lock: lock('Button text (blank to hide)', 'button_text'), link: lock('Button link', 'button_link'), text: 'GO', href: 'https://www.switchyards.com/', style: 'primary', align: 'center' }],
  ['image', { id: 'b', type: 'image', lock: lock('Hero image', 'hero_image'), mode: 'module', src: '', alt: '', href: '', width: 560, align: 'center', optional: true }],
  ['topbar', { id: 'b', type: 'topbar', lock: lock('Top bar tagline', 'top_bar_tagline'), text: '"A tagline."' }],
  ['stripes', { id: 'b', type: 'stripes', stripes: [{ color: '#d20000', height: 4 }, { color: '#fcfff5', height: 2 }] }],
  ['spacer', { id: 'b', type: 'spacer', height: 24 }],
  ['divider', { id: 'b', type: 'divider', height: 2, color: null, width: 100, align: 'center' }],
  ['legal', { id: 'b', type: 'legal', logoSrc: '', logoWidth: 180, note: 'A note.', noteLock: lock('Legal note', 'legal_note', false) }],
];

describe.each(SAMPLES)('%s', (_name, block) => {
  it.each(THEMES)('renders on the %s theme', (themeName) => {
    const html = compile(only(block, themeName), { mode: 'hubl', date: '2026-09-11' }).html;
    expect(snapshotOf(html)).toMatchSnapshot();
  });

  // acceptance.md §1: the linter passes on every snapshot. A block that only ever appears inside a
  // full template can hide a broken declaration behind a neighbour that happens to satisfy a rule.
  it.each(THEMES)('passes the linter on its own, on the %s theme', (themeName) => {
    const out = compile(only(block, themeName), { mode: 'hubl', date: '2026-09-11' });
    const findings = lint({ tree: out.tree, registry: out.registry, html: out.html, bytes: out.bytes });
    // A single block is not a whole email, so the one rule about the email as a whole is exempt.
    expect(errorsIn(findings).filter((f) => f.rule !== 'can-spam')).toEqual([]);
  });

  it('renders in preview as well as HubL', () => {
    const preview = compile(only(block), { mode: 'preview', date: '2026-09-11' }).html;
    expect(preview).not.toContain('{%');
    expect(preview).not.toContain('{{');
  });
});

// acceptance.md §1: "A blank editable heading, a blank button label and an unset image each remove
// their whole block including surrounding spacing." The images are covered in branches.test.ts
// against the real standard email; these are the two that the fixture has no example of.
describe('blank content collapses the whole block', () => {
  const sectionsIn = (html: string) => html.split('class="hse-section').length - 1;

  it('a blank heading removes its section, gap included', () => {
    const heading = SAMPLES.find(([n]) => n === 'heading')![1];
    const filled = compile(only(heading), { mode: 'preview', branch: { headline: true } });
    const blank = compile(only(heading), { mode: 'preview', branch: { headline: false } });
    expect(filled.html).toContain('HEADING ONE');
    expect(blank.html).not.toContain('HEADING ONE');
    expect(sectionsIn(blank.html)).toBe(sectionsIn(filled.html) - 1);
  });

  it('a blank button label removes the button and its padding', () => {
    const button = SAMPLES.find(([n]) => n === 'button')![1];
    const blank = compile(only(button), { mode: 'preview', branch: { button_text: false } });
    expect(blank.html).not.toContain('class="sy-btn');
  });

  it('declares the field above the conditional either way, so HubSpot still registers it', () => {
    for (const name of ['heading', 'button'] as const) {
      const html = compile(only(SAMPLES.find(([n]) => n === name)![1]), { mode: 'hubl' }).html;
      expect(html.indexOf('{% text'), name).toBeLessThan(html.indexOf('{% if'));
    }
  });
});

// acceptance.md §1: "Field declaration order in the output matches canvas order for a template with
// at least eight editable fields in a non-obvious arrangement."
describe('declaration order follows document order', () => {
  it('holds for eight fields interleaved across sections and block types', () => {
    const mk = (block: Block) => only(block).sections[0]!;
    const blocks: Block[] = [
      { id: '1', type: 'heading', lock: lock('Eyebrow', 'eyebrow'), text: 'ONE', level: 'h4', align: 'left' },
      { id: '2', type: 'image', lock: lock('Hero', 'hero'), mode: 'module', src: '', alt: '', href: '', width: 560, align: 'center', optional: true },
      { id: '3', type: 'richtext', lock: lock('Intro', 'intro'), html: '<p>a</p>', align: 'left' },
      { id: '4', type: 'button', lock: lock('Primary text (blank to hide)', 'primary_text'), link: lock('Primary link', 'primary_link'), text: 'A', href: 'https://x.test/', style: 'primary', align: 'center' },
      { id: '5', type: 'heading', lock: lock('Kicker', 'kicker'), text: 'TWO', level: 'h2', align: 'left' },
      { id: '6', type: 'richtext', lock: lock('Outro', 'outro'), html: '<p>b</p>', align: 'left' },
      { id: '7', type: 'image', lock: lock('Sign-off', 'sign_off'), mode: 'module', src: '', alt: '', href: '', width: 280, align: 'center', optional: true },
    ];
    // Deliberately non-obvious: alphabetically the names run eyebrow, hero, intro, kicker, outro,
    // primary_link, primary_text — nothing like the order they appear in.
    const template: Template = { ...only(blocks[0]!), sections: blocks.map(mk) };
    template.sections.forEach((section, i) => {
      section.rows[0]!.columns[0]!.blocks = [blocks[i]!];
    });

    const html = compile(template, { mode: 'hubl', date: '2026-09-11' }).html;
    const declared = [...html.matchAll(/\{%\s*(?:text|rich_text|module)\s+"([a-z_0-9]+)"/g)].map((m) => m[1]);
    expect(declared).toEqual(['eyebrow', 'hero', 'intro', 'primary_text', 'primary_link', 'kicker', 'outro', 'sign_off']);
    expect(declared.length).toBeGreaterThanOrEqual(8);
  });
});

/**
 * The footer's two legal links.
 *
 * Unsubscribe is the law's and HubSpot's; Manage Preferences is a courtesy, and Jared asked for it to be optional
 * (2026-09-21). The thing to defend is that the optional one can go without taking the required one with it, in
 * every layout that draws them — three different pieces of markup, which is exactly how one of them gets missed.
 */
describe('a footer dropped in from the palette', () => {
  it('runs to the window’s edge, where nothing else does', async () => {
    const { createSection } = await import('../src/model/catalog.ts');
    const { sequentialIds } = await import('../src/model/ids.ts');
    const ids = () => ({ id: sequentialIds(), taken: new Set<string>() });
    expect(createSection('legal', ids(), DEFAULT_DESIGN_SYSTEM).bleed).toBe(true);
    // Only the footer. A heading that ran to the edge would be a band across the window with one word in it.
    for (const type of ['heading', 'richtext', 'button', 'image', 'topbar'] as const) {
      expect(createSection(type, ids(), DEFAULT_DESIGN_SYSTEM).bleed, type).toBeFalsy();
    }
  });
});

describe('the Manage Preferences link', () => {
  const LAYOUTS = ['classic', 'masthead', 'ledger', 'stub', 'letterhead'] as const;
  const footer = (over: Partial<Extract<Block, { type: 'legal' }>>): Block => ({
    id: 'b',
    type: 'legal',
    logoSrc: '',
    logoWidth: 180,
    note: 'A note.',
    noteLock: lock('Legal note', 'legal_note', false),
    ...over,
  });

  it.each(LAYOUTS)('is there by default on the %s layout', (layout) => {
    const html = compile(only(footer({ layout }), 'cream'), { mode: 'hubl', date: '2026-09-11' }).html;
    expect(html).toContain('Manage Preferences');
    expect(html).toContain('Unsubscribe');
  });

  it.each(LAYOUTS)('goes when it is left out, and takes nothing else with it on the %s layout', (layout) => {
    const html = compile(only(footer({ layout, hidePreferences: true }), 'cream'), { mode: 'hubl', date: '2026-09-11' }).html;
    expect(html).not.toContain('Manage Preferences');
    // The one that is not a choice.
    expect(html).toContain('Unsubscribe');
    expect(html).toContain('{{ unsubscribe_link_all }}');
    // And the separator between them goes too, rather than leaving a dot with nothing after it.
    expect(html).not.toContain('&middot;&nbsp; </span></span>');
  });

  it('still passes the linter with it gone, because the required link is untouched', () => {
    const out = compile(only(footer({ layout: 'ledger', hidePreferences: true }), 'cream'), { mode: 'hubl', date: '2026-09-11' });
    const findings = lint({ tree: out.tree, registry: out.registry, html: out.html, bytes: out.bytes });
    expect(errorsIn(findings).filter((f) => f.rule === 'can-spam')).toEqual([]);
  });

  it('is absent from an older footer, so nothing written before this loses its link', () => {
    const html = compile(only(footer({ layout: 'ledger' }), 'cream'), { mode: 'hubl', date: '2026-09-11' }).html;
    expect(html).toContain('Manage Preferences');
  });
});

/**
 * What a new ledger footer says before anybody types in it (Jared, 2026-09-21).
 *
 * The ledger sets its note beside an index of links rather than under a centred badge row, which makes its small
 * type read as a statement about the company rather than as housekeeping — so it carries different words from the
 * other four, and this is the test that keeps the two sets from drifting into each other.
 */
describe('the ledger footer, as the system builds it', () => {
  it('opens on the ledger words, not the printing notice', async () => {
    const { SY_BLOCKS, SY_COPY, SY_SOCIAL } = await import('../src/model/switchyards.ts');
    const item = SY_BLOCKS.find((b) => b.id === 'footer-b');
    expect(item).toBeTruthy();
    const sections = item!.make(DEFAULT_DESIGN_SYSTEM);
    const block = sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))).find((b) => b.type === 'legal');
    expect(block).toBeTruthy();
    const legal = block as Extract<Block, { type: 'legal' }>;
    expect(legal.note).toBe('40+ clubs. 17 cities. 1 membership.');
    // The note is the ledger's own; the mark is the system's, the same one every other footer signs off with.
    expect(legal.mark).toBe(SY_COPY.mark);
    expect(legal.instagram).toBe(SY_SOCIAL.instagram);
    expect(legal.youtube).toBe(SY_SOCIAL.youtube);
    expect(legal.youtube).toBe('https://www.youtube.com/@switchyards');
  });

  it('leaves the other footers on the printing notice, and gives them all the same mark', async () => {
    const { SY_BLOCKS, SY_COPY, SY_SOCIAL } = await import('../src/model/switchyards.ts');
    // The ledger's mark is the system's too (Jared: "delete ledgermarks and use the default one"), so the only
    // thing that sets the ledger apart from the rest is its note.
    const ledgerItem = SY_BLOCKS.find((b) => b.id === 'footer-b')!;
    const ledgerMark = (ledgerItem
      .make(DEFAULT_DESIGN_SYSTEM)
      .flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)))
      .find((b) => b.type === 'legal') as Extract<Block, { type: 'legal' }>).mark;
    const ids = ['footer-a', 'footer-c', 'footer-letterhead'];
    let checked = 0;
    for (const id of ids) {
      const item = SY_BLOCKS.find((b) => b.id === id);
      expect(item, id).toBeTruthy();
      const legal = item!
        .make(DEFAULT_DESIGN_SYSTEM)
        .flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)))
        .find((b) => b.type === 'legal') as Extract<Block, { type: 'legal' }> | undefined;
      expect(legal, id).toBeTruthy();
      expect(legal!.note, id).toBe(SY_COPY.notice);
      expect(legal!.mark, id).toBe(SY_COPY.mark);
      expect(legal!.mark, id).toBe(ledgerMark);
      expect(legal!.youtube, id).toBe(SY_SOCIAL.youtube);
      checked += 1;
    }
    // A loop that skipped everything would pass silently, which is the one way this test could lie.
    expect(checked).toBe(ids.length);
  });
});
