// ⌘C and ⌘V between templates, and the several-at-once edits multi-select needs.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { clipText, parseClip } from '../src/model/clipboard.ts';
import { allBlocks, hubspotFields, insertBlocksAt, insertBlocksInColumn, moveSections, pasteSection, removeBlocks } from '../src/model/edit.ts';
import { blankTemplate, cardTemplate } from '../src/model/starters.ts';
import { declaredFields } from './structure.ts';

describe('the clip', () => {
  it('round-trips blocks and sections, and is text', () => {
    const t = cardTemplate();
    const blocks = allBlocks(t).slice(0, 2);
    const text = clipText({ kind: 'blocks', blocks });
    expect(typeof text).toBe('string');
    expect(parseClip(text)).toEqual({ kind: 'blocks', blocks });
    const section = t.sections[2]!;
    expect(parseClip(clipText({ kind: 'section', section }))).toEqual({ kind: 'section', section });
  });

  it('is not fooled by ordinary text or other JSON', () => {
    expect(parseClip('https://www.switchyards.com/')).toBeNull();
    expect(parseClip('{"kind":"blocks","blocks":[]}')).toBeNull();
    expect(parseClip('{"template-studio":1,"kind":"blocks","blocks":[{"nope":true}]}')).toBeNull();
    expect(parseClip('{not json')).toBeNull();
    expect(parseClip('')).toBeNull();
  });
});

describe('pasting', () => {
  it('lands blocks as sections of their own, on the template’s presets, with new names', () => {
    const from = cardTemplate();
    const blocks = allBlocks(from).filter((b) => b.type === 'richtext').slice(0, 2);
    const into = insertBlocksAt(blankTemplate(), blocks, 0);
    expect(into.sections.slice(0, 2).map((s) => s.theme)).toEqual(['cream', 'cream']);
    expect(into.sections[0]!.rows[0]!.columns[0]!.blocks[0]!.id).not.toBe(blocks[0]!.id);
    // Pasted twice: no field collides.
    const twice = insertBlocksAt(into, blocks, 0);
    const names = declaredFields(compile(twice, { mode: 'hubl' }).html).map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(errorsIn(lint({ ...compile(twice, { mode: 'hubl' }), mode: 'hubl', template: twice }))).toEqual([]);
  });

  it('into a column, leaving full-bleed blocks out', () => {
    const t = cardTemplate();
    const column = t.sections[2]!.rows[0]!.columns[0]!;
    const footer = allBlocks(blankTemplate())[0]!;
    const heading = allBlocks(t).find((b) => b.type === 'heading')!;
    const next = insertBlocksInColumn(t, column.id, [footer, heading], 0);
    const blocks = next.sections[2]!.rows[0]!.columns[0]!.blocks;
    expect(blocks[0]!.type).toBe('heading');
    expect(blocks.some((b) => b.type === 'legal')).toBe(false);
    expect(blocks.length).toBe(column.blocks.length + 1);
  });

  it('a whole section, without any pattern marker it carried', () => {
    const t = cardTemplate();
    const section = { ...t.sections[2]!, pattern: { id: 'p', version: 1 } };
    const next = pasteSection(blankTemplate(), section, 0);
    expect(next.sections[0]!.pattern).toBeUndefined();
    expect(next.sections[0]!.rows[0]!.columns[0]!.borderWidth).toBe(2);
    expect(hubspotFields(next).map((f) => f.field)).toContain('first_card');
  });
});

describe('several blocks at once', () => {
  it('removes them in one step and drops the sections they emptied', () => {
    const t = cardTemplate();
    const ids = allBlocks(t).slice(0, 3).map((b) => b.id);
    const next = removeBlocks(t, ids);
    expect(allBlocks(next).length).toBe(allBlocks(t).length - 3);
    expect(next.sections.length).toBe(t.sections.length - 3);
  });

  it('moves a run of sections together, and not off either end', () => {
    const t = cardTemplate();
    const [a, b] = [t.sections[1]!, t.sections[2]!];
    const ids = [a, b].flatMap((s) => s.rows[0]!.columns[0]!.blocks.map((x) => x.id));
    const down = moveSections(t, ids, 1);
    expect(down.sections.map((s) => s.id).slice(0, 4)).toEqual([t.sections[0]!.id, t.sections[3]!.id, a.id, b.id]);
    const up = moveSections(t, ids, -1);
    expect(up.sections.map((s) => s.id).slice(0, 3)).toEqual([a.id, b.id, t.sections[0]!.id]);
    expect(moveSections(up, ids, -1)).toBe(up);
    // A run with a gap in it does not move: what "together" would mean is not obvious.
    const gapped = [t.sections[0]!, t.sections[2]!].flatMap((s) => s.rows[0]!.columns[0]!.blocks.map((x) => x.id));
    expect(moveSections(t, gapped, 1)).toBe(t);
  });
});
