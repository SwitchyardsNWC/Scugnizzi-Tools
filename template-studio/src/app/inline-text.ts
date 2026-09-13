// Which element inside a block holds its text, for editing on the canvas.
//
// This is editor knowledge and it lives in the editor. The alternative — having every block
// renderer emit a marker — would push a concern the exported template does not have down into the
// compiler, and the compiler is the part that has to stay clean.
//
// The cost is a selector coupled to markup the compiler owns, so it can go stale silently. That is
// paid for by `tests/inline-text.test.ts`, which compiles one of each block type and asserts the
// anchor is still there. A stale entry then fails a test rather than making double-click do
// nothing, which is the failure Jared named as the worst kind.

import type { BlockType } from '../model/types.ts';

export interface TextTarget {
  /** Matched inside the block's own subtree. */
  selector: string;
  /** Where the edited value is written back. */
  path: string;
  /** A substring the compiled block must contain, so a stale selector fails a test. */
  anchor: string;
  /**
   * Markup, not a line of text.
   *
   * Changes three things: the value read back is `innerHTML` rather than `textContent`, Return
   * makes a paragraph instead of committing, and paste goes through the sanitiser. That last one is
   * the whole reason rich text could not be edited here until now — see `sanitise.ts`.
   */
  rich?: boolean;
}

export const TEXT_TARGETS: Partial<Record<BlockType, TextTarget>> = {
  heading: { selector: 'h1, h2, h3, h4, h5, h6', path: 'block.text', anchor: '<h1' },
  // The cell that carries `.sy-rich`, so the block's own type scale applies while it is being
  // edited and the designer is looking at the real thing rather than at browser defaults.
  richtext: { selector: '.sy-rich', path: 'block.html', anchor: 'sy-rich', rich: true },
  // The topbar's own span, not the h2 — the h2 carries the uppercase transform, and editing
  // through it would write the shouted version back into the document.
  topbar: { selector: 'h2 span', path: 'block.text', anchor: '<h2' },
  button: { selector: '.sy-btn strong', path: 'block.text', anchor: 'class="sy-btn' },
};

/**
 * Rich text was absent from this list for two rounds, and the reason was paste.
 *
 * `contentEditable` on it always worked; what broke was content pasted in from Word, Docs or a web
 * page, which arrives carrying inline styles that beat the block's own size, colour and line height
 * (learnings 3.5). v1 shipped without a sanitiser and it cost a round of feedback.
 *
 * `sanitise.ts` is that sanitiser: an allowlist of tags, every attribute but `href` dropped, and
 * bold and italic recovered from the styled spans that Word and Docs use to express them. It is
 * tested against the shapes real clipboards produce rather than against tidy fixtures.
 */
export const RICH: BlockType[] = ['richtext'];
