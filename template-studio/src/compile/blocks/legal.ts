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
    `<p style="${pm}line-height:115%; font-size:12px; color:${ink}; font-weight:normal">${inline(block.note, link)}</p>`,
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
    }),
  ]);
}
