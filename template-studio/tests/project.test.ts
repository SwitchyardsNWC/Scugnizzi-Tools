// A project folder, its board, and Freeform frames as files in it.
//
// Defended: project.json and board.json read back as written, and garbage reads as nothing or an empty
// board; a card without a place finds the first free spot beside its kind and never lands on another card,
// while a card with a place keeps it; a card whose file has gone is reported, not dropped; the links say
// which frame an email follows and where each picture is used; a frame file round-trips and gets a name of
// its own; and the sync takes the newer copy, adopts frames no project has, leaves another project's frames
// alone and drops frames deleted from the folder.

import { describe, expect, it } from 'vitest';

import { createSection } from '../src/model/catalog.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { frameFileJson, frameFileName, planFrameSync, readFrameFile } from '../src/model/frame-file.ts';
import {
  addFrame,
  applyPulls,
  dropFrames,
  FRAME_PREFIX,
  FRAMES_INDEX,
  FREEFORM_APP_FRAME,
  loadFrames,
  projectFrames,
  readFrameIndex,
  readFrames,
  removeFrame,
  restoreFrame,
  tagFrames,
  touchFrame,
  type KeyValue,
} from '../src/model/frame-store.ts';
import {
  boardJson,
  emptyBoard,
  forgetCard,
  layoutBoard,
  moveCard,
  newProjectInfo,
  projectJson,
  projectLinks,
  readBoard,
  readProjectInfo,
  withPlaces,
  type CardSource,
} from '../src/model/project.ts';
import { blankTemplate } from '../src/model/starters.ts';
import type { FreeformBlock, ImageBlock, Template } from '../src/model/types.ts';

const memory = (): KeyValue => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};
const ids = (prefix: string) => {
  let n = 0;
  return { id: () => `${prefix}-${(n += 1)}`, taken: new Set<string>() };
};
const makeFrame = (name: string, id: string): Template => ({
  ...blankTemplate(),
  name,
  hubspotLabel: name,
  sections: [createSection('freeform', ids(id), DEFAULT_DESIGN_SYSTEM)],
});
const firstBlock = <T,>(t: Template, at = 0) => t.sections[at]!.rows[0]!.columns[0]!.blocks[0] as T;

const P = 'folder:spring';

describe('project.json', () => {
  it('reads back as written, and garbage as nothing', () => {
    const info = newProjectInfo('  Spring campaign ', 'folder:Spring campaign', 7);
    expect(readProjectInfo(projectJson(info))).toEqual({ version: 1, id: 'folder:Spring campaign', name: 'Spring campaign', createdAt: 7 });
    expect(readProjectInfo('nope')).toBeNull();
    expect(readProjectInfo('{"version":2,"id":"a"}')).toBeNull();
    expect(readProjectInfo('{"version":1}')).toBeNull();
  });
});

describe('board.json', () => {
  it('reads back as written, with places in whole pixels', () => {
    const board = moveCard(emptyBoard(), 'email:welcome.template.json', 10.4, 20.6);
    expect(board.cards).toEqual({ 'email:welcome.template.json': { x: 10, y: 21 } });
    expect(readBoard(boardJson(board))).toEqual(board);
    expect(forgetCard(board, 'email:welcome.template.json').cards).toEqual({});
  });

  it('reads garbage as an empty board, and skips places it cannot use', () => {
    expect(readBoard('nope')).toEqual(emptyBoard());
    const raw = JSON.stringify({ version: 1, cards: { 'email:a': { x: 1, y: 2 }, 'poster:b': { x: 1, y: 2 }, 'frame:c': { x: 'left', y: 2 } } });
    expect(readBoard(raw).cards).toEqual({ 'email:a': { x: 1, y: 2 } });
  });
});

describe('the board layout', () => {
  const email = (name: string): CardSource => ({ id: `email:${name}.template.json`, kind: 'email', name });
  const picture = (name: string): CardSource => ({ id: `picture:${name}`, kind: 'picture', name });

  it('lays a new folder out in lanes: emails, then frames, then pictures, each by name', () => {
    const layout = layoutBoard([email('B'), picture('p2.png'), { id: 'frame:k', kind: 'frame', name: 'F' }, email('A'), picture('p1.png')], emptyBoard());
    const at = Object.fromEntries(layout.cards.map((c) => [c.id, [c.x, c.y]]));
    expect(at).toEqual({
      'email:A.template.json': [0, 0],
      'email:B.template.json': [300, 0],
      'frame:k': [0, 500],
      'picture:p1.png': [0, 870],
      'picture:p2.png': [260, 870],
    });
    expect(layout.placed).toEqual(['email:A.template.json', 'email:B.template.json', 'frame:k', 'picture:p1.png', 'picture:p2.png']);
    expect(layout.missing).toEqual([]);
  });

  it('wraps a lane after five cards', () => {
    const layout = layoutBoard(['1', '2', '3', '4', '5', '6'].map((n) => picture(`${n}.png`)), emptyBoard());
    expect(layout.cards.map((c) => [c.x, c.y])).toEqual([[0, 0], [260, 0], [520, 0], [780, 0], [1040, 0], [0, 250]]);
  });

  it('keeps a card where it was put, and finds the next free spot beside it', () => {
    const board = moveCard(emptyBoard(), 'email:A.template.json', 300, 0);
    const layout = layoutBoard([email('A'), email('B')], board);
    expect(layout.cards.map((c) => [c.id, c.x, c.y])).toEqual([
      ['email:A.template.json', 300, 0],
      ['email:B.template.json', 600, 0],
    ]);
    expect(layout.placed).toEqual(['email:B.template.json']);
  });

  it('never lands a card on a card of another kind', () => {
    let board = moveCard(emptyBoard(), 'email:A.template.json', 0, 0);
    board = moveCard(board, 'frame:k', 300, 0);
    const layout = layoutBoard([email('A'), email('B'), { id: 'frame:k', kind: 'frame', name: 'K' }], board);
    expect(layout.cards.find((c) => c.id === 'email:B.template.json')).toMatchObject({ x: 900, y: 0 });
  });

  it('reports a card whose file has gone, and keeps its spot taken', () => {
    const board = moveCard(emptyBoard(), 'email:gone.template.json', 0, 0);
    const layout = layoutBoard([email('A')], board);
    expect(layout.missing).toEqual([{ id: 'email:gone.template.json', kind: 'email', x: 0, y: 0, w: 260, h: 380 }]);
    expect(layout.cards[0]).toMatchObject({ id: 'email:A.template.json', x: 300, y: 0 });
  });

  it('draws a group for a folder with nothing in it yet, and none for a folder a group cannot own', () => {
    const laid = layoutBoard([], emptyBoard(), ['photos', 'logos', 'rendered', '.hidden', 'a/b']);
    expect(laid.groups.map((g) => [g.folder, g.name, g.members])).toEqual([
      ['logos', 'logos', []],
      ['photos', 'photos', []],
    ]);
    expect(laid.groupsPlaced).toEqual(['group:logos', 'group:photos']);
    // Side by side in a row, and kept once written down.
    expect(laid.groups[0]!.y).toBe(laid.groups[1]!.y);
    expect(laid.groups[1]!.x).toBeGreaterThan(laid.groups[0]!.x + laid.groups[0]!.w);
    const kept = withPlaces(emptyBoard(), laid.cards, laid.groups);
    expect(layoutBoard([], kept, ['photos', 'logos']).groupsPlaced).toEqual([]);
    // A picture filed in one later lands inside it.
    const filed = layoutBoard([{ id: 'picture:photos/a.png', kind: 'picture', name: 'a.png' }], kept, ['photos', 'logos']);
    const photos = filed.groups.find((g) => g.folder === 'photos')!;
    expect(photos.members).toEqual(['picture:photos/a.png']);
    const card = filed.cards[0]!;
    expect(card.x).toBeGreaterThanOrEqual(photos.x);
    expect(card.x + card.w).toBeLessThanOrEqual(photos.x + photos.w);
  });

  it('lays out the same once the places are written down', () => {
    const sources = [email('A'), email('B'), picture('p.png')];
    const first = layoutBoard(sources, emptyBoard());
    const again = layoutBoard(sources, withPlaces(emptyBoard(), first.cards));
    expect(again.placed).toEqual([]);
    expect(again.cards).toEqual(first.cards);
  });
});

describe('links between cards', () => {
  it('says which frame an email follows and where each picture is used', () => {
    const key = `${FRAME_PREFIX}k`;
    const image = createSection('image', ids('i'), DEFAULT_DESIGN_SYSTEM);
    firstBlock<ImageBlock>({ sections: [image] } as Template).src = 'hero.png';
    const followed = createSection('freeform', ids('f'), DEFAULT_DESIGN_SYSTEM);
    const block = firstBlock<FreeformBlock>({ sections: [followed] } as Template);
    block.source = { app: 'freeform', key };
    // A followed block carries copies of the frame's layers, pictures included.
    block.layers = [{ id: 'l1', kind: 'image', src: 'photo.png', x: 0, y: 0, width: 10, height: 10, opacity: 1 }];
    const emailT: Template = { ...blankTemplate(), sections: [image, followed] };

    const frameT = makeFrame('K', 'k');
    firstBlock<FreeformBlock>(frameT).layers = [{ id: 'l1', kind: 'image', src: 'photo.png', x: 0, y: 0, width: 10, height: 10, opacity: 1 }];

    const links = projectLinks(
      [{ id: 'email:e', template: emailT }],
      [{ id: 'frame:k', key, template: frameT }],
      ['hero.png', 'photo.png', 'unused.png'].map((path) => ({ id: `picture:${path}`, path })),
    );
    expect(links).toEqual([
      { from: 'picture:hero.png', to: 'email:e', kind: 'uses' },
      { from: 'frame:k', to: 'email:e', kind: 'follows' },
      { from: 'picture:photo.png', to: 'frame:k', kind: 'uses' },
    ]);
  });
});

describe('frame files', () => {
  const frame = { key: `${FRAME_PREFIX}k`, name: 'Social media', savedAt: 42, template: makeFrame('Social media', 'k') };

  it('read back as written', () => {
    expect(readFrameFile(frameFileJson(frame))).toEqual(JSON.parse(JSON.stringify(frame)));
  });

  it('read anything else as nothing', () => {
    const raw = JSON.parse(frameFileJson(frame)) as Record<string, unknown>;
    expect(readFrameFile('nope')).toBeNull();
    expect(readFrameFile(JSON.stringify({ ...raw, kind: 'poster' }))).toBeNull();
    expect(readFrameFile(JSON.stringify({ ...raw, key: 'elsewhere' }))).toBeNull();
    expect(readFrameFile(JSON.stringify({ ...raw, template: blankTemplate() }))).toBeNull();
  });

  it('are named for their frame, and never for another frame’s file', () => {
    expect(frameFileName('Social media', [])).toBe('social-media.frame.json');
    expect(frameFileName('Social media', ['Social-Media.frame.json'])).toBe('social-media-2.frame.json');
    expect(frameFileName('Social media', ['social-media.frame.json', 'social-media-2.frame.json'])).toBe('social-media-3.frame.json');
    expect(frameFileName('Café crème', [])).toBe('cafe-creme.frame.json');
    expect(frameFileName('  ', [])).toBe('frame.frame.json');
  });
});

describe('frames between this browser and a project', () => {
  it('takes the newer copy of each frame', () => {
    expect(planFrameSync(P, [], [{ key: 'a', savedAt: 5 }])).toEqual([{ op: 'pull', key: 'a' }]);
    expect(planFrameSync(P, [{ key: 'a', updatedAt: 4, project: P }], [{ key: 'a', savedAt: 5 }])).toEqual([{ op: 'pull', key: 'a' }]);
    expect(planFrameSync(P, [{ key: 'a', updatedAt: 6, project: P }], [{ key: 'a', savedAt: 5 }])).toEqual([{ op: 'push', key: 'a' }]);
    expect(planFrameSync(P, [{ key: 'a', updatedAt: 5, project: P }], [{ key: 'a', savedAt: 5 }])).toEqual([]);
    expect(planFrameSync(P, [{ key: 'a', updatedAt: 5 }], [{ key: 'a', savedAt: 5 }])).toEqual([{ op: 'tag', key: 'a' }]);
  });

  it('adopts frames no project has, drops frames deleted from the folder, and leaves other projects’ alone', () => {
    expect(planFrameSync(P, [{ key: 'new', updatedAt: 1 }], [])).toEqual([{ op: 'push', key: 'new' }]);
    expect(planFrameSync(P, [{ key: 'gone', updatedAt: 1, project: P }], [])).toEqual([{ op: 'drop', key: 'gone' }]);
    expect(planFrameSync(P, [{ key: 'theirs', updatedAt: 1, project: 'folder:autumn' }], [])).toEqual([]);
  });

  it('takes in no loose frames for a project made from a type, and still takes its own', () => {
    expect(planFrameSync(P, [{ key: 'loose', updatedAt: 1 }], [], false)).toEqual([]);
    expect(planFrameSync(P, [{ key: 'gone', updatedAt: 1, project: P }], [{ key: 'starter', savedAt: 2 }], false)).toEqual([
      { op: 'pull', key: 'starter' },
      { op: 'drop', key: 'gone' },
    ]);
  });

  it('keeps the browser’s list in step: taken, marked, touched, dropped', () => {
    const store = memory();
    let index = loadFrames(store, makeFrame, 1);
    const mine = index.active;
    const file = { key: `${FRAME_PREFIX}k`, name: 'Social', savedAt: 9, template: makeFrame('Social', 'k') };

    index = applyPulls(store, index, [file], P)!;
    expect(index.active).toBe(mine);
    expect(index.frames.map((f) => [f.key, f.name, f.updatedAt, f.project])).toEqual([
      [mine, 'Frame 1', 1, undefined],
      [file.key, 'Social', 9, P],
    ]);
    expect(store.getItem(file.key)).toBe(JSON.stringify(file.template));
    expect(readFrameIndex(store.getItem(FRAMES_INDEX))).toEqual(index);

    expect(projectFrames(index, 'folder:autumn').map((f) => f.key)).toEqual([mine]);
    expect(projectFrames(index, P).map((f) => f.key)).toEqual([mine, file.key]);
    expect(projectFrames(index, null)).toHaveLength(2);
    expect(projectFrames(index, P, false).map((f) => f.key)).toEqual([file.key]);

    index = tagFrames(store, index, [mine], P);
    expect(projectFrames(index, 'folder:autumn')).toEqual([]);
    index = touchFrame(store, index, mine, 20);
    expect(index.frames[0]!.updatedAt).toBe(20);

    index = dropFrames(store, index, [mine]);
    expect(index.frames.map((f) => f.key)).toEqual([file.key]);
    expect(index.active).toBe(file.key);
    // The drawing stays, for a file put back and for emails that follow it.
    expect(store.getItem(mine)).not.toBeNull();

    expect(applyPulls(memory(), null, [file], P)?.active).toBe(file.key);
  });

  it('brings a deleted frame back as one no project has, so its file is written again', () => {
    const store = memory();
    let index = loadFrames(store, makeFrame, 1);
    index = addFrame(store, index, 'Frame 2', makeFrame('Frame 2', 'b'), 'b', 2);
    index = tagFrames(store, index, [`${FRAME_PREFIX}b`], P);
    const { index: after, removed } = removeFrame(store, index, `${FRAME_PREFIX}b`);
    const back = restoreFrame(store, after, removed!);
    expect(back.frames.find((f) => f.key === `${FRAME_PREFIX}b`)?.project).toBeUndefined();
  });

  it('does not bring the frame from before frames back once a project has emptied the list', () => {
    const store = memory();
    store.setItem(FREEFORM_APP_FRAME, JSON.stringify(makeFrame('Freeform', 'old')));
    store.setItem(FRAMES_INDEX, JSON.stringify({ version: 1, active: '', frames: [] }));
    expect(readFrames(store, 3)).toBeNull();
    expect(loadFrames(store, makeFrame, 3).active).not.toBe(FREEFORM_APP_FRAME);
  });
});
