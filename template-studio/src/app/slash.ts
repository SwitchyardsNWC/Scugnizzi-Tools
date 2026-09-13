// Slash commands: the pure half.
//
// The toolbar over a block being edited is gone. In its place, typing `/` opens a menu at the
// caret listing everything the block can become — a heading, a list, a quote, bold, a link — and
// everything that can be added *below* it. Type to filter, Enter to apply. The same menu opens on
// a selected block that is not being edited, offering the second half only.
//
// Two reasons this is better than a bar of buttons, and neither is fashion. A bar has to fit every
// option at once, so it shows twelve glyphs nobody reads and hides the rest; a menu shows the
// three that match what you typed. And a bar sits *over* the block, between the words and the
// eye, while a menu opens where the caret already is.
//
// This file is the part that needs no DOM: what the commands are, how a query matches them, and
// which typed markers ("- ", "# ") mean a format. It is tested under Node like the compiler is.
// Running a command against a `contenteditable` is Preview.tsx's business.

/**
 * What the menu offers while editing rich text.
 *
 * The list is **what HubSpot's editor offers, minus what the design system owns.** Font, size,
 * colour and highlight are in HubSpot's toolbar and deliberately not here: an inline style beats
 * the block's own scale (learnings 3.5), and the sanitiser strips them on the way to the document
 * whether they arrive by paste or by button. Everything below survives the sanitiser, because
 * `.sy-rich` has a rule for each of its tags.
 */
export type Exec =
  | { command: 'formatBlock'; value: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote' }
  | { command: 'insertUnorderedList' | 'insertOrderedList' | 'insertHorizontalRule' }
  | { command: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'superscript' | 'subscript' }
  | { command: 'removeFormat' | 'unlink' }
  | { command: 'link' }
  /** No `execCommand` exists for these; the selection (or the block) is wrapped by hand. */
  | { command: 'wrap'; tag: 'small' | 'code' };

export interface SlashItem {
  id: string;
  label: string;
  /** Which part of the menu. Format commands need an editable; blocks need a selection; recent
   *  is the last few blocks added, shown first while nothing has been typed. */
  group: 'recent' | 'format' | 'block';
  /** Other words somebody might type for it. Matched as prefixes, so short is fine. */
  keywords: string[];
  /** One line, shown as the item's hover — Jared's rule about explanations. */
  hint: string;
  exec?: Exec;
  /** For `block` items: what the palette calls it. */
  kind?: string;
}

const f = (id: string, label: string, keywords: string[], hint: string, exec: Exec): SlashItem => ({
  id,
  label,
  group: 'format',
  keywords,
  hint,
  exec,
});

export const FORMAT_COMMANDS: SlashItem[] = [
  f('p', 'Paragraph', ['text', 'normal', 'body', 'p'], 'Body copy, at the body role.', { command: 'formatBlock', value: 'p' }),
  f('h1', 'Heading 1', ['h1', 'title', 'headline'], 'The largest heading. Sized by Design › Type.', { command: 'formatBlock', value: 'h1' }),
  f('h2', 'Heading 2', ['h2', 'subhead'], 'A section heading.', { command: 'formatBlock', value: 'h2' }),
  f('h3', 'Heading 3', ['h3'], 'A smaller heading.', { command: 'formatBlock', value: 'h3' }),
  f('h4', 'Heading 4', ['h4'], 'A small heading.', { command: 'formatBlock', value: 'h4' }),
  f('h5', 'Heading 5', ['h5', 'eyebrow', 'caps'], 'Uppercase and tracked, in the shipped scale.', { command: 'formatBlock', value: 'h5' }),
  f('h6', 'Heading 6', ['h6', 'label'], 'The smallest heading.', { command: 'formatBlock', value: 'h6' }),
  f('ul', 'Bulleted list', ['bullets', 'list', 'ul', '-'], 'Or type "- " at the start of a line.', { command: 'insertUnorderedList' }),
  f('ol', 'Numbered list', ['numbers', 'steps', 'ol', '1'], 'Or type "1. " at the start of a line.', { command: 'insertOrderedList' }),
  f('quote', 'Quote', ['blockquote', 'pull', '>'], 'A block quote, with the bar and inset from Design › Lists & quotes.', { command: 'formatBlock', value: 'blockquote' }),
  f('hr', 'Horizontal rule', ['rule', 'line', 'divider', 'hr', '---'], 'A rule between paragraphs, on the system’s rule colour.', { command: 'insertHorizontalRule' }),
  f('bold', 'Bold', ['strong', 'b'], '⌘B does the same.', { command: 'bold' }),
  f('italic', 'Italic', ['em', 'i'], '⌘I does the same.', { command: 'italic' }),
  f('underline', 'Underline', ['u'], '⌘U does the same. Readers expect underlined text to be a link, so use it sparingly.', { command: 'underline' }),
  f('strike', 'Strikethrough', ['strikethrough', 'del', 's'], 'A line through the selection.', { command: 'strikeThrough' }),
  f('sup', 'Superscript', ['superscript', 'sup', 'power'], 'Raised small text — a footnote mark, a ™.', { command: 'superscript' }),
  f('sub', 'Subscript', ['subscript', 'sub'], 'Lowered small text.', { command: 'subscript' }),
  f('small', 'Small print', ['small', 'fine', 'footnote', 'caption'], 'The selection at the small size — or the whole paragraph, when nothing is selected.', { command: 'wrap', tag: 'small' }),
  f('code', 'Code', ['mono', 'monospace', 'pre'], 'Monospace, for a code or a reference number.', { command: 'wrap', tag: 'code' }),
  f('link', 'Link', ['url', 'href', 'anchor', 'a'], 'Link the selection. ⌘K does the same.', { command: 'link' }),
  f('unlink', 'Remove link', ['unlink'], 'Keep the words, drop the link.', { command: 'unlink' }),
  f('clear', 'Clear formatting', ['plain', 'remove', 'reset'], 'Back to plain body copy.', { command: 'removeFormat' }),
];

/**
 * A block the menu can add below the current one. The app supplies the list from the palette, so
 * this file does not have to know what blocks exist.
 */
export function blockItem(kind: string, name: string, summary: string, group: 'block' | 'recent' = 'block'): SlashItem {
  return { id: `${group}-${kind}`, label: name, group, keywords: [kind, 'add', 'new', 'block', 'insert'], hint: summary, kind };
}

/**
 * Where a `/` query starts in the text before the caret, or null when there is none.
 *
 * The slash has to be at the start or after whitespace — `https://` is not a command — and the
 * query must contain no whitespace, so typing on past a menu that matched nothing dismisses it
 * rather than following you down the paragraph.
 */
export function slashQuery(before: string): { at: number; query: string } | null {
  const at = before.lastIndexOf('/');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { at, query };
}

/**
 * The items matching a query, best first.
 *
 * Ranked rather than merely filtered: "h" should put Heading 1 above Horizontal rule, and "list"
 * should put both lists above anything that merely mentions one. Empty matches everything, in
 * the order the list was written, which is the order somebody reaches for them.
 */
export function filterItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const scored = items
    .map((item) => ({ item, score: score(item, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

function score(item: SlashItem, q: string): number {
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 100;
  if (label.split(/\s+/).some((word) => word.startsWith(q))) return 80;
  if (item.keywords.some((k) => k.toLowerCase().startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  // A subsequence — "hrl" for "Horizontal rule" — as the last resort, so a typo still finds it.
  let i = 0;
  for (const c of label) if (c === q[i]) i += 1;
  return i === q.length ? 10 : 0;
}

/**
 * What a typed marker at the start of a line means, or null.
 *
 * The Markdown habits — "- " for a bullet, "1. " for a number, "# " for a heading, "> " for a
 * quote, "--- " for a rule. Checked when the space is typed, and only when the marker is all the
 * line holds, so a hyphen in the middle of a sentence is a hyphen.
 */
export function markdownShortcut(marker: string): Exec | null {
  const m = marker.replace(/ /g, ' ').trimEnd();
  if (/^#{1,6}$/.test(m)) return { command: 'formatBlock', value: `h${m.length}` as 'h1' };
  if (/^[-*+]$/.test(m)) return { command: 'insertUnorderedList' };
  if (/^1[.)]$/.test(m)) return { command: 'insertOrderedList' };
  if (m === '>') return { command: 'formatBlock', value: 'blockquote' };
  if (m === '---') return { command: 'insertHorizontalRule' };
  return null;
}

/** The keyboard shortcuts the canvas answers to, for the sheet `?` opens. Data, so the sheet and the docs agree. */
export const SHORTCUTS: Array<{ keys: string; does: string; when?: string }> = [
  { keys: '/', does: 'Open the menu — format the text, or add a block below' },
  { keys: '⌘K', does: 'Link the selection', when: 'editing' },
  { keys: '⌘K', does: 'Add a block below the selected one', when: 'selected' },
  { keys: '⌘B  ⌘I  ⌘U', does: 'Bold, italic, underline', when: 'editing' },
  { keys: '- ␣   1. ␣   # ␣   > ␣', does: 'Bullet, number, heading, quote — at the start of a line', when: 'editing' },
  { keys: 'Tab  ⇧Tab', does: 'Indent or outdent a list item', when: 'editing' },
  { keys: 'Enter', does: 'Edit the selected block’s text', when: 'selected' },
  { keys: 'Esc', does: 'Finish editing; then deselect' },
  { keys: '↑  ↓', does: 'Select the block above or below', when: 'selected' },
  { keys: '⌥↑  ⌥↓', does: 'Move the selected block up or down', when: 'selected' },
  { keys: '⌘D', does: 'Duplicate the selected block', when: 'selected' },
  { keys: '⌘G', does: 'Group the selected blocks into one column — one box, one gutter', when: 'several selected' },
  { keys: '⇧⌘G', does: 'Ungroup: one section per block again', when: 'in a group' },
  { keys: '⌫  ⌦', does: 'Delete the selected block. Undo is offered.', when: 'selected' },
  { keys: '⌘Z  ⇧⌘Z', does: 'Undo, redo' },
  { keys: '⌘S', does: 'Save now' },
  { keys: '⇧⌘E', does: 'Export the coded template' },
  { keys: '?', does: 'This sheet' },
];
