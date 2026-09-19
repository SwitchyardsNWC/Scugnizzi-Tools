// The markup primitives every block is built from: the section band, the centred container, the
// padded cell, the spacer row and the button.
//
// These are the parts that encode learnings section 2 — nested tables with role="presentation",
// MSO conditionals around the container so Outlook gets a fixed width, zero horizontal padding on
// sections so phones get full bleed, and a spacer that is a real table row because Outlook ignores
// heights on empty divs. Blocks compose these and never emit structural markup of their own, which
// is what keeps "layouts are built only from primitives the compiler knows how to render"
// (plan.md, Risks) true by construction rather than by review.

import { el, frag, raw, type AttrValue, type ElementColors, type IRNode } from './ir.ts';
import { buttonOf, colorOf, fontDecl, halfWidth, typeOf, type ButtonStyle, type DesignSystem } from '../model/design-system.ts';

// Every primitive takes the design system rather than reading a constant, and takes it as a
// *required* option so a new call site cannot quietly fall back to Helvetica. That is the whole
// mechanism behind "change a token, watch everything move": there is nowhere left for a literal to
// hide. The defaults reproduce v1's bytes exactly, which `tests/design-system.test.ts` proves.

/** Style declarations joined the way v1 wrote them, skipping anything empty. */
function style(...parts: Array<string | number | false | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join('; ');
}

export interface SectionOptions {
  ds: DesignSystem;
  /**
   * Let the band run to the edge of the message area instead of stopping at the email's width.
   *
   * v1's shape, and the reason "email width" did not mean what it said: the container narrowed and
   * the navy bar, the stripes and every section background carried on to the window edge. Set only
   * by the parity test now — an email is as wide as it is, furniture included.
   */
  bleed?: boolean;
  /** The band colour. Also switches on the Outlook background table. */
  band?: string | null;
  container?: string | null;
  padTop?: number;
  padBottom?: number;
  domId?: string;
  /** A row with more than one column: the container becomes the table and columns are the cells. */
  multiColumn?: boolean;
}

/**
 * One full-width band with the 600px column centred inside it.
 *
 * Horizontal padding is deliberately zero: sections run edge to edge so the email is full bleed on
 * phones (learnings 2.4). Padding lives on the inner cells instead. Gmail's apps still draw their
 * own inset around every message and no email can remove it — the page background is what shows in
 * that gap, which is why it is a setting.
 */
export function section(inner: IRNode, options: SectionOptions): IRNode {
  const { ds, bleed = false, band = null, container = null, padTop = 0, padBottom = 0, domId, multiColumn = false } = options;
  const width = ds.containerWidth;

  const containerStyle = style(
    // The floor follows the container rather than sitting above it, so a deliberately narrow email
    // — a 300px receipt, say — is actually 300px wide instead of being propped open at 280.
    `min-width:${Math.min(280, width)}px`,
    `max-width:${width}px`,
    'margin:0 auto',
    container && `background-color:${container}`,
    padTop && `padding-top:${padTop}px`,
    padBottom && `padding-bottom:${padBottom}px`,
    multiColumn && 'border-collapse:separate',
    multiColumn && 'display:table',
    multiColumn && 'width:100%',
  );
  // Word's CSS parser is unforgiving about what it will accept inside a conditional's inline style,
  // so these are concatenated without spaces exactly as v1 emitted them rather than reformatted.
  const msoPad =
    (padTop ? `padding-top:${padTop}px;` : '') + (padBottom ? `padding-bottom:${padBottom}px;` : '');
  const msoWidth = multiColumn ? halfWidth(ds) : width;

  const containerEl = el(
    'div',
    {
      class: `hse-column-container${multiColumn ? ' hse-no-stack-row' : ''}`,
      style: containerStyle,
      bgcolor: container,
    },
    [
      raw(
        `<!--[if (mso)|(IE)]><table align="center" style="width:${width}px;" cellpadding="0" cellspacing="0" role="presentation" width="${width}"${
          container ? ` bgcolor="${container}"` : ''
        }><tr><td valign="top" style="width:${msoWidth}px;${msoPad}"><![endif]-->`,
      ),
      multiColumn ? inner : el('div', { class: 'hse-column hse-size-12' }, inner),
      raw('<!--[if (mso)|(IE)]></td></tr></table><![endif]-->'),
    ],
    container ? { bg: container } : undefined,
  );

  // Outlook needs a real table to paint a full-width background; a div with bgcolor is ignored.
  // Every <tbody> opened inside a conditional is closed — an unclosed one collapses the layout in
  // Outlook only, so it stays invisible until a test send (learnings 2.2).
  // Outlook's band table is bounded the same way, or the colour it paints would be the one thing in
  // the email that ignored the width.
  const msoBand = bleed ? 'width="100%" style="width:100%"' : `width="${width}" style="width:${width}px"`;
  const body: IRNode[] = band
    ? [
        raw(
          `<!--[if gte mso 9]><table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" ${msoBand} bgcolor="${band}"><tbody><tr><td valign="top"><![endif]-->`,
        ),
        containerEl,
        raw('<!--[if gte mso 9]></td></tr></tbody></table><![endif]-->'),
      ]
    : [containerEl];

  return el(
    'div',
    {
      class: 'hse-section',
      id: domId,
      style: style(
        'padding:0',
        // `max-width` bounds and never forces: a 600px email on a 375px phone still fills it, so
        // full bleed where it matters survives (learnings 2.4). What it stops is a 320px email
        // whose navy bar runs across a 900px window.
        !bleed && `max-width:${width}px`,
        !bleed && 'margin:0 auto',
        band && `background-color:${band}`,
      ),
      bgcolor: band,
    },
    body,
    band ? { bg: band } : undefined,
  );
}

export interface BoxTokens {
  width: number;
  color: string;
  radius: number;
  pad: number;
  /** A colour behind the contents, with the box's corners. Null is no fill. */
  fill?: string | null;
}

/**
 * A box around a block's contents: the probe template's look — a rule, a card, a callout.
 *
 * A real table rather than a div with a border, because Word gives a div a border at the width of
 * whatever contains it and gives a table the width you asked for. `border-collapse:separate` is
 * what makes `border-radius` apply at all; without it the corners stay square everywhere, not just
 * in Outlook.
 *
 * It sits *inside* the cell's padding, so the page gutter stays outside the box and the box's own
 * `pad` is the space between the line and the words. That is the difference between a callout and
 * a full-width rule across the email, and it is the one anybody drawing a card means.
 */
export function boxed(inner: IRNode, box: BoxTokens): IRNode {
  const fill = box.fill ?? null;
  return el(
    'table',
    {
      role: 'presentation',
      width: '100%',
      cellpadding: '0',
      cellspacing: '0',
      style: style(
        'width:100%',
        'border-collapse:separate',
        box.width > 0 && `border:${box.width}px solid ${box.color}`,
        box.radius > 0 && `border-radius:${box.radius}px`,
        // The fill on the table as well as the cell, so a client that drops one of them still paints the card.
        fill && `background-color:${fill}`,
      ),
    },
    [
      el('tbody', null, [
        el('tr', null, [
          el(
            'td',
            {
              bgcolor: fill,
              style: style(`padding:${box.pad}px`, fill && `background-color:${fill}`, fill && box.radius > 0 && `border-radius:${box.radius}px`),
            },
            inner,
            fill ? { bg: fill } : {},
          ),
        ]),
      ]),
    ],
  );
}

export interface CellOptions {
  ds: DesignSystem;
  padding: string;
  color?: string | null;
  linkColor?: string | null;
  /** Extra classes, e.g. `sy-rich sy-rt-2`. */
  className?: string;
  align?: string | null;
  /** A box around the contents, when the column asks for one. */
  box?: BoxTokens | null;
  /**
   * Off for a row *inside* a stacked column: the column's outer cell is the one that carries the
   * gutter and wears `hs_padded`, and a second cell wearing it would be dragged out to the gutter
   * again on every phone by HubSpot's own `!important` rule — a double inset nobody asked for.
   */
  padded?: boolean;
}

/**
 * A padded content cell. `hs_padded` is HubSpot's own class and carries padding of its own on
 * phones (learnings 1.11) — it is reused deliberately here rather than stacked on top of, which is
 * what caused v1's double-padding bug in the legal footer. Phase 0 question G re-checks it.
 */
export function cell(inner: IRNode, options: CellOptions): IRNode {
  const { ds, padding, color, linkColor, className, align, box, padded = true } = options;
  const content = box ? boxed(inner, box) : inner;
  const colors: ElementColors = {};
  if (color) colors.text = color;
  if (linkColor) colors.link = linkColor;

  return el('table', { role: 'presentation', cellpadding: '0', cellspacing: '0', width: '100%' }, [
    el('tbody', null, [
      el('tr', null, [
        el(
          'td',
          {
            class: classOf(padded, className),
            align,
            style: style(
              `${fontDecl(ds)} font-size:${typeOf(ds, 'body').size}px`,
              'word-break:break-word',
              `padding:${padding}`,
              color && `color:${color}`,
              align && `text-align:${align}`,
            ),
          },
          content,
          colors.text || colors.link ? colors : undefined,
        ),
      ]),
    ]),
  ]);
}

/** `hs_padded` plus whatever else, or only whatever else; null when there is nothing to say. */
function classOf(padded: boolean, className: string | null | undefined): string | null {
  const own = padded ? 'hs_padded' : '';
  const rest = className ?? '';
  const joined = [own, rest].filter(Boolean).join(' ');
  return joined || null;
}

/**
 * An image cell. font-size:0 kills the descender gap under the img in Outlook.
 *
 * `className` is the side-padding override, when the column has one — see `padClass`. `padded`
 * is off for a row inside a stacked column, for the reason `CellOptions` gives.
 */
export function imageCell(
  inner: IRNode,
  padding: string,
  align: string,
  ds: DesignSystem,
  className?: string | null,
  box?: BoxTokens | null,
  padded = true,
): IRNode {
  return el('table', { class: 'hse-image-wrapper', role: 'presentation', width: '100%', cellpadding: '0', cellspacing: '0' }, [
    el('tbody', null, [
      el('tr', null, [
        el(
          'td',
          {
            class: classOf(padded, className),
            align,
            valign: 'top',
            style: `${fontDecl(ds)} word-break:break-word; text-align:${align}; padding:${padding}; font-size:0px`,
          },
          box ? boxed(inner, box) : inner,
        ),
      ]),
    ]),
  ]);
}

// --- a row of columns ------------------------------------------------------------------------------

export interface ColumnCell {
  /** Twelfths. The cells of a row must sum to twelve. */
  span: number;
  /** Set only when the compiler is annotating for the canvas. Never reaches an exported template. */
  id?: string;
  /** Likewise: the section the row belongs to, so a click on the cell's gap can select the row. */
  sectionId?: string;
  /** Drop this column below the breakpoint. `hs-hm` is HubSpot's own class and head.ts styles it. */
  hideOnPhone?: boolean;
  /** Everything the column holds: each block's own padded cell, exactly as it renders alone. */
  inner: IRNode;
}

export interface ColumnsOptions {
  ds: DesignSystem;
  /** Full width each, one under the other, below the breakpoint. Off keeps them side by side. */
  stack: boolean;
}

/**
 * Columns as a real table with one `<td>` each.
 *
 * Not the `hse-column` div grid the single-column path uses, and the difference is Outlook. Word's
 * engine has no float, no flex and no inline-block worth the name, so a div grid only survives
 * there inside an MSO conditional that rebuilds it as a table — two layouts to keep in agreement,
 * and the one nobody can see is the one that breaks. A table is the same markup in every client.
 *
 * The stacking is a media query turning the cells into blocks, which is the oldest reliable trick
 * in email and is already how this project's two-column footer works.
 *
 * The td carries no padding of its own: every block inside renders the same padded cell it renders
 * when it is alone in a section, so a heading in a column and a heading spanning the width are the
 * same markup. One less thing that can disagree.
 */
export function columnsRow(cells: ColumnCell[], { ds, stack }: ColumnsOptions): IRNode {
  const total = cells.reduce((sum, c) => sum + c.span, 0) || 12;
  return el(
    'table',
    {
      role: 'presentation',
      width: '100%',
      cellpadding: '0',
      cellspacing: '0',
      class: `sy-row${stack ? ' sy-row-stack' : ''}`,
      style: 'width:100%; border-collapse:collapse',
    },
    [
      el('tbody', null, [
        el(
          'tr',
          null,
          cells.map((c) => {
            const pct = Math.round((c.span / total) * 10000) / 100;
            return el(
              'td',
              {
                class: `sy-col${c.hideOnPhone ? ' sy-col-hide' : ''}`,
                'data-sy-column': c.id ?? null,
                'data-sy-section': c.sectionId ?? null,
                valign: 'top',
                width: `${pct}%`,
                // Both, deliberately: Outlook honours the attribute and ignores a percentage width
                // in CSS on a td, while everything else prefers the style.
                style: `width:${pct}%; vertical-align:top; ${fontDecl(ds)} font-size:${typeOf(ds, 'body').size}px; word-break:break-word`,
              },
              c.inner,
            );
          }),
        ),
      ]),
    ],
  );
}

/** The phone rules a row of columns needs. Emitted once, and only when a template has one. */
export const COLUMN_PHONE_CSS = [
  '  .sy-row-stack .sy-col { display:block !important; width:100% !important; max-width:100% !important; box-sizing:border-box !important }',
  '  .sy-col-hide { display:none !important }',
];

/** Fixed vertical space that every client honours. Outlook ignores heights on empty divs. */
export function spacerRow(height: number): IRNode {
  return el('table', { role: 'presentation', width: '100%', cellpadding: '0', cellspacing: '0' }, [
    el('tbody', null, [
      el('tr', null, [
        el(
          'td',
          {
            height: String(height),
            style: `height:${height}px; line-height:${height}px; font-size:0; mso-line-height-rule:exactly`,
          },
          raw('&nbsp;'),
        ),
      ]),
    ]),
  ]);
}

/**
 * The inline style every image carries.
 *
 * `border:none` unless the design system asks for one — an image with a frame is a template-wide
 * decision, the same as a button's corner radius. Outlook squares off `border-radius` and honours
 * the border, which is the usual split and not worth working around.
 */
export function imgStyle(ds: DesignSystem): string {
  const { radius, borderWidth } = ds.image;
  const border =
    borderWidth > 0 ? `border:${borderWidth}px solid ${colorOf(ds, ds.image.borderColor) ?? '#000000'}` : 'border:none';
  return style(
    'outline:none',
    'text-decoration:none',
    border,
    radius > 0 && `border-radius:${radius}px`,
    'max-width:100%',
    'font-size:16px',
  );
}

export interface ButtonOptions {
  ds: DesignSystem;
  label: IRNode;
  href: AttrValue;
  variant: ButtonStyle;
  align: string;
  fontSize?: number;
  /** Mobile size class, when the block sets one. */
  className?: string;
}

/**
 * The bulletproof button: a td carrying bgcolor, border, border-radius and mso-padding-alt, with a
 * full-width anchor inside (learnings 2.10). The anchor is display:block so the whole pill is the
 * click target in every client, including Outlook.
 */
export function button(options: ButtonOptions): IRNode {
  const { ds, label, href, variant, align, fontSize, className } = options;
  const t = buttonOf(ds, variant);
  const bg = t.fill;
  const color = t.ink;
  const border = t.border;
  const padding = `${t.padY}px ${t.padX}px`;
  // The block may override the size; everything else about the button is the design system's.
  const size = fontSize || t.size;
  const full = align === 'full';

  return el(
    'table',
    {
      width: full ? '100%' : null,
      align: full ? 'left' : align,
      border: '0',
      cellpadding: '0',
      cellspacing: '0',
      role: 'presentation',
      style: 'border-collapse:separate!important',
    },
    [
      el('tbody', null, [
        el('tr', null, [
          el(
            'td',
            {
              class: 'sy-btn',
              align: 'center',
              valign: 'middle',
              bgcolor: bg,
              style: style(
                `${fontDecl(ds)} font-size:${typeOf(ds, 'body').size}px`,
                'word-break:break-word',
                `border-radius:${t.radius}px`,
                'cursor:auto',
                `background-color:${bg}`,
                `border:${t.borderWidth}px solid ${border}`,
                'box-sizing:border-box',
                `mso-padding-alt:${padding}`,
              ),
            },
            el(
              'a',
              {
                href,
                class: className || null,
                target: '_blank',
                style: style(
                  `color:${color}`,
                  `font-size:${size}px`,
                  // No space after the commas: v1 wrote it this way here and with spaces elsewhere.
                  `font-family:${ds.fontStack.replace(/,\s*/g, ',')}`,
                  'Margin:0',
                  'text-transform:none',
                  'letter-spacing:0px',
                  'text-decoration:none',
                  `padding:${padding}`,
                  'display:block',
                ),
              },
              el('strong', { style: `color:${color}; font-weight:bold; text-decoration:none; font-style:normal` }, label),
            ),
            { bg, text: color, link: color },
          ),
        ]),
      ]),
    ],
  );
}

export { frag, style as styleOf };
