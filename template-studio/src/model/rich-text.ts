// Formatting inside one text layer: some words bold, some underlined, some in another face.
//
// Jared: "if I have a text box clicked and highlight text allow changes to only that text. that way I
// can have a paragraph with bold/italic/underline and possibly other effects."
//
// A layer keeps its words as one plain string, so everything that reads words — the layer list, the
// slash menu, the arc and the wobble — goes on reading a string. The formatting sits beside it as
// ranges over that string that never overlap. Every change goes through one mark per character and
// back into ranges: slow in theory, instant for a paragraph, and it cannot leave two ranges
// disagreeing about a letter.
//
// Pure, like the rest of the model. The editor that reads selections is app/rich-editing.ts.

import type { StyleRange, TextMarks } from './types.ts';

export type MarkKey = 'bold' | 'italic' | 'underline' | 'strike';

const KEYS = ['bold', 'italic', 'underline', 'strike', 'color', 'highlight', 'font'] as const;

function clean(m: TextMarks): TextMarks {
  const out: TextMarks = {};
  for (const k of KEYS) if (m[k] !== undefined) (out as Record<string, unknown>)[k] = m[k];
  return out;
}

const same = (a: TextMarks, b: TextMarks) => KEYS.every((k) => a[k] === b[k]);

/** No formatting at all. */
export const isPlain = (m: TextMarks) => KEYS.every((k) => m[k] === undefined);

/** The start and end of a selection, in order and inside the text. */
function span(length: number, from: number, to: number): [number, number] {
  const clamp = (v: number) => Math.max(0, Math.min(length, Math.floor(v)));
  return [clamp(Math.min(from, to)), clamp(Math.max(from, to))];
}

/** One mark set per character. Ranges past the end are cut; later ranges win where two overlap. */
export function marksPerChar(length: number, styles: StyleRange[] | undefined): TextMarks[] {
  const out: TextMarks[] = Array.from({ length }, () => ({}));
  for (const range of styles ?? []) {
    const [from, to] = span(length, range.from, range.to);
    const { from: _from, to: _to, ...marks } = range;
    void _from;
    void _to;
    const m = clean(marks);
    for (let i = from; i < to; i += 1) out[i] = { ...out[i], ...m };
  }
  return out;
}

/** Characters' marks back into ranges: neighbours that match become one range, plain letters none. */
export function rangesOf(marks: TextMarks[]): StyleRange[] {
  const out: StyleRange[] = [];
  let i = 0;
  while (i < marks.length) {
    const m = marks[i]!;
    let j = i + 1;
    while (j < marks.length && same(marks[j]!, m)) j += 1;
    if (!isPlain(m)) out.push({ from: i, to: j, ...clean(m) });
    i = j;
  }
  return out;
}

export const normalizeStyles = (length: number, styles: StyleRange[] | undefined): StyleRange[] => rangesOf(marksPerChar(length, styles));

/** The words cut where their formatting changes: what gets drawn, one span per run. */
export function runsOf(text: string, styles: StyleRange[] | undefined): Array<{ text: string; marks: TextMarks; from: number }> {
  const marks = marksPerChar(text.length, styles);
  const out: Array<{ text: string; marks: TextMarks; from: number }> = [];
  let i = 0;
  while (i < text.length) {
    let j = i + 1;
    while (j < text.length && same(marks[j]!, marks[i]!)) j += 1;
    out.push({ text: text.slice(i, j), marks: clean(marks[i]!), from: i });
    i = j;
  }
  return out;
}

/** Sets marks on the characters `from` to `to`. A mark given as undefined is taken off. */
export function applyMarks(text: string, styles: StyleRange[] | undefined, from: number, to: number, patch: Partial<TextMarks>): StyleRange[] {
  const marks = marksPerChar(text.length, styles);
  const [a, b] = span(text.length, from, to);
  for (let i = a; i < b; i += 1) marks[i] = clean({ ...marks[i], ...patch });
  return rangesOf(marks);
}

/** Takes every mark off the characters `from` to `to`: back to the style. */
export function clearMarks(text: string, styles: StyleRange[] | undefined, from: number, to: number): StyleRange[] {
  const marks = marksPerChar(text.length, styles);
  const [a, b] = span(text.length, from, to);
  for (let i = a; i < b; i += 1) marks[i] = {};
  return rangesOf(marks);
}

/**
 * Bold, italic, underline or strike on or off, the way a word processor does it: off when every
 * selected letter already has it, on otherwise. `base` is what the style itself says — a bold style
 * makes every letter bold until a range says `bold: false` — and a mark that only repeats the style
 * is not kept.
 */
export function toggleMark(text: string, styles: StyleRange[] | undefined, from: number, to: number, key: MarkKey, base = false): StyleRange[] {
  const marks = marksPerChar(text.length, styles);
  const [a, b] = span(text.length, from, to);
  if (a === b) return rangesOf(marks);
  let all = true;
  for (let i = a; i < b && all; i += 1) all = (marks[i]![key] ?? base) === true;
  const want = !all;
  return applyMarks(text, styles, a, b, { [key]: want === base ? undefined : want });
}

export interface MarkState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** The one value every selected letter has; null when none has one; undefined when they differ. */
  color: string | null | undefined;
  highlight: string | null | undefined;
  font: string | null | undefined;
}

/** What a selection is set in, for the format bar's buttons. An empty selection reads the letter before it. */
export function markState(text: string, styles: StyleRange[] | undefined, from: number, to: number, base: { bold?: boolean; italic?: boolean } = {}): MarkState {
  const marks = marksPerChar(text.length, styles);
  const [a, b] = span(text.length, from, to);
  const letters: number[] = [];
  if (a === b) {
    if (a > 0) letters.push(a - 1);
    else if (text.length) letters.push(0);
  } else for (let i = a; i < b; i += 1) letters.push(i);
  const all = (key: MarkKey, dflt: boolean) => letters.length > 0 && letters.every((i) => (marks[i]![key] ?? dflt) === true);
  const common = (key: 'color' | 'highlight' | 'font') => {
    const values = new Set(letters.map((i) => marks[i]![key] ?? null));
    return values.size === 0 ? null : values.size === 1 ? [...values][0]! : undefined;
  };
  return {
    bold: all('bold', base.bold ?? false),
    italic: all('italic', base.italic ?? false),
    underline: all('underline', false),
    strike: all('strike', false),
    color: common('color'),
    highlight: common('highlight'),
    font: common('font'),
  };
}

/**
 * Replaces the characters `from` to `to` with `insert`, keeping every other letter's formatting on
 * that letter. New letters take the marks given, or those of the letter before them, so typing at the
 * end of a bold word goes on in bold.
 */
export function spliceText(text: string, styles: StyleRange[] | undefined, from: number, to: number, insert: string, marks?: TextMarks): { text: string; styles: StyleRange[] } {
  const per = marksPerChar(text.length, styles);
  const [a, b] = span(text.length, from, to);
  const inherit = marks ?? per[a - 1] ?? per[b] ?? {};
  per.splice(a, b - a, ...Array.from({ length: insert.length }, () => ({ ...inherit })));
  return { text: text.slice(0, a) + insert + text.slice(b), styles: rangesOf(per) };
}
