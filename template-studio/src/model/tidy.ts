// Clean up: the markup a block carries that the template does not use.
//
// A rich text block's HTML arrives from three places — the canvas editor, the inspector's own
// textarea, and a v1 import — and only the first goes through the sanitiser on the way in. The
// other two can carry anything: empty paragraphs, `<span style>` wrappers from a paste, a
// `target="_blank"` an email client ignores, a list nested inside a list. None of it breaks the
// send; all of it is bytes the template pays for and markup the next person has to read around.
//
// This is the same reduction the sanitiser applies to a paste, run over the document on request.
// The linter reports what it would change; Clean up in Checks makes the change, as one undo step.

import { sanitise } from './sanitise.ts';
import type { Block, Template } from './types.ts';

export interface Untidy {
  blockId: string;
  /** What the block is called in the outline, for the message. */
  label: string;
  /** One line on what would change. */
  what: string;
}

/** Whitespace-insensitive, so a difference is a difference in markup and not in line breaks. */
const norm = (html: string) => html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();

/** Plain text, with the whitespace a designer did not mean: runs collapsed, ends trimmed. */
const plain = (text: string) => text.replace(/\s+/g, ' ').trim();

/** What Clean up would do to one block, or null when it would do nothing. */
export function untidyOf(block: Block): string | null {
  if (block.type === 'richtext') {
    const clean = sanitise(block.html);
    if (norm(clean) === norm(block.html)) return null;
    const before = norm(block.html).length;
    const after = norm(clean).length;
    const tags = (html: string) => (html.match(/<[a-z][^>]*>/gi) ?? []).length;
    const dropped = tags(block.html) - tags(clean);
    const parts: string[] = [];
    if (dropped > 0) parts.push(`${dropped} tag${dropped === 1 ? '' : 's'} the template does not use`);
    if (/style=|target=|class=/.test(block.html)) parts.push('attributes an email client ignores');
    if (/<(p|h[1-6]|li)>\s*(<br>\s*)*<\/\1>/i.test(block.html) || /<p>(&nbsp;|\s)*<\/p>/i.test(block.html)) parts.push('empty paragraphs');
    if (/<\/(ul|ol)>\s*<(ul|ol)>|<(ul|ol)>\s*<(ul|ol)>/i.test(block.html)) parts.push('a list nested outside its item');
    if (parts.length === 0) parts.push(after < before ? `${before - after} bytes of markup that changes nothing` : 'markup the sanitiser would rewrite');
    return parts.join(', ');
  }
  if (block.type === 'heading' || block.type === 'topbar' || block.type === 'button') {
    return plain(block.text) === block.text ? null : 'stray spaces in the text';
  }
  return null;
}

/** Every block Clean up would change, in document order. What the linter reports. */
export function untidyBlocks(template: Template, labelOf: (block: Block) => string): Untidy[] {
  const out: Untidy[] = [];
  for (const section of template.sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        for (const block of column.blocks) {
          const what = untidyOf(block);
          if (what) out.push({ blockId: block.id, label: labelOf(block), what });
        }
      }
    }
  }
  return out;
}

/** The document with every block cleaned. The same template comes back when there was nothing to do. */
export function tidyTemplate(template: Template): Template {
  let changed = false;
  const sections = template.sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({
      ...row,
      columns: row.columns.map((column) => ({
        ...column,
        blocks: column.blocks.map((block): Block => {
          if (!untidyOf(block)) return block;
          changed = true;
          if (block.type === 'richtext') return { ...block, html: sanitise(block.html) };
          if (block.type === 'heading' || block.type === 'topbar' || block.type === 'button') return { ...block, text: plain(block.text) };
          return block;
        }),
      })),
    })),
  }));
  return changed ? { ...template, sections } : template;
}
