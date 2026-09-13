// Image.
//
// `mode: 'module'` hands the team HubSpot's own image picker via `@hubspot/image_email` and reads
// the values back out through the template context, so the template controls the markup and can
// leave the block out entirely until an image is picked.
//
// **Verified in a live send, 2026-09-11** (learnings 1.6): the link arrives, as a bare URL string,
// at `widget_data.<name>.link` — the path used below. `.link.url`, `.link.url.href` and
// `.img.link` are all empty, so none of the shapes guessed at in earlier drafts exist. `mode:
// 'field'` stays implemented as the older two-field approach, but nothing needs it now.
//
// Two things that are settled and easy to get wrong:
//
//   - **The width comes from the block, never from the module.** The same send proved why: the
//     module reports `img.width` as the *file's* natural width (a 1080px upload came back as 1080
//     even though 400 was declared), so a compiler that trusted it would reproduce v1's shipped
//     bug exactly (learnings 1.6a, 2.9). There is a regression test for this.
//   - The module is declared unconditionally and the conditional wraps our own markup. A module
//     inside an `{% if %}` that starts false never appears in the Contents panel at all, which is
//     how you ship a checkbox that does nothing (learnings 1.5).

import { attrPrint, decl, el, frag, voidEl, when, wrapWhen, type Field, type IRNode, type Test } from '../ir.ts';
import { imgStyle, imageCell, section } from '../layout.ts';
import { boxOf, padClass, paddingOf, type BuildContext } from '../context.ts';
import type { Column, ImageBlock, Section } from '../../model/types.ts';
import type { DesignSystem } from '../../model/design-system.ts';
import { hublAttr } from '../escape.ts';
import type { BlockParts } from './fields.ts';

/** Builds the padded image cell. The section around it, if any, is the row's business. */
type CellOf = (inner: IRNode) => IRNode;
/** The same, as a row of a stacked column: the gap below, no gutter, no box. */
type RowOf = (inner: IRNode, padding: string) => IRNode;
const KEEP: (inner: IRNode) => IRNode = (inner) => inner;

const LINK_STYLE = 'color:#00a4bd';

/**
 * What the canvas shows for an image the team has not picked yet.
 *
 * learnings 3.1 says preview mode substitutes sample content, and this is the case that needs it
 * most: with no default, the branch "an image is set" would otherwise render an `<img src="">` —
 * an invisible gap where a designer is trying to judge spacing. A labelled box at the block's real
 * width shows where it will sit and how big it will be.
 *
 * This is preview-only by construction, not by a flag: it is the fallback on a `print`, and HubL
 * mode emits the interpolation instead of the fallback. Nothing in the exported template can reach
 * it — there is a test.
 */
function samplePlaceholder(label: string, width: number, font: string): string {
  const height = Math.round(width / 2);
  const text = `${label} · ${width}px`.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#9aa0a6" stroke-width="2" stroke-dasharray="7 5"/>` +
    `<text x="50%" y="50%" fill="#9aa0a6" font-family="${font.replace(/,\s*/g, ',')}" font-size="15" ` +
    `text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function imageParts(block: ImageBlock, col: Column, ctx: BuildContext): BlockParts {
  const padding = paddingOf(col, ctx.ds);
  const side = padClass(col, ctx);
  const width = block.width || ctx.ds.image.defaultWidth;
  const align = block.align || 'center';
  const box = boxOf(col, ctx.ds);
  const cellOf: CellOf = (inner) => imageCell(inner, padding, align, ctx.ds, side, box);
  const rowOf: RowOf = (inner, gap) => imageCell(inner, gap, align, ctx.ds, null, null, false);

  if (block.mode === 'static' || !block.lock.editable) {
    // A locked image with no URL is nothing at all, not an empty box: `collapse` swallows whatever
    // wrapper the row puts around it, section included.
    if (!block.src.trim()) return { declaration: frag([]), markup: frag([]), row: () => frag([]), collapse: () => frag([]) };
    const img = voidEl('img', { alt: block.alt, src: block.src, style: imgStyle(ctx.ds), width, align: 'middle' });
    const inner = block.href ? el('a', { href: block.href, target: '_blank', style: LINK_STYLE }, img) : img;
    return { declaration: frag([]), markup: cellOf(inner), row: (gap) => rowOf(inner, gap), collapse: KEEP };
  }

  if (block.mode === 'module') return moduleImage(block, cellOf, rowOf, width, ctx.ds);
  return pickerImage(block, cellOf, rowOf, width, ctx.ds);
}

export function renderImage(block: ImageBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const parts = imageParts(block, col, ctx);
  const markup = section(parts.markup, { ds: ctx.ds, band: sec.bandColor, container: sec.containerColor });
  return frag([parts.declaration, parts.collapse(markup)]);
}

/** HubSpot's own image module supplies the editor UI; the template renders the image itself. */
function moduleImage(block: ImageBlock, cellOf: CellOf, rowOf: RowOf, width: number, ds: DesignSystem): BlockParts {
  const name = block.lock.field;
  const params: Array<[string, string]> = [
    ['alignment', `"${hublAttr(block.align || 'center')}"`],
    ['img', `{ "src": "${hublAttr(block.src)}", "alt": "${hublAttr(block.alt)}", "width": ${width} }`],
  ];
  if (block.href.trim()) params.push(['link', `"${hublAttr(block.href)}"`]);

  const field: Field = {
    name,
    kind: 'module',
    label: block.lock.label,
    modulePath: '@hubspot/image_email',
    moduleParams: params,
    exported: true,
    presentByDefault: block.src.trim() !== '',
  };

  const base = `widget_data.${name}`;
  // `.link`, not `.link.url` — see the header. The module's own `img.link` is always empty.
  const linkTest: Test = { k: 'path', path: `${base}.link`, field: `${name}__link` };
  const sample = block.src || samplePlaceholder(block.lock.label, width, ds.fontStack);
  const img = voidEl('img', {
    alt: attrPrint(`${base}.img.alt`, block.alt || block.lock.label),
    src: attrPrint(`${base}.img.src`, sample),
    style: imgStyle(ds),
    width,
    align: 'middle',
  });
  const linked = wrapWhen(linkTest, 'a', { href: attrPrint(`${base}.link`, block.href || '#'), target: '_blank', style: LINK_STYLE }, img);

  const present: Test = { k: 'path', path: `${base}.img.src`, field: name };
  return {
    declaration: decl(field),
    markup: cellOf(linked),
    row: (gap) => rowOf(linked, gap),
    collapse: block.optional ? (inner) => when(present, inner) : KEEP,
  };
}

/**
 * The older shape: HubSpot's picker for the image, plus a separate text field for the URL, because
 * the picker's own link is not exposed to the template (learnings 1.6). Two fields the team has to
 * find, which is why it is not the default — but it is the fallback if question A comes back no.
 */
function pickerImage(block: ImageBlock, cellOf: CellOf, rowOf: RowOf, width: number, ds: DesignSystem): BlockParts {
  const name = block.lock.field;
  const linkName = `${name}_link`;

  const image: Field = {
    name,
    kind: 'module',
    label: block.lock.label,
    modulePath: '@hubspot/linked_image',
    moduleParams: [
      ['src', `"${hublAttr(block.src)}"`],
      ['alt', `"${hublAttr(block.alt)}"`],
      ['width', String(width)],
    ],
    exported: true,
    presentByDefault: block.src.trim() !== '',
  };
  const link: Field = {
    name: linkName,
    kind: 'text',
    label: `${block.lock.label} link (paste the URL here)`,
    value: block.href,
    exported: true,
  };

  const linkTest: Test = { k: 'textFilled', field: linkName };
  const img = voidEl('img', {
    alt: attrPrint(`widget_data.${name}.alt`, block.alt),
    src: attrPrint(`widget_data.${name}.src`, block.src),
    style: imgStyle(ds),
    width,
    align: 'middle',
  });
  const linked = wrapWhen(
    linkTest,
    'a',
    { href: attrPrint(`widget_data.${linkName}.value|trim`, block.href), target: '_blank', style: LINK_STYLE },
    img,
  );
  const present: Test = { k: 'path', path: `widget_data.${name}.src`, field: name };
  // Both declarations first, so the link field sits immediately after the image in the panel
  // (learnings 1.4) and neither is hidden inside the conditional (1.5).
  return {
    declaration: frag([decl(image), decl(link)]),
    markup: cellOf(linked),
    row: (gap) => rowOf(linked, gap),
    collapse: block.optional ? (inner) => when(present, inner) : KEEP,
  };
}
