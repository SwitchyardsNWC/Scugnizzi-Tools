// Block dispatch.
//
// Adding a block type means adding a file next to this one and a line here. In v1 it meant editing
// the source of a 116KB single file, which was the fourth reason listed for replacing it
// (brief.md, "What version one is and why it is being replaced").

import { frag, type IRNode } from '../ir.ts';
import type { BuildContext } from '../context.ts';
import type { Block, BlockType, Column, Section } from '../../model/types.ts';
import { STACKABLE } from '../../model/catalog.ts';

import { renderTopbar, topbarParts } from './topbar.ts';
import { renderStripes } from './stripes.ts';
import { renderSpacer, spacerParts } from './spacer.ts';
import { renderDivider, dividerParts } from './divider.ts';
import { renderImage, imageParts } from './image.ts';
import { renderHeading, headingParts } from './heading.ts';
import { renderRichText, richTextParts } from './richtext.ts';
import { renderButton, buttonParts } from './button.ts';
import { renderLegal } from './legal.ts';
import { renderFreeform, freeformParts } from './freeform.ts';
import { renderBrand, brandParts } from './brand.ts';
import { renderDndArea } from './dndarea.ts';
import type { BlockParts } from './fields.ts';

/**
 * The blocks that can sit inside a column of a multi-column row, or share a column with others.
 *
 * One list, kept with the catalog so the editor and the compiler cannot disagree about it. The
 * three that are not on it — the top bar, the stripes and the legal footer — each draw their own
 * full-width band, which is the one thing a cell cannot do. Excluded here as well as in the
 * interface, so the compiler cannot be asked to do it at all.
 */
export const COLUMN_BLOCKS: BlockType[] = STACKABLE;

/** A block's three pieces, for a row that provides its own wrapper. Null for a full-bleed block. */
export function blockParts(block: Block, sec: Section, col: Column, ctx: BuildContext): BlockParts | null {
  switch (block.type) {
    case 'heading':
      return headingParts(block, sec, col, ctx);
    case 'richtext':
      return richTextParts(block, sec, col, ctx);
    case 'button':
      return buttonParts(block, sec, col, ctx);
    case 'image':
      return imageParts(block, col, ctx);
    case 'spacer':
      return spacerParts(block, ctx);
    case 'divider':
      return dividerParts(block, sec, col, ctx);
    case 'topbar':
      return topbarParts(block, sec, col, ctx);
    case 'freeform':
      return freeformParts(block, col, ctx);
    case 'brand':
      return brandParts(block, sec, col, ctx);
    default:
      return null;
  }
}

export function renderBlock(block: Block, sec: Section, col: Column, ctx: BuildContext): IRNode {
  switch (block.type) {
    case 'topbar':
      return renderTopbar(block, sec, ctx);
    case 'stripes':
      return renderStripes(block, sec, ctx);
    case 'spacer':
      return renderSpacer(block, sec, ctx);
    case 'divider':
      return renderDivider(block, sec, col, ctx);
    case 'image':
      return renderImage(block, sec, col, ctx);
    case 'heading':
      return renderHeading(block, sec, col, ctx);
    case 'richtext':
      return renderRichText(block, sec, col, ctx);
    case 'button':
      return renderButton(block, sec, col, ctx);
    case 'legal':
      return renderLegal(block, sec, col, ctx);
    case 'freeform':
      return renderFreeform(block, sec, col, ctx);
    case 'brand':
      return renderBrand(block, sec, col, ctx);
    case 'dndarea':
      // Not in `blockParts`: the area draws its own full-width region and HubSpot's own editor owns
      // what goes inside it, so it can no more share a cell than the stripes or the legal footer.
      return renderDndArea(block, sec, ctx);
    default: {
      // Exhaustiveness: a new member of the Block union fails to compile until it is handled here,
      // rather than silently rendering nothing in a send.
      const never: never = block;
      void never;
      return frag([]);
    }
  }
}
