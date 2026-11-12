// The space around several blocks at once.
//
// Jared, 2026-11-12: "Select multiple blocks and change their spacing together." A selection of blocks is a list of
// ids; each block keeps its space where its own Spacing panel keeps it — the column's padding for a block that
// shares a cell, the section's for one that draws its own band. So a side is read and written through the path the
// block's own panel uses (catalog.ts), never a second idea of where space lives.
//
// Pure: template and ids in, numbers or a template out.

import { CATALOG } from './catalog.ts';
import { readValue, setValue, siteOf } from './edit.ts';
import type { Block, Template } from './types.ts';

export type Side = 'above' | 'below' | 'left' | 'right';
export const SIDES: Side[] = ['above', 'below', 'left', 'right'];

/** Where each side may live, in the order a block's own Spacing panel would offer it. */
const PATHS: Record<Side, string[]> = {
  above: ['column.padTop', 'section.padTop'],
  below: ['column.padBottom', 'section.padBottom'],
  left: ['column.padLeft'],
  right: ['column.padRight'],
};

/** The path a block's own Spacing panel edits for a side, or null when it has no such control (a Spacer, the stripes). */
export function sidePath(block: Pick<Block, 'type'>, side: Side): string | null {
  const paths = CATALOG[block.type].groups.filter((g) => g.name === 'Spacing').flatMap((g) => g.controls.map((c) => c.path));
  return PATHS[side].find((p) => paths.includes(p)) ?? null;
}

export interface SideRead {
  /** How many of the blocks have this side at all. */
  count: number;
  /** The one value they share. For the sides, null is "following Design › Page padding". Undefined when they differ. */
  value: number | null | undefined;
  /** They do not all say the same thing. */
  mixed: boolean;
}

function sitesFor(template: Template, ids: string[], side: Side) {
  return ids.flatMap((id) => {
    const site = siteOf(template, id);
    const block = site?.column.blocks[site.index];
    const path = block ? sidePath(block, side) : null;
    return site && block && path ? [{ selection: { kind: 'block' as const, sectionId: site.section.id, blockId: id }, path }] : [];
  });
}

export function readSide(template: Template, ids: string[], side: Side): SideRead {
  const sites = sitesFor(template, ids, side);
  const values = sites.map(({ selection, path }) => {
    const v = readValue(template, selection, path);
    return typeof v === 'number' ? v : null;
  });
  if (values.length === 0) return { count: 0, value: undefined, mixed: false };
  const mixed = values.some((v) => v !== values[0]);
  return { count: values.length, value: mixed ? undefined : values[0]!, mixed };
}

/**
 * The same space on one side of every block that has that side. Null on the left or right hands the side back to
 * the page gutter. Blocks without the side are left as they are, and so is everything else about every block.
 */
export function setSide(template: Template, ids: string[], side: Side, value: number | null): Template {
  // Above and below are plain numbers with nothing to follow; only the sides can be handed back.
  if (value === null && (side === 'above' || side === 'below')) return template;
  return sitesFor(template, ids, side).reduce((t, { selection, path }) => setValue(t, selection, path, value), template);
}
