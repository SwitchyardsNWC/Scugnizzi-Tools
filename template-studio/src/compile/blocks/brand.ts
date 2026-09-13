// Brand mark: a bundled SVG drawn live in a colour, shipped as a picture.
//
// The same two renderings as the freeform block, through the same `mode` node: the canvas gets the
// SVG so the colour and the size are seen as they are set; the file gets the rendered PNG, which is
// what a mail client can show. A mark with no picture is a check error; one older than its colour
// or width is a warning (learnings 3.66).

import { byMode, frag, raw, voidEl, type IRNode } from '../ir.ts';
import { imgStyle, imageCell, section } from '../layout.ts';
import { boxOf, padClass, paddingOf, type BuildContext } from '../context.ts';
import { colorOf } from '../../model/design-system.ts';
import { markOf } from '../../model/marks.ts';
import type { BrandBlock, Column, Section } from '../../model/types.ts';
import type { BlockParts } from './fields.ts';

/** The mark at a width, in a colour. Height follows the mark's own proportions. */
export function brandSvg(block: BrandBlock, ink: string): string {
  const mark = markOf(block.mark);
  const width = Math.max(1, block.width);
  const height = Math.round((width / mark.ratio) * 100) / 100;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" data-sy-brand="${mark.key}" viewBox="${mark.viewBox}" width="${width}" height="${height}" fill="${ink}" ` +
    `style="display:block; max-width:100%; height:auto" role="img" aria-label="${block.alt.replace(/"/g, '&quot;')}">${mark.body}</svg>`
  );
}

export function brandParts(block: BrandBlock, sec: Section, col: Column, ctx: BuildContext): BlockParts {
  const ds = ctx.ds;
  const ink = colorOf(ds, block.color) ?? sec.textColor;
  const align = block.align || 'center';
  const picture = byMode(
    raw(brandSvg(block, ink)),
    voidEl('img', { alt: block.alt, src: block.src, style: imgStyle(ds), width: block.width, align: 'middle' }),
  );
  const side = padClass(col, ctx);
  return {
    declaration: frag([]),
    markup: imageCell(picture, paddingOf(col, ds), align, ds, side, boxOf(col, ds)),
    row: (padding) => imageCell(picture, padding, align, ds, null, null, false),
    collapse: (inner) => inner,
  };
}

export function renderBrand(block: BrandBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const parts = brandParts(block, sec, col, ctx);
  return section(parts.markup, { ds: ctx.ds, band: sec.bandColor, container: sec.containerColor });
}
