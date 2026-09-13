// The design system. Named roles, not raw values (plan.md, "Design system (tokens)").
//
// The defaults below are v1's values, which is deliberate: plan.md says v1's values seed the first
// design system, and the type scale in particular was tuned over several rounds of feedback
// (learnings 2.13). Getting back to it from scratch would cost the same rounds again.
//
// Templates reference tokens by name and resolve at export. A block may override with a literal;
// the inspector flags it so overrides stay deliberate rather than accidental.

export interface TypeStyle {
  size: number;
  /** Percent. */
  lineHeight: number;
  weight: 'normal' | 'bold';
  /** Below the 639px breakpoint (learnings 2.3). */
  mobileSize: number;
  /** Bottom margin. Headings in body copy need real margins (brief.md, Jared's words). */
  marginBottom: number;
  uppercase?: boolean;
  /**
   * Tracking, in pixels. Absent or zero is `normal`.
   *
   * Pixels rather than the `em` the defaults used to carry, because a dial is a number and a
   * designer thinks in the units the rest of the panel is in. It stops scaling with the size, which
   * for a role whose size is itself a token is a difference nobody will notice.
   */
  letterSpacing?: number;
  /**
   * A key of `ds.fonts`. Absent means the email's default stack.
   *
   * A name rather than a stack, for the reason in learnings 3.12: a role that stored
   * `'Georgia, Times New Roman, serif'` would be a second copy of a value the system already holds,
   * and the two would drift the first time somebody added a fallback to one of them.
   */
  font?: string;
  /**
   * A key of `ds.colors`, or a literal hex. Absent means the colour of the section it sits in,
   * which is almost always what a heading should do — a role that pins its own colour stops being
   * readable the moment it lands on the navy band.
   */
  color?: ColorRef;
}

/**
 * A reference to a colour: the *name* of a palette entry, a literal `#hex`, or null for none.
 *
 * Names are the point (plan.md, "Design system (tokens)": named roles, not raw values). A preset
 * that stored `#d10000` would duplicate the palette, and changing the brand red would move the
 * buttons while leaving every link behind — which is exactly the bug this type exists to prevent.
 * A literal is still allowed, because an override is sometimes the right answer; it simply stops
 * following the palette, and the panel shows it as a literal rather than as a role.
 */
export type ColorRef = string | null;

/**
 * Which button role a preset reaches for.
 *
 * Named for what they are rather than what colour they happen to be: the pair used to be `red` and
 * `white`, which stopped being true the moment either one could be recoloured.
 */
export type ButtonStyle = 'primary' | 'secondary';

/** A section preset: the band, the container, and the text and link colours that go with them. */
export interface ThemeTokens {
  /** Full-width band behind the container. Null lets the page background through. */
  band: ColorRef;
  /** The 600px container. Null is transparent. */
  container: ColorRef;
  text: ColorRef;
  link: ColorRef;
  button: ButtonStyle;
}

/** A preset with its references resolved, which is all the compiler and the document ever see. */
export interface ResolvedTheme {
  band: string | null;
  container: string | null;
  text: string;
  link: string;
  button: ButtonStyle;
}

/**
 * A button style, end to end.
 *
 * Every number here was a literal in v1's compiler — `border-radius:25px`, `12px 18px`, `16`, and a
 * `#FFFFFF` that was uppercase in one place and lowercase two lines below it. They stayed literals
 * while v1's output was the gate, because moving one broke the byte diff. They are tokens now.
 *
 * The two variants have different padding and different sizes, which is itself a v1 artefact — the
 * white one was drawn for a footer. That is now a thing a designer can fix rather than a thing they
 * have to work around.
 */
export interface ButtonTokens {
  fill: ColorRef;
  ink: ColorRef;
  /** Renamed from `edge`, 2026-09-11 — it is a border, and calling it anything else was cleverness. */
  border: ColorRef;
  radius: number;
  /**
   * Below the phone breakpoint. Zero means "the same".
   *
   * Worth a token of its own rather than being dropped with the other per-block sizes: an 18px
   * label wraps inside a narrow column on a phone, and a wrapped button reads as broken rather
   * than as small (learnings 2.10).
   */
  mobileSize: number;
  /** Vertical padding. Also goes into `mso-padding-alt`, which is how Outlook gets it. */
  padY: number;
  padX: number;
  size: number;
  borderWidth: number;
}

/**
 * The things the team can make in HubSpot's rich text editor that are not a paragraph.
 *
 * Lists, quotes and rules were hard-coded numbers in the stylesheet — `22px`, `135%`, `3px solid`,
 * `2px solid` — which meant a designer could set the type scale and then had no say over what a
 * bulleted list actually looked like. They are the parts of an email nobody designs until somebody
 * pastes one in.
 */
export interface RichTextTokens {
  /** How far a list is indented. Margin, not padding: Outlook ignores padding on a `ul`. */
  listIndent: number;
  /** Space between items. */
  listGap: number;
  /** Line height for list items, as a percentage — usually tighter than reading text. */
  listLineHeight: number;
  /** The bar down the side of a quote. Zero removes it. */
  quoteBar: number;
  quoteColor: ColorRef;
  /** Space between that bar and the words. */
  quoteInset: number;
  quoteItalic: boolean;
  /** A horizontal rule the team drops in. */
  ruleWidth: number;
  ruleColor: ColorRef;
}

/**
 * Every image in the template, before the block says anything.
 *
 * Width stays on the block — every image is a different shape, so there is no role it could belong
 * to (types.ts) — but the frame around it is a template-wide decision, and `defaultWidth` is what a
 * newly dropped Image starts at.
 */
export interface ImageTokens {
  /** Rounded corners. Honoured everywhere except Outlook, which squares them off. */
  radius: number;
  borderWidth: number;
  borderColor: ColorRef;
  defaultWidth: number;
}

/** What a canvas type style does beyond the letters. Every one of them survives becoming a picture. */
export type CanvasEffect = 'none' | 'outline' | 'shadow' | 'highlight' | 'sticker' | 'wobble' | 'arc';

export const CANVAS_EFFECTS: Array<[CanvasEffect, string]> = [
  ['none', 'Plain'],
  ['outline', 'Outline'],
  ['shadow', 'Hard shadow'],
  ['highlight', 'Highlighter'],
  ['sticker', 'Sticker'],
  ['wobble', 'Wobble'],
  ['arc', 'Arc'],
];

/**
 * A text style for the freeform canvas. Its own category, because it follows none of the email's
 * rules: it only ever ships inside a picture, so it can do what email type cannot — a thick outline,
 * a hard offset shadow, a highlighter stroke, a sticker's white border, letters that wobble, a line
 * that bends (learnings 3.68).
 */
export interface CanvasTextStyle {
  label: string;
  /** A key of `fonts`. Absent means the email's default stack. */
  font?: string;
  size: number;
  weight: 'normal' | 'bold';
  /** Percent. */
  lineHeight: number;
  uppercase?: boolean;
  italic?: boolean;
  letterSpacing?: number;
  color: ColorRef;
  effect: CanvasEffect;
  /** The outline, the shadow, the highlight or the sticker border. Null picks one that reads. */
  effectColor: ColorRef;
  /** How much, 0 to 100: an outline's width, a shadow's offset, a wobble's swing, an arc's bend. */
  amount: number;
}

export const DEFAULT_CANVAS_TYPE: Record<string, CanvasTextStyle> = {
  marker: { label: 'Marker', size: 34, weight: 'bold', lineHeight: 105, italic: true, color: null, effect: 'wobble', effectColor: null, amount: 28 },
  sticker: { label: 'Sticker', size: 30, weight: 'bold', lineHeight: 112, uppercase: true, letterSpacing: 1, color: null, effect: 'sticker', effectColor: '#ffffff', amount: 40 },
  outline: { label: 'Outline', size: 46, weight: 'bold', lineHeight: 100, uppercase: true, color: '#00000000', effect: 'outline', effectColor: null, amount: 30 },
  retro: { label: 'Retro', font: 'georgia', size: 40, weight: 'bold', lineHeight: 104, color: null, effect: 'shadow', effectColor: '#FFB000', amount: 40 },
  highlight: { label: 'Highlighter', size: 24, weight: 'bold', lineHeight: 135, color: null, effect: 'highlight', effectColor: '#FFE58A', amount: 55 },
  arc: { label: 'Arc', size: 24, weight: 'bold', lineHeight: 100, uppercase: true, letterSpacing: 3, color: null, effect: 'arc', effectColor: null, amount: 45 },
};

/** The system's canvas type, or the shipped styles for a system that has never set any. */
export function canvasTypeOf(ds: DesignSystem): Record<string, CanvasTextStyle> {
  return ds.canvasType && Object.keys(ds.canvasType).length ? ds.canvasType : DEFAULT_CANVAS_TYPE;
}

export interface DesignSystem {
  version: number;
  colors: Record<string, string>;
  richText: RichTextTokens;
  image: ImageTokens;
  /** Keyed by `ButtonStyle`: the variant a block picks. */
  buttons: Record<string, ButtonTokens>;
  themes: Record<string, ThemeTokens>;
  type: Record<string, TypeStyle>;
  space: Record<string, number>;
  /**
   * The email's outer width — the band, the stripes and the footer included, not just the text
   * column. 600px is the number every client agrees about; 320 is a receipt.
   */
  containerWidth: number;
  /**
   * The gutter between that outer edge and the content, on both sides.
   *
   * A token rather than a number on every column, because it is one decision about the email and
   * not sixteen decisions about blocks. Together with the width it is what sets the measure — the
   * line length the copy actually gets.
   */
  pagePadding: number;
  /**
   * The space between blocks that share a column — a heading over its paragraph over its button,
   * inside one card. One rhythm for the email, like the gutter; a column departs from it by being
   * given a number of its own.
   */
  blockGap: number;
  pageBackground: string;
  /**
   * A frame around the whole email, drawn outside every band — the navy top bar and the footer
   * included, because it is the email's edge and not a section's.
   *
   * Zero by default, and the default is what every existing template compiles to: the frame's
   * markup is only emitted when the width is above zero, so an email that does not ask for one is
   * byte-identical to the one this project shipped.
   */
  pageBorderWidth: number;
  /** The frame's colour. Named from the palette, so recolouring the brand moves it. */
  pageBorderColor: ColorRef;
  /**
   * Space between the email and the edge of the message area, on all four sides.
   *
   * The page background shows through it. It deliberately gives up full bleed on phones
   * (learnings 2.4) — which is the point of a receipt or a card, and the reason it is zero unless
   * somebody asks.
   */
  pageMargin: number;
  /** The email's default stack, used by everything that is not a type role with its own. */
  fontStack: string;
  /** The stacks a role may name. Email has no webfonts worth relying on — this is what is installed. */
  fonts: Record<string, string>;
  /** Playful type for the freeform canvas. Absent means the shipped styles. See `CanvasTextStyle`. */
  canvasType?: Record<string, CanvasTextStyle>;
  /**
   * The phone breakpoint, in pixels. Stored as a number rather than as a finished media query
   * because the compiler needs both sides of it — `max-width:639px` for the phone rules and
   * `min-width:640px` for the desktop ones — and two strings that must stay one apart is a bug
   * waiting to be typed.
   */
  mobileBreakpoint: number;
}

export const DEFAULT_DESIGN_SYSTEM: DesignSystem = {
  version: 1,
  colors: {
    navy: '#011272',
    red: '#d10000',
    redBright: '#d20000',
    cream: '#f7f6f3',
    offwhite: '#fcfff5',
    white: '#ffffff',
  },
  // The shipped values are what the compiler used to hard-code, to the pixel.
  richText: {
    listIndent: 22,
    listGap: 4,
    listLineHeight: 135,
    quoteBar: 3,
    quoteColor: 'red',
    quoteInset: 16,
    quoteItalic: true,
    ruleWidth: 2,
    ruleColor: 'red',
  },
  image: { radius: 0, borderWidth: 0, borderColor: 'navy', defaultWidth: 560 },
  buttons: {
    primary: { fill: 'cream', ink: 'red', border: 'red', radius: 25, padY: 12, padX: 18, size: 16, mobileSize: 0, borderWidth: 2 },
    secondary: { fill: 'navy', ink: 'white', border: 'white', radius: 25, padY: 9, padX: 17, size: 13, mobileSize: 0, borderWidth: 2 },
  },
  themes: {
    cream: { band: null, container: 'cream', text: 'navy', link: 'red', button: 'primary' },
    navy: { band: 'navy', container: null, text: 'offwhite', link: 'offwhite', button: 'secondary' },
    offwhite: { band: 'offwhite', container: null, text: 'navy', link: 'red', button: 'primary' },
  },
  // learnings 2.13, verbatim. Changing any of these is a design decision, not a refactor.
  type: {
    h1: { size: 38, lineHeight: 120, weight: 'bold', mobileSize: 30, marginBottom: 16 },
    h2: { size: 22, lineHeight: 125, weight: 'bold', mobileSize: 20, marginBottom: 12 },
    h3: { size: 17, lineHeight: 130, weight: 'bold', mobileSize: 17, marginBottom: 10 },
    h4: { size: 15, lineHeight: 135, weight: 'bold', mobileSize: 15, marginBottom: 8 },
    h5: { size: 14, lineHeight: 135, weight: 'bold', mobileSize: 14, marginBottom: 8, uppercase: true, letterSpacing: 0.6 },
    h6: { size: 12, lineHeight: 135, weight: 'bold', mobileSize: 12, marginBottom: 8, uppercase: true, letterSpacing: 0.7 },
    body: { size: 18, lineHeight: 150, weight: 'normal', mobileSize: 17, marginBottom: 16 },
    // The top bar's tagline. A role rather than two numbers on the block, because there is one top
    // bar per email and "how big is the tagline" is a decision about the template.
    topbar: { size: 12, lineHeight: 110, weight: 'bold', mobileSize: 10, marginBottom: 0, uppercase: true },
  },
  space: { s: 10, m: 20, l: 40 },
  containerWidth: 600,
  pagePadding: 20,
  blockGap: 16,
  pageBackground: '#f7f6f3',
  pageBorderWidth: 0,
  pageBorderColor: 'navy',
  pageMargin: 0,
  fontStack: 'Helvetica, Arial, sans-serif',
  fonts: {
    helvetica: 'Helvetica, Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    georgia: 'Georgia, Times New Roman, serif',
    times: 'Times New Roman, Times, serif',
    verdana: 'Verdana, Geneva, sans-serif',
    tahoma: 'Tahoma, Verdana, sans-serif',
    courier: 'Courier New, Courier, monospace',
  },
  mobileBreakpoint: 639,
};

/**
 * A system read from a folder file, made whole.
 *
 * A file written by an older build has no key for a token added since, and `border:${undefined}px`
 * is a frame nobody asked for (the same reasoning as the schema 4 migration). Top-level keys the
 * file lacks come from the shipped values; what the file does say is taken as it is.
 */
export function completeDesignSystem(raw: unknown): DesignSystem {
  const base = structuredClone(DEFAULT_DESIGN_SYSTEM);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  return { ...base, ...(raw as Partial<DesignSystem>) };
}

/** Resolves one reference. A `#hex` passes through; a name looks up; anything unknown is nothing. */
export function colorOf(ds: DesignSystem, ref: ColorRef): string | null {
  if (!ref) return null;
  if (ref.startsWith('#')) return ref;
  return ds.colors[ref] ?? null;
}

/** The preset, by name, with every reference resolved. Unknown presets fall back to cream. */
export function theme(ds: DesignSystem, name: string): ResolvedTheme {
  // Falls back to whatever the system's *first* preset is, not to one called `cream`. A preset can
  // be renamed or removed now, and a fallback naming a key that may not exist is the bug this whole
  // file keeps producing.
  const t = ds.themes[name] ?? Object.values(ds.themes)[0] ?? DEFAULT_DESIGN_SYSTEM.themes['cream']!;
  return {
    band: colorOf(ds, t.band),
    container: colorOf(ds, t.container),
    // Text and a link have to land somewhere: a section with no text colour renders as whatever
    // the client decides, which in dark mode is not a colour anyone chose.
    text: colorOf(ds, t.text) ?? '#000000',
    link: colorOf(ds, t.link) ?? '#000000',
    button: t.button,
  };
}

/** One button variant, resolved. Falls back to red, which is the one every theme but navy uses. */
export function buttonOf(ds: DesignSystem, style: string): ButtonTokens & { fill: string; ink: string; border: string } {
  const t = ds.buttons[style] ?? ds.buttons['primary'] ?? DEFAULT_DESIGN_SYSTEM.buttons['primary']!;
  return {
    ...t,
    fill: colorOf(ds, t.fill) ?? '#ffffff',
    ink: colorOf(ds, t.ink) ?? '#000000',
    border: colorOf(ds, t.border) ?? '#000000',
  };
}

/** The name of the preset a new section starts on: the first one the system defines. */
export const firstPreset = (ds: DesignSystem): string => Object.keys(ds.themes)[0] ?? 'cream';

/**
 * The preset the top bar and the legal footer start on: the first one that paints a band.
 *
 * Those two blocks are the email's furniture, and furniture wants the dark band — but `navy` is a
 * name this project's palette happens to use, and a template built on an imported system may call
 * it `ink`, or `charcoal`, or have nothing of the kind. "The first preset with a band" is the
 * closest thing to the question actually being asked. A system with no banded preset gets its
 * first one, which is at least a preset it has, rather than a name it does not.
 */
export function bandedPreset(ds: DesignSystem): string {
  const names = Object.keys(ds.themes);
  return names.find((name) => ds.themes[name]?.band) ?? names[0] ?? 'cream';
}

/** The palette, in the order a brand thinks about it. Used by the panel and by the preset picker. */
export const PALETTE_ORDER = ['navy', 'red', 'cream', 'offwhite', 'white'] as const;

// --- what the compiler asks the design system for -------------------------------------------------
//
// Everything below turns tokens into the exact strings the output carries. They live here rather
// than in the compiler because the point of a design system is that one value reaches every place
// it belongs, and the only way to keep that true is for those places to share a single source.
//
// Each of these reproduces, byte for byte, what the compiler used to hard-code. That is checked:
// `tests/design-system.test.ts` compiles with the defaults and diffs against the golden file, so
// threading the tokens through is provably a no-op until somebody actually changes one.

/** The font-family declaration, trailing semicolon included, as every inline style expects it. */
export const fontDecl = (ds: DesignSystem): string => `font-family:${ds.fontStack};`;

/** The stack a type role renders in: its own if it names one, otherwise the email's default. */
export function fontOf(ds: DesignSystem, name: string): string {
  const role = ds.type[name];
  return (role?.font && ds.fonts[role.font]) || ds.fontStack;
}

/** True when a role departs from the default stack, which is the only time it has to say so. */
export const hasOwnFont = (ds: DesignSystem, name: string): boolean => fontOf(ds, name) !== ds.fontStack;

/** `only print` reaches clients that honour print media, which is how phones get the rules (2.3). */
export const phoneQuery = (ds: DesignSystem): string =>
  `only print, only screen and (max-width:${ds.mobileBreakpoint}px)`;

export const deskQuery = (ds: DesignSystem): string =>
  `only print, only screen and (min-width:${ds.mobileBreakpoint + 1}px)`;

/** A six-span column: half the container, which is the only multi-column width the grid produces. */
export const halfWidth = (ds: DesignSystem): number => Math.round(ds.containerWidth / 2);

export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export function typeOf(ds: DesignSystem, name: string): TypeStyle {
  return ds.type[name] ?? ds.type['body'] ?? DEFAULT_DESIGN_SYSTEM.type['body']!;
}

/**
 * One `.sy-rich` rule. HubSpot inlines these onto whatever the team typed in the rich text editor
 * at send (learnings 1.9), so this is the only styling that reaches Gmail for their content.
 */
function richRule(selector: string, t: TypeStyle, statesWeight: boolean, ds: DesignSystem): string {
  // A heading always states its weight, because clients disagree about what an `h3` weighs inside
  // an email. Body text states one only when it is *not* the natural `normal` — saying so adds
  // bytes to every send and changes nothing, which is why v1 left it out and the golden file
  // records its absence.
  const weight = statesWeight || t.weight !== 'normal' ? `; font-weight:${t.weight}` : '';
  const caps = t.uppercase ? '; text-transform:uppercase' : '';
  const track = t.letterSpacing ? `; letter-spacing:${t.letterSpacing}px` : '';
  const extra = `${caps}${track}`;
  // A role states a font or a colour only when it departs from the default — saying what is already
  // true adds bytes to every send and changes nothing, and it is what keeps the golden file honest.
  const stack = (t.font && ds.fonts[t.font]) || ds.fontStack;
  const font = stack === ds.fontStack ? '' : `; font-family:${stack}`;
  const own = colorOf(ds, t.color ?? null);
  const color = own ? `; color:${own}` : '';
  return `${selector} { margin:0 0 ${t.marginBottom}px 0; line-height:${t.lineHeight}%; font-size:${t.size}px${weight}${font}${color}${extra} }`;
}

/** The type scale, as the stylesheet HubSpot inlines. */
export function richTextCss(ds: DesignSystem): string[] {
  const body = typeOf(ds, 'body');
  const levels: HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  return [
    ...levels.map((level) => richRule(`.sy-rich ${level}`, typeOf(ds, level), true, ds)),
    richRule('.sy-rich p', body, false, ds),
    // Lists keep a tighter line height than reading text on purpose; only the size and the bottom
    // margin follow the body token.
    `.sy-rich ul, .sy-rich ol { margin:0 0 ${body.marginBottom}px ${ds.richText.listIndent}px; padding:0; line-height:${ds.richText.listLineHeight}%; font-size:${body.size}px }`,
  ];
}

/**
 * Phone sizes for the same scale, plus the compiler's own heading classes.
 *
 * All six levels. It was four, which matched the Heading block's picker at the time and left an
 * `<h5>` the team typed in HubSpot's editor at its desktop size on every phone — the one level
 * that is uppercase and tracked, and so the one whose size matters most on a narrow screen.
 */
export function phoneTypeCss(ds: DesignSystem): string {
  const levels: HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  return levels
    .map((level) => {
      const t = typeOf(ds, level);
      return `.sy-${level}, .sy-rich ${level} { font-size:${t.mobileSize}px !important }`;
    })
    .join(' ');
}
