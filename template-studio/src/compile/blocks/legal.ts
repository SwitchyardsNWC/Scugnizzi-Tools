// The legal footer: company, address, unsubscribe.
//
// Everything here comes from HubSpot's own settings, and HubSpot refuses to publish a template
// without these variables (learnings 1.8). They are `print` nodes with sample fallbacks, which is
// the whole reason preview mode needs fallbacks at all.
//
// The address is wrapped in our own non-underlined anchor to Google Maps, in the text colour. That
// is not a convenience link — Gmail and Apple Mail auto-detect a bare postal address and restyle it
// as a blue underlined link, and the only reliable defence is to leave nothing for them to linkify
// (learnings 2.7). The `a[x-apple-data-detectors]` rule in head.ts is the second half of it.
//
// The footer draws its section's preset — band, text, links — like every other block, and sets
// its text the way its column says. Both were pinned: a navy band, white text, right-aligned,
// whatever the section or the column said. That was the standard email's footer and nobody
// else's; a centred footer on a white page, which is the more common shape, could not be built.

import { el, frag, print, raw, text, voidEl, when, type IRNode, type Test } from '../ir.ts';
import { imgStyle, section } from '../layout.ts';
import { fontDecl, typeOf } from '../../model/design-system.ts';
import type { BuildContext } from '../context.ts';
import type { Column, LegalBlock, Section } from '../../model/types.ts';
import { richContent } from './fields.ts';
import { inline } from '../friendly.ts';

/**
 * Every `<p>` states its own margin, because HubSpot inlines a default `margin-bottom: 1em` onto
 * paragraphs at send (learnings 1.9, verified 2026-09-11). The `p { margin:0 }` reset in the
 * ordinary `<style>` block cannot save them — Gmail strips embedded styles — so a paragraph that
 * says nothing ships with a gap nobody chose. The template's own inline style wins, so simply
 * saying it is the whole fix. v1 omitted them, which is why its footers shipped a gap nobody chose.
 */
const P_MARGIN = 'margin:0; ';

export function renderLegal(block: LegalBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const layout = block.layout ?? 'classic';
  return layout === 'classic' ? renderClassic(block, sec, col, ctx) : renderSystemFooter(layout, block, sec, col, ctx);
}

/** The footer as it always was, byte for byte: every template from before layouts existed compiles through here. */
function renderClassic(block: LegalBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const p = ctx.preview;
  const ink = sec.textColor;
  const link = sec.linkColor;
  const align = col.align;
  // The footer's gutters are the page gutter. The outer cell adds a second one on the side the text
  // is set *away* from — a right-aligned footer gets extra room on the left — which is what keeps a
  // long address from running the full width. A centred footer gets neither.
  const gut = ctx.ds.pagePadding;
  const outerLeft = align === 'right' ? gut : 0;
  const outerRight = align === 'left' ? gut : 0;
  const company = print('site_settings.company_name', p.company);

  // HubSpot's own wrapper adds padding to the container; on phones the band has to reclaim it or
  // the colour runs out from under the text (learnings 1.11). Emitted here, in the section's own
  // band colour, rather than in the head pinned to a preset called navy.
  if (sec.bandColor) {
    const band = sec.bandColor;
    ctx.once('legal-phone', () =>
      ctx.mobile.push(
        `#section-legal .hse-column-container { padding-top:0px !important; padding-bottom:0px !important; background-color:transparent !important } #section-legal { background-color:${band} !important }`,
      ),
    );
  }

  // `address_2` is optional in HubSpot's settings, so it is a branch rather than a blank gap.
  const hasAddress2: Test = { k: 'path', path: 'site_settings.company_street_address_2', field: 'site_settings.company_street_address_2' };
  const addressText = frag([
    print('site_settings.company_street_address_1', p.address),
    when(hasAddress2, [text(' '), print('site_settings.company_street_address_2', '')]),
    text(', '),
    print('site_settings.company_city', p.city),
    text(', '),
    print('site_settings.company_state', p.state),
    raw('&nbsp;'),
    print('site_settings.company_zip', p.zip),
  ]);

  // `~` concatenates and `|urlencode` makes it safe inside the query string (learnings 1.8, 1.10).
  const query = {
    k: 'attrPrint' as const,
    path: '(site_settings.company_street_address_1 ~ ", " ~ site_settings.company_city ~ ", " ~ site_settings.company_state ~ " " ~ site_settings.company_zip)|urlencode',
    fallback: encodeURIComponent(`${p.address}, ${p.city}, ${p.state} ${p.zip}`),
  };
  const address = el(
    'a',
    {
      href: ['https://www.google.com/maps/search/?api=1&query=', query],
      target: '_blank',
      style: `color:${ink} !important; text-decoration:none !important`,
    },
    addressText,
  );

  const pm = P_MARGIN;
  const note = richContent(
    block.noteLock,
    `<p style="${pm}line-height:115%; font-size:12px; color:${ink}; font-weight:normal">${noteHtml(block.note, link)}</p>`,
  );

  const logo = block.logoSrc
    ? el('table', { class: 'hse-image-wrapper', role: 'presentation', width: '100%', cellpadding: '0', cellspacing: '0' }, [
        el('tbody', null, [
          el('tr', null, [
            el(
              'td',
              {
                class: 'hs_padded',
                align,
                valign: 'top',
                style: `${fontDecl(ctx.ds)} text-align:${align}; padding:${sec.padTop}px ${gut}px 0px; font-size:0px`,
              },
              voidEl('img', {
                alt: { k: 'attrPrint' as const, path: 'site_settings.company_name', fallback: p.company },
                src: block.logoSrc,
                style: imgStyle(ctx.ds),
                width: block.logoWidth || 180,
                align: 'middle',
              }),
            ),
          ]),
        ]),
      ])
    : null;

  const textCell = el(
    'table',
    { role: 'presentation', cellpadding: '0', cellspacing: '0', width: '100%' },
    el('tbody', null, [
      el('tr', null, [
        el(
          'td',
          {
            // The space above goes on the logo when there is one, otherwise on the text.
            style: `${fontDecl(ctx.ds)} font-size:${typeOf(ctx.ds, 'body').size}px; word-break:break-word; padding:${logo ? 0 : sec.padTop}px ${outerRight}px ${sec.padBottom}px ${outerLeft}px`,
          },
          el(
            'table',
            {
              role: 'presentation',
              class: 'hse-footer hse-secondary',
              width: '100%',
              cellpadding: '0',
              cellspacing: '0',
              style: `${fontDecl(ctx.ds)} font-size:12px; line-height:135%; margin-bottom:0; padding:0`,
            },
            el('tbody', null, [
              el('tr', null, [
                el(
                  'td',
                  {
                    align,
                    valign: 'top',
                    style: `${fontDecl(ctx.ds)} font-size:${typeOf(ctx.ds, 'body').size}px; color:${ink}; word-break:break-word; text-align:${align}; margin-bottom:0; line-height:135%; padding:10px ${gut}px`,
                  },
                  [
                    el('p', { style: `${pm}line-height:115%; color:${ink}; font-weight:bold; font-size:12px` }, [
                      el('span', { style: 'font-size:16px' }, company),
                      voidEl('br', {}),
                      address,
                    ]),
                    el('div', { style: `line-height:115%; font-size:12px; color:${ink}` }, note.value),
                    el('p', { style: `${pm}line-height:100%` }, raw('&nbsp;')),
                    el('p', pm ? { style: pm.trim().replace(/;$/, '') } : null, [
                      el('span', { style: `color:${ink}; font-size:12px` }, [
                        el(
                          'a',
                          { href: { k: 'attrPrint' as const, path: 'unsubscribe_link_all', fallback: '#unsubscribe' }, style: `color:${link}`, 'data-unsubscribe': 'true', target: '_blank' },
                          text('Unsubscribe'),
                        ),
                      ]),
                      voidEl('br', {}),
                      el(
                        'a',
                        { href: { k: 'attrPrint' as const, path: 'unsubscribe_link', fallback: '#preferences' }, style: `color:${link}`, 'data-unsubscribe': 'true', target: '_blank' },
                        el('span', { style: 'font-size:12px' }, text('Manage Preferences')),
                      ),
                    ]),
                  ],
                  { text: ink, link },
                ),
              ]),
            ]),
          ),
        ),
      ]),
    ]),
  );

  return frag([
    note.declaration,
    section(frag(logo ? [logo, textCell] : [textCell]), {
      ds: ctx.ds,
      band: sec.bandColor,
      container: sec.containerColor,
      domId: 'section-legal',
      bleed: sec.bleed ?? false,
    }),
  ]);
}

// --- the Switchyards footers ------------------------------------------------------------------------------------
//
// Four arrangements of the same four parts (model/switchyards.ts, after the Switchyards email design system):
// seals, the badge row; identity, the company in the h3 role and the address in small bold; notice, the one line
// about not printing; colophon, the legal links and the © mark. Structure is drawn with 1px hairlines in the
// section's own ink, so the same footer reads on navy and on cream. HubSpot's tokens are the same in every one:
// the company and address from site_settings, the two unsubscribe links it refuses to publish without.
//
// Phones: `.sy-stack` cells drop under each other, the footer links grow a 12px tap pad, the middle dot between
// them goes, and the ledger's divider turns from a vertical line into a horizontal one.

/**
 * The notice line as markup. Plain text takes the friendly forms (`**bold**`, `[a link](url)`, a line break per
 * line); text that is already HTML is used as it is, so a footer can carry a link or an emphasis written out.
 * Jared, 2026-09-18: "allow html in the note section of the legal footers."
 */
export function noteHtml(note: string, linkColor: string): string {
  return /<[a-z][^>]*>/i.test(note) ? note.trim() : inline(note, linkColor);
}

/** The social links a footer names, in a fixed order, only those set. */
export function socialLinks(block: Pick<LegalBlock, 'instagram' | 'youtube' | 'linkedin'>): Array<{ name: string; href: string }> {
  return [
    { name: 'Instagram', href: block.instagram?.trim() ?? '' },
    { name: 'YouTube', href: block.youtube?.trim() ?? '' },
    { name: 'LinkedIn', href: block.linkedin?.trim() ?? '' },
  ].filter((l) => l.href);
}

type Attrs = Record<string, string | number | null>;
const tbl = (rows: IRNode[], attrs: Attrs = {}): IRNode =>
  el('table', { role: 'presentation', width: '100%', cellpadding: '0', cellspacing: '0', ...attrs }, [el('tbody', null, rows)]);
const tr = (cells: IRNode[]): IRNode => el('tr', null, cells);

/** `https://www.switchyards.com/` → `switchyards.com`, for a link that shows where it goes. */
export function hostOf(url: string): string {
  return url
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '');
}

function renderSystemFooter(layout: Exclude<LegalBlock['layout'], undefined | 'classic'>, block: LegalBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const p = ctx.preview;
  const ds = ctx.ds;
  const ink = sec.textColor;
  const link = sec.linkColor;
  const font = fontDecl(ds);
  const h3 = typeOf(ds, 'h3');
  const gut = ds.pagePadding;
  const hair = `1px solid ${ink}`;
  const small = (weight: 'normal' | 'bold', extra = '') => `${font} font-size:13px; line-height:17px; font-weight:${weight}; color:${ink}${extra}`;
  const nameStyle = `${font} font-size:${h3.size}px; line-height:${h3.lineHeight}%; font-weight:bold; color:${ink}`;

  if (sec.bandColor) {
    const band = sec.bandColor;
    ctx.once('legal-phone', () =>
      ctx.mobile.push(
        `#section-legal .hse-column-container { padding-top:0px !important; padding-bottom:0px !important; background-color:transparent !important } #section-legal { background-color:${band} !important }`,
      ),
    );
  }
  ctx.once(`sy-footer-phone-${ink}`, () =>
    ctx.mobile.push(
      `.sy-stack { display:block !important; width:100% !important; text-align:left !important; padding-left:0 !important; padding-right:0 !important }`,
      `.sy-tap { display:inline-block !important; padding:12px 0 !important }`,
      `.sy-sep { display:none !important }`,
      // With the dot gone, the second link goes under the first rather than against it.
      `.sy-tap + .sy-sep + .sy-tap { display:block !important }`,
      `.sy-ledger { border-left:0 !important; border-top:${hair} !important; padding-left:0 !important; padding-top:20px !important }`,
      `.sy-ledger-l { padding-right:0 !important; padding-bottom:20px !important }`,
    ),
  );

  const company = print('site_settings.company_name', p.company);
  const hasAddress2: Test = { k: 'path', path: 'site_settings.company_street_address_2', field: 'site_settings.company_street_address_2' };
  const addressText = frag([
    print('site_settings.company_street_address_1', p.address),
    when(hasAddress2, [text(' '), print('site_settings.company_street_address_2', '')]),
    text(', '),
    print('site_settings.company_city', p.city),
    text(', '),
    print('site_settings.company_state', p.state),
    raw('&nbsp;'),
    print('site_settings.company_zip', p.zip),
  ]);
  const query = {
    k: 'attrPrint' as const,
    path: '(site_settings.company_street_address_1 ~ ", " ~ site_settings.company_city ~ ", " ~ site_settings.company_state ~ " " ~ site_settings.company_zip)|urlencode',
    fallback: encodeURIComponent(`${p.address}, ${p.city}, ${p.state} ${p.zip}`),
  };
  // Our own anchor around the address, in the ink and without a line, so no client draws its own blue one (learnings 2.7).
  const address = el('a', { href: ['https://www.google.com/maps/search/?api=1&query=', query], target: '_blank', style: `color:${ink} !important; text-decoration:none !important` }, addressText);
  const note = richContent(block.noteLock, `<p style="margin:0; font-size:13px; line-height:17px; color:${ink}">${noteHtml(block.note, link)}</p>`);

  const legalLink = (path: string, fallback: string, label: string) =>
    el('a', { href: { k: 'attrPrint' as const, path, fallback }, class: 'sy-tap', style: `color:${link}; text-decoration:none`, 'data-unsubscribe': 'true', target: '_blank' }, text(label));
  const unsubscribe = legalLink('unsubscribe_link_all', '#unsubscribe', 'Unsubscribe');
  const preferences = legalLink('unsubscribe_link', '#preferences', 'Manage Preferences');
  const links = el('span', { style: small('normal') }, [unsubscribe, el('span', { class: 'sy-sep' }, raw(' &nbsp;&middot;&nbsp; ')), preferences]);
  const markText = block.mark?.trim() ?? '';
  const mark = markText ? el('span', { style: small('bold', '; letter-spacing:1px; text-transform:uppercase') }, text(markText)) : null;
  const socials = socialLinks(block);
  const socialLink = (l: { name: string; href: string }) => el('a', { href: l.href, class: 'sy-tap', target: '_blank', style: `color:${link}; text-decoration:none` }, text(l.name));
  const dot = () => el('span', { class: 'sy-sep' }, raw(' &nbsp;&middot;&nbsp; '));
  /** The socials on one line, dotted, in the footer's small type. */
  const socialLine = socials.length ? el('span', { style: small('normal') }, socials.flatMap((l, i) => (i ? [dot(), socialLink(l)] : [socialLink(l)]))) : null;
  const width = block.logoWidth || (layout === 'letterhead' ? 120 : 180);
  const picture = (display: 'block' | 'inline-block') =>
    block.logoSrc
      ? voidEl('img', {
          src: block.logoSrc,
          alt: { k: 'attrPrint' as const, path: 'site_settings.company_name', fallback: p.company },
          width,
          style: `display:${display}; width:${width}px; height:auto; border:0; outline:none; text-decoration:none`,
        })
      : null;

  const name = el('p', { style: `margin:0; ${nameStyle}` }, company);
  const addressLine = (align: string) => el('td', { align, style: `${small('bold')}; text-align:${align}; padding:0` }, address);
  const noteCell = (align: string, padding: string) => el('td', { align, style: `${small('normal')}; text-align:${align}; padding:${padding}` }, note.value);

  let inner: IRNode;
  if (layout === 'masthead') {
    const seals = picture('inline-block');
    inner = tbl([
      ...(seals ? [tr([el('td', { align: 'center', style: `padding:14px 0; border-top:${hair}; border-bottom:${hair}; font-size:0; line-height:0` }, seals)])] : []),
      tr([el('td', { align: 'center', style: `${nameStyle}; text-align:center; padding:${seals ? 20 : 0}px 0 0` }, name)]),
      tr([addressLine('center')]),
      tr([noteCell('center', socialLine ? '20px 0 0' : '20px 0 20px')]),
      ...(socialLine ? [tr([el('td', { align: 'center', style: 'padding:14px 0 20px; text-align:center' }, socialLine)])] : []),
      tr([
        el(
          'td',
          { style: `padding:0; border-top:${hair}` },
          tbl([
            tr([
              el('td', { class: 'sy-stack', width: '50%', style: 'padding:14px 0 0' }, mark ?? raw('&nbsp;')),
              el('td', { class: 'sy-stack', width: '50%', align: 'right', style: 'padding:14px 0 0; text-align:right' }, links),
            ]),
          ]),
        ),
      ]),
    ]);
  } else if (layout === 'ledger') {
    const seals = picture('block');
    // The socials share one row of the index, dotted, rather than a row each (Jared, 2026-09-18).
    const socialRows = socialLine ? [tr([el('td', { style: `padding:12px 0; border-bottom:${hair}` }, socialLine)])] : [];
    inner = tbl(
      [
        tr([
          el(
            'td',
            { class: 'sy-stack sy-ledger-l', width: '58%', valign: 'top', style: 'padding:0 20px 0 0' },
            tbl([
              ...(seals ? [tr([el('td', { style: 'padding:0 0 20px; font-size:0; line-height:0' }, seals)])] : []),
              tr([el('td', { align: 'left', style: `${nameStyle}; text-align:left; padding:0` }, name)]),
              tr([addressLine('left')]),
              tr([noteCell('left', '20px 0 0')]),
            ]),
          ),
          el(
            'td',
            { class: 'sy-stack sy-ledger', width: '42%', valign: 'top', style: `padding:0 0 0 20px; border-left:${hair}` },
            tbl([
              tr([el('td', { style: `padding:12px 0; border-bottom:${hair}` }, el('span', { style: small('normal') }, unsubscribe))]),
              tr([el('td', { style: `padding:12px 0; border-bottom:${hair}` }, el('span', { style: small('normal') }, preferences))]),
              ...socialRows,
              ...(mark ? [tr([el('td', { style: 'padding:12px 0 0' }, mark)])] : []),
            ]),
          ),
        ]),
      ],
      { style: 'border-collapse:separate' },
    );
  } else if (layout === 'stub') {
    const seals = picture('block');
    inner = tbl([
      tr([
        el('td', { class: 'sy-stack', width: '50%', valign: 'middle', style: 'padding:0 0 14px; font-size:0; line-height:0' }, seals ?? raw('&nbsp;')),
        el('td', { class: 'sy-stack', width: '50%', valign: 'middle', align: 'right', style: 'padding:0 0 14px; text-align:right' }, socialLine ? [links, dot(), socialLine] : links),
      ]),
      tr([
        el('td', { colspan: '2', style: `padding:14px 0 0; border-top:${hair}` }, [
          el('span', { style: small('bold') }, [company, raw(' &nbsp;&middot;&nbsp; '), address, ...(mark ? [raw(' &nbsp;&middot;&nbsp; ')] : [])]),
          ...(mark ? [mark] : []),
        ]),
      ]),
    ]);
  } else {
    // Letterhead: cream, a note from a person. The lockup where the seals would be, and the legal links in the link colour.
    const lockup = picture('inline-block');
    inner = tbl([
      ...(lockup ? [tr([el('td', { align: 'center', style: 'padding:0 0 20px; font-size:0; line-height:0' }, lockup)])] : []),
      tr([el('td', { align: 'center', style: `${nameStyle}; text-align:center; padding:20px 0 0; border-top:${hair}` }, name)]),
      tr([addressLine('center')]),
      tr([noteCell('center', '20px 0 20px')]),
      tr([el('td', { align: 'center', style: `padding:20px 0 0; border-top:${hair}; text-align:center` }, links)]),
      ...(socialLine ? [tr([el('td', { align: 'center', style: 'padding:10px 0 0; text-align:center' }, socialLine)])] : []),
      ...(mark ? [tr([el('td', { align: 'center', style: 'padding:10px 0 0; text-align:center' }, mark)])] : []),
    ]);
  }

  const outer = el(
    'table',
    { role: 'presentation', cellpadding: '0', cellspacing: '0', width: '100%' },
    el('tbody', null, [
      el('tr', null, [
        el(
          'td',
          { class: 'hs_padded', style: `${font} padding:${sec.padTop}px ${gut}px ${sec.padBottom}px; word-break:break-word` },
          inner,
          { text: ink, link },
        ),
      ]),
    ]),
  );
  void col;
  return frag([note.declaration, section(outer, { ds, band: sec.bandColor, container: sec.containerColor, domId: 'section-legal', bleed: sec.bleed ?? false })]);
}
