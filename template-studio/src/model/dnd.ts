// Document queries and defaults for the drag and drop area.
//
// Its own file rather than a few helpers in edit.ts, because three layers need them and none of
// them should import the editor: the compiler asks whether a template has an area (it decides
// whether HubSpot's stylesheet tag goes in the head), the linter asks how many there are and how
// wide the container is, and the catalog builds the defaults for a new one.

import { newId } from './ids.ts';
import type { DndAreaBlock, DndColumn, DndModule, DndSection, Template } from './types.ts';

/**
 * HubSpot's floor for a drag and drop area, and the single most consequential number in this
 * feature: "the minimum width is set to 624 pixels, and this value cannot be overridden."
 *
 * The design system ships a 600px container, so a template holding an area has to be widened. That
 * is a lint error rather than a silent stretch, because quietly rendering an email 24px wider than
 * it was designed is the kind of thing nobody notices until it is in an inbox.
 */
export const DND_MIN_WIDTH = 624;

/** Every drag and drop area in the document, in document order. Normally none or one. */
export function dndAreas(template: Template): DndAreaBlock[] {
  const out: DndAreaBlock[] = [];
  for (const section of template.sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        for (const block of column.blocks) {
          if (block.type === 'dndarea') out.push(block);
        }
      }
    }
  }
  return out;
}

export const hasDndArea = (template: Template): boolean => dndAreas(template).length > 0;

/** Every module placed as default content, across every section and column of one area. */
export const modulesOf = (block: DndAreaBlock): DndModule[] =>
  block.sections.flatMap((s) => s.columns.flatMap((c) => c.modules));

// --- defaults ----------------------------------------------------------------------------------

export const newDndModule = (path: string, label: string): DndModule => ({
  id: newId('m'),
  path,
  label,
  params: [],
});

export const newDndColumn = (width = 12): DndColumn => ({ id: newId('c'), width, modules: [] });

export const newDndSection = (): DndSection => ({
  id: newId('s'),
  background: null,
  padTop: 20,
  padBottom: 20,
  columns: [newDndColumn(12)],
});

/**
 * A new area, with one section holding one rich text module.
 *
 * Not empty: an empty area is a blank rectangle in the editor with no indication of what it is for,
 * and the team's most common case by a distance is a column of copy. One module is the smallest
 * thing that shows what the block does.
 */
export function newDndArea(name: string): Omit<DndAreaBlock, 'id'> {
  const section = newDndSection();
  section.columns[0]!.modules.push(newDndModule('@hubspot/email_body', 'Body'));
  return { type: 'dndarea', name, label: 'Email body', sections: [section] };
}
