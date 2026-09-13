// Freeform: a picture in the email, a drawing on the canvas.
//
// The block's one tree holds both, through a `mode` node: the canvas gets the recipe drawn live
// as inline SVG, so a layer moves as it is dragged; the file gets an `<img>` of the rendered
// picture, which is the only thing an email client can show. The picture's `src` is a local file
// straight after rendering and a hosted URL once it is uploaded — the same path every image takes,
// with the same check refusing the export in between (learnings 3.36).

import { byMode, frag, raw, voidEl, type IRNode } from '../ir.ts';
import { imgStyle, imageCell, section } from '../layout.ts';
import { boxOf, padClass, paddingOf, type BuildContext } from '../context.ts';
import { freeformSvg } from '../freeform.ts';
import type { Column, FreeformBlock, Section } from '../../model/types.ts';
import type { BlockParts } from './fields.ts';

export function freeformParts(block: FreeformBlock, col: Column, ctx: BuildContext): BlockParts {
  const ds = ctx.ds;
  const align = block.align || 'center';
  const picture = byMode(
    raw(freeformSvg(block, ds)),
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

export function renderFreeform(block: FreeformBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const parts = freeformParts(block, col, ctx);
  return section(parts.markup, { ds: ctx.ds, band: sec.bandColor, container: sec.containerColor });
}
