// Top bar: the band across the very top, with the uppercase tagline.
//
// It draws its section's preset — band, container and text — like every other block. It used to
// draw a preset called `navy` in white whatever its section said, which was fine for the one
// palette that has a navy and wrong for every other: a template built on an imported system got a
// bar it could not recolour, and the Background picker on it was the one dial in the app wired to
// nothing.

import { el, frag, type IRNode } from '../ir.ts';
import { cell, section } from '../layout.ts';
import { boxOf, padClass, paddingOf, type BuildContext } from '../context.ts';
import type { Column, Section, TopbarBlock } from '../../model/types.ts';
import { textContent, type BlockParts } from './fields.ts';
import { fontOf, hasOwnFont, typeOf } from '../../model/design-system.ts';

/** The tagline itself: an h2 in the top bar role, with the section's ink and the block's alignment. */
function tagline(block: TopbarBlock, sec: Section, ctx: BuildContext): IRNode {
  const content = textContent(block.lock, block.text);
  // Sized by the `topbar` type role. One class, emitted once — there is one top bar per email, and
  // even if there were two they would be the same size.
  const t = typeOf(ctx.ds, 'topbar');
  const cls = 'sy-tagline';
  ctx.once(cls, () =>
    ctx.mobile.push(`.${cls} { font-size:${t.mobileSize}px !important; line-height:${t.lineHeight}% !important }`),
  );

  const ink = sec.textColor;
  const align = block.align ?? 'center';
  // The role, all of it — including the two the first version dropped. Tracking and a font of the
  // role's own are exactly what a small uppercase tagline is set with, and the Type panel offered
  // both for this role while the block ignored them.
  const font = hasOwnFont(ctx.ds, 'topbar') ? `; font-family:${fontOf(ctx.ds, 'topbar')}` : '';
  const track = t.letterSpacing ? `; letter-spacing:${t.letterSpacing}px` : '';
  const words = el('span', { style: `color:${ink}` }, content.value);
  const href = block.href?.trim();
  return el(
    'h2',
    {
      class: cls,
      style: `margin:0; text-align:${align}${font}; font-size:${t.size}px; line-height:${t.lineHeight}%; font-weight:${t.weight}; text-transform:${t.uppercase ? 'uppercase' : 'none'}${track}; color:${ink}`,
      align,
    },
    // A link in the section's ink, not the link colour: a tagline that turns red because it is
    // clickable stops being a tagline.
    href ? el('a', { href, target: '_blank', style: `color:${ink}; text-decoration:none` }, words) : words,
  );
}

/** The top bar as a block that shares a cell: in a column, or in a group, with the cell's padding. */
export function topbarParts(block: TopbarBlock, sec: Section, col: Column, ctx: BuildContext): BlockParts {
  const content = textContent(block.lock, block.text);
  const h2 = tagline(block, sec, ctx);
  const side = padClass(col, ctx);
  return {
    declaration: content.declaration,
    markup: cell(h2, {
      ds: ctx.ds,
      padding: paddingOf(col, ctx.ds),
      color: sec.textColor,
      linkColor: sec.textColor,
      ...(side ? { className: side } : {}),
      box: boxOf(col, ctx.ds),
    }),
    row: (padding) => cell(h2, { ds: ctx.ds, padding, color: sec.textColor, linkColor: sec.textColor, padded: false }),
    collapse: content.collapse,
  };
}

/** The top bar alone in its section: the band it always drew, with the section's own padding. */
export function renderTopbar(block: TopbarBlock, sec: Section, ctx: BuildContext): IRNode {
  const content = textContent(block.lock, block.text);
  const ink = sec.textColor;
  const inner = el('div', null, tagline(block, sec, ctx), { text: ink });

  return frag([
    content.declaration,
    section(inner, {
      ds: ctx.ds,
      band: sec.bandColor,
      container: sec.containerColor,
      padTop: sec.padTop,
      padBottom: sec.padBottom,
    }),
  ]);
}
