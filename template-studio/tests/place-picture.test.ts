import { describe, expect, it } from 'vitest';

import { allBlocks, siteOf } from '../src/model/edit.ts';
import { altFor, placePicture, replacePicture } from '../src/model/place-picture.ts';
import { blankTemplate } from '../src/model/starters.ts';
import type { ImageBlock } from '../src/model/types.ts';

const imageAt = (t: ReturnType<typeof blankTemplate>, id: string | null) => allBlocks(t).find((b) => b.id === id) as ImageBlock | undefined;

describe('a picture dropped into the email', () => {
  it('gets a section of its own at the end, or where it was aimed', () => {
    const t = blankTemplate();
    const before = t.sections.length;
    const { template: next, blockId } = placePicture(t, 'photos/hero-shot.png', null);
    expect(next.sections.length).toBe(before + 1);
    const block = imageAt(next, blockId);
    expect(block).toMatchObject({ type: 'image', src: 'photos/hero-shot.png', alt: 'hero shot', mode: 'module' });
    expect(siteOf(next, blockId!)?.section).toBe(next.sections[before]);

    const { template: first, blockId: firstId } = placePicture(t, 'a.png', { kind: 'section', index: 0 });
    expect(siteOf(first, firstId!)?.section).toBe(first.sections[0]);
  });

  it('joins the column it was dropped beside, at that index, with an id and field name of its own', () => {
    const t = blankTemplate();
    const { template: one, blockId: a } = placePicture(t, 'a.png', null);
    const column = siteOf(one, a!)!.column;
    const { template: two, blockId: b } = placePicture(one, 'b.png', { kind: 'column', columnId: column.id, index: 0 });
    const blocks = siteOf(two, b!)!.column.blocks;
    expect(blocks.map((x) => (x as ImageBlock).src)).toEqual(['b.png', 'a.png']);
    expect(b).not.toBe(a);
    const fields = blocks.map((x) => (x as ImageBlock).lock.field);
    expect(new Set(fields).size).toBe(2);
    // Past the end lands at the end; a column that is not there changes nothing.
    const { template: three, blockId: c } = placePicture(two, 'c.png', { kind: 'column', columnId: column.id, index: 99 });
    expect(siteOf(three, c!)!.column.blocks.map((x) => (x as ImageBlock).src)).toEqual(['b.png', 'a.png', 'c.png']);
    expect(placePicture(two, 'd.png', { kind: 'column', columnId: 'nowhere', index: 0 })).toEqual({ template: two, blockId: null });
  });

  it('dropped on an Image block, replaces its picture and writes an alt text only when there was none', () => {
    const t = blankTemplate();
    const { template: one, blockId } = placePicture(t, 'a.png', null);
    const swapped = replacePicture(one, blockId!, 'photos/b-side.png');
    expect(imageAt(swapped, blockId)).toMatchObject({ src: 'photos/b-side.png', alt: 'a' });
    const blank = { ...one, sections: one.sections.map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, columns: r.columns.map((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, alt: '' } : b)) })) })) })) };
    expect(imageAt(replacePicture(blank, blockId!, 'photos/b-side.png'), blockId)?.alt).toBe('b side');
    // The same picture again, or not an Image, or not there: the same template back.
    expect(replacePicture(swapped, blockId!, 'photos/b-side.png')).toBe(swapped);
    const legal = allBlocks(one).find((b) => b.type === 'legal')!;
    expect(replacePicture(one, legal.id, 'x.png')).toBe(one);
    expect(replacePicture(one, 'nowhere', 'x.png')).toBe(one);
  });

  it('reads a first alt text off the file name', () => {
    expect(altFor('photos/team-photo_2.jpg')).toBe('team photo 2');
    expect(altFor('Seeyouaroundtheclub.png')).toBe('Seeyouaroundtheclub');
    expect(altFor('rendered/lede.png')).toBe('lede');
  });
});
