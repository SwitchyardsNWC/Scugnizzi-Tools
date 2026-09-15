// What the board does to the files (model/board-edits.ts).
//
// Defended: a picture dropped on an email becomes an image block above the footer with a field name of its
// own; dropped on a frame it becomes a fitted image layer; an email can be made to follow a frame and to stop;
// taking a picture out removes every block and layer that showed it and the sections left empty, and changes
// nothing when it was not there; a recipe lets go of one source; and a frame copy has its own key and name.

import { describe, expect, it } from 'vitest';

import { addFrameToEmail, addPictureToEmail, addPictureToFrame, altFor, dropSourceFromRecipe, duplicateFrameFile, frameBlock, removePictureFrom, unfollowFrame } from '../src/model/board-edits.ts';
import { createSection } from '../src/model/catalog.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { readAppFrame } from '../src/model/freeform-link.ts';
import { blankTemplate } from '../src/model/starters.ts';
import type { FreeformBlock, ImageBlock, Template } from '../src/model/types.ts';

const ids = (prefix: string) => {
  let n = 0;
  return { id: () => `${prefix}${(n += 1)}`, taken: new Set<string>() };
};
/** A short email: heading, image, legal footer. */
const email = (): Template => ({ ...blankTemplate(), sections: ['heading', 'image', 'legal'].map((t, i) => createSection(t as 'heading', ids(`s${i}-`), DEFAULT_DESIGN_SYSTEM)) });
const frame = (): Template => ({ ...blankTemplate(), name: 'Hero', hubspotLabel: 'Hero', sections: [createSection('freeform', ids('f-'), DEFAULT_DESIGN_SYSTEM)] });
const blocks = (t: Template) => t.sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)));
const kinds = (t: Template) => blocks(t).map((b) => b.type);

describe('board edits', () => {
  it('put a picture in an email as an image block above the footer, with a field name of its own', () => {
    const before = email();
    const after = addPictureToEmail(before, 'photos/hero-shot.png', 'bd-');
    expect(kinds(after)).toEqual(['heading', 'image', 'image', 'legal']);
    const added = blocks(after)[2] as ImageBlock;
    expect(added).toMatchObject({ type: 'image', src: 'photos/hero-shot.png', alt: 'hero shot' });
    const existing = blocks(before)[1] as ImageBlock;
    expect(added.lock.field).not.toBe(existing.lock.field);
    expect(altFor('a_b-c.JPG')).toBe('a b c');
  });

  it('put a picture in a frame as a fitted, centred layer', () => {
    const t = frame();
    const block = frameBlock(t)!;
    const after = frameBlock(addPictureToFrame(t, 'photos/wide.png', { width: 4000, height: 1000 }))!;
    const layer = after.layers[after.layers.length - 1]!;
    expect(layer.kind).toBe('image');
    if (layer.kind !== 'image') return;
    expect(layer.src).toBe('photos/wide.png');
    expect(layer.width).toBeLessThanOrEqual(Math.max(40, block.width / 2));
    expect(Math.round(layer.x + layer.width / 2)).toBe(Math.round(block.width / 2));
    expect(frameBlock(email())).toBeNull();
  });

  it('make an email follow a frame, and stop', () => {
    const f = readAppFrame(JSON.stringify(frame()), 'scuggnizzi.freeform.frame.abc')!;
    const following = addFrameToEmail(email(), f, 'ff-');
    expect(kinds(following)).toEqual(['heading', 'image', 'freeform', 'legal']);
    const block = blocks(following)[2] as FreeformBlock;
    expect(block.source).toMatchObject({ app: 'freeform', key: 'scuggnizzi.freeform.frame.abc' });
    const { template: free, unlinked } = unfollowFrame(following, 'scuggnizzi.freeform.frame.abc');
    expect(unlinked).toBe(1);
    expect((blocks(free)[2] as FreeformBlock).source).toBeUndefined();
    expect(kinds(free)).toEqual(kinds(following));
    expect(unfollowFrame(free, 'scuggnizzi.freeform.frame.abc').unlinked).toBe(0);
  });

  it('take a picture out of everything that shows it, sections included, and leave the rest alone', () => {
    let t = addPictureToEmail(email(), 'photos/a.png', 'a-');
    const withLayer = addPictureToFrame(frame(), 'photos/a.png', { width: 100, height: 100 });
    t = { ...t, sections: [...t.sections, ...withLayer.sections] };
    expect(kinds(t)).toEqual(['heading', 'image', 'image', 'legal', 'freeform']);
    const { template: after, removed } = removePictureFrom(t, 'photos/a.png');
    expect(removed).toBe(2);
    expect(kinds(after)).toEqual(['heading', 'image', 'legal', 'freeform']);
    expect(frameBlock({ ...after, sections: after.sections.slice(3) })!.layers.some((l) => l.kind === 'image')).toBe(false);
    const untouched = removePictureFrom(after, 'photos/b.png');
    expect(untouched.removed).toBe(0);
    expect(untouched.template).toBe(after);
  });

  it('let a recipe go of one source', () => {
    const raw = { version: 1, tool: 'riso', output: 'assets/a-riso.png', sources: ['assets/a.png', 'assets/b.png'] };
    expect(dropSourceFromRecipe(raw, 'a.png')).toEqual({ value: { ...raw, sources: ['assets/b.png'] }, changed: true });
    expect(dropSourceFromRecipe(raw, 'zzz.png')).toEqual({ value: raw, changed: false });
    expect(dropSourceFromRecipe('nope', 'a.png').changed).toBe(false);
  });

  it('copy a frame with its own key and name', () => {
    const copy = duplicateFrameFile({ key: 'k1', name: 'Hero', savedAt: 1, template: frame() }, 'k2', 9);
    expect(copy).toMatchObject({ key: 'k2', name: 'Hero copy', savedAt: 9 });
    expect(copy.template).toMatchObject({ name: 'Hero copy', hubspotLabel: 'Hero copy' });
  });
});
