// The space around several blocks at once (src/model/multi-spacing.ts).
//
// Jared: "Select multiple blocks and change their spacing together." Defended: each block's space is read and
// written where its own Spacing panel keeps it, so this is a shortcut and never a second place space lives; blocks
// that differ say so; a block with no such side is left alone; one undo step's worth of change is one template.

import { describe, expect, it } from 'vitest';

import { addSection, allBlocks, groupIntoStack, readValue, siteOf } from '../src/model/edit.ts';
import { readSide, setSide, sidePath } from '../src/model/multi-spacing.ts';
import { blankTemplate } from '../src/model/starters.ts';
import type { Template } from '../src/model/types.ts';

/** Heading, Text, Spacer, Top bar, above the footer a blank template starts with. */
function email(): { t: Template; ids: Record<string, string> } {
  let t = blankTemplate();
  for (const type of ['topbar', 'spacer', 'richtext', 'heading'] as const) t = addSection(t, type, null);
  const ids = Object.fromEntries(allBlocks(t).map((b) => [b.type, b.id]));
  return { t, ids };
}
const at = (t: Template, id: string, path: string) => readValue(t, { kind: 'block', sectionId: siteOf(t, id)!.section.id, blockId: id }, path);

describe('where each block keeps its space', () => {
  it('is the path its own Spacing panel edits', () => {
    expect(sidePath({ type: 'richtext' }, 'above')).toBe('column.padTop');
    expect(sidePath({ type: 'richtext' }, 'left')).toBe('column.padLeft');
    // The top bar draws its own band, so its space is the section's, and it has no sides.
    expect(sidePath({ type: 'topbar' }, 'above')).toBe('section.padTop');
    expect(sidePath({ type: 'topbar' }, 'left')).toBeNull();
    // A Spacer is its own height.
    expect(sidePath({ type: 'spacer' }, 'above')).toBeNull();
  });
});

describe('several blocks, one number', () => {
  it('reads as mixed when they differ, and as the one value once set', () => {
    const { t, ids } = email();
    const run = [ids['heading']!, ids['richtext']!];
    const differing = setSide(setSide(t, [run[0]!], 'above', 8), [run[1]!], 'above', 30);
    expect(readSide(differing, run, 'above')).toEqual({ count: 2, value: undefined, mixed: true });
    const same = setSide(differing, run, 'above', 24);
    expect(readSide(same, run, 'above')).toEqual({ count: 2, value: 24, mixed: false });
    expect(at(same, run[0]!, 'column.padTop')).toBe(24);
    expect(at(same, run[1]!, 'column.padTop')).toBe(24);
  });

  it('reaches a band block through its section, and leaves a Spacer and everything else alone', () => {
    const { t, ids } = email();
    const run = [ids['heading']!, ids['spacer']!, ids['topbar']!];
    expect(readSide(t, run, 'below').count).toBe(2);
    const next = setSide(t, run, 'below', 40);
    expect(at(next, ids['heading']!, 'column.padBottom')).toBe(40);
    expect(at(next, ids['topbar']!, 'section.padBottom')).toBe(40);
    expect(allBlocks(next).find((b) => b.id === ids['spacer'])).toEqual(allBlocks(t).find((b) => b.id === ids['spacer']));
    // Only the side asked for moved.
    expect(at(next, ids['heading']!, 'column.padTop')).toBe(at(t, ids['heading']!, 'column.padTop'));
  });

  it('hands the sides back to the page gutter with null, and never above or below', () => {
    const { t, ids } = email();
    const run = [ids['heading']!, ids['richtext']!];
    expect(readSide(t, run, 'left')).toEqual({ count: 2, value: null, mixed: false });
    const own = setSide(t, run, 'left', 0);
    expect(readSide(own, run, 'left').value).toBe(0);
    expect(readSide(setSide(own, run, 'left', null), run, 'left').value).toBeNull();
    expect(setSide(t, run, 'above', null)).toBe(t);
  });

  it('sets a group’s space once, because its blocks share it', () => {
    const { t, ids } = email();
    const grouped = groupIntoStack(t, [ids['heading']!, ids['richtext']!])!;
    const run = [ids['heading']!, ids['richtext']!];
    const next = setSide(grouped, run, 'above', 12);
    expect(siteOf(next, run[0]!)!.column.id).toBe(siteOf(next, run[1]!)!.column.id);
    expect(readSide(next, run, 'above')).toEqual({ count: 2, value: 12, mixed: false });
  });
});
