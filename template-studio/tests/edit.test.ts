// The editing layer. Pure functions, so the rules that matter can be tested without a browser —
// and the rules that matter here are mostly about HubSpot field names, which are the one thing an
// editor can silently destroy.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { importV1 } from '../src/model/import-v1.ts';
import {
  addSection,
  allBlocks,
  backToText,
  renderAsImage,
  duplicateSection,
  hubspotFields,
  lockedBlockIds,
  moveSection,
  moveSectionTo,
  readValue,
  removeSection,
  resolve,
  setValue,
  takenFieldNames,
  type Selection,
} from '../src/model/edit.ts';
import { compile } from '../src/compile/compile.ts';
import { declaredFields } from './structure.ts';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../reference/v1-standard-email.design.json', import.meta.url)), 'utf8'),
);
const base = () => importV1(fixture).template;

/** The section holding the first block of the given type. */
function find(template = base(), type: string): Selection {
  for (const section of template.sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        for (const block of column.blocks) {
          if (block.type === type) return { kind: 'block', sectionId: section.id, blockId: block.id };
        }
      }
    }
  }
  throw new Error(`no ${type} block`);
}

describe('setting a value', () => {
  it('writes to the block, and leaves the document otherwise untouched', () => {
    const before = base();
    const at = find(before, 'heading' in before ? 'heading' : 'button');
    const after = setValue(before, at, 'block.text', 'NEW LABEL');
    expect(readValue(after, at, 'block.text')).toBe('NEW LABEL');
    expect(before).not.toBe(after);
    expect(after.sections).toHaveLength(before.sections.length);
  });

  it('writes padding to the column, not the block', () => {
    const before = base();
    const at = find(before, 'richtext');
    const after = setValue(before, at, 'column.padTop', 42);
    expect(resolve(after, at).column?.padTop).toBe(42);
    expect(resolve(after, at).block).not.toHaveProperty('padTop');
  });

  it('moves band, container, text and link together when the preset changes', () => {
    const before = base();
    const at = find(before, 'richtext');
    const after = setValue(before, at, 'section.theme', 'navy');
    const section = resolve(after, at).section!;
    expect(section.theme).toBe('navy');
    expect(section.bandColor).toBe('#011272');
    expect(section.containerColor).toBeNull();
    expect(section.textColor).toBe('#fcfff5');
    expect(section.linkColor).toBe('#fcfff5');
  });
});

describe('HubSpot field names', () => {
  it('does not change when the label is renamed', () => {
    // learnings 1.10: a renamed field orphans whatever the team already typed into the old one.
    const before = base();
    const at = find(before, 'richtext');
    const field = readValue(before, at, 'block.lock.field');
    const after = setValue(before, at, 'block.lock.label', 'Something else entirely');
    expect(readValue(after, at, 'block.lock.field')).toBe(field);
    expect(readValue(after, at, 'block.lock.label')).toBe('Something else entirely');
  });

  it('mints one the first time a field is unlocked, and only then', () => {
    const before = base();
    const at = find(before, 'legal');
    expect(readValue(before, at, 'block.noteLock.field')).toBe('');

    const unlocked = setValue(before, at, 'block.noteLock.editable', true);
    const minted = readValue(unlocked, at, 'block.noteLock.field');
    expect(minted).toBe('legal_note');

    // Locking and unlocking again keeps the name it already had.
    const relocked = setValue(unlocked, at, 'block.noteLock.editable', false);
    const again = setValue(relocked, at, 'block.noteLock.editable', true);
    expect(readValue(again, at, 'block.noteLock.field')).toBe(minted);
  });

  it('never mints a name that collides with one already in the template', () => {
    const before = base();
    const at = find(before, 'legal');
    const after = setValue(before, at, 'block.noteLock.editable', true);
    const names = [...takenFieldNames(after)];
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('structural edits', () => {
  it('moves a section, and refuses to move it off either end', () => {
    const before = base();
    const first = before.sections[0]!.id;
    expect(moveSection(before, first, -1)).toBe(before);
    const moved = moveSection(before, first, 1);
    expect(moved.sections[1]!.id).toBe(first);

    const last = before.sections.at(-1)!.id;
    expect(moveSection(before, last, 1)).toBe(before);
  });

  it('duplicates a section directly below it, with entirely new ids', () => {
    const before = base();
    const at = find(before, 'button');
    const after = duplicateSection(before, at.kind === 'block' ? at.sectionId : '');
    expect(after.sections).toHaveLength(before.sections.length + 1);

    const ids = after.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const blockIds = allBlocks(after).map((b) => b.id);
    expect(new Set(blockIds).size).toBe(blockIds.length);
  });

  it('gives the duplicate its own HubSpot fields, so the panel has no collision', () => {
    // Two blocks sharing a field name would be one field to the team, editing both at once.
    const before = base();
    const at = find(before, 'button');
    const after = duplicateSection(before, at.kind === 'block' ? at.sectionId : '');
    const names = declaredFields(compile(after, { mode: 'hubl' }).html).map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('button_text');
    expect(names).toContain('button_text_2');
  });

  it('removes a section', () => {
    const before = base();
    const at = find(before, 'button');
    const id = at.kind === 'block' ? at.sectionId : '';
    const after = removeSection(before, id);
    expect(after.sections).toHaveLength(before.sections.length - 1);
    expect(after.sections.find((s) => s.id === id)).toBeUndefined();
  });

  it('adds a block below the selected one, and the result still compiles clean', () => {
    const before = base();
    const at = find(before, 'richtext');
    const after = addSection(before, 'heading', at.kind === 'block' ? at.sectionId : null);
    expect(after.sections).toHaveLength(before.sections.length + 1);

    const out = compile(after, { mode: 'hubl' });
    const names = declaredFields(out.html).map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('headline');
  });

  it('keeps every added block type compiling and uniquely named', () => {
    let template = base();
    for (const type of ['heading', 'richtext', 'image', 'button', 'divider', 'stripes', 'spacer', 'topbar'] as const) {
      template = addSection(template, type, null);
    }
    const names = declaredFields(compile(template, { mode: 'hubl' }).html).map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the editability view', () => {
  it('lists fields in the order HubSpot will list them', () => {
    // Panel order is document order, because the compiler emits each declaration immediately
    // before the markup that uses it (learnings 1.4). This view can therefore be trusted without
    // compiling — and this test proves the two agree.
    const template = base();
    const fromDocument = hubspotFields(template).map((f) => f.field);
    const fromOutput = declaredFields(compile(template, { mode: 'hubl' }).html).map((f) => f.name);
    expect(fromDocument).toEqual(fromOutput);
  });

  it('keeps a button’s label and link adjacent, in that order', () => {
    const fields = hubspotFields(base()).map((f) => f.field);
    expect(fields.indexOf('button_link')).toBe(fields.indexOf('button_text') + 1);
  });

  it('omits locked content, because the team never sees it', () => {
    const template = base();
    const shown = hubspotFields(template);
    const all = hubspotFields(template, true);
    expect(all.length).toBeGreaterThan(shown.length);
    expect(shown.every((f) => f.editable)).toBe(true);
  });

  it('points at blocks that have nothing editable, for dimming', () => {
    const template = base();
    const dim = lockedBlockIds(template);
    const editableBlocks = new Set(hubspotFields(template).map((f) => f.blockId));
    expect(dim.length).toBeGreaterThan(0);
    expect(dim.some((id) => editableBlocks.has(id))).toBe(false);
  });

  it('renames a label without moving the field name underneath it', () => {
    const template = base();
    const entry = hubspotFields(template)[0]!;
    const at: Selection = { kind: 'block', sectionId: entry.sectionId, blockId: entry.blockId };
    const after = setValue(template, at, `${entry.path}.label`, 'Renamed in the fields view');
    const renamed = hubspotFields(after)[0]!;
    expect(renamed.label).toBe('Renamed in the fields view');
    expect(renamed.field).toBe(entry.field);
  });
});

describe('moving a section to an absolute position', () => {
  it('moves it, and clamps rather than throwing', () => {
    const template = base();
    const id = template.sections[0]!.id;
    expect(moveSectionTo(template, id, 3).sections[3]!.id).toBe(id);
    expect(moveSectionTo(template, id, 999).sections.at(-1)!.id).toBe(id);
    expect(moveSectionTo(template, id, 0)).toBe(template);
  });
});

describe('writing to a named node', () => {
  it('lands on the block it names, not on whatever was selected before', () => {
    // The fields view and inline canvas editing both act on a block the user has not selected yet.
    // `select()` then `set()` looks equivalent and is not — `set` closes over the selection from
    // its own render — which is why `setValue` takes the selection explicitly.
    const template = base();
    const heading = find(template, 'topbar');
    const button = find(template, 'button');

    const after = setValue(template, button, 'block.text', 'Written to the button');
    expect(readValue(after, button, 'block.text')).toBe('Written to the button');
    expect(readValue(after, heading, 'block.text')).toBe(readValue(template, heading, 'block.text'));
  });

  it('is what the fields view uses to rename every row independently', () => {
    let template = base();
    for (const entry of hubspotFields(template)) {
      template = setValue(
        template,
        { kind: 'block', sectionId: entry.sectionId, blockId: entry.blockId },
        `${entry.path}.label`,
        `${entry.label}!`,
      );
    }
    const labels = hubspotFields(template).map((f) => f.label);
    expect(labels.every((l) => l.endsWith('!'))).toBe(true);
    // Every one renamed exactly once — a stale selection would have written them all onto one block.
    expect(labels.every((l) => !l.endsWith('!!'))).toBe(true);
  });
});

describe('rendering a block as a picture of itself', () => {
  /** The first rich text block in the v1 email, which has an open HubSpot field. */
  const textBlock = () => {
    const template = importV1(fixture as never).template;
    const block = allBlocks(template).find((b) => b.type === 'richtext')!;
    return { template, block };
  };

  it('replaces the words with an image, keeping the id so nothing else has to move', () => {
    const { template, block } = textBlock();
    const after = renderAsImage(template, block.id, { src: 'headline-a1.png', alt: 'Headline', width: 560 });
    const now = allBlocks(after).find((b) => b.id === block.id)!;
    expect(now.type).toBe('image');
    expect(now.type === 'image' && now.src).toBe('headline-a1.png');
    expect(now.type === 'image' && now.width).toBe(560);
  });

  it('carries the words into the alt, because that is the block where images are blocked', () => {
    // Outlook on Windows and most corporate mail block images by default. For those readers the
    // alt is not an accessibility nicety — it is the content.
    const { template, block } = textBlock();
    const after = renderAsImage(template, block.id, { src: 'a.png', alt: 'Lorem ipsum dolor', width: 560 });
    const now = allBlocks(after).find((b) => b.id === block.id)!;
    expect(now.type === 'image' && now.alt).toBe('Lorem ipsum dolor');
  });

  it('closes the HubSpot field, because nobody can retype a picture', () => {
    const { template, block } = textBlock();
    expect(block.type === 'richtext' && block.lock.editable).toBe(true);
    const after = renderAsImage(template, block.id, { src: 'a.png', alt: 'x', width: 560 });
    const now = allBlocks(after).find((b) => b.id === block.id)!;
    expect('lock' in now && now.lock.editable).toBe(false);
    // And the field leaves the template, which is the consequence worth stating out loud: whatever
    // the team typed into it in a past send has nothing to come back to (learnings 1.10).
    const fields = declaredFields(compile(after, { mode: 'hubl' }).html).map((f) => f.name);
    expect(fields).not.toContain(block.type === 'richtext' ? block.lock.field : '');
  });

  it('keeps the original whole, so going back restores the field rather than minting a new one', () => {
    const { template, block } = textBlock();
    const there = renderAsImage(template, block.id, { src: 'a.png', alt: 'x', width: 560 });
    const back = backToText(there, block.id);
    expect(allBlocks(back).find((b) => b.id === block.id)).toEqual(block);
    // The name is the part that matters: a fresh one would orphan the team's copy a second time.
    const fields = declaredFields(compile(back, { mode: 'hubl' }).html).map((f) => f.name);
    expect(fields).toContain(block.type === 'richtext' ? block.lock.field : '');
  });

  it('leaves everything that is not a heading or a paragraph alone', () => {
    const template = importV1(fixture as never).template;
    const stripes = allBlocks(template).find((b) => b.type === 'stripes')!;
    expect(renderAsImage(template, stripes.id, { src: 'a.png', alt: 'x', width: 560 })).toEqual(template);
    // And an image that was never words has nowhere to go back to.
    const image = allBlocks(template).find((b) => b.type === 'image')!;
    expect(backToText(template, image.id)).toEqual(template);
  });
});
