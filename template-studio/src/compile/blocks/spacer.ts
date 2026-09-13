// Vertical space, as a real table row. Outlook ignores heights on empty divs.

import { frag, type IRNode } from '../ir.ts';
import { section, spacerRow } from '../layout.ts';
import type { BuildContext } from '../context.ts';
import type { Section, SpacerBlock } from '../../model/types.ts';
import type { BlockParts } from './fields.ts';

export function spacerParts(block: SpacerBlock, ctx: BuildContext): BlockParts {
  void ctx;
  const markup = spacerRow(block.height || 20);
  // In a stack the spacer *is* the space: the row builder puts no gap on either side of it, so the
  // number on the block is the number on the page.
  return { declaration: frag([]), markup, row: () => markup, collapse: (inner) => inner };
}

export function renderSpacer(block: SpacerBlock, sec: Section, ctx: BuildContext): IRNode {
  return section(spacerParts(block, ctx).markup, {
    ds: ctx.ds,
    band: sec.bandColor,
    container: sec.containerColor,
  });
}
