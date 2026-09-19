// The baseline template: one email that contains every block, every style and every edge case.
//
//   npm run baseline
//
// Built by a program rather than hand-written as JSON, and that is the whole point. A fixture typed
// out by hand is correct on the day it is written and silently wrong from the first model change
// after — the fields drift, the enums stop matching, and nothing complains because JSON has no
// opinion. This is type-checked against the model, so a block that gains a field or loses one
// breaks the build here instead of producing a file that no longer loads.
//
// What it is for:
//
//   - **Seeing every style at once.** Lists, quotes, rules, small print, code, nested lists — the
//     things nobody designs until somebody pastes one in.
//   - **A real send that exercises everything.** One upload answers questions about a dozen shapes
//     rather than one, which matters because a send is the expensive step (acceptance.md §3).
//   - **Keeping the design panel honest.** Every token has something on this page that moves when
//     you change it. A token with nothing to show is a token nobody can judge.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile/compile.ts';
import { lint, errorsIn } from '../src/compile/lint.ts';
import { DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import { DND_MIN_WIDTH } from '../src/model/dnd.ts';
import { sequentialIds } from '../src/model/ids.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import { serializeTemplate } from '../src/model/serialize.ts';
import { pictureHash, recipeHash } from '../src/model/freeform.ts';
import type { Align, Block, Column, Lock, MobileBehaviour, Section, Template } from '../src/model/types.ts';

const id = sequentialIds();
const ds = DEFAULT_DESIGN_SYSTEM;

/** Locked, so the page renders as designed rather than as eight empty HubSpot fields. */
const fixed = (label: string): Lock => ({ editable: false, label, field: '' });
/** Unlocked, for the handful that should appear in the Contents panel. */
const open = (label: string, field: string): Lock => ({ editable: true, label, field });

const column = (blocks: Block[], span = 12, extra: Partial<Column> = {}): Column => ({
  id: id(),
  span,
  padTop: 14,
  padBottom: 14,
  padLeft: 20,
  padRight: 20,
  align: 'left' as Align,
  ...extra,
  blocks,
});

/** `mobile` belongs to the row, not the section, and is lifted out here so call sites read flatly. */
function section(
  columns: Column[],
  themeName: string,
  extra: Partial<Section> & { mobile?: MobileBehaviour } = {},
): Section {
  const t = theme(ds, themeName);
  const { mobile = 'stack', ...rest } = extra;
  return {
    id: id(),
    theme: themeName,
    bandColor: t.band,
    containerColor: t.container,
    textColor: t.text,
    linkColor: t.link,
    padTop: 0,
    padBottom: 0,
    ...rest,
    rows: [{ id: id(), mobile, columns }],
  };
}

const heading = (text: string, level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', align: Align = 'left'): Block => ({
  id: id(),
  type: 'heading',
  lock: fixed(`${level.toUpperCase()} heading`),
  text,
  level,
  align,
});

const copy = (html: string, align: Align = 'left', lock: Lock = fixed('Copy')): Block => ({
  id: id(),
  type: 'richtext',
  lock,
  html,
  align,
});

const button = (text: string, style: 'primary' | 'secondary', align: Align | 'full' = 'center'): Block => ({
  id: id(),
  type: 'button',
  lock: fixed(`${style} button`),
  link: fixed(`${style} link`),
  text,
  href: 'https://www.switchyards.com/',
  style,
  align,
});

const spacer = (height: number): Block => ({ id: id(), type: 'spacer', height });

/**
 * The drag and drop area, with default content the team starts from.
 *
 * Two sections, the second of them split in two, because a single column holding one module would
 * not show the nesting — and the nesting is the part that has never been seen in a real send.
 */
const dndArea = (): Block => ({
  id: id(),
  type: 'dndarea',
  name: 'email_body',
  label: 'Email body',
  sections: [
    {
      id: id(),
      background: null,
      padTop: 20,
      padBottom: 10,
      columns: [
        {
          id: id(),
          width: 12,
          modules: [
            { id: id(), path: '@hubspot/email_header', label: 'Headline', params: [] },
            { id: id(), path: '@hubspot/email_body', label: 'Body', params: [] },
          ],
        },
      ],
    },
    {
      id: id(),
      background: null,
      padTop: 10,
      padBottom: 20,
      columns: [
        { id: id(), width: 6, modules: [{ id: id(), path: '@hubspot/image_email', label: 'Picture', params: [] }] },
        { id: id(), width: 6, modules: [{ id: id(), path: '@hubspot/email_cta', label: 'Call to action', params: [] }] },
      ],
    },
  ],
});

/** A rule inside the gutter. Null colour follows the system's rule colour. */
const divider = (height: number, width = 100, color: string | null = null, align: Align = 'center'): Block => ({
  id: id(),
  type: 'divider',
  height,
  color,
  width,
  align,
});

const brand = (mark: string): Block => {
  const block: Block = {
    id: id(),
    type: 'brand',
    mark,
    alt: mark.toUpperCase(),
    width: 96,
    align: 'center',
    color: null,
    src: 'https://hs-50604449.f.hubspotemail.net/hub/50604449/hubfs/sy-logo-lockup@2x.png?width=720&upscale=true&name=sy-logo-lockup@2x.png',
  };
  return { ...block, renderedHash: pictureHash(block) };
};

const freeform = (): Block => {
  const block: Block = {
    id: id(),
    type: 'freeform',
    alt: 'A card drawn by hand',
    width: 560,
    height: 200,
    background: 'offwhite',
    layers: [
      { kind: 'rect', id: 'l1', x: 16, y: 16, width: 528, height: 168, fill: null, stroke: 'navy', strokeWidth: 2, radius: 8 },
      { kind: 'line', id: 'l2', x1: 40, y1: 120, x2: 520, y2: 120, stroke: 'red', strokeWidth: 3 },
      { kind: 'text', id: 'l3', text: 'Drawn, not typed.', role: 'h2', color: 'navy', x: 40, y: 44, width: 480, align: 'left' },
      { kind: 'ellipse', id: 'l4', x: 440, y: 132, width: 40, height: 40, fill: 'red', stroke: null, strokeWidth: 0 },
    ],
    src: 'https://hs-50604449.f.hubspotemail.net/hub/50604449/hubfs/sy-logo-lockup@2x.png?width=720&upscale=true&name=sy-logo-lockup@2x.png',
    align: 'center',
  };
  return { ...block, renderedHash: recipeHash(block) };
};

const stripes = (a: string, ha: number, b: string, hb: number): Block => ({
  id: id(),
  type: 'stripes',
  stripes: [
    { color: a, height: ha },
    { color: b, height: hb },
  ],
});

const image = (label: string, width: number, align: Align = 'center', optional = false): Block => ({
  id: id(),
  type: 'image',
  lock: fixed(label),
  mode: 'static',
  src: 'https://hs-50604449.f.hubspotemail.net/hub/50604449/hubfs/sy-logo-lockup@2x.png?width=720&upscale=true&name=sy-logo-lockup@2x.png',
  alt: label,
  href: '',
  width,
  align,
  optional,
});

// --- the page -------------------------------------------------------------------------------------

const sections: Section[] = [
  // On the navy preset, which is what it draws now — it used to draw navy whatever its section said.
  section([column([{ id: id(), type: 'topbar', lock: fixed('Tagline'), text: 'EVERY BLOCK, EVERY STYLE.' }], 12, { padTop: 0, padBottom: 0, align: 'center' })], 'navy', { padTop: 16, padBottom: 12 }),
  section([column([stripes('redBright', 4, 'offwhite', 2)], 12, { padTop: 0, padBottom: 0 })], 'cream'),

  // Type, at every level the scale defines.
  section([column([heading('Heading one', 'h1'), copy('<p>The first paragraph, at the body role. Everything below is rendered by the design system, so changing a token in the panel moves it here.</p>')])], 'cream'),
  section([column([heading('Heading two', 'h2'), heading('Heading three', 'h3'), heading('Heading four', 'h4'), heading('Heading five', 'h5'), heading('Heading six', 'h6')])], 'cream'),

  // The rich text editor's whole vocabulary, which is what the team actually produces.
  section([
    column([
      copy(
        '<h2>What the team can type</h2>' +
          '<p>Body copy with <strong>bold</strong>, <em>italic</em>, <u>underline</u> and ' +
          '<a href="https://www.switchyards.com/">a link</a> in it. This paragraph is deliberately long ' +
          'enough to wrap two or three times, because line height and measure only show themselves at ' +
          'length — a single line tells you nothing about either.</p>' +
          '<h3>A bulleted list</h3>' +
          '<ul><li>First item, short.</li>' +
          '<li>Second item, long enough to wrap onto a second line so the hanging indent is visible.</li>' +
          '<li>Third item, with a nested list under it:<ul><li>Nested one</li><li>Nested two</li></ul></li></ul>' +
          '<h3>A numbered list</h3>' +
          '<ol><li>Step one</li><li>Step two, also long enough to wrap so the indent can be judged.</li><li>Step three</li></ol>' +
          '<blockquote>A block quote. The bar down the side, the inset and whether it leans are all ' +
          'design-system tokens, which they were not until this page existed to show them.</blockquote>' +
          '<hr>' +
          '<p><small>Small print, for the line nobody reads until it matters.</small></p>',
        'left',
        open('Body copy', 'body_copy'),
      ),
    ]),
  ], 'cream'),

  // The same vocabulary on the dark band, which is where contrast mistakes appear.
  section([
    column([
      copy(
        '<h2>The same, on navy</h2>' +
          '<p>Text and links resolve from the preset, so this paragraph and its ' +
          '<a href="https://www.switchyards.com/">link</a> should both be legible without anybody ' +
          'setting a colour on the block.</p>' +
          '<ul><li>A list on navy</li><li>Second item</li></ul>' +
          '<blockquote>And a quote, whose bar is a palette colour rather than a hard-coded red.</blockquote>',
      ),
    ]),
  ], 'navy'),

  // Buttons: both variants, and full width, which wraps differently.
  section([column([heading('Buttons', 'h2'), button('Primary button', 'primary'), spacer(8), button('Full width primary', 'primary', 'full')])], 'cream'),
  section([column([button('Secondary button', 'secondary'), spacer(8), button('Secondary, left', 'secondary', 'left')])], 'navy'),

  // Images: the global frame, at three widths and three alignments.
  section([column([heading('Images', 'h2'), image('Full width image', 560), spacer(6), image('Half width, left', 280, 'left'), spacer(6), image('Small, right', 160, 'right')])], 'cream'),
  // The absent case, which needs a *real* one: editable, through HubSpot's own module, with no
  // source. A locked static image ignores `optional` entirely — it renders or it does not, and
  // putting one here would have shown the flag doing nothing.
  section([
    column([
      copy('<p>Below is an optional image. Until somebody picks one in HubSpot the block is not in the send at all — no placeholder, no gap.</p>'),
      {
        id: id(),
        type: 'image',
        lock: open('Optional image', 'optional_image'),
        mode: 'module',
        src: '',
        alt: '',
        href: '',
        width: 560,
        align: 'center',
        optional: true,
      },
    ]),
  ], 'offwhite'),

  // Columns: even, uneven, three up, and one that leaves on a phone.
  section([column([heading('Two even columns', 'h2')])], 'cream'),
  section(
    [column([copy('<p>Left column. Even split, stacking on a phone.</p>')], 6), column([copy('<p>Right column, the same width.</p>')], 6)],
    'cream',
  ),
  section([column([heading('Two uneven columns', 'h2')])], 'cream'),
  section(
    [column([copy('<p>Eight twelfths. The wide side, where the copy goes.</p>')], 8), column([image('Narrow', 160)], 4)],
    'cream',
  ),
  section([column([heading('Three columns, side by side on phones', 'h2')])], 'cream'),
  section(
    [column([copy('<p>One</p>')], 4), column([copy('<p>Two</p>')], 4), column([copy('<p>Three</p>')], 4)],
    'offwhite',
    { mobile: 'side-by-side' as MobileBehaviour },
  ),
  section([column([heading('A column that leaves on a phone', 'h2')])], 'cream'),
  section(
    [column([copy('<p>This column stays.</p>')], 8), column([image('Decoration', 160)], 4, { hideOnPhone: true })],
    'cream',
  ),

  // Spacing and rules.
  section([column([heading('Spacers and stripes', 'h2'), copy('<p>A 40px spacer follows this paragraph.</p>'), spacer(40), copy('<p>And stripes follow that.</p>')])], 'cream'),
  section([column([stripes('redBright', 6, 'navy', 3)], 12, { padTop: 0, padBottom: 0 })], 'cream'),
  // Dividers: inside the gutter, where stripes are not. Full width on the rule colour, then a
  // short one in navy, left, to show the width and alignment doing something.
  section([column([heading('Dividers', 'h2'), copy('<p>A full-width divider on the system’s rule colour follows this paragraph.</p>'), divider(2), copy('<p>And a short navy one, set left.</p>'), divider(4, 30, 'navy', 'left')])], 'cream'),

  // A freeform surface: a box, a line and a caption, rendered. The picture named here is the
  // logo lockup, which is hosted; the hash is stamped below so the checks see it as current.
  section([column([heading('Freeform', 'h2'), copy('<p>A drawing surface the email carries as one picture. The canvas draws the recipe; the file carries the PNG.</p>'), freeform()])], 'cream'),

  // The four brand marks in a row, on the dark band, following its text colour.
  section([column([heading('Brand marks', 'h2')])], 'cream'),
  section([column([brand('sy')], 3), column([brand('scgnzi')], 3), column([brand('ica')], 3), column([brand('nwca')], 3)], 'navy', { mobile: 'side-by-side' }),

  // The drag and drop area: the one region the team lays out itself. This block is the reason the
  // page is 624px wide rather than 600 — see the design system below.
  section([column([heading('Drag and drop area', 'h2'), copy('<p>Everything in the dashed region is the team’s to arrange in HubSpot. The canvas draws the structure; HubSpot draws the modules.</p>')])], 'cream'),
  section([column([dndArea()], 12, { padTop: 0, padBottom: 0 })], 'cream'),

  // The footer HubSpot will not publish without.
  section([column([{ id: id(), type: 'legal', logoSrc: '', logoWidth: 180, note: 'A note in the legal footer, which is locked so that re-uploading the template fixes every future send.', noteLock: fixed('Legal note') }], 12, { padTop: 0, padBottom: 0, padRight: 0, align: 'right' })], 'navy', { padTop: 30, padBottom: 10, domId: 'section-legal' }),
  section([column([stripes('redBright', 4, 'offwhite', 2)], 12, { padTop: 0, padBottom: 0 })], 'cream'),
];

const template: Template = {
  schema: SCHEMA_VERSION,
  id: id(),
  name: 'Baseline',
  hubspotLabel: 'Switchyards Baseline — every block and style',
  pageBackground: ds.pageBackground,
  forceLight: true,
  // 624 rather than the system's 600, because this page holds a drag and drop area and HubSpot's
  // minimum for one cannot be overridden. It is the feature's real cost, and the baseline is the
  // right place to carry it: a page holding every block has to be wide enough for every block.
  ds: { ...ds, containerWidth: DND_MIN_WIDTH },
  preview: { company: 'SWITCHYARDS U.S.A.', address: '151 Ted Turner Dr SE', city: 'Atlanta', state: 'GA', zip: '30303' },
  sections,
};

// --- write it out ----------------------------------------------------------------------------------

// `fileURLToPath`, not `url.pathname`: a pathname is percent-encoded, so a project living in a
// folder whose name contains a space resolves to a directory that does not exist — and because
// `mkdirSync` is recursive, the tool cheerfully creates it and writes the output there. That is
// exactly what happened when this project moved into a folder with two spaces in its name.
const here = (path: string) => resolve(dirname(fileURLToPath(import.meta.url)), '..', path);
const write = (path: string, text: string) => {
  mkdirSync(dirname(here(path)), { recursive: true });
  writeFileSync(here(path), text);
  return path;
};

const out = compile(template, { mode: 'hubl' });
const errors = errorsIn(lint({ ...out, mode: 'hubl' }));

write('templates/baseline.template.json', serializeTemplate(template));
write('exports/baseline.html', out.html);
write('exports/baseline.preview.html', compile(template, { mode: 'preview' }).html);

const blocks = sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)));
const kinds = [...new Set(blocks.map((b) => b.type))].sort();

console.log(`Baseline: ${sections.length} sections, ${blocks.length} blocks, ${kinds.length} block types`);
console.log(`  types: ${kinds.join(', ')}`);
console.log(`  ${(out.bytes / 1024).toFixed(1)}KB  ·  ${errors.length === 0 ? 'validation clean' : `${errors.length} to fix`}`);
for (const error of errors) console.log(`  ! ${error.rule}: ${error.message}`);
console.log('  templates/baseline.template.json, exports/baseline.html, exports/baseline.preview.html');
