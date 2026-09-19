// The board bar's few glyphs, drawn rather than typed.
//
// Jared, 2026-09-19: "the toolbars icons are not aligned." They were characters: an arrow, a minus sign, a plus
// and a caret from the text face, each sitting where its font put it, none on the same line as the words beside
// it. A 12px square stroked in the current colour sits where flex puts it, the same for all four.

import type { JSX } from 'preact';

const glyph = (path: string, title: string): JSX.Element => (
  <svg class="pb-glyph" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label={title}>
    <path d={path} />
  </svg>
);

export const ArrowLeft = () => glyph('M10 6H2.5M5.5 3L2.5 6l3 3', 'Back');
export const Plus = () => glyph('M6 2v8M2 6h8', 'Add');
export const Minus = () => glyph('M2 6h8', 'Less');
export const Chevron = () => glyph('M3 4.75L6 7.75l3-3', 'Menu');
/** Four corners: everything, brought into the window. */
export const FitAll = () => glyph('M1.5 4V1.5H4M8 1.5h2.5V4M10.5 8v2.5H8M4 10.5H1.5V8', 'Fit everything');
/** A card inside the window: the selection, brought in close. */
export const FitOne = () => glyph('M1.5 1.5h9v9h-9zM4 4h4v4H4z', 'Zoom to the selection');
