// Formatting inside one text layer, and fonts from the design system.
//
// Jared: "if I have a text box clicked and highlight text allow changes to only that text. that way I
// can have a paragraph with bold/italic/underline and possibly other effects." What is defended here:
// formatting lands on exactly the letters chosen, stays on them as words are typed around it, and a
// layer nobody has formatted draws exactly as it always did.

import { describe, expect, it } from 'vitest';

import { freeformSvg } from '../src/compile/freeform.ts';
import { canvasCommands, filterCommands, textStyleOf } from '../src/model/canvas-text.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { applyMarks, clearMarks, marksPerChar, markState, normalizeStyles, runsOf, spliceText, toggleMark } from '../src/model/rich-text.ts';
import type { FreeformBlock, FreeformLayer, StyleRange } from '../src/model/types.ts';

const ds = DEFAULT_DESIGN_SYSTEM;
const text = 'Hello big world';

type TextLayer = Extract<FreeformLayer, { kind: 'text' }>;
const layer = (over: Partial<TextLayer> = {}): TextLayer => ({ kind: 'text', id: 't', text, role: 'h2', color: null, x: 0, y: 0, width: 300, align: 'left', ...over });
const page = (layers: FreeformLayer[]): FreeformBlock => ({ id: 'f', type: 'freeform', alt: '', width: 400, height: 200, background: null, layers, src: '', align: 'center' });

describe('formatting inside a text layer', () => {
  it('goes on only the selected letters, and neighbours that match become one range', () => {
    let s = applyMarks(text, [], 6, 9, { bold: true });
    expect(s).toEqual([{ from: 6, to: 9, bold: true }]);
    s = applyMarks(text, s, 9, 15, { bold: true });
    expect(s).toEqual([{ from: 6, to: 15, bold: true }]);
    expect(runsOf(text, s).map((r) => r.text)).toEqual(['Hello ', 'big world']);
  });

  it('toggles off only when every selected letter already has it — the style counts', () => {
    expect(toggleMark(text, [{ from: 0, to: 5, italic: true }], 0, 5, 'italic')).toEqual([]);
    expect(toggleMark(text, [], 0, 5, 'bold', true)).toEqual([{ from: 0, to: 5, bold: false }]);
    expect(toggleMark(text, [{ from: 0, to: 3, bold: true }], 0, 5, 'bold')).toEqual([{ from: 0, to: 5, bold: true }]);
  });

  it('stays on the right letters as words are typed and deleted around it', () => {
    const s: StyleRange[] = [{ from: 6, to: 9, underline: true }];
    const before = spliceText(text, s, 0, 0, 'Oh ');
    expect(before.text).toBe('Oh Hello big world');
    expect(before.styles).toEqual([{ from: 9, to: 12, underline: true }]);
    expect(spliceText(text, s, 7, 7, 'ii').styles).toEqual([{ from: 6, to: 11, underline: true }]);
    const gone = spliceText(text, s, 5, 10, '');
    expect(gone.text).toBe('Helloworld');
    expect(gone.styles).toEqual([]);
  });

  it('says what a selection is set in, and when it is mixed', () => {
    const s: StyleRange[] = [{ from: 0, to: 5, bold: true, color: 'red' }];
    expect(markState(text, s, 0, 5)).toMatchObject({ bold: true, italic: false, color: 'red' });
    expect(markState(text, s, 0, 9)).toMatchObject({ bold: false, color: undefined });
    expect(markState(text, [], 0, 5)).toMatchObject({ color: null });
    expect(clearMarks(text, s, 0, 15)).toEqual([]);
  });

  it('tidies ranges that overlap, run past the end, or say nothing', () => {
    expect(normalizeStyles(5, [{ from: 0, to: 3, bold: true }, { from: 2, to: 99, bold: true }, { from: 1, to: 1, italic: true }])).toEqual([{ from: 0, to: 5, bold: true }]);
    expect(marksPerChar(3, undefined)).toEqual([{}, {}, {}]);
  });
});

describe('formatted words, drawn', () => {
  it('wraps only the formatted words, and draws unformatted words exactly as before', () => {
    const plain = freeformSvg(page([layer()]), ds);
    expect(freeformSvg(page([layer({ styles: [] })]), ds)).toBe(plain);
    const svg = freeformSvg(page([layer({ styles: [{ from: 6, to: 9, bold: true, underline: true, color: 'red' }] })]), ds);
    expect(svg).toContain('Hello <span style="font-weight:bold; text-decoration:underline; color:');
    expect(svg).toContain('>big</span> world');
  });

  it('carries formatting into the wobble letter by letter, and the arc run by run', () => {
    const styles: StyleRange[] = [{ from: 0, to: 5, italic: false }];
    const wobble = freeformSvg(page([layer({ look: 'marker', styles })]), ds);
    expect(wobble).toContain('; font-style:normal">H</span>');
    const arc = freeformSvg(page([layer({ look: 'arc', styles: [{ from: 0, to: 5, bold: false }] })]), ds);
    expect(arc).toContain('<tspan font-weight="normal">HELLO</tspan> BIG WORLD');
  });

  it('sets a layer, or a few of its words, in a face from the design system', () => {
    expect(textStyleOf(layer({ font: 'georgia' }), ds).font).toBe(ds.fonts['georgia']);
    expect(freeformSvg(page([layer({ font: 'georgia' })]), ds)).toContain(`font-family:${ds.fonts['georgia']}`);
    expect(freeformSvg(page([layer({ styles: [{ from: 0, to: 5, font: 'courier' }] })]), ds)).toContain(`font-family:${ds.fonts['courier']}`);
    const found = filterCommands(canvasCommands(layer(), ds), 'georgia');
    expect(found[0]!.patch).toEqual({ font: 'georgia' });
    expect(found[0]!.fontStack).toBe(ds.fonts['georgia']);
  });
});
