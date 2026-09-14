// What the canvas is told and what it says back, as types: rows, drop spots, the overlays' geometry.

import type { BlockType } from '../../model/types.ts';

/**
 * What a section is, for the bar on its row: the glyph, the name, and — for a lone block — which
 * block, so clicking the name selects it rather than the section around it.
 */
export interface RowInfo {
  kind: 'block' | 'group' | 'columns';
  label: string;
  glyph: BlockType | 'group' | 'columns';
  blockId?: string;
}

/**
 * What the ⋯ on a row offers. Built by the app, because the actions are the editor's; the canvas
 * only knows where the row is.
 */
export interface RowMenuSpec {
  columns?: { count: number; onPick(count: number): void };
  mobile?: { value: 'stack' | 'side-by-side'; onPick(value: 'stack' | 'side-by-side'): void };
  background?: { value: string; options: Array<[string, string]>; onPick(key: string): void };
  actions: Array<{ label: string; onClick(): void; danger?: boolean; title?: string }>;
}

export interface PreviewApi {
  /** Opens the block's text for editing on the canvas. False when it has no text to edit. */
  startEditing(blockId: string): boolean;
  /** The slash menu, in its add-a-block form, on the selected block. */
  openQuickAdd(): void;
}

/**
 * The slash menu's state. `format` is the menu over an editable, `insert` the same menu on a
 * selected block with only the add-a-block half, `link` the URL field that replaces it while a
 * link is being typed. Position is in frame coordinates, like the action bar's.
 */
export interface SlashState {
  mode: 'format' | 'insert' | 'link';
  query: string;
  index: number;
  top: number;
  left: number;
}

/**
 * Where a dragged block would land, named in terms of the document rather than of pixels.
 *
 * The canvas resolves a pointer position to one of these and stops there. Turning it into "column
 * c7, index 2" needs the document, which this component deliberately does not have — it knows about
 * markup and rectangles, and the editor knows about structure.
 */
export type DropSpot =
  /** Into the block's column, before or after it — alongside it in the same cell. */
  | { at: 'block'; blockId: string; before: boolean }
  /** A full-width section of its own, before or after this one. */
  | { at: 'section'; sectionId: string; before: boolean }
  /** Into a column's own padding: the start of it, or with `tail` the end. */
  | { at: 'column'; columnId: string; tail: boolean }
  | { at: 'end' };

/**
 * Where to draw the indicator, in frame coordinates. A line for an edge, a box for a whole column.
 * `frame` is the cell a drop would land *inside*, drawn faintly so an inset line reads as "into
 * this" rather than as a line that happens to be short.
 */
export interface Hint {
  top: number;
  left: number;
  width: number;
  height: number;
  box: boolean;
  frame?: { top: number; left: number; width: number; height: number };
}

/**
 * One strip of the spacing overlay: a padding, a gap, a section's space, or a box's inset, with
 * the number it is. Drawn over the canvas on hover and while a spacing dial is being worked, so
 * the structure a block sits in is visible rather than inferred from where the words stop.
 */
export interface SpaceBox {
  /** Stable across re-measures — `pad-top`, `gap-bottom` — so a strip keeps its node between them. */
  key: string;
  top: number;
  left: number;
  width: number;
  height: number;
  kind: 'pad' | 'gap' | 'section' | 'box';
  /** The number the strip is, as rendered. */
  value: number;
}

/** A row as the canvas draws it: what it is, and its band in frame coordinates. */
export interface RowCard extends RowInfo {
  sectionId: string;
  top: number;
  left: number;
  width: number;
  height: number;
}
