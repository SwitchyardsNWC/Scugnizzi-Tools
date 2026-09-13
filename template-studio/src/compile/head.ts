// The document shell: everything outside the blocks.
//
// Almost all of this is learnings section 2 written down as markup. It is boilerplate in the sense
// that it rarely changes, and load-bearing in the sense that removing any one line breaks a
// specific client in a way only a test send would reveal. The MSO conditionals give Outlook a
// fixed-width table and a VML page background; the resets kill the table spacing, the bicubic image
// scaling and the line-height rounding that Word's rendering engine applies otherwise.

import { darkModeLayers, type Registry } from './colors.ts';
import {
  theme as themeOf,
  colorOf,
  deskQuery,
  fontDecl,
  phoneQuery,
  phoneTypeCss,
  richTextCss,
  typeOf,
  type DesignSystem,
} from '../model/design-system.ts';

/** What a rich-text accent falls back to when its reference resolves to nothing. */
const brandFallback = (ds: DesignSystem): string => themeOf(ds, 'cream').link;

/** Layer 1 of dark mode: Apple Mail and iOS Mail honour these and leave the email alone (2.5). */
function colorSchemeMeta(): string {
  return [
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    '<meta name="color-scheme" content="only light">',
  ].join('\n');
}

export function forceLightHead(registry: Registry, pageBackground: string, ds: DesignSystem): string {
  return `${colorSchemeMeta()}\n<style type="text/css">\n:root { color-scheme: light; supported-color-schemes: light; }\n${darkModeLayers(registry, pageBackground, ds)}\n</style>\n`;
}

export interface HeadOptions {
  ds: DesignSystem;
  pageBackground: string;
  /** Rules for the mobile media query, in emission order. */
  mobile: string[];
  /** Per-block rules appended to the block HubSpot inlines at send (learnings 1.9). */
  inlineCss: string[];
}

export function headCss({ ds, pageBackground, mobile, inlineCss }: HeadOptions): string {
  // Every number and colour below that a designer could reasonably want to move comes from the
  // design system. The ones that do not — HubSpot's own class names, the 20px gutter, the list
  // indent — are structural rather than stylistic, and a token for each would be a knob nobody
  // turns. Defaults reproduce the previous output byte for byte; there is a test.
  const phone = phoneQuery(ds);
  const desk = deskQuery(ds);
  const w = ds.containerWidth;
  // Resolved through the presets, not by reaching into the palette for a key called `red`.
  //
  // Reading `ds.colors['red']` looks like using the design system and is not: it pins the output to
  // a *name*, so renaming that entry — or removing it, which is the same walk — leaves these three
  // rules on a literal forever, while everything that referenced it properly moves. The third
  // instance of that bug in one afternoon, and the reason there is now a test that greps for it.
  //
  // A preset is itself a set of references, so going through one follows the palette all the way
  // down. These are the *defaults* for rich text; a block in a section overrides them per section.
  const base = themeOf(ds, 'cream');
  const onNavy = themeOf(ds, 'navy');
  const brand = base.link;
  const onDark = onNavy.text;
  const body = typeOf(ds, 'body');
  const rt = ds.richText;
  const quoteColour = colorOf(ds, rt.quoteColor) ?? brandFallback(ds);
  const ruleColour = colorOf(ds, rt.ruleColor) ?? brandFallback(ds);

  return [
    '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings><w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word"><w:DontUseAdvancedTypographyReadingMail/></w:WordDocument></xml><style>ul > li { text-indent: -1em; }</style><![endif]-->',
    `<!--[if mso]><style type="text/css">body, td { font-family: Arial, Helvetica, sans-serif; } .hse-body-wrapper-table { background-color: ${pageBackground}; }</style><![endif]-->`,
    '<!--[if mso | IE]><style type="text/css">.hse-column-container { border: none !important; padding: 0 !important; }</style><![endif]-->',
    '<!--[if !((mso)|(IE))]><!-- --><style type="text/css">',
    // The gutter's own phone rule used to sit here for every template; it is emitted by the
    // first padded cell now (context.ts, `padClass`), so a template with none carries none.
    // `.moz-text-html` is the class Thunderbird puts on the body, which is why nothing in the
    // output carries it and the linter's unused-rule check knows to let it through.
    `.moz-text-html .hse-column-container { max-width:${w}px !important; width:${w}px !important } .moz-text-html .hse-column { display:table-cell; vertical-align:top } .moz-text-html .hse-section .hse-size-12 { max-width:${w}px !important; width:${w}px !important }`,
    `@media ${desk} { .hse-column-container { max-width:${w}px !important; width:${w}px !important } .hse-column { display:table-cell; vertical-align:top } .hse-section .hse-size-12 { max-width:${w}px !important; width:${w}px !important } }`,
    // The legal footer's own phone rules used to be here, pinned to the navy preset. They are
    // emitted by the footer now, in the colour its section actually has — see blocks/legal.ts.
    '/* Phone sizes for headings and anything typed in the rich text editor. */',
    `@media ${phone} {`,
    `  ${phoneTypeCss(ds)}`,
    `  .sy-rich p, .sy-rich li, .sy-rich blockquote { font-size:${body.mobileSize}px !important }`,
    ...mobile,
    '}',
    // Three rules for markup nothing here emits and HubSpot may: a CTA the team inserts into rich
    // text, the screen-reader text HubSpot adds, and its inline editor's paragraph wrappers. The
    // rest of the boilerplate this file used to carry — footer variants that were never built,
    // module styles for modules a coded template cannot hold, hide-on-phone classes nothing sets —
    // is gone, and `tests/lint.test.ts` keeps it gone: a rule that matches nothing is a warning.
    'a.cta_button { -moz-box-sizing:content-box !important; -webkit-box-sizing:content-box !important; box-sizing:content-box !important; vertical-align:middle }',
    '.hs-screen-reader-text { clip:rect(1px, 1px, 1px, 1px); height:1px; overflow:hidden; position:absolute !important; width:1px }',
    '.ShadowHTML p, .sh-modified-inline p { margin:0 }',
    '</style><!--<![endif]-->',
    '<style type="text/css">',
    // Gmail and Apple auto-link addresses and phone numbers and then restyle them. This is the
    // first of the two defences; the second is wrapping the address in our own anchor (2.7).
    '#hs_body #hs_cos_wrapper_main a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important }',
    'a { text-decoration:underline } p { margin:0 } body { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; -webkit-font-smoothing:antialiased; moz-osx-font-smoothing:grayscale }',
    'table { border-spacing:0; mso-table-lspace:0; mso-table-rspace:0 } table, td { border-collapse:collapse } img { -ms-interpolation-mode:bicubic } p, a, li, td, blockquote { mso-line-height-rule:exactly }',
    '</style>',
    '<!-- HubSpot inlines this block onto matching elements at send time, so formatting the team applies in the rich text editor (headings, lists, quotes, links, rules) keeps these styles in every client, Gmail included. -->',
    '<style type="text/css" id="hs-inline-css">',
    '/* Type scale: 1.5 line-height for reading text, tighter for headings, a real margin after every block. */',
    ...richTextCss(ds),
    `.sy-rich li { margin:0 0 ${rt.listGap}px 0; line-height:${rt.listLineHeight}% } .sy-rich li ul, .sy-rich li ol { margin:${rt.listGap}px 0 0 ${rt.listIndent}px }`,
    `.sy-rich a { color:${brand}; text-decoration:underline }`,
    '.sy-rich strong, .sy-rich b { font-weight:bold } .sy-rich em, .sy-rich i { font-style:italic } .sy-rich u { text-decoration:underline }',
    // The rest of the inline vocabulary the slash menu offers. Stated rather than left to the
    // client, because Outlook's defaults for these are not everyone else's.
    '.sy-rich s { text-decoration:line-through } .sy-rich sup, .sy-rich sub { font-size:75%; line-height:0 } .sy-rich sup { vertical-align:super } .sy-rich sub { vertical-align:sub }',
    `.sy-rich blockquote { margin:0 0 ${body.marginBottom}px 0; padding:4px 0 4px ${rt.quoteInset}px;${rt.quoteBar ? ` border-left:${rt.quoteBar}px solid ${quoteColour};` : ''} font-style:${rt.quoteItalic ? 'italic' : 'normal'}; line-height:${body.lineHeight}% }`,
    `.sy-rich hr { border:0; border-top:${rt.ruleWidth}px solid ${ruleColour}; margin:0 0 ${body.marginBottom}px 0; height:0 }`,
    '.sy-rich img { max-width:100%; height:auto; border:0 }',
    '.sy-rich pre, .sy-rich code { font-family:Menlo, Consolas, monospace; font-size:15px; white-space:pre-wrap }',
    '.sy-rich small { font-size:14px }',
    '.sy-rich table { border-collapse:collapse } .sy-rich td, .sy-rich th { padding:4px 8px; border:1px solid #d9d8d3; font-size:16px; line-height:125% }',
    // The footer's own scale. Deliberately flat — everything is one of two sizes on a navy band,
    // because a footer that honoured the full type scale would shout over the email above it.
    `.sy-rich-footer h1, .sy-rich-footer h2 { margin:0; line-height:100%; font-size:20px; font-weight:bold; color:${onDark} }`,
    `.sy-rich-footer h3 { margin:0; line-height:150%; font-size:17px; font-weight:bold; color:${onDark} }`,
    `.sy-rich-footer h4, .sy-rich-footer h5, .sy-rich-footer h6 { margin:0; line-height:125%; font-size:14px; font-weight:bold; color:${onDark} }`,
    `.sy-rich-footer p, .sy-rich-footer li { margin:0; line-height:125%; font-size:14px; color:${onDark} }`,
    '.sy-rich-footer ul, .sy-rich-footer ol { margin:0 0 0 20px; padding:0 }',
    `.sy-rich-footer a { color:${onDark}; font-weight:bold; text-decoration:none }`,
    ...inlineCss,
    '</style>',
  ].join('\n');
}

export interface ShellOptions {
  ds: DesignSystem;
  title: string;
  pageBackground: string;
  bodyClass: string;
  head: string;
  body: string;
}

/** The full document. `<v:background>` is the only way Outlook paints a page background. */
/**
 * The frame around the whole email, and the space outside it.
 *
 * Both are off by default and both emit nothing at all when they are, so every template written
 * before they existed still compiles byte for byte — which is what `tests/hubspot-contract.test.ts`
 * and the golden file are there to keep true.
 *
 * The frame is a div *and* a conditional table because Word has no `max-width`: left to the div
 * alone, Outlook would draw the border at the width of the window instead of the width of the
 * email, which is the one place a frame is worse than no frame.
 *
 * The border is drawn **outside** the email's width — the content box stays exactly
 * `containerWidth` and the frame adds to the overall, the same way an image's border does. The
 * first version did the opposite, with `box-sizing:border-box` so that "email width" kept meaning
 * the outside edge. It looked right and was not: the desktop rules above force
 * `.hse-size-12 { width:<containerWidth>px !important }`, so the content stayed at its full width
 * inside a content box two borders narrower and spilled over the right edge, painting out the
 * right-hand border. A frame with three sides is worse than either honest answer.
 *
 * The conditional's table is `containerWidth + 2 × border` because Word's table width is the
 * overall width, borders included. Erring wide costs a few pixels of page background in Outlook;
 * erring narrow would reproduce the same overflow there, where nobody would see it.
 */
function frame(body: string, ds: DesignSystem): string {
  const width = ds.pageBorderWidth;
  if (!width) return body;
  const colour = colorOf(ds, ds.pageBorderColor) ?? '#000000';
  const w = ds.containerWidth;
  const outer = w + width * 2;
  return (
    `<!--[if gte mso 9]><table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" width="${outer}" style="width:${outer}px; border:${width}px solid ${colour}"><tbody><tr><td valign="top" style="padding:0"><![endif]-->\n` +
    `<div class="hse-body-frame" style="max-width:${w}px; margin:0 auto; border:${width}px solid ${colour}">\n` +
    `${body}\n` +
    '</div>\n' +
    '<!--[if gte mso 9]></td></tr></tbody></table><![endif]-->'
  );
}

export function emailDocument({ ds, title, pageBackground, bodyClass, head, body }: ShellOptions): string {
  const font = fontDecl(ds);
  const size = typeOf(ds, 'body').size;
  // The document's default text colour, from the preset rather than from a palette key.
  const ink = themeOf(ds, 'cream').text;
  // Padding on the wrapper cell, not a margin on anything: a td's padding is the one box model
  // every client including Word agrees about, and the page background shows through it — which is
  // what makes the gap read as the email sitting *on* the page.
  const margin = ds.pageMargin > 0 ? `; padding:${ds.pageMargin}px` : '';
  return (
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml" lang="en">\n' +
    `<head>\n<title>${title}</title>\n` +
    '<meta name="x-apple-disable-message-reformatting">\n' +
    '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n' +
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    `${head}\n</head>\n` +
    `<body id="hs_body" class="${bodyClass}" bgcolor="${pageBackground}" style="margin:0 !important; padding:0 !important; background-color:${pageBackground}; ${font} font-size:${size}px; color:${ink}; word-break:break-word">\n` +
    `<!--[if gte mso 9]><v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t"><v:fill type="tile" size="100%,100%" color="${pageBackground}"/></v:background><![endif]-->\n` +
    `<div class="hse-body-background" lang="en" style="background-color:${pageBackground}" bgcolor="${pageBackground}">\n` +
    `<table role="presentation" class="hse-body-wrapper-table" cellpadding="0" cellspacing="0" style="margin:0; padding:0; width:100% !important; min-width:320px !important; height:100% !important; background-color:${pageBackground}" width="100%" height="100%" bgcolor="${pageBackground}"><tbody><tr>\n` +
    `<td class="hse-body-wrapper-td" valign="top" style="${font} font-size:${size}px; color:${ink}; word-break:break-word${margin}">\n<div id="hs_cos_wrapper_main">\n\n` +
    `${frame(body, ds)}\n\n</div>\n</td></tr></tbody></table>\n</div>\n</body>\n</html>\n`
  );
}

/** HubSpot will not offer the template when creating an email without this (learnings 1.1). */
export function annotation(label: string, date: string): string {
  return (
    `<!--\n  templateType: email\n  isAvailableForNewContent: true\n  label: ${label.replace(/\n/g, ' ')}\n-->\n` +
    `{# Generated by Template Studio on ${date}. Edit the template in the app and re-export rather than editing this file by hand. #}\n`
  );
}
