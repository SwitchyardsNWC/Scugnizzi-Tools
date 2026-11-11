// Vertical space, as a real table row. Outlook ignores heights on empty divs.

import { frag, type IRNode } from '../ir.ts';
import { section, spacerRow } from '../layout.ts';
import type { BuildContext } from '../context.ts';
import type { Section, SpacerBlock } from '../../model/types.ts';
import type { BlockParts } from './fields.ts';

export function spacerParts(block: SpacerBlock, ctx: BuildContext): BlockParts {
  void ctx;
  // Zero is a height somebody chose — it is how a stack loses its gap — so only a missing or broken number falls
  // back to 20. `|| 20` read 0 as unset, and the outline said "Spacer · 0px" over 20px of space.
  const height = Number.isFinite(block.height) ? Math.max(0, block.height) : 20;
  const markup = spacerRow(height);
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
