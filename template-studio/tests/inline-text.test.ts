// The inline-text selectors are coupled to markup the compiler owns, which means they can go stale
// without anything complaining. This is what makes that a failing test rather than a dead
// double-click.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { TEXT_TARGETS, RICH } from '../src/app/inline-text.ts';
import { CATALOG, createSection } from '../src/model/catalog.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import { sequentialIds } from '../src/model/ids.ts';
import type { BlockType, Template } from '../src/model/types.ts';

function one(type: BlockType): Template {
  const section = createSection(type, { id: sequentialIds(), taken: new Set<string>() });
  return {
    schema: SCHEMA_VERSION,
    id: 't',
    name: 'One',
    hubspotLabel: 'One',
    pageBackground: '#f7f6f3',
    forceLight: true,
    preview: { company: 'C', address: 'A', city: 'C', state: 'S', zip: 'Z' },
    sections: [section],
  };
}

describe('inline text targets', () => {
  const entries = Object.entries(TEXT_TARGETS) as Array<[BlockType, (typeof TEXT_TARGETS)[BlockType]]>;

  it('covers the blocks whose text is worth editing in place', () => {
    expect(entries.map(([type]) => type).sort()).toEqual(['button', 'heading', 'richtext', 'topbar']);
  });

  it.each(entries)('%s still renders the element the selector expects', (type, target) => {
    const html = compile(one(type), { mode: 'preview', annotate: true }).html;
    expect(html, `${type}: the markup moved and the selector is stale`).toContain(target!.anchor);
  });

  it.each(entries)('%s writes back to a path the block actually has', (type, target) => {
    // `block.text` has to exist on the block, or the edit lands nowhere.
    const section = one(type).sections[0]!;
    const block = section.rows[0]!.columns[0]!.blocks[0]!;
    const key = target!.path.replace('block.', '');
    expect(block).toHaveProperty(key);
  });

  it('marks rich text as markup, so it reads back as HTML and paste is sanitised', () => {
    // It was excluded for two rounds, and the reason was paste: content from Word or Docs carries
    // inline styles that beat the block's own (learnings 3.5). `sanitise.ts` is what unblocked it.
    expect(RICH).toContain('richtext');
    expect(TEXT_TARGETS['richtext']?.rich).toBe(true);
    expect(TEXT_TARGETS['richtext']?.path).toBe('block.html');
    // The inspector keeps its own field, because markup is sometimes what you want to edit.
    expect(CATALOG.richtext.groups[0]!.controls[0]!.kind).toBe('html');
  });
});
