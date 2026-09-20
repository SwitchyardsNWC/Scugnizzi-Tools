// Heading.
//
// The whole section disappears when the heading is blank, gap included — not just the text
// (learnings 2.11). That is why `collapse` wraps the section rather than the h1.

import { el, frag, type IRNode } from '../ir.ts';
import { cell, section, textInset } from '../layout.ts';
import { boxOf, padClass, paddingOf, type BuildContext } from '../context.ts';
import { colorOf, fontOf, typeOf } from '../../model/design-system.ts';
import type { DesignSystem } from '../../model/design-system.ts';
import type { Column, HeadingBlock, Section } from '../../model/types.ts';
import { textContent, type BlockParts } from './fields.ts';

/**
 * A heading's inline style: the level's role, all of it.
 *
 * "All of it" is the fix, and it took two goes. The first pass took the size, the line height and
 * the font and left the weight, the capitals and the tracking to the browser's defaults — so a
 * Heading block set to H5 rendered as whatever the client thinks an `<h5>` weighs, while an `<h5>`
 * the team typed in HubSpot's editor picked up `font-weight:bold; text-transform:uppercase;
 * letter-spacing:0.6px` from `.sy-rich h5`. The same role, two renderings, in one email.
 *
 * It matches `richRule` in design-system.ts declaration for declaration on purpose. If one of them
 * grows a property the other must too, and there is a test comparing the pair.
 *
 * What stays different is the margin: a Heading block's spacing comes from the column it sits in,
 * where a heading inside rich text has only its own margin to work with.
 */
function levelStyle(level: HeadingBlock['level'], ds: DesignSystem): string {
  const t = typeOf(ds, level);
  const stack = fontOf(ds, level);
  // h1 always states the stack, because it is the first heading a client sees and the one most
  // likely to be re-styled. The others say so only when their role names a font of its own.
  const font = level === 'h1' || stack !== ds.fontStack ? `; font-family:${stack}` : '';
  const caps = t.uppercase ? '; text-transform:uppercase' : '';
  const track = t.letterSpacing ? `; letter-spacing:${t.letterSpacing}px` : '';
  return `margin:0; line-height:${t.lineHeight}%${font}; font-size:${t.size}px; font-weight:${t.weight}${caps}${track}`;
}

export function headingParts(block: HeadingBlock, sec: Section, col: Column, ctx: BuildContext): BlockParts {
  // The role, then the section. A role that pins its own colour stops being readable the moment it
  // lands on the navy band, which is why the section is the default and the role is opt-in. There is
  // no third level: a colour on the block would be a value with no name.
  const color = colorOf(ctx.ds, typeOf(ctx.ds, block.level).color ?? null) ?? sec.textColor;
  const content = textContent(block.lock, block.text);

  const style = levelStyle(block.level, ctx.ds);
  // One class per level, shared by every heading at that level — the phone size is the role's, so
  // there is nothing block-specific left to name. head.ts already emits the rule.
  const cls = `sy-${block.level}`;

  const heading = textInset(
    el(block.level, { class: cls, style: `${style}; text-align:${block.align}; color:${color}`, align: block.align }, content.value),
    ctx,
  );

  return {
    declaration: content.declaration,
    markup: cell(heading, {
      ds: ctx.ds,
      padding: paddingOf(col, ctx.ds),
      color,
      linkColor: sec.linkColor,
      // Null unless this block departs from the page gutter, in which case it is the class that
      // keeps it there on a phone — `.hs_padded`'s own rule is `!important`.
      ...(padClass(col, ctx) ? { className: padClass(col, ctx)! } : {}),
      box: boxOf(col, ctx.ds),
    }),
    row: (padding) => cell(heading, { ds: ctx.ds, padding, color, linkColor: sec.linkColor, padded: false }),
    collapse: content.collapse,
  };
}

export function renderHeading(block: HeadingBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const parts = headingParts(block, sec, col, ctx);
  const markup = section(parts.markup, { ds: ctx.ds, band: sec.bandColor, container: sec.containerColor });
  return frag([parts.declaration, parts.collapse(markup)]);
}
