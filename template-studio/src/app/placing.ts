// Where a drop lands, in terms of the document.
//
// The canvas resolves a pointer position to a `DropSpot` — "before that block", "into that
// column", "at the end" — and stops there, because it knows about markup and rectangles and not
// about the document. Turning one into a column and an index is this side's job.

import { siteOf } from '../model/edit.ts';
import type { Template } from '../model/types.ts';
import type { DropSpot } from './Preview.tsx';

export type Place =
  /** Into a column, at an index among its blocks — beside what is already there. */
  | { kind: 'column'; columnId: string; index: number }
  /** A full-width section of its own, at an index among the template's sections. */
  | { kind: 'section'; index: number };

/**
 * Whether the block's column is shared — a row of columns, or a group — so an add or a paste
 * beside it lands in the column rather than in a section of its own.
 */
export const shared = (site: { row: { columns: unknown[] }; column: { blocks: unknown[] } }) =>
  site.row.columns.length > 1 || site.column.blocks.length > 1;

/** The section a column is in, as an index — the place a section dropped *on* it goes after. */
export function sectionAfter(template: Template, columnId: string): number {
  return template.sections.findIndex((s) => s.rows.some((r) => r.columns.some((c) => c.id === columnId))) + 1;
}

export function placeOf(template: Template, spot: DropSpot): Place | null {
  const sections = template.sections;
  if (spot.at === 'end') return { kind: 'section', index: sections.length };
  if (spot.at === 'section') {
    const at = sections.findIndex((s) => s.id === spot.sectionId);
    return at === -1 ? null : { kind: 'section', index: at + (spot.before ? 0 : 1) };
  }
  if (spot.at === 'column') {
    const column = template.sections.flatMap((s) => s.rows.flatMap((r) => r.columns)).find((c) => c.id === spot.columnId);
    return { kind: 'column', columnId: spot.columnId, index: spot.tail ? (column?.blocks.length ?? 0) : 0 };
  }
  const site = siteOf(template, spot.blockId);
  if (!site) return null;
  // Beside a block means in its column — a group, if it was alone (learnings 3.59). The canvas
  // offers the section edges separately, so this is what the middle of a block means.
  return { kind: 'column', columnId: site.column.id, index: site.index + (spot.before ? 0 : 1) };
}
