// The canvas's text editor: formatted words in an editable element, and the selection as character offsets.
//
// The model keeps words as a string and formatting as ranges over it (model/rich-text.ts). The editor
// is a contenteditable filled from those once, when typing starts. After that the browser owns the
// caret, and on every keystroke the words and their formatting are read back out of it. Every run
// carries its marks as data attributes, so reading back never has to guess from computed styles.
// Newlines are real newline characters under `white-space: pre-wrap`. The one `<br data-end>` is
// only there so a trailing newline shows its empty line.

import { marksCss } from '../compile/freeform.ts';
import type { DesignSystem } from '../model/design-system.ts';
import { rangesOf, runsOf } from '../model/rich-text.ts';
import type { StyleRange, TextMarks } from '../model/types.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function editableHtml(text: string, styles: StyleRange[] | undefined, ds: DesignSystem): string {
  const html = runsOf(text, styles)
    .map((run) => {
      const m = run.marks;
      const attrs =
        (m.bold !== undefined ? ` data-b="${m.bold ? 1 : 0}"` : '') +
        (m.italic !== undefined ? ` data-i="${m.italic ? 1 : 0}"` : '') +
        (m.underline ? ' data-u="1"' : '') +
        (m.strike ? ' data-s="1"' : '') +
        (m.color ? ` data-c="${esc(m.color)}"` : '') +
        (m.highlight ? ` data-h="${esc(m.highlight)}"` : '') +
        (m.font ? ` data-f="${esc(m.font)}"` : '');
      return attrs ? `<span${attrs} style="${esc(marksCss(m, ds))}">${esc(run.text)}</span>` : esc(run.text);
    })
    .join('');
  return text.endsWith('\n') ? `${html}<br data-end="">` : html;
}

function marksFrom(el: HTMLElement, inherited: TextMarks): TextMarks {
  const m: TextMarks = { ...inherited };
  const d = el.dataset;
  if (d['b'] !== undefined) m.bold = d['b'] === '1';
  if (d['i'] !== undefined) m.italic = d['i'] === '1';
  if (d['u']) m.underline = true;
  if (d['s']) m.strike = true;
  if (d['c']) m.color = d['c'];
  if (d['h']) m.highlight = d['h'];
  if (d['f']) m.font = d['f'];
  // Whatever a browser may make of a keyboard shortcut of its own.
  const tag = el.tagName;
  if (tag === 'B' || tag === 'STRONG') m.bold = true;
  if (tag === 'I' || tag === 'EM') m.italic = true;
  if (tag === 'U') m.underline = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') m.strike = true;
  return m;
}

/** The words and their formatting, as the editor holds them now. */
export function readEditable(root: HTMLElement): { text: string; styles: StyleRange[] } {
  // Emptied, a contenteditable keeps a lone <br> so it has a line to put the caret on. That is no words, not a newline.
  if (root.childNodes.length === 1 && (root.firstChild as HTMLElement | null)?.tagName === 'BR') return { text: '', styles: [] };
  let text = '';
  const marks: TextMarks[] = [];
  const push = (s: string, m: TextMarks) => {
    text += s;
    for (let i = 0; i < s.length; i += 1) marks.push(m);
  };
  const walk = (node: Node, m: TextMarks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      push((node.nodeValue ?? '').replace(/ /g, ' '), m);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      if (!el.hasAttribute('data-end')) push('\n', m);
      return;
    }
    if ((el.tagName === 'DIV' || el.tagName === 'P') && text.length > 0 && !text.endsWith('\n')) push('\n', m);
    const own = marksFrom(el, m);
    el.childNodes.forEach((child) => walk(child, own));
  };
  root.childNodes.forEach((child) => walk(child, {}));
  return { text, styles: rangesOf(marks) };
}

/** Keeps the empty last line showing when the words end in a newline, and takes it away when they no longer do. */
export function keepEnd(root: HTMLElement, text: string): void {
  const last = root.lastChild as HTMLElement | null;
  const sentinel = Boolean(last && last.nodeType === Node.ELEMENT_NODE && last.tagName === 'BR' && last.hasAttribute('data-end'));
  if (text.endsWith('\n') && !sentinel) {
    const br = root.ownerDocument.createElement('br');
    br.setAttribute('data-end', '');
    root.appendChild(br);
  } else if (!text.endsWith('\n') && sentinel) last!.remove();
}

/** The selection as character offsets into the words, or null when it is not in the editor. */
export function selectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const doc = root.ownerDocument;
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  // Counted by reading the content before the point with the same rules as the words, so the two can never disagree.
  const at = (node: Node, offset: number) => {
    const range = doc.createRange();
    range.setStart(root, 0);
    range.setEnd(node, offset);
    const holder = doc.createElement('div');
    holder.appendChild(range.cloneContents());
    return readEditable(holder).text.length;
  };
  return { start: at(r.startContainer, r.startOffset), end: at(r.endContainer, r.endOffset) };
}

/** Puts the selection back at character offsets, after the editor has been filled again. */
export function setSelectionOffsets(root: HTMLElement, start: number, end = start): void {
  const doc = root.ownerDocument;
  const locate = (target: number): [Node, number] => {
    let acc = 0;
    let found = null as [Node, number] | null;
    const walk = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.nodeValue?.length ?? 0;
        if (target <= acc + len) {
          found = [node, target - acc];
          return true;
        }
        acc += len;
        return false;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node as HTMLElement;
      if (el.tagName === 'BR') {
        if (el.hasAttribute('data-end')) return false;
        if (target === acc) {
          found = [el.parentNode!, [...el.parentNode!.childNodes].indexOf(el)];
          return true;
        }
        acc += 1;
        return false;
      }
      for (const child of [...el.childNodes]) if (walk(child)) return true;
      return false;
    };
    for (const child of [...root.childNodes]) if (walk(child)) break;
    return found ?? [root, root.childNodes.length];
  };
  const sel = doc.getSelection();
  if (!sel) return;
  const range = doc.createRange();
  const [sn, so] = locate(start);
  const [en, eo] = locate(end);
  range.setStart(sn, so);
  range.setEnd(en, eo);
  sel.removeAllRanges();
  sel.addRange(range);
}
