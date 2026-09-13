// Button.
//
// Two fields, declared one after the other so they sit together in the Contents panel (learnings
// 1.4): the label, and the link. A blank label hides the whole block including its spacing
// (learnings 2.11) — the conditional wraps the section, not the anchor.
//
// Separate desktop and mobile sizes matter more here than anywhere else: an 18px label wraps inside
// a footer column, and a wrapped button looks broken rather than small (learnings 2.10).

import { frag, type IRNode } from '../ir.ts';
import { button, cell, section } from '../layout.ts';
import { boxOf, padClass, paddingOf, type BuildContext } from '../context.ts';
import type { ButtonBlock, Column, Section } from '../../model/types.ts';
import { textContent, type BlockParts } from './fields.ts';

export function buttonParts(block: ButtonBlock, sec: Section, col: Column, ctx: BuildContext): BlockParts {
  void sec;
  const label = textContent(block.lock, block.text);
  const link = textContent(block.link, block.href);

  // The phone size is the variant's, not the block's, so one class serves every button of that
  // variant. Zero means "the same size on a phone" and emits no rule at all.
  const variant = ctx.ds.buttons[block.style];
  const mobile = variant?.mobileSize ?? 0;
  let cls: string | undefined;
  if (mobile > 0) {
    cls = `sy-bt-${block.style}`;
    ctx.once(cls, () => ctx.mobile.push(`.${cls} { font-size:${mobile | 0}px !important }`));
  }

  const pill = button({
    ds: ctx.ds,
    label: label.value,
    href: link.attr,
    variant: block.style,
    align: block.align,
    fontSize: 0,
    ...(cls ? { className: cls } : {}),
  });
  const padded = cell(pill, {
    ds: ctx.ds,
    padding: paddingOf(col, ctx.ds),
    ...(padClass(col, ctx) ? { className: padClass(col, ctx)! } : {}),
    box: boxOf(col, ctx.ds),
  });

  // Two fields, so the declaration is a fragment of both — they sit together in the Contents panel
  // because they are emitted together (learnings 1.4).
  return {
    declaration: frag([label.declaration, link.declaration]),
    markup: padded,
    row: (padding) => cell(pill, { ds: ctx.ds, padding, padded: false }),
    collapse: label.collapse,
  };
}

export function renderButton(block: ButtonBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const parts = buttonParts(block, sec, col, ctx);

  // The conditional wraps the whole section, which is what every other block does. v1 wrapped only
  // the padded cell and left an empty section behind — harmless, because a button's section carries
  // no padding, but it meant one block collapsed differently from the rest for no reason anyone
  // could state. A blank label now removes the section outright (learnings 2.11).
  const markup = section(parts.markup, { ds: ctx.ds, band: sec.bandColor, container: sec.containerColor });

  return frag([parts.declaration, parts.collapse(markup)]);
}
