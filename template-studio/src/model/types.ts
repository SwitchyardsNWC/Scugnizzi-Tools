// The document. Everything the editor manipulates and the compiler consumes is one of these.
//
// The tree is Template -> Section -> Row -> Column -> Block (plan.md, "Layout tree"). Two things
// that were per-block in v1 have moved up where they belong: background colour lives on the Section,
// padding lives on the Column. A v1 design imports into exactly that shape without loss, because
// v1's own `section(cell(...))` was already a section wrapping a padded cell.

import type { ButtonStyle, ColorRef, DesignSystem, HeadingLevel } from './design-system.ts';

export type Align = 'left' | 'center' | 'right';

/**
 * Where a row's columns go on a phone. plan.md, "Row".
 *
 * `stack` is the default and is what a phone needs almost always. `side-by-side` keeps the columns
 * next to each other, which is right for a pair of small things — two logos, two short buttons —
 * and wrong for anything with a paragraph in it.
 *
 * plan.md also lists `stack-reverse`. It is deliberately not here: reversing on a phone means
 * emitting the columns backwards and restoring the order on desktop with `direction:rtl`, and
 * Word's engine does not honour that on a table row — so the one client nobody can check would
 * silently render it the wrong way round. Swapping the two columns in the editor does the same job
 * and is visible while you do it.
 */
export type MobileBehaviour = 'stack' | 'side-by-side';

/**
 * A HubSpot field name. Generated once from the label, stored against the block, and then frozen —
 * renaming a field in the template orphans whatever the team already typed into the old one
 * (learnings 1.10). Nothing may re-derive this from a label after creation.
 */
export type FieldName = string;

/**
 * Editability, on the one kind of thing that can carry it. Only content — text, rich text, images,
 * links — is ever unlockable; style, spacing and alignment are permanently designer-owned
 * (architecture.md §1, learnings 3.10). There is deliberately no lock on a padding value.
 */
export interface Lock {
  editable: boolean;
  /** What the team reads in the Contents panel. Microcopy, not a variable name (learnings 1.10). */
  label: string;
  /** Stable. See FieldName. */
  field: FieldName;
}

export interface Preview {
  company: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface Template {
  schema: number;
  id: string;
  /** Display and file name. */
  name: string;
  /** The `label:` in the annotation comment HubSpot reads (learnings 1.1). */
  hubspotLabel: string;
  /** Shows around the 600px column, and in the inset phone mail apps draw (learnings 2.4). */
  pageBackground: string;
  /** Emit the three dark-mode layers (learnings 2.5). */
  forceLight: boolean;
  /**
   * The design system this template compiles against. Absent means the defaults, which is what
   * every document written before the design panel existed says — so a missing field is a valid
   * document rather than a migration.
   *
   * It lives on the template rather than in the folder, and that is a limitation, named: a real
   * design system is one file every template resolves against, and changing `h1` there should move
   * every email at once. That needs a second file in the workspace with its own load, save and
   * conflict path. Until it exists, "design system" here means "this template's", and the panel
   * says so rather than implying otherwise.
   */
  ds?: DesignSystem;
  /**
   * The folder's design system this template follows, by name: `design-systems/<name>.system.json`
   * in the workspace. While it names one, `ds` is that system materialised on open and is never
   * written into this template's own file — every edit to it goes back to the folder's file, so
   * every template that names the same system moves together. That is the shared system the
   * comment above says was not built; it is the layer on top of `ds`, not a replacement for it.
   * Absent means the template's own `ds`, or the shipped values.
   */
  designSystem?: string;
  /** Sample values for the CAN-SPAM variables, used in preview mode only. */
  preview: Preview;
  sections: Section[];
}

export interface Section {
  id: string;
  /**
   * The design-system preset this section's colours came from, remembered by name so the inspector
   * can offer "Background: navy" rather than four colour pickers, and so changing the preset moves
   * band, container, text and link together.
   *
   * The four resolved colours below stay authoritative — the compiler never looks the theme up.
   * That is a deliberate simplification of plan.md's "resolve at export": it costs a stale value if
   * someone edits the design system, and buys an editor that does not need the token layer to exist
   * yet. Revisit in step 5, when the design-system editor makes the difference real.
   */
  theme?: string;
  /** Full-width band behind the container. Null lets the page background show. */
  bandColor: string | null;
  /** The 600px container itself. Null is transparent. */
  containerColor: string | null;
  textColor: string;
  linkColor: string;
  /** Vertical padding on the container. Horizontal is always zero — full bleed (learnings 2.4). */
  padTop: number;
  padBottom: number;
  /** A stable DOM id, when a section needs to be targeted from the stylesheet (e.g. section-legal). */
  domId?: string;
  /**
   * Set when this section was placed from a folder pattern, and which version of it. The content
   * is a *copy* — the template compiles alone, with no dependency at export — and the marker is
   * what lets the editor say "the pattern has moved on" and offer the new version, or a detach.
   */
  pattern?: { id: string; version: number };
  rows: Row[];
}

export interface Row {
  id: string;
  mobile: MobileBehaviour;
  columns: Column[];
}

export interface Column {
  id: string;
  /**
   * The column's share of the row, relative to its siblings. Twelfths from the ratio presets;
   * percentages after a divider has been dragged on the canvas. The compiler divides by the
   * row's total, so the unit is whatever the row's columns agree on.
   */
  span: number;
  padTop: number;
  padBottom: number;
  /**
   * Side padding, when this block departs from Design › Page padding.
   *
   * Absent — or null, which the inspector writes when you hand a side back — means "follow the
   * page", and that is the normal case: one gutter is one decision about the email, and sixteen
   * blocks each carrying their own 20 is sixteen chances to disagree (learnings 3.42).
   *
   * These two used to be required, set to 20 by every constructor, and read by nothing. Schema 6
   * strips them for exactly that reason: a number nobody read must not become authoritative just
   * because the compiler started reading it.
   */
  padLeft?: number | null;
  padRight?: number | null;
  /**
   * A box drawn around what is in this column — the probe template's look, and the reason it
   * exists: a rule, a card, a callout.
   *
   * On the column rather than the block, for the same reason the padding is: it is a decision
   * about the space the block sits in. Two blocks sharing a column share one box, which is what
   * you want and is also the only thing that can be true, since the box is drawn once around the
   * column's contents.
   *
   * Zero width is no box and emits nothing at all, which is every column anybody has not asked.
   */
  borderWidth?: number;
  borderColor?: ColorRef;
  /** Rounded corners. Outlook squares these off and honours the border, which is the usual split. */
  borderRadius?: number;
  /** The gap between the box and what is inside it. */
  borderPad?: number;
  /**
   * Space between the blocks when this column holds more than one.
   *
   * Absent — or null — follows Design › Between blocks, for the same reason the sides follow the
   * page gutter: one rhythm for the email, departed from on purpose. A Spacer block in the stack
   * replaces the gap on both sides of it, so a designer who wants forty pixels under one heading
   * asks for forty and gets forty, not forty plus the gap.
   */
  gap?: number | null;
  align: Align;
  /**
   * Drop this column below the phone breakpoint.
   *
   * A per-column switch rather than a row-level one because that is how it is actually used: a
   * two-column row with a decorative image beside the copy wants the image gone on a phone and the
   * copy kept, and the row has no opinion about which is which.
   */
  hideOnPhone?: boolean;
  blocks: Block[];
}

// ---------------------------------------------------------------------------------------------
// Blocks

export type Block =
  | TopbarBlock
  | StripesBlock
  | SpacerBlock
  | DividerBlock
  | ImageBlock
  | HeadingBlock
  | RichTextBlock
  | ButtonBlock
  | FreeformBlock
  | BrandBlock
  | LegalBlock;

export type BlockType = Block['type'];

interface BlockBase {
  id: string;
}

// A note that applies to the four blocks below.
//
// None of them carries a size, a line height or a colour any more. Those went to the design system
// on 2026-09-11, at Jared's direction: "appearance options should be limited to alignment, since
// size, line height, color should be chosen in the design panel."
//
// It is the right shape for the same reason a preset names a colour rather than repeating one
// (learnings 3.12). A size on a block is a value with no name, invisible from anywhere except that
// block, and sixteen of them is not a type scale — it is sixteen chances to drift. What a block
// still decides is what it *is* (a heading's level, a button's variant) and where it sits
// (alignment), because those are the things that genuinely differ block to block.

/**
 * The tagline band: small uppercase text on its section's preset, sized by the `topbar` role.
 *
 * It can share a cell now (learnings 3.65): a top bar with the tagline on the left and a
 * "view in browser" on the right is a two-column row on the dark preset holding two of these.
 * Absent `align` is centred and absent `href` is no link, which is every top bar written before.
 */
export interface TopbarBlock extends BlockBase {
  type: 'topbar';
  lock: Lock;
  text: string;
  align?: Align;
  /** Wraps the tagline in a link when set. */
  href?: string;
}

/**
 * Two full-width rules. Thickness 0 drops one, so this doubles as a single line.
 *
 * The colour is a `ColorRef` like everywhere else, not a raw hex. It was a hex until Jared tried to
 * delete a palette entry: the standard email paints three stripes in `#d20000`, and because the
 * block held the literal rather than the name, the palette reported that colour as used by nothing
 * and offered to remove it. A token nothing can be seen to reference is not a token.
 */
export interface StripesBlock extends BlockBase {
  type: 'stripes';
  stripes: Array<{ color: ColorRef; height: number }>;
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  height: number;
}

/**
 * A rule across the column — inside the page gutter, where Stripes run edge to edge.
 *
 * The two are different blocks because they answer different questions. Stripes are a band: the
 * brand's red-and-cream lines under the top bar, full bleed, drawn on the section. A divider is
 * punctuation between two paragraphs, and stops where the text does.
 *
 * The colour is a palette reference like the stripes' (learnings 3.34), and null follows the
 * design system's rule colour — so a divider a designer drops and an `<hr>` the team types into
 * rich text are the same line unless somebody says otherwise.
 */
export interface DividerBlock extends BlockBase {
  type: 'divider';
  /** Thickness, in pixels. */
  height: number;
  color: ColorRef;
  /** Percent of the column it spans. Under 100, `align` says where it sits. */
  width: number;
  align: Align;
}

/**
 * How an image reaches HubSpot.
 *  - 'module' uses @hubspot/image_email, which gives the team HubSpot's own picker. Whether its
 *    link reaches the template is Phase 0 question A and is NOT settled (learnings 1.6).
 *  - 'field' is the older shape: a picker plus a separate text field for the URL.
 *  - 'static' is a locked image the template renders itself.
 */
export type ImageMode = 'module' | 'field' | 'static';

export interface ImageBlock extends BlockBase {
  type: 'image';
  lock: Lock;
  mode: ImageMode;
  src: string;
  alt: string;
  href: string;
  /** Display width. Never the natural width of the file — v1 shipped that bug (learnings 2.9). */
  width: number;
  align: Align;
  /** Leave the block out of the send entirely until an image is picked (learnings 2.11). */
  optional: boolean;
  /**
   * The heading or rich text this image was rendered from, kept so it can go back.
   *
   * Present only on a block that was *converted* — a picture of type, made because Outlook rounds
   * line heights, ignores letter spacing and substitutes fonts, and a picture does none of those
   * things. It is not a cache: the image is the thing that ships, and this is the source that made
   * it, so re-rendering after a type change is possible and so is changing your mind.
   *
   * It costs bytes in the `.template.json` and none in the email. Absent on every image anybody
   * dropped, which is almost all of them.
   */
  wasText?: HeadingBlock | RichTextBlock;
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  lock: Lock;
  text: string;
  /** Which type role renders it. This is what the block *is*, not how it looks. */
  level: HeadingLevel;
  align: Align;
}

export interface RichTextBlock extends BlockBase {
  type: 'richtext';
  lock: Lock;
  html: string;
  align: Align;
}

// The variant a button reaches for. Defined with the tokens, because that is where the thing it
// names actually lives.
export type { ButtonStyle } from './design-system.ts';

export interface ButtonBlock extends BlockBase {
  type: 'button';
  /** The label. Blank in HubSpot hides the whole block (learnings 2.11). */
  lock: Lock;
  /** The href. Its own field, declared immediately after the label so they sit together (1.4). */
  link: Lock;
  text: string;
  href: string;
  /** Which button role renders it. Everything about its shape lives on that role. */
  style: ButtonStyle;
  align: Align | 'full';
}

/** What every layer carries: its id, its turn about its own centre, and the group it moves with. */
interface LayerBase {
  id: string;
  rotation?: number;
  /** Strokes drawn in one marker session share one, and move, scale, colour and delete as one. */
  group?: string;
}

/**
 * One layer of a freeform block. Every kind is a recipe that becomes pixels, and none is added
 * until it renders identically on export (docs/freeform-and-effects.md). Positions and sizes are
 * in the surface's own pixels.
 *
 * `look` on text names a style from Design › Canvas type: playful type that only ever ships as a
 * picture (learnings 3.68). Absent, the text is set in its email type role.
 */
export type FreeformLayer =
  | (LayerBase & { kind: 'text'; text: string; role: string; color: ColorRef; x: number; y: number; width: number; align: Align; look?: string })
  | (LayerBase & { kind: 'image'; src: string; x: number; y: number; width: number; height: number; opacity: number })
  | (LayerBase & { kind: 'rect'; x: number; y: number; width: number; height: number; fill: ColorRef; stroke: ColorRef; strokeWidth: number; radius: number })
  | (LayerBase & { kind: 'ellipse'; x: number; y: number; width: number; height: number; fill: ColorRef; stroke: ColorRef; strokeWidth: number })
  | (LayerBase & { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: ColorRef; strokeWidth: number })
  | (LayerBase & { kind: 'path'; points: number[]; stroke: ColorRef; strokeWidth: number })
  | (LayerBase & { kind: 'sticky'; text: string; role: string; color: ColorRef; fill: ColorRef; x: number; y: number; width: number; height: number })
  | (LayerBase & { kind: 'mark'; mark: string; color: ColorRef; x: number; y: number; width: number; height: number });

/**
 * A drawing surface — images, text and simple shapes — that the email carries as one picture.
 *
 * The layers are the recipe and the picture is rendered from them: on the canvas the recipe is
 * drawn live, and the export carries `src`, the rendered PNG once it is hosted. `renderedHash` is
 * the recipe the picture was made from; a picture whose hash no longer matches is stale, which
 * the checks say rather than the export shipping it (learnings 3.65).
 */
export interface FreeformBlock extends BlockBase {
  type: 'freeform';
  /** What arrives where images are blocked. Not a HubSpot field: the picture is the template's. */
  alt: string;
  width: number;
  height: number;
  background: ColorRef;
  /** Bottom to top. */
  layers: FreeformLayer[];
  /** The rendered picture: a file under `assets/rendered/` straight after rendering, a hosted URL once uploaded. */
  src: string;
  renderedHash?: string;
  align: Align;
}

/**
 * A brand mark — the SY monogram, Scugnizzi, the club associations — as a picture, in a colour.
 *
 * An image block that knows what it shows: the mark is one of the bundled SVGs (model/marks.ts),
 * drawn live on the canvas in the block's colour, and carried in the email as a PNG rendered from
 * it, the same way a freeform block is (learnings 3.66). `src` and `renderedHash` mean what they
 * mean there.
 */
export interface BrandBlock extends BlockBase {
  type: 'brand';
  /** A key in `MARKS`. */
  mark: string;
  alt: string;
  width: number;
  align: Align;
  /** The ink. Null follows the section's text colour, so a mark on the dark band is light. */
  color: ColorRef;
  src: string;
  renderedHash?: string;
}

/** Company, address, unsubscribe. Locked by default — a re-upload must fix every future send (1.7). */
export interface LegalBlock extends BlockBase {
  type: 'legal';
  logoSrc: string;
  logoWidth: number;
  note: string;
  noteLock: Lock;
}
