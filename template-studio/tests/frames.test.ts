// Several frames in the Freeform app, and the email Template Studio keeps when no folder is open.
//
// Defended: the frame kept before there were frames becomes the first frame under the key it always had,
// so blocks already linked to it still are; the last frame cannot be deleted and a deleted one comes back
// whole; a copied frame has ids of its own; Template Studio reads every frame by the name the app gave
// it; and a kept email reads back as the email it was.

import { describe, expect, it } from 'vitest';

import { draftJson, readDraft } from '../src/model/draft.ts';
import {
  addFrame,
  copyFrameDoc,
  FRAME_PREFIX,
  FRAMES_INDEX,
  FREEFORM_APP_FRAME,
  frameName,
  loadFrames,
  openFrame,
  readFrameIndex,
  removeFrame,
  renameFrame,
  restoreFrame,
  type KeyValue,
} from '../src/model/frame-store.ts';
import { readAppFrames } from '../src/model/freeform-link.ts';
import { createSection } from '../src/model/catalog.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { blankTemplate } from '../src/model/starters.ts';
import type { FreeformBlock, Template } from '../src/model/types.ts';

const memory = (): KeyValue & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

const makeFrame = (name: string, id: string): Template => {
  let n = 0;
  const section = createSection('freeform', { id: () => `${id}-${(n += 1)}`, taken: new Set() }, DEFAULT_DESIGN_SYSTEM);
  return { ...blankTemplate(), name, hubspotLabel: name, sections: [section] };
};
const blockOf = (t: Template) => t.sections[0]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock;

describe('frames in the Freeform app', () => {
  it('makes the frame kept before frames the first one, under its old key', () => {
    const store = memory();
    store.setItem(FREEFORM_APP_FRAME, JSON.stringify(makeFrame('Freeform', 'old')));
    const index = loadFrames(store, makeFrame, 5);
    expect(index).toEqual({ version: 1, active: FREEFORM_APP_FRAME, frames: [{ key: FREEFORM_APP_FRAME, name: 'Frame 1', updatedAt: 5 }] });
    expect(readFrameIndex(store.getItem(FRAMES_INDEX))).toEqual(index);
    expect(loadFrames(store, makeFrame, 9)).toEqual(index);
  });

  it('starts with one empty frame when there is nothing, and tidies frames that lost their drawing', () => {
    const store = memory();
    const index = loadFrames(store, makeFrame, 5);
    expect(index.frames).toHaveLength(1);
    expect(index.active.startsWith(FRAME_PREFIX)).toBe(true);
    expect(store.getItem(index.active)).not.toBeNull();
    const two = addFrame(store, index, 'Frame 2', makeFrame('Frame 2', 'b'), 'b', 6);
    store.removeItem(index.active);
    expect(loadFrames(store, makeFrame, 7).frames.map((f) => f.name)).toEqual(['Frame 2']);
    expect(two.active).toBe(`${FRAME_PREFIX}b`);
  });

  it('adds, opens, renames, deletes and brings back', () => {
    const store = memory();
    let index = loadFrames(store, makeFrame, 1);
    const first = index.active;
    index = addFrame(store, index, frameName(index), makeFrame('Frame 2', 'b'), 'b', 2);
    expect(index.frames.map((f) => f.name)).toEqual(['Frame 1', 'Frame 2']);
    index = openFrame(store, index, first);
    expect(index.active).toBe(first);
    expect(openFrame(store, index, 'scuggnizzi.freeform.frame.nope')).toBe(index);
    index = renameFrame(store, index, first, '  Poster  ', 3);
    expect(index.frames[0]!.name).toBe('Poster');
    expect(renameFrame(store, index, first, '   ')).toBe(index);

    const { index: after, removed } = removeFrame(store, index, first);
    expect(after.frames.map((f) => f.name)).toEqual(['Frame 2']);
    expect(after.active).toBe(`${FRAME_PREFIX}b`);
    expect(store.getItem(first)).toBeNull();
    expect(removeFrame(store, after, after.active).removed).toBeNull();

    const back = restoreFrame(store, after, removed!);
    expect(back.frames.map((f) => f.name)).toEqual(['Poster', 'Frame 2']);
    expect(back.active).toBe(first);
    expect(store.getItem(first)).not.toBeNull();
  });

  it('names new frames with the next free number', () => {
    const index = { version: 1 as const, active: 'scuggnizzi.freeform.frame.a', frames: [{ key: 'scuggnizzi.freeform.frame.a', name: 'Frame 2', updatedAt: 0 }] };
    expect(frameName(index)).toBe('Frame 3');
    expect(frameName(null)).toBe('Frame 1');
  });

  it('copies a frame with ids of its own', () => {
    const doc = makeFrame('Poster', 'a');
    const copy = copyFrameDoc(doc, 'z', 'Poster copy');
    expect(copy.name).toBe('Poster copy');
    expect(blockOf(copy).id).not.toBe(blockOf(doc).id);
    expect(blockOf(copy).layers).toEqual(blockOf(doc).layers);
  });

  it('reads garbage as no index', () => {
    expect(readFrameIndex('nope')).toBeNull();
    expect(readFrameIndex(JSON.stringify({ version: 1, frames: [{ key: 'elsewhere', name: 'x' }] }))).toBeNull();
  });
});

describe('Template Studio reading the frames', () => {
  it('reads every frame by the name the app gave it, and the old frame alone when there is no index', () => {
    const store = memory();
    store.setItem(FREEFORM_APP_FRAME, JSON.stringify(makeFrame('Freeform', 'old')));
    const get = (k: string) => store.getItem(k);
    expect(readAppFrames(get).map((f) => [f.key, f.name])).toEqual([[FREEFORM_APP_FRAME, 'Frame 1']]);
    let index = loadFrames(store, makeFrame, 1);
    index = addFrame(store, index, 'Poster', makeFrame('Poster', 'p'), 'p', 2);
    index = renameFrame(store, index, FREEFORM_APP_FRAME, 'Club');
    expect(readAppFrames(get).map((f) => [f.key, f.name])).toEqual([
      [FREEFORM_APP_FRAME, 'Club'],
      [`${FRAME_PREFIX}p`, 'Poster'],
    ]);
    store.setItem(`${FRAME_PREFIX}p`, 'broken');
    expect(readAppFrames(get).map((f) => f.name)).toEqual(['Club']);
  });
});

describe('the email kept when no folder is open', () => {
  it('reads back as the email it was, and nothing from what it cannot read', () => {
    const email = { ...blankTemplate(), name: 'Kept email' };
    expect(readDraft(draftJson(email, 1))).toEqual(email);
    expect(readDraft(null)).toBeNull();
    expect(readDraft('{"version":2,"template":{}}')).toBeNull();
    expect(readDraft('not json')).toBeNull();
  });
});
