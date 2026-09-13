// The "friendly format" v1 used for short text fields: a blank line starts a paragraph, `**bold**`,
// `[text](url)`, and a value starting with `<` is treated as raw HTML.
//
// It survives into v2 only because saved v1 designs contain it — the legal note and the footer
// links box are still written this way. New content goes through the rich text editor instead.
// Kept here rather than in the importer because the legal block's note is still authored as plain
// text with line breaks.

import { esc } from './escape.ts';

/** Inline markup only. Newlines become `<br>`, which is what a two-line legal note wants. */
export function inline(input: string, linkColor: string): string {
  let s = esc(String(input ?? '').replace(/\r\n?/g, '\n'));
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<span style="font-weight: bold;">$1</span>');
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    `<a href="$2" rel="noopener" style="color:${linkColor}" target="_blank">$1</a>`,
  );
  return s.replace(/\n/g, '<br>');
}

/**
 * Gives every `<p>` a margin of its own, if it does not already state one.
 *
 * HubSpot inlines `margin-bottom: 1em` onto paragraphs at send and Gmail strips the `p { margin:0 }`
 * reset that would otherwise cover it (learnings 1.9), so a paragraph that says nothing ships a gap
 * nobody chose. The compiler's own paragraphs have always said so; these are the ones it did not
 * write — markup pasted into a *locked* rich text block, which renders straight into the output
 * rather than becoming a HubSpot field default.
 *
 * Applied to markup the compiler *renders*, and deliberately not to a HubSpot field's default.
 * A default is copied into each email once and then re-serialised by HubSpot's own editor, where
 * `.sy-rich p` in the inlined stylesheet covers it — and the contract test noticed immediately when
 * the first version changed the defaults, which are part of the handoff.
 *
 * Found by the baseline template on its first compile, which is the entire reason that page exists.
 */
export function statedMargins(html: string, marginBottom: number): string {
  return html.replace(/<p(\s[^>]*)?>/gi, (tag, attrs: string | undefined) => {
    const rest = attrs ?? '';
    const style = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(rest);
    if (!style) return `<p style="margin:0 0 ${marginBottom}px 0"${rest}>`;
    const declarations = style[2] ?? style[3] ?? '';
    if (/(^|;)\s*margin(-bottom)?\s*:/i.test(declarations)) return tag;
    const merged = `margin:0 0 ${marginBottom}px 0; ${declarations}`.replace(/;\s*$/, '');
    return tag.replace(style[1]!, `"${merged}"`);
  });
}

/**
 * Block-level: splits on blank lines into paragraphs. Spacing and line height come from the
 * `.sy-rich` rules rather than from markup, the same as text the team types in HubSpot, so a
 * paragraph needs no inline style of its own.
 */
export function richHtml(input: string, linkColor: string): string {
  const text = String(input ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return '';
  if (text.startsWith('<')) return text;
  return text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${inline(p, linkColor)}</p>`)
    .join('');
}
