// Dropping, from the canvas or from the palette.
//
// The canvas resolves a pointer position to a `DropSpot` and this side turns it into a column and
// an index (placing.ts). A block already on the canvas moves; a kind dragged from the palette is
// added, with the ghost that shows what is in your hand drawn by the app.

import { useCallback, useRef, useState } from 'preact/hooks';

import { canStack } from '../model/catalog.ts';
import { siteOf } from '../model/edit.ts';
import { isPatternKind, patternIdOf, type PaletteKind } from './Palette.tsx';
import { placeOf, sectionAfter } from './placing.ts';
import type { DropSpot } from './Preview.tsx';
import type { Editor } from './useEditor.ts';

export function useDrops({
  editor,
  placePatternAt,
  noteRecent,
}: {
  editor: Editor;
  placePatternAt(id: string, index: number | null): void;
  noteRecent(kind: string): void;
}) {
  const dropExisting = useCallback(
    (blockId: string, spot: DropSpot) => {
      const place = placeOf(editor.template, spot);
      if (!place) return;
      const site = siteOf(editor.template, blockId);
      const block = site?.column.blocks[site.index];
      // A block that draws its own band cannot join a cell; it goes below the column's section.
      if (place.kind === 'column' && block && !canStack(block)) {
        editor.dropAsSection(blockId, sectionAfter(editor.template, place.columnId));
        return;
      }
      if (place.kind === 'column') editor.dropInto(blockId, place.columnId, place.index);
      else editor.dropAsSection(blockId, place.index);
    },
    [editor],
  );

  // --- the palette ---------------------------------------------------------------------------------
  const [dragType, setDragType] = useState<PaletteKind | null>(null);
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);
  const spot = useRef<DropSpot | null>(null);

  const onPaletteDrag = useCallback((type: PaletteKind, x: number, y: number) => {
    setDragType(type);
    setProbe({ x, y });
  }, []);

  /** What the canvas resolved the pointer to, so the drop itself stays this side's decision. */
  const onProbe = useCallback((found: DropSpot | null) => {
    spot.current = found;
  }, []);

  const dropNew = useCallback(() => {
    const type = dragType;
    const where = spot.current;
    setDragType(null);
    setProbe(null);
    spot.current = null;
    if (!type) return;
    // Released over nothing: the drag is abandoned rather than guessed at. Dropping a block
    // somewhere the pointer never was is the kind of surprise undo exists to fix and should not
    // have to.
    if (!where) return;
    const place = placeOf(editor.template, where);
    if (!place) return;

    // A pattern is a section, so like columns it lands as a section: after the one it was aimed
    // at when that was inside a column.
    const sectionIndex = place.kind === 'section' ? place.index : sectionAfter(editor.template, place.columnId);
    if (isPatternKind(type)) {
      placePatternAt(patternIdOf(type), sectionIndex);
      return;
    }
    if (type === 'columns') {
      // Columns cannot nest — `Column.blocks` holds blocks, and a row is not one. Dropped onto a
      // column, the new row lands after the one it was aimed at rather than inside it, which is
      // the only reading that produces something.
      editor.addColumns(sectionIndex);
      return;
    }
    noteRecent(type);

    // The top bar, the stripes and the footer draw their own band, so they take a section wherever
    // they were aimed — the same reading as columns and patterns.
    if (place.kind === 'section' || !canStack({ type })) {
      editor.addAt(type, sectionIndex);
      return;
    }
    const section = editor.template.sections.find((s) =>
      s.rows.some((r) => r.columns.some((c) => c.id === place.columnId)),
    );
    if (section) editor.addToColumn(section.id, place.columnId, type, place.index);
  }, [dragType, editor, placePatternAt, noteRecent]);

  return { dragType, probe, dropExisting, dropNew, onPaletteDrag, onProbe };
}
