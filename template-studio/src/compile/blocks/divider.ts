// A rule across the column.
//
// A bar rather than a border: a `<td>` with a height and a background colour is the one way to draw
// a line every client agrees about — it is the same shape as the spacer row, which Outlook has
// honoured for years — where `border-top` on an empty cell is exactly the kind of thing Word's
// engine rounds away or doubles.
//
// It renders inside an ordinary padded cell, so it respects the page gutter and can sit in a column
// of a multi-column row. That is the whole difference between this and the Stripes block, which
// paints a band on the section and runs edge to edge.

import { el, frag, raw, type IRNode } from '../ir.ts';
import { cell, section } from '../layout.ts';
import { boxOf, padClass, paddingOf, type BuildContext } from '../context.ts';
import { colorOf } from '../../model/design-system.ts';
import type { Column, DividerBlock, Section } from '../../model/types.ts';
import type { BlockParts } from './fields.ts';

export function dividerParts(block: DividerBlock, sec: Section, col: Column, ctx: BuildContext): BlockParts {
  const ds = ctx.ds;
  // The block's own colour, then the system's rule colour, then the section's text. A line has to
  // be drawn in *something*: `background-color:null` is a line nobody sees, and a divider that
  // quietly disappears is worse than one in the wrong colour.
  const color = colorOf(ds, block.color) ?? colorOf(ds, ds.richText.ruleColor) ?? sec.textColor;
  const height = Math.max(1, block.height | 0);
  const pct = Math.max(1, Math.min(100, block.width || 100));
  const full = pct >= 100;

  const rule = el(
    'table',
    {
      role: 'presentation',
      width: `${pct}%`,
      // `align` on the table is how a narrower rule is placed: `margin:0 auto` is ignored by Word,
      // and the attribute is honoured everywhere.
      align: full ? null : block.align,
      cellpadding: '0',
      cellspacing: '0',
      style: `width:${pct}%; border-collapse:collapse`,
    },
    [
      el('tbody', null, [
        el('tr', null, [
          el(
            'td',
            {
              height: String(height),
              bgcolor: color,
              style: `height:${height}px; line-height:${height}px; font-size:0; background-color:${color}; mso-line-height-rule:exactly`,
            },
            raw('&nbsp;'),
            { bg: color },
          ),
        ]),
      ]),
    ],
  );

  return {
    declaration: frag([]),
    markup: cell(rule, {
      ds,
      padding: paddingOf(col, ds),
      ...(padClass(col, ctx) ? { className: padClass(col, ctx)! } : {}),
      box: boxOf(col, ds),
    }),
    row: (padding) => cell(rule, { ds, padding, padded: false }),
    collapse: (inner) => inner,
  };
}

export function renderDivider(block: DividerBlock, sec: Section, col: Column, ctx: BuildContext): IRNode {
  const parts = dividerParts(block, sec, col, ctx);
  return section(parts.markup, { ds: ctx.ds, band: sec.bandColor, container: sec.containerColor });
}
