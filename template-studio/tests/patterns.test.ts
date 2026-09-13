// Patterns: a section saved to the folder, placed elsewhere, and kept in step.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { allBlocks, hubspotFields, setValue } from '../src/model/edit.ts';
import {
  applyPattern,
  detachPattern,
  instanceOf,
  parsePattern,
  patternFromSection,
  placePattern,
  pushPattern,
  staleInstances,
} from '../src/model/patterns.ts';
import { blankTemplate, cardTemplate } from '../src/model/starters.ts';
import { declaredFields } from './structure.ts';

/** The card email's second card: a text block and a button in one boxed column. */
const source = () => {
  const t = cardTemplate();
  const section = t.sections.find((s) => s.rows[0]!.columns[0]!.blocks.some((b) => b.type === 'button'))!;
  return { t, section };
};

describe('saving a section as a pattern', () => {
  it('captures the section and marks the original as its first instance', () => {
    const { t, section } = source();
    const made = patternFromSection(t, section.id, 'Card with button', 'pat1')!;
    expect(made.pattern).toMatchObject({ id: 'pat1', name: 'Card with button', version: 1 });
    expect(made.pattern.section.pattern).toBeUndefined();
    expect(made.pattern.section.rows[0]!.columns[0]!.borderWidth).toBe(2);
    const marked = made.template.sections.find((s) => s.id === section.id)!;
    expect(marked.pattern).toEqual({ id: 'pat1', version: 1 });
  });

  it('returns null for a section that does not exist', () => {
    expect(patternFromSection(cardTemplate(), 'nope', 'x')).toBeNull();
  });
});

describe('placing a pattern', () => {
  it('lands a copy with new ids and unique field names, and the output stays clean', () => {
    const { t, section } = source();
    const { pattern } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    const target = placePattern(blankTemplate(), pattern, 0);
    expect(target.sections[0]!.pattern).toEqual({ id: 'pat1', version: 1 });
    expect(target.sections[0]!.id).not.toBe(section.id);
    // Placed twice in one template: two sets of fields, none colliding.
    const twice = placePattern(target, pattern, 1);
    const names = declaredFields(compile(twice, { mode: 'hubl' }).html).map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => n.startsWith('second_card')).length).toBeGreaterThanOrEqual(4);
    expect(errorsIn(lint({ ...compile(twice, { mode: 'hubl' }), mode: 'hubl', template: twice }))).toEqual([]);
  });

  it('keeps the pattern’s own field names, which the source template still holds', () => {
    const { t, section } = source();
    const { pattern } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    const fields = hubspotFields({ ...blankTemplate(), sections: [pattern.section] }).map((f) => f.field);
    expect(fields).toContain('second_card');
  });
});

describe('an instance against the folder', () => {
  it('knows whether it is current, behind, or orphaned', () => {
    const { t, section } = source();
    const { pattern, template } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    const placed = template.sections.find((s) => s.id === section.id)!;
    expect(instanceOf(placed, [pattern])).toEqual({ pattern, stale: false, missing: false });
    expect(instanceOf(placed, [{ ...pattern, version: 2 }])).toMatchObject({ stale: true, missing: false });
    expect(instanceOf(placed, [])).toMatchObject({ pattern: null, stale: false, missing: true });
    expect(instanceOf(t.sections[0]!, [pattern])).toBeNull();
  });

  it('lists the stale ones for the badges', () => {
    const { t, section } = source();
    const { pattern, template } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    expect(staleInstances(template, [pattern])).toEqual([]);
    expect(staleInstances(template, [{ ...pattern, version: 3 }])).toEqual([{ sectionId: section.id, pattern: { ...pattern, version: 3 } }]);
  });
});

describe('pushing and applying an update', () => {
  it('a push bumps the version from the instance’s contents and stamps the instance', () => {
    const { t, section } = source();
    const { pattern, template } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    const block = section.rows[0]!.columns[0]!.blocks[0]!;
    const edited = setValue(template, { kind: 'block', sectionId: section.id, blockId: block.id }, 'block.html', '<h2>Changed</h2><p>New copy.</p>');
    const pushed = pushPattern(edited, section.id, pattern)!;
    expect(pushed.pattern.version).toBe(2);
    expect((pushed.pattern.section.rows[0]!.columns[0]!.blocks[0] as { html: string }).html).toContain('Changed');
    expect(pushed.pattern.section.pattern).toBeUndefined();
    expect(pushed.template.sections.find((s) => s.id === section.id)!.pattern).toEqual({ id: 'pat1', version: 2 });
  });

  it('applying an update keeps the field names the team’s emails are bound to', () => {
    // Place, push a change from the source, then apply it to the placement.
    const { t, section } = source();
    const { pattern, template: src } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    const placed = placePattern(blankTemplate(), pattern, 0);
    const before = hubspotFields(placed).map((f) => f.field);

    const block = section.rows[0]!.columns[0]!.blocks[0]!;
    const edited = setValue(src, { kind: 'block', sectionId: section.id, blockId: block.id }, 'block.html', '<h2>Changed</h2>');
    const { pattern: v2 } = pushPattern(edited, section.id, pattern)!;

    expect(instanceOf(placed.sections[0]!, [v2])!.stale).toBe(true);
    const updated = applyPattern(placed, placed.sections[0]!.id, v2);
    expect(updated.sections[0]!.pattern).toEqual({ id: 'pat1', version: 2 });
    expect(updated.sections[0]!.id).toBe(placed.sections[0]!.id);
    expect(compile(updated, { mode: 'preview' }).html).toContain('Changed');
    // Same labels, same names — nothing the team typed is orphaned (learnings 1.10).
    expect(hubspotFields(updated).map((f) => f.field)).toEqual(before);
  });

  it('a genuinely new block in the update gets a fresh name, and a removed one goes', () => {
    const { t, section } = source();
    const { pattern, template: src } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    const placed = placePattern(blankTemplate(), pattern, 0);
    // Add a heading to the source's instance, push, apply.
    const withHeading = {
      ...src,
      sections: src.sections.map((s) =>
        s.id === section.id
          ? { ...s, rows: [{ ...s.rows[0]!, columns: [{ ...s.rows[0]!.columns[0]!, blocks: [{ id: 'nh', type: 'heading' as const, lock: { editable: true, label: 'Card title', field: 'card_title' }, text: 'Title', level: 'h2' as const, align: 'left' as const }, ...s.rows[0]!.columns[0]!.blocks] }] }] }
          : s,
      ),
    };
    const { pattern: v2 } = pushPattern(withHeading, section.id, pattern)!;
    const updated = applyPattern(placed, placed.sections[0]!.id, v2);
    const fields = hubspotFields(updated).map((f) => f.field);
    expect(fields).toContain('card_title');
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('ignores an apply for a section that is not that pattern’s instance', () => {
    const { t, section } = source();
    const { pattern } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    const other = blankTemplate();
    expect(applyPattern(other, other.sections[0]!.id, pattern)).toBe(other);
    expect(pushPattern(other, other.sections[0]!.id, pattern)).toBeNull();
  });
});

describe('detaching', () => {
  it('keeps the content and drops the marker', () => {
    const { t, section } = source();
    const { pattern, template } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    const free = detachPattern(template, section.id);
    const s = free.sections.find((x) => x.id === section.id)!;
    expect(s.pattern).toBeUndefined();
    expect(allBlocks(free).length).toBe(allBlocks(template).length);
    expect(instanceOf(s, [pattern])).toBeNull();
  });
});

describe('the pattern file', () => {
  it('parses what it wrote and refuses what it did not', () => {
    const { t, section } = source();
    const { pattern } = patternFromSection(t, section.id, 'Card', 'pat1')!;
    expect(parsePattern(JSON.parse(JSON.stringify(pattern)))).toEqual(pattern);
    expect(() => parsePattern({ name: 'x' })).toThrow(/pattern file/);
    expect(() => parsePattern('x')).toThrow(/pattern file/);
  });
});
