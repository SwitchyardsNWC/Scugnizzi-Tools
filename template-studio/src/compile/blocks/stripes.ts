// Stripes: full-width rules. A stripe of zero height is dropped, so the block doubles as a single
// line without needing a second block type.

import { frag, type IRNode } from '../ir.ts';
import { section, spacerRow } from '../layout.ts';
import type { BuildContext } from '../context.ts';
import type { StripesBlock } from '../../model/types.ts';
import { colorOf } from '../../model/design-system.ts';

export function renderStripes(block: StripesBlock, ctx: BuildContext): IRNode {
  const bands = block.stripes
    .map((s) => ({ height: s.height, band: colorOf(ctx.ds, s.color) }))
    .filter((s) => s.height > 0 && s.band)
    .map((s) => section(spacerRow(s.height), { ds: ctx.ds, band: s.band }));
  return frag(bands);
}
