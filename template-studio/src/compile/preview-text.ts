// HubSpot's preview text: the line an inbox shows after the subject (learnings 1.17).
//
// HubSpot knows one field by name for this. A coded template that declares `{% text "preview_text" %}`
// gets **Settings › Preview text** in the email editor, and whatever the team types there is what the
// tag prints; a template without it has no such setting at all. So the tag is emitted into every
// template, in HubSpot's documented shape — rendered in place, not exported, inside a hidden div at
// the top of the body — rather than in the shape every other field here takes. It is the one field
// whose name and shape are HubSpot's, not ours.
//
// Two things are ours. The hidden div carries more than HubSpot's `display:none!important`, because
// Outlook on Windows ignores `display` on a div and needs `mso-hide`, and a client that honours
// neither still gets a one-pixel line with no height. And when Studio's own preview text is written,
// a run of invisible characters follows it, so a client with room left over shows blank space rather
// than pulling the email's first words in after it — the logo's tagline, a "view in browser", the
// first heading. Only then: with no preview text, the first words are the preview, and a spacer
// would leave the line empty instead.

import { decl, el, raw, type Field, type IRNode } from './ir.ts';
import { isBlank } from './escape.ts';

/** The field HubSpot looks for by name. Never rename it: the Settings tab is keyed to it. */
export const PREVIEW_TEXT = 'preview_text';

/** HubSpot's own label, verbatim from its documentation, help-text span included. */
export const PREVIEW_TEXT_LABEL =
  'Preview Text <span class=help-text>This will be used as the preview text that displays in some email clients</span>';

const HIDDEN = 'display:none!important; mso-hide:all; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden';

/**
 * Invisible, and not whitespace a client will collapse: a combining grapheme joiner, a zero-width
 * non-joiner and a non-breaking space, a hundred times over. About 300 characters, which is more than
 * any client shows after a subject, for 1.8KB of the 102KB Gmail allows (learnings 2.12).
 */
export const SPACER = '&#847;&zwnj;&nbsp;'.repeat(100);

/** One line, the way an inbox shows it. A newline typed into the box is a space in the tag anyway. */
export function previewTextOf(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** The hidden div, the tag, and the spacer when there is preview text for it to follow. */
export function previewTextNode(value: string | undefined): IRNode {
  const text = previewTextOf(value);
  const field: Field = { name: PREVIEW_TEXT, kind: 'text', label: PREVIEW_TEXT_LABEL, value: text, exported: false, noWrapper: true };
  return el('div', { id: PREVIEW_TEXT, style: HIDDEN }, [decl(field), ...(isBlank(text) ? [] : [raw(SPACER)])]);
}

// --- the email's first words ---------------------------------------------------------------------

/**
 * What a client shows after the subject when there is no preview text: the first text in the body,
 * read the way a mail client reads it. Styles, comments (Outlook's conditional markup among them),
 * anything hidden inline and the canvas's own empty-column slots are skipped; tags become spaces;
 * entities are decoded; whitespace collapses. Pictures contribute nothing, alt text included.
 *
 * Works on a compiled preview, so it sees the branch the canvas shows. A string pass rather than a
 * DOM, because the compiler is DOM-free (acceptance.md §1) and the only markup it reads is its own.
 */
export function firstWords(html: string, max = 240): string {
  let s = html;
  const body = s.search(/<body\b/i);
  if (body >= 0) s = s.slice(body);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(style|script|title)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  s = dropHidden(s);
  // A block ends a run of words; a link or a bold word sits inside one, and a space there would put
  // one before the full stop that follows it.
  s = s.replace(TAG, (whole, name: string) => (INLINE.has(name.toLowerCase()) ? '' : ' '));
  s = decode(s)
    .replace(/[͏​‌‍﻿]/g, '')
    .replace(/[\s ]+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max).trimEnd() : s;
}

/** A tag, with quoted attribute values allowed to hold a `>`. */
const TAG = /<\/?([a-z][a-z0-9]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const INLINE = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'font', 'small', 'sup', 'sub', 'code', 'mark', 'abbr']);
const OPEN = /<([a-z][a-z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const VOID = new Set(['img', 'br', 'hr', 'meta', 'input', 'link', 'source', 'area', 'base', 'col', 'wbr']);

function hidden(attrs: string): boolean {
  return /\bstyle\s*=\s*"[^"]*display\s*:\s*none/i.test(attrs) || /\bdata-sy-slot\b/i.test(attrs);
}

/** Every element hidden inline, removed with everything inside it. */
function dropHidden(html: string): string {
  let out = '';
  let from = 0;
  OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN.exec(html))) {
    const [whole, name = '', attrs = ''] = m;
    if (!hidden(attrs)) continue;
    out += html.slice(from, m.index);
    const selfClosing = VOID.has(name.toLowerCase()) || whole.endsWith('/>');
    from = selfClosing ? OPEN.lastIndex : closeOf(html, name, OPEN.lastIndex);
    OPEN.lastIndex = from;
  }
  return out + html.slice(from);
}

/** Where the element opened just before `from` ends, counting nested elements of the same name. */
function closeOf(html: string, name: string, from: number): number {
  const re = new RegExp(`<(/?)${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return re.lastIndex;
  }
  return html.length;
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '‌', zwj: '‍', shy: '', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•' };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}
