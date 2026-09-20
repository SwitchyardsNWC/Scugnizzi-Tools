// Rich text — the block the team does most of its work in.
//
// The per-block size and line height go into the `hs-inline-css` block, in the same stylesheet as
// the base `.sy-rich` scale, because HubSpot inlines those rules onto matching elements at send and
// that is the only way to style what the team types (learnings 1.9). Gmail strips embedded styles
// and keeps inline ones, so nothing else reaches it.
//
// Line height carries `!important` deliberately: pasted content arrives with its own inline
// line-height, and without it the block's setting loses (learnings 3.5).

import { frag, type IRNode } from '../ir.ts';
import { cell, hasTextInset, section, textInset } from '../layout.ts';
import { boxOf, padClass, paddingOf, type BuildContext } from '../context.ts';
import type { Column, RichTextBlock, Section } from '../../model/types.ts';
import { richContent, type BlockParts } from './fields.ts';
import { richHtml } from '../friendly.ts';
import { colorOf, typeOf } from '../../model/design-system.ts';

export function richTextParts(block: RichTextBlock, sec: Section, col: Column, ctx: BuildContext): BlockParts {
  const color = colorOf(ctx.ds, typeOf(ctx.ds, 'body').color ?? null) ?? sec.textColor;

  // Size, line height and phone size all come from the `body` role now, and `.sy-rich` already
  // carries them — so a rich text block contributes no per-block CSS for any of it. What is left is
  // the link colour, which varies by section rather than by block: keyed by the colour, emitted
  // once, and shared by every block that sits on the same background.
  //
  // It has to live in `hs-inline-css` rather than the ordinary stylesheet, because that is the
  // block HubSpot inlines onto matching elements at send and therefore the only one that reaches
  // Gmail (learnings 1.9).
  const cls = `sy-rtl-${sec.linkColor.replace('#', '').toLowerCase()}`;
  ctx.once(cls, () => ctx.inlineCss.push(`.${cls} a { color:${sec.linkColor} }`));

  const content = richContent(block.lock, richHtml(block.html, sec.linkColor), typeOf(ctx.ds, 'body').marginBottom);
  // The words, in the extra space the system asks for around every text block (layout.ts, textInset); nothing at
  // zero. With an inset, `sy-rich` rides the inner cell, so the canvas still opens the paragraphs' own container
  // for editing and the inlined `.sy-rich p` rules still match from above them.
  const rich = `sy-rich ${cls}`;
  const inset = hasTextInset(ctx.ds);
  const words = inset ? textInset(content.value, ctx.ds, rich) : content.value;
  const outerClass = (side: string | null) => (inset ? side : [rich, side].filter(Boolean).join(' ') || null);

  // Bottom padding defaults to 0 because the last paragraph's own margin already provides it;
  // adding more is how a text block ends up with a double gap under it.
  return {
    declaration: content.declaration,
    markup: cell(words, {
      ds: ctx.ds,
      padding: paddingOf(col, ctx.ds),
      color,
      linkColor: sec.linkColor,
      ...(outerClass(padClass(col, ctx)) ? { className: outerClass(padClass(col, ctx))! } : {}),
      box: boxOf(col, ctx.ds),
      align: block.align,
    }),
    // The class stays on the row: `.sy-rich` is what the inlined rules match against, and it has
    // to wrap this block's markup and nothing else's.
    row: (padding) => cell(words, { ds: ctx.ds, padding, color, linkColor: sec.linkColor, ...(inset ? {} : { className: rich }), align: block.align, padded: false }),
    collapse: content.collapse,
  };
}

export function renderRichText(block: RichTextBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const parts = richTextParts(block, sec, col, ctx);
  const markup = section(parts.markup, { ds: ctx.ds, band: sec.bandColor, container: sec.containerColor });

  // Declaration, then conditional, then markup — the one arrangement that satisfies learnings
  // 1.4, 1.5 and 2.11 at once. Exporting the field is what makes the section wrappable at all;
  // under v1 parity `collapse` is the identity and the tag renders where it stands.
  return frag([parts.declaration, parts.collapse(markup)]);
}
