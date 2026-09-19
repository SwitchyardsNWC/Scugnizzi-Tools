// A picture from the folder, placed in an email as a new Image block.
//
// Jared, 2026-09-19: "allow the ability to drag an asset into the email and it creates the container needed
// for it." Dropped beside a block it joins that block's column; dropped on a section edge, or at the end, it
// gets a section, row and column of its own, the way a pasted block does (edit.ts, `insertBlocksAt`). The
// document stores the file's name, as every image does; a hosted URL replaces it before export.

import { createBlock } from './catalog.ts';
import { freshIds, insertBlocksAt, insertBlocksInColumn, takenFieldNames } from './edit.ts';
import type { ImageBlock, Template } from './types.ts';

export type PicturePlace =
  /** Into a column, at an index among its blocks. */
  | { kind: 'column'; columnId: string; index: number }
  /** A section of its own, at an index among the template's sections. */
  | { kind: 'section'; index: number };

/** `photos/team-photo_2.jpg` → `team photo 2`: a first alt text, to be written properly in the Inspector. */
export function altFor(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The email with the picture placed, and the new block's id (null only when the column is not there). */
export function placePicture(template: Template, name: string, place: PicturePlace | null): { template: Template; blockId: string | null } {
  const made = createBlock('image', { id: freshIds(template), taken: takenFieldNames(template) }) as ImageBlock;
  const block: ImageBlock = { ...made, src: name, alt: altFor(name) };
  if (place?.kind === 'column') {
    const column = template.sections.flatMap((s) => s.rows.flatMap((r) => r.columns)).find((c) => c.id === place.columnId);
    if (!column) return { template, blockId: null };
    const at = Math.max(0, Math.min(column.blocks.length, place.index));
    const next = insertBlocksInColumn(template, place.columnId, [block], at);
    const placed = next.sections.flatMap((s) => s.rows.flatMap((r) => r.columns)).find((c) => c.id === place.columnId)?.blocks[at];
    return { template: next, blockId: placed?.id ?? null };
  }
  const at = Math.max(0, Math.min(template.sections.length, place?.index ?? template.sections.length));
  const next = insertBlocksAt(template, [block], at);
  return { template: next, blockId: next.sections[at]?.rows[0]?.columns[0]?.blocks[0]?.id ?? null };
}
