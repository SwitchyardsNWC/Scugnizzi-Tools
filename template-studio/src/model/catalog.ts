// What a designer can change, declared once per block type.
//
// The inspector is generated from this. That is the point: v1's fourth listed flaw was that adding
// a block type meant editing the source (brief.md), and half of what it meant was editing the
// control panel by hand. Here a new block is a renderer plus an entry below, and the interface
// builds itself.
//
// Groups are the drill-down. A designer opening a block sees **Content** first, because that is
// what they came for; Appearance, Spacing and the HubSpot lock sit below it, open on demand. The
// order is deliberate and is not the order the fields appear in the data.
//
// Paths carry a prefix because the model and the interface disagree about where a property lives,
// on purpose. Background belongs to the Section and padding to the Column — that is the correct
// document shape — but a designer thinks of both as belonging to the block they can see. The
// prefix lets one panel edit all three nodes without flattening the model to match the UI.

import { bandedPreset, DEFAULT_DESIGN_SYSTEM, firstPreset, theme as themeTokens, type DesignSystem } from './design-system.ts';
import { fieldName, bodyFieldName } from './ids.ts';
import { newDndArea } from './dnd.ts';
import { MARKS } from './marks.ts';
import type { Align, Block, BlockType, Column, Row, Section } from './types.ts';

export type ControlKind =
  | 'text'
  | 'textarea'
  | 'html'
  | 'url'
  | 'number'
  /** A number that follows a design-system token until you give it one of its own. */
  | 'inherit-number'
  /** Render this block's text as a picture of itself, or put the words back. */
  | 'rasterise'
  /** A box around the block. One row until it has a width, then four. */
  | 'border'
  /** A button variant, listed from the template's own design system rather than from a fixed set. */
  | 'variant'
  | 'select'
  | 'color'
  /** A palette colour by name, with `zero` naming what an empty reference falls back to. */
  | 'palette'
  | 'toggle'
  | 'lock'
  | 'stripes'
  /** The freeform block's layers: the list, the tools, and the selected layer's numbers. */
  | 'layers'
  /** Render a picture block — freeform or brand — to its picture, and where that picture is. */
  | 'render-picture'
  | 'columns'
  /** The drag and drop area's default content: its sections, columns and HubSpot modules. */
  | 'dnd'
  /** A background preset, listed from the template's own design system rather than from a fixed set. */
  | 'preset';

export interface Control {
  kind: ControlKind;
  /** `block.text`, `column.padTop`, `section.theme`. */
  path: string;
  label: string;
  /** One line, shown on hover. Jared asked for this on every control, explicitly. */
  help?: string;
  options?: Array<[string, string]>;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /** What an empty or zero value means, shown in the field rather than in a footnote. */
  zero?: string;
  placeholder?: string;
  /**
   * Only shown when the block's column holds more than one block. A "between blocks" dial on a
   * block that is alone in its column is a dial wired to nothing, and a panel should not carry
   * one of those.
   */
  when?: 'stack' | 'canvas';
}

export interface Group {
  name: string;
  help?: string;
  /** Open on selection. Exactly one group per block should be — the one they came for. */
  open?: boolean;
  /** Only inside the freeform canvas, or only outside it. Absent is both. */
  when?: 'canvas' | 'email';
  controls: Control[];
}

export interface BlockSpec {
  type: BlockType;
  name: string;
  /** One line in the Add menu: what this block is for, not what it contains. */
  summary: string;
  groups: Group[];
  /** How the block names itself in the outline. */
  outline(block: Block): string;
}

// --- shared option lists -------------------------------------------------------------------------

const ALIGN: Array<[string, string]> = [
  ['left', 'Left'],
  ['center', 'Center'],
  ['right', 'Right'],
];

/**
 * What an Appearance panel is now, and what it is not.
 *
 * Jared, 2026-09-11: "appearance options should be limited to alignment, since size, line height,
 * color should be chosen in the design panel." So a block decides what it *is* — a heading's level,
 * a button's variant — and where it sits. Everything about how it looks is a role in the design
 * system, set once for the template.
 *
 * The list of per-block text colours that used to live here went with them.
 */
const FROM_SYSTEM = 'Size, line height and colour come from the design system, so every block of this kind moves together. Design › Type.';

/**
 * Turning the words into a picture of the words.
 *
 * One control in three catalogs — heading, rich text, and the image a converted one becomes —
 * because it is the same decision read from either side. What it renders depends on the block it
 * finds itself on, which is the one place in this file a control is not purely declarative; the
 * alternative was two kinds that had to be kept in step.
 */
/**
 * A box around the block — the probe template's look: a rule, a card, a callout.
 *
 * One entry rather than four, because four rows of box settings on every block is four rows of
 * nothing for the blocks that have no box. The control opens up once the width is above zero.
 *
 * In every Appearance panel that has a cell to draw it on. Not on the top bar, the stripes or the
 * legal footer: those draw their own full-bleed band and have no cell, so there is nothing for a
 * box to sit inside.
 */
const border = (): Control => ({
  kind: 'border',
  path: 'column.borderWidth',
  label: 'Border',
  help: 'A box around this block, inside the page gutter. Outlook honours the line and squares off the corners, which is the usual split.',
});

/** A colour behind the column's contents, with the box's corners: a card. */
const fill = (): Control => ({
  kind: 'palette',
  path: 'column.fill',
  label: 'Fill',
  zero: 'None',
  help: 'A colour behind everything in this column, with the box’s corners: a card. The Switchyards Callout is a heading and a line on a navy fill with 8px corners.',
});

const asImage = (): Control => ({
  kind: 'rasterise',
  path: 'block.src',
  label: 'Render as image',
  help: 'Draws this block exactly as the canvas shows it and puts the picture in its place. Word rounds line heights, drops letter spacing and substitutes fonts; a picture does none of that. The costs: it stops being editable in HubSpot, it cannot reflow or invert, and where images are blocked the alt text is all that arrives.',
});

/**
 * Padding on the column, which is where a block's own breathing room lives.
 *
 * Above and below are the block's own numbers. The two sides follow Design › Page padding until
 * you give one a number, because the gutter is a decision about the email and not about this
 * block — but "until" matters: one edge-to-edge image inside an otherwise inset email is a real
 * design, and before this there was no way to ask for it except by moving every block.
 */
const spacing = (top = 'Space above', bottom = 'Space below'): Group => ({
  name: 'Spacing',
  help: 'Above and below belong to this block — or to the group, when several blocks share a column. The sides follow the page gutter until you set one; the band behind it always runs edge to edge either way. Hover the canvas to see them drawn.',
  controls: [
    { kind: 'number', path: 'column.padTop', label: top, min: 0, max: 200, suffix: 'px' },
    { kind: 'number', path: 'column.padBottom', label: bottom, min: 0, max: 200, suffix: 'px' },
    {
      kind: 'inherit-number',
      path: 'column.gap',
      label: 'Between blocks',
      min: 0,
      max: 80,
      suffix: 'px',
      zero: 'None',
      when: 'stack',
      help: 'The space between the blocks in this group. Following Design › Between blocks until you set it. A Spacer block replaces it on both sides, so a Spacer is exactly the space it says.',
    },
    {
      kind: 'inherit-number',
      path: 'column.padLeft',
      label: 'Space left',
      min: 0,
      max: 120,
      suffix: 'px',
      zero: 'None',
      help: 'Following Design › Page padding. Drag to give this block its own left gutter, or use the button to hand it back.',
    },
    {
      kind: 'inherit-number',
      path: 'column.padRight',
      label: 'Space right',
      min: 0,
      max: 120,
      suffix: 'px',
      zero: 'None',
      help: 'Following Design › Page padding. Drag to give this block its own right gutter, or use the button to hand it back.',
    },
  ],
});

/** For the blocks that draw their own band: let it run to the window's edge. */
const fullWidth = (): Control => ({
  kind: 'toggle',
  path: 'section.bleed',
  label: 'Full width',
  help: 'Let the band run to the edge of the window instead of stopping at the email’s width. The content stays in its column. Gmail’s apps keep their own inset around every message, which no email can remove.',
});

/** Padding on the section, for blocks that draw their own band and ignore the column. */
const sectionSpacing = (): Group => ({
  name: 'Spacing',
  controls: [
    { kind: 'number', path: 'section.padTop', label: 'Space above', min: 0, max: 200, suffix: 'px' },
    { kind: 'number', path: 'section.padBottom', label: 'Space below', min: 0, max: 200, suffix: 'px' },
  ],
});

const background = (): Group => ({
  name: 'Background',
  help: 'A preset moves the band, the container, the text colour and the link colour together.',
  controls: [
    {
      // `preset`, not `select` with a fixed list. The options used to come from the *shipped*
      // presets, so one added in the design panel never appeared here and one renamed there broke
      // the picker — the same bug as a hard-coded palette, one level up.
      kind: 'preset',
      path: 'section.theme',
      label: 'Background',
      help: 'Set these up in Design › Background presets.',
    },
  ],
});

// The per-block "Columns" panel used to live here, splitting the row a block happened to sit in.
// It is gone: Jared called it confusing, for the right reason — it asked a designer to know that a
// block they can see sits inside a row they cannot, and then to edit the invisible one through the
// visible one. Columns are dropped from the palette now, and their settings belong to the row
// itself (Inspector.tsx, `ColumnsPanel`).

const hubspot = (path: string, what: string): Group => ({
  name: 'In HubSpot',
  help: 'Locked content is rendered by the template, so re-uploading it fixes every future send.',
  controls: [
    {
      kind: 'lock',
      path,
      label: what,
      help: 'Unlock to let the team change this when they write an email. The label is all they see.',
    },
  ],
});

// --- the catalog ----------------------------------------------------------------------------------

export const CATALOG: Record<BlockType, BlockSpec> = {
  heading: {
    type: 'heading',
    name: 'Heading',
    summary: 'A headline. Left blank in HubSpot, the whole block disappears, gap included.',
    outline: (b) => (b.type === 'heading' && b.text.trim()) || 'Heading',
    groups: [
      {
        name: 'Content',
        open: true,
        controls: [{ kind: 'text', path: 'block.text', label: 'Text', placeholder: 'Heading' }],
      },
      {
        name: 'Appearance',
        help: FROM_SYSTEM,
        controls: [
          {
            kind: 'select',
            path: 'block.level',
            label: 'Level',
            options: [['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4'], ['h5', 'H5'], ['h6', 'H6']],
            help: 'Which type role renders it — size, weight, line height and phone size all come with it. Set them in Design › Type.',
          },
          { kind: 'select', path: 'block.align', label: 'Align', options: ALIGN },
          border(), fill(),
          asImage(),
        ],
      },
      spacing(),
      background(),
      hubspot('block.lock', 'Heading'),
    ],
  },

  richtext: {
    type: 'richtext',
    name: 'Text',
    summary: 'Body copy. The team edits it in HubSpot’s own rich text editor.',
    outline: (b) => (b.type === 'richtext' ? firstWords(b.html) : 'Text'),
    groups: [
      {
        name: 'Content',
        open: true,
        help: 'The default the team starts from. HubSpot copies it into each email once, when the email is created.',
        controls: [{ kind: 'html', path: 'block.html', label: 'Default copy' }],
      },
      {
        name: 'Appearance',
        help: FROM_SYSTEM,
        controls: [{ kind: 'select', path: 'block.align', label: 'Align', options: ALIGN }, border(), fill(), asImage()],
      },
      spacing('Space above', 'Space below'),
      background(),
      hubspot('block.lock', 'Copy'),
    ],
  },

  image: {
    type: 'image',
    name: 'Image',
    summary: 'A picture, optionally linked. Absent from the send until someone picks one.',
    outline: (b) => (b.type === 'image' ? b.lock.label || 'Image' : 'Image'),
    groups: [
      {
        name: 'Content',
        open: true,
        controls: [
          {
            kind: 'url',
            path: 'block.src',
            label: 'Image URL',
            placeholder: 'https://…',
            help: 'Upload to HubSpot Files and paste the URL. Leave blank and the team supplies it.',
          },
          { kind: 'text', path: 'block.alt', label: 'Alt text', help: 'Outlook shows this when images are blocked, which is most first opens.' },
          { kind: 'url', path: 'block.href', label: 'Link', placeholder: 'https://…' },
        ],
      },
      {
        // The one Appearance panel that keeps a number, and it is not a style: every image is a
        // different shape, so there is no role a width could belong to.
        name: 'Appearance',
        controls: [
          {
            kind: 'number',
            path: 'block.width',
            label: 'Width',
            min: 20,
            max: 700,
            suffix: 'px',
            help: 'The size it renders at. Upload at twice this for retina. Never taken from the file.',
          },
          { kind: 'select', path: 'block.align', label: 'Align', options: ALIGN },
          border(), fill(),
          // Renders as nothing at all on an image nobody converted, which is almost all of them.
          asImage(),
        ],
      },
      spacing(),
      background(),
      {
        name: 'In HubSpot',
        controls: [
          {
            kind: 'lock',
            path: 'block.lock',
            label: 'Image',
            help: 'Unlocked, the team gets HubSpot’s own picker with its link and alignment.',
          },
          {
            kind: 'toggle',
            path: 'block.optional',
            label: 'Leave out until an image is picked',
            help: 'On, no placeholder ever ships. Off, the block always renders.',
          },
          {
            kind: 'select',
            path: 'block.mode',
            label: 'How the team picks it',
            options: [
              ['module', 'HubSpot’s image module'],
              ['field', 'Picker plus a separate link field'],
            ],
            help: 'The module is verified to hand its link back to the template. The older shape needs a second field.',
          },
        ],
      },
    ],
  },

  button: {
    type: 'button',
    name: 'Button',
    summary: 'A call to action. Clearing its label in HubSpot removes it and its spacing.',
    outline: (b) => (b.type === 'button' && b.text.trim()) || 'Button',
    groups: [
      {
        name: 'Content',
        open: true,
        controls: [
          { kind: 'text', path: 'block.text', label: 'Label', placeholder: 'Read more' },
          { kind: 'url', path: 'block.href', label: 'Link', placeholder: 'https://…' },
        ],
      },
      {
        name: 'Appearance',
        help: FROM_SYSTEM,
        controls: [
          {
            // `variant`, not `select` with a list. The list here said Red and White, which were the
            // variant names until schema 3 renamed them for being named after a colour either of
            // them could stop being. The stored values moved; this list did not, so picking one
            // wrote `red`, matched no variant, and fell back to primary — a control that looked
            // like it worked. Reading the keys is the only version that cannot go stale, and it is
            // the same fix as the palette and the presets (learnings 3.34).
            kind: 'variant',
            path: 'block.style',
            label: 'Style',
            help: 'Which button role renders it. Their fill, ink, border and shape are in Design › Buttons.',
          },
          { kind: 'select', path: 'block.align', label: 'Align', options: [...ALIGN, ['full', 'Full width']] },
          border(), fill(),
        ],
      },
      spacing(),
      background(),
      {
        name: 'In HubSpot',
        controls: [
          { kind: 'lock', path: 'block.lock', label: 'Label' },
          { kind: 'lock', path: 'block.link', label: 'Link' },
        ],
      },
    ],
  },

  topbar: {
    type: 'topbar',
    name: 'Top bar',
    summary: 'The navy band across the very top, in small uppercase.',
    outline: (b) => (b.type === 'topbar' && b.text.trim()) || 'Top bar',
    groups: [
      {
        name: 'Content',
        open: true,
        controls: [
          { kind: 'text', path: 'block.text', label: 'Tagline' },
          { kind: 'url', path: 'block.href', label: 'Link', placeholder: 'https://…', help: 'Optional. The tagline becomes a link — a “view in browser”, say.' },
        ],
      },
      {
        name: 'Appearance',
        help: 'Size, tracking and case come from the Top bar role in Design › Type. Put two of these in a row of columns for a tagline on the left and a link on the right.',
        controls: [{ kind: 'select', path: 'block.align', label: 'Align', options: ALIGN }],
      },
      { ...sectionSpacing(), controls: [...sectionSpacing().controls, fullWidth()] },
      // The band it draws is a preset like any other section's. It was pinned to one called `navy`
      // — which is this brand's name for its dark band and not a thing every design system has —
      // so a template built on any other palette got a navy bar it could not change.
      background(),
      hubspot('block.lock', 'Tagline'),
    ],
  },

  stripes: {
    type: 'stripes',
    name: 'Stripes',
    summary: 'One or two full-width rules. Thickness zero drops a stripe.',
    outline: () => 'Stripes',
    groups: [
      {
        name: 'Stripes',
        open: true,
        help: 'Set a thickness to zero to drop that stripe, which turns this into a single rule.',
        controls: [{ kind: 'stripes', path: 'block.stripes', label: 'Stripes' }],
      },
      { name: 'Width', controls: [fullWidth()] },
    ],
  },

  spacer: {
    type: 'spacer',
    name: 'Spacer',
    summary: 'Vertical space that every client honours, Outlook included.',
    outline: (b) => (b.type === 'spacer' ? `Spacer · ${b.height}px` : 'Spacer'),
    groups: [
      {
        name: 'Size',
        open: true,
        controls: [{ kind: 'number', path: 'block.height', label: 'Height', min: 0, max: 200, suffix: 'px' }],
      },
      background(),
    ],
  },

  divider: {
    type: 'divider',
    name: 'Divider',
    summary: 'A rule across the column, inside the page gutter. Stripes run edge to edge; this stops where the text does.',
    outline: (b) => (b.type === 'divider' ? `Divider · ${b.height}px` : 'Divider'),
    groups: [
      {
        name: 'Rule',
        open: true,
        controls: [
          { kind: 'number', path: 'block.height', label: 'Thickness', min: 1, max: 12, suffix: 'px' },
          {
            kind: 'number',
            path: 'block.width',
            label: 'Width',
            min: 10,
            max: 100,
            step: 5,
            suffix: '%',
            help: 'Of the column. Under 100 it sits where Align says.',
          },
          { kind: 'select', path: 'block.align', label: 'Align', options: ALIGN },
          {
            kind: 'palette',
            path: 'block.color',
            label: 'Colour',
            zero: 'Rule colour',
            help: 'Named from the palette. Left alone it follows Design › Lists & quotes › Rule, so it matches a rule the team types into rich text.',
          },
        ],
      },
      spacing(),
      background(),
    ],
  },

  freeform: {
    type: 'freeform',
    name: 'Freeform',
    summary: 'A canvas of pictures, text, notes, stamps and drawing, which the email carries as one picture.',
    outline: (b) => (b.type === 'freeform' ? `Freeform · ${b.layers.length} ${b.layers.length === 1 ? 'layer' : 'layers'}` : 'Freeform'),
    groups: [
      {
        name: 'Canvas',
        open: true,
        help: 'Everything on the canvas lives in the canvas. Open it to draw, drop pictures in, stamp and type; the email only ever sees the picture it becomes.',
        controls: [{ kind: 'layers', path: 'block.layers', label: 'Layers' }],
      },
      {
        name: 'Page',
        open: true,
        when: 'canvas',
        help: 'The canvas page, which is the size of the picture. Drag its edges on the canvas, or set it here.',
        controls: [
          { kind: 'number', path: 'block.width', label: 'Width', min: 40, max: 700, suffix: 'px', help: 'Rendered at twice this for retina.' },
          { kind: 'number', path: 'block.height', label: 'Height', min: 20, max: 1200, suffix: 'px' },
          { kind: 'palette', path: 'block.background', label: 'Background', zero: 'Transparent', help: 'Behind everything on the page. Transparent shows the section through the picture.' },
        ],
      },
      {
        name: 'Picture',
        help: 'Render draws the canvas; upload the PNG to HubSpot Files and paste the URL here, the way any image works.',
        controls: [
          { kind: 'text', path: 'block.alt', label: 'Alt text', help: 'What arrives where images are blocked, which is Outlook on Windows and most corporate mail.' },
          { kind: 'render-picture', path: 'block.src', label: 'Render' },
        ],
      },
      { name: 'Appearance', when: 'email', controls: [{ kind: 'select', path: 'block.align', label: 'Align', options: ALIGN }, border(), fill()] },
      { ...spacing(), when: 'email' },
      { ...background(), when: 'email' },
    ],
  },

  brand: {
    type: 'brand',
    name: 'Brand mark',
    summary: 'A brand mark — the monogram, Scugnizzi, the associations — as a picture, in any colour.',
    outline: (b) => (b.type === 'brand' ? (MARKS.find((m) => m.key === b.mark)?.name ?? 'Brand mark') : 'Brand mark'),
    groups: [
      {
        name: 'Content',
        open: true,
        controls: [
          {
            kind: 'select',
            path: 'block.mark',
            label: 'Mark',
            options: MARKS.map((m) => [m.key, m.name] as [string, string]),
            help: 'The bundled marks, from the ink bleed tool’s assets. Drawn live in the colour below; the email carries a picture of it.',
          },
          { kind: 'text', path: 'block.alt', label: 'Alt text', help: 'What arrives where images are blocked.' },
        ],
      },
      {
        name: 'Appearance',
        controls: [
          { kind: 'number', path: 'block.width', label: 'Width', min: 20, max: 600, suffix: 'px', help: 'Rendered at twice this for retina.' },
          { kind: 'select', path: 'block.align', label: 'Align', options: ALIGN },
          { kind: 'palette', path: 'block.color', label: 'Colour', zero: 'Section text', help: 'Named from the palette. Left alone it follows the section’s text colour, so the mark reads on any band.' },
          border(), fill(),
        ],
      },
      {
        name: 'Picture',
        help: 'Render draws the mark; upload the PNG to HubSpot Files and paste the URL here, the way any image works.',
        controls: [{ kind: 'render-picture', path: 'block.src', label: 'Render' }],
      },
      spacing(),
      background(),
    ],
  },

  legal: {
    type: 'legal',
    name: 'Legal footer',
    summary: 'Company, address and unsubscribe. HubSpot will not publish a template without it.',
    outline: () => 'Legal footer',
    groups: [
      {
        name: 'Content',
        open: true,
        help: 'Company name, address and both unsubscribe links come from HubSpot’s own settings.',
        controls: [
          {
            kind: 'select',
            path: 'block.layout',
            label: 'Layout',
            options: [
              ['classic', 'Classic'],
              ['masthead', 'Masthead'],
              ['ledger', 'Ledger'],
              ['stub', 'Stub'],
              ['letterhead', 'Letterhead'],
            ],
            help: 'Classic is the footer as it always was. The other four are the Switchyards email system’s: a centred masthead, a two-column ledger, a one-row stub for short sends, a cream letterhead for a note from a person. Same parts in every one; only the arrangement changes.',
          },
          { kind: 'url', path: 'block.logoSrc', label: 'Logo URL', placeholder: 'https://…', help: 'The picture at the top of the footer: the badge row on navy, the lockup on a letterhead.' },
          { kind: 'number', path: 'block.logoWidth', label: 'Logo width', min: 40, max: 400, suffix: 'px' },
          {
            kind: 'html',
            path: 'block.note',
            label: 'Note',
            help: 'The notice line. Plain text, with **bold** and [a link](https://…) if you like, or HTML written out: a <a>, a <br>, an <em>. In the Switchyards footer: “Please consider the environment and do not print this email. Nobody prints emails.”',
          },
          { kind: 'text', path: 'block.mark', label: 'Mark', placeholder: '© Switchyards U.S.A.', help: 'The colophon mark, set in small letterspaced caps. Blank shows none. Not drawn by the classic layout.' },
          { kind: 'url', path: 'block.instagram', label: 'Instagram', placeholder: 'https://instagram.com/…', help: 'Named in the footer’s small type: on its own line in the masthead and letterhead, a row in the ledger, after the legal links in the stub. Blank leaves it out.' },
          { kind: 'url', path: 'block.youtube', label: 'YouTube', placeholder: 'https://youtube.com/…', help: 'The same, for YouTube.' },
          { kind: 'url', path: 'block.linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/…', help: 'The same, for LinkedIn.' },
        ],
      },
      {
        name: 'Appearance',
        controls: [
          {
            kind: 'select',
            path: 'column.align',
            label: 'Align',
            options: ALIGN,
            help: 'Where the company, address and links sit. Right is the Switchyards footer; a centred one is the more common shape.',
          },
        ],
      },
      { ...sectionSpacing(), controls: [...sectionSpacing().controls, fullWidth()] },
      background(),
      hubspot('block.noteLock', 'Note'),
    ],
  },

  dndarea: {
    type: 'dndarea',
    name: 'Drag and drop area',
    summary: 'A region the team lays out themselves in HubSpot. One per template.',
    outline: (block) => (block.type === 'dndarea' && block.label.trim() ? block.label : 'Drag and drop area'),
    groups: [
      {
        name: 'Default content',
        open: true,
        help: 'Where the team starts before they touch anything. They can add, move and delete all of it, so this is a starting point rather than a layout.',
        controls: [
          {
            kind: 'text',
            path: 'block.label',
            label: 'Area name',
            help: 'What the team sees against this region in HubSpot’s sidebar.',
          },
          { kind: 'dnd', path: 'block.sections', label: 'Sections' },
        ],
      },
      sectionSpacing(),
      background(),
    ],
  },
};

/**
 * What there is to set on a group — one column holding several blocks — when the group itself is
 * selected: the box around all of them, the space around and between them, and the band behind.
 * Every path lands on the column or the section, which is where a group lives.
 */
export const GROUP_GROUPS: Group[] = [
  {
    name: 'Appearance',
    open: true,
    help: 'A box around the whole group, inside the page gutter.',
    controls: [border(), fill()],
  },
  { ...spacing('Space above', 'Space below'), open: true },
  { ...background(), open: true },
];

/** Everything a designer may add, in the order the Add menu shows them. */
export const ADDABLE: BlockType[] = ['heading', 'richtext', 'image', 'brand', 'button', 'freeform', 'divider', 'stripes', 'spacer', 'dndarea', 'topbar', 'legal'];

/**
 * Blocks a template may hold only one of.
 *
 * One entry so far, and it is HubSpot's rule rather than ours: a coded email template may contain
 * exactly one drag and drop area, and a second is rejected at upload. The editor greys out the
 * second insert and lint catches one that arrives another way — through a paste, an import, or a
 * file edited by hand.
 */
export const SINGLETON: BlockType[] = ['dndarea'];

/**
 * The blocks that can share a column — sit inside a column of a multi-column row, or stack with
 * others in one cell.
 *
 * The three that cannot — the top bar, the stripes and the legal footer — each draw their own
 * full-width band, which is the one thing a cell cannot do. Putting one in a column would paint
 * navy across half the email, and no arrangement of the markup makes that mean anything. The
 * compiler reads this list too, so it cannot be asked.
 */
export const STACKABLE: BlockType[] = ['heading', 'richtext', 'image', 'brand', 'button', 'freeform', 'divider', 'spacer', 'topbar'];
export const canStack = (block: Pick<Block, 'type'>): boolean => STACKABLE.includes(block.type);

function firstWords(html: string): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 'Text';
  return text.length > 34 ? `${text.slice(0, 34)}…` : text;
}

// --- creating one ----------------------------------------------------------------------------------

export interface NewBlockContext {
  id(): string;
  /** Every field name already used in this template, so a new one cannot collide. */
  taken: Set<string>;
}

/**
 * A new block, in its own section. Every default here is a decision: a new heading is editable
 * because headings are what the team writes, a new legal footer is locked because a re-upload has
 * to be able to fix it everywhere (learnings 1.7).
 */
export function createBlock(type: BlockType, ctx: NewBlockContext): Block {
  const lock = (label: string, editable = true) => ({
    editable,
    label,
    field: editable ? fieldName(label, ctx.taken) : '',
  });

  return ((): Block => {
    switch (type) {
      case 'heading':
        return { id: ctx.id(), type, lock: lock('Headline'), text: 'Heading', level: 'h1', align: 'left' };
      case 'richtext':
        // The first body a template gets is HubSpot's `email_body` (ids.ts); the ones after it are named for their label.
        return { id: ctx.id(), type, lock: { editable: true, label: 'Body', field: bodyFieldName('Body', ctx.taken) }, html: '<p>Copy goes here.</p>', align: 'left' };
      case 'image':
        return { id: ctx.id(), type, lock: lock('Image'), mode: 'module', src: '', alt: '', href: '', width: 560, align: 'center', optional: true };
      case 'button':
        return { id: ctx.id(), type, lock: lock('Button text (blank to hide)'), link: lock('Button link'), text: 'Read more', href: '', style: 'primary', align: 'center' };
      case 'topbar':
        return { id: ctx.id(), type, lock: lock('Top bar tagline'), text: 'A TAGLINE.', align: 'center' };
      case 'stripes':
        return { id: ctx.id(), type, stripes: [{ color: 'redBright', height: 4 }, { color: 'offwhite', height: 2 }] };
      case 'spacer':
        return { id: ctx.id(), type, height: 24 };
      case 'divider':
        // Null follows the design system's rule colour, so this and an `<hr>` the team types agree.
        return { id: ctx.id(), type, height: 2, color: null, width: 100, align: 'center' };
      case 'brand':
        return { id: ctx.id(), type, mark: 'sy', alt: 'Switchyards', width: 120, align: 'center', color: null, src: '' };
      case 'freeform':
        // One text layer to start from, so the surface is never a blank nobody can find.
        return {
          id: ctx.id(),
          type,
          alt: 'Freeform',
          width: 560,
          height: 280,
          background: null,
          layers: [{ kind: 'text', id: 'l1', text: 'Freeform', role: 'h2', color: null, x: 24, y: 24, width: 512, align: 'left' }],
          src: '',
          align: 'center',
        };
      case 'legal':
        // Locked by default: anything that must stay current across every future send is rendered
        // by the template, not copied into each email (learnings 1.7).
        return { id: ctx.id(), type, logoSrc: '', logoWidth: 180, note: '', noteLock: lock('Legal note', false) };
      case 'dndarea':
        // No `lock`. Every other block's editability is a field the team fills in; this one hands
        // over the layout itself, which is not a lock and deliberately does not pretend to be one.
        //
        // The name goes through the same allocator as a field name, because both end up as
        // identifiers in one template and a collision between them is HubSpot's problem to hit.
        return { id: ctx.id(), ...newDndArea(fieldName('Email body', ctx.taken)) };
    }
  })();
}

/**
 * A new block, in its own section, on **this template's** presets.
 *
 * `ds` is the template's design system, and it has to be: the first version read the shipped
 * defaults, so a heading dropped into a template built on another palette arrived on cream with
 * navy text — the one section in the email that ignored the system, and it was every new one.
 *
 * The top bar and the footer start on the first preset that paints a band; everything else starts
 * on the first preset there is. Named from the system rather than as `navy` and `cream`, for the
 * same reason (learnings 3.34).
 */
export function createSection(type: BlockType, ctx: NewBlockContext, ds: DesignSystem = DEFAULT_DESIGN_SYSTEM): Section {
  return sectionFor(createBlock(type, ctx), ctx, ds);
}

/**
 * A section of its own around a block that already exists — one pasted in, or one lifted out of
 * a column. The same shape a new block gets, so a pasted heading and a dropped heading are the
 * same thing in the document.
 */
export function sectionFor(block: Block, ctx: NewBlockContext, ds: DesignSystem = DEFAULT_DESIGN_SYSTEM): Section {
  const type = block.type;
  const topOrLegal = type === 'topbar' || type === 'legal';
  const preset = topOrLegal ? bandedPreset(ds) : firstPreset(ds);
  const t = themeTokens(ds, preset);

  const column: Column = {
    id: ctx.id(),
    span: 12,
    padTop: topOrLegal ? 0 : 10,
    padBottom: type === 'richtext' ? 0 : topOrLegal ? 0 : 10,
    align: type === 'topbar' ? 'center' : type === 'legal' ? 'right' : ('left' as Align),
    blocks: [block],
  };
  const row: Row = { id: ctx.id(), mobile: 'stack', columns: [column] };

  // Stripes paint their own bands and sit on nothing; everything else sits on its preset.
  const bare = type === 'stripes';
  return {
    id: ctx.id(),
    theme: preset,
    bandColor: bare ? null : t.band,
    containerColor: bare ? null : t.container,
    textColor: t.text,
    linkColor: t.link,
    padTop: type === 'topbar' ? 16 : type === 'legal' ? 30 : 0,
    padBottom: type === 'topbar' ? 12 : type === 'legal' ? 10 : 0,
    ...(type === 'legal' ? { domId: 'section-legal' } : {}),
    rows: [row],
  };
}
