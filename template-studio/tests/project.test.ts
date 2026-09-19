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
  addNote,
  addReply,
  boardJson,
  emailCardSize,
  emptyBoard,
  forgetCard,
  layoutBoard,
  moveCard,
  newProjectInfo,
  NOTE_WIDTH,
  projectJson,
  projectLinks,
  readBoard,
  readProjectInfo,
  removeNote,
  removeReply,
  sectionLabels,
  tidyBoard,
  updateNote,
  withPlaces,
  type BoardNote,
  type CardLink,
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

describe('notes on the board', () => {
  const note = (over: Partial<BoardNote> = {}): BoardNote => ({ id: 'note:a1', text: 'Tighten the headline', x: 300, y: 40, w: NOTE_WIDTH, color: 1, on: 'email:a', part: null, at: 1700000000000, resolvedAt: 0, replies: [], ...over });

  it('reads back as written, and skips what it cannot use', () => {
    const board = addNote(moveCard(emptyBoard(), 'email:a', 10, 20), note());
    expect(readBoard(boardJson(board))).toEqual(board);
    const raw = JSON.stringify({
      version: 1,
      cards: {},
      groups: [],
      notes: [note({ part: 'sec-2' }), { ...note({ id: 'note:a1' }) }, note({ id: 'sticky:x' }), { ...note({ id: 'note:b' }), x: 'left' }, { ...note({ id: 'note:c', w: 9999, color: 42, on: 'poster:z' }), at: 'now', part: 7, resolvedAt: -5 }, note({ id: 'note:d', resolvedAt: 1700000005000 })],
    });
    expect(readBoard(raw).notes).toEqual([note({ part: 'sec-2' }), { ...note({ id: 'note:c' }), w: 480, color: 0, on: null, part: null, at: 0, resolvedAt: 0, replies: [] }, note({ id: 'note:d', resolvedAt: 1700000005000 })]);
    // Replies read back checked: a blank one, one without an id, and a repeated id are dropped.
    const threaded = JSON.stringify({ version: 1, cards: {}, groups: [], notes: [note({ replies: [{ id: 'reply:1', text: 'Agreed.', at: 5 }, { id: 'reply:1', text: 'again', at: 6 }, { text: 'no id', at: 7 }, { id: 'reply:2', text: '   ', at: 8 }, { id: 'reply:3', text: 'Done', at: 'now' }] as never })] });
    expect(readBoard(threaded).notes[0]!.replies).toEqual([
      { id: 'reply:1', text: 'Agreed.', at: 5 },
      { id: 'reply:3', text: 'Done', at: 0 },
    ]);
    // Boards written before notes read as boards with none.
    expect(readBoard(JSON.stringify({ version: 1, cards: {}, groups: [] })).notes).toEqual([]);
  });

  it('goes where the card it is left on goes, and stays put when the card is forgotten', () => {
    const board = addNote(moveCard(emptyBoard(), 'email:a', 10, 20), note());
    const moved = moveCard(board, 'email:a', 110, 70);
    expect(moved.notes[0]).toMatchObject({ x: 400, y: 90, on: 'email:a' });
    // A card placed for the first time moves no note.
    expect(moveCard(board, 'frame:f', 500, 500).notes).toEqual(board.notes);
    const gone = forgetCard(updateNote(moved, 'note:a1', { part: 'sec-1' }), 'email:a');
    expect(gone.notes[0]).toMatchObject({ x: 400, y: 90, on: null, part: null });
    expect(updateNote(gone, 'note:a1', { text: 'Done', color: 3 }).notes[0]).toMatchObject({ text: 'Done', color: 3, x: 400 });
    expect(updateNote(gone, 'note:zz', { text: 'x' })).toBe(gone);
    expect(removeNote(gone, 'note:a1').notes).toEqual([]);
  });

  it('takes replies under a note, oldest first, and lets one go', () => {
    const board = addNote(emptyBoard(), note());
    const one = addReply(board, 'note:a1', { id: 'reply:1', text: 'Agreed, doing it.', at: 10 });
    const two = addReply(one, 'note:a1', { id: 'reply:2', text: 'Done.', at: 20 });
    expect(two.notes[0]!.replies.map((r) => r.text)).toEqual(['Agreed, doing it.', 'Done.']);
    expect(addReply(two, 'note:zz', { id: 'reply:3', text: 'x', at: 1 })).toBe(two);
    expect(addReply(two, 'note:a1', { id: 'reply:3', text: '  ', at: 1 })).toBe(two);
    expect(removeReply(two, 'note:a1', 'reply:1').notes[0]!.replies.map((r) => r.id)).toEqual(['reply:2']);
    expect(removeReply(two, 'note:a1', 'reply:9')).toBe(two);
    expect(readBoard(boardJson(two))).toEqual(two);
  });

  it('names an email’s sections for a note to point at', () => {
    const template = {
      sections: [
        { id: 's1', rows: [{ columns: [{ blocks: [{ type: 'topbar', text: 'A TAGLINE.' }] }] }] },
        { id: 's2', rows: [{ columns: [{ blocks: [{ type: 'image', src: '' }, { type: 'heading', text: 'Big news: we’re opening 2 more clubs in Chicago.' }] }] }] },
        { id: 's3', rows: [{ columns: [{ blocks: [{ type: 'richtext', html: '<p>The&nbsp;<b>club</b> opens in&amp;around May.</p>' }] }] }] },
        { id: 's4', domId: 'section-legal', rows: [{ columns: [{ blocks: [{ type: 'legal' }] }] }] },
        { id: 's5', rows: [] },
      ],
    } as unknown as Parameters<typeof sectionLabels>[0];
    expect(sectionLabels(template)).toEqual([
      { id: 's1', label: '1. Top bar: A TAGLINE.' },
      { id: 's2', label: '2. Image: Big news: we’re opening 2 more…' },
      { id: 's3', label: '3. Text: The club opens in around May.' },
      { id: 's4', label: '4. Footer' },
      { id: 's5', label: '5. Empty' },
    ]);
  });

  it('survives a tidy, riding with its card', () => {
    const sources: CardSource[] = [
      { id: 'email:a', kind: 'email', name: 'A' },
      { id: 'email:b', kind: 'email', name: 'B' },
    ];
    let board = layoutBoard(sources, emptyBoard()).cards.reduce((b, c) => moveCard(b, c.id, c.x + 1000, c.y + 1000), emptyBoard());
    board = addNote(board, note({ on: 'email:a', x: board.cards['email:a']!.x + 300, y: board.cards['email:a']!.y }));
    board = addNote(board, note({ id: 'note:free', on: null, x: 5, y: 5 }));
    const tidy = tidyBoard(sources, board);
    const a = tidy.cards['email:a']!;
    expect(tidy.notes.find((n) => n.id === 'note:a1')).toMatchObject({ x: a.x + 300, y: a.y, on: 'email:a' });
    expect(tidy.notes.find((n) => n.id === 'note:free')).toMatchObject({ x: 5, y: 5 });
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

  it('takes a card at its own size when it has one, an email at its full length', () => {
    const tall: CardSource = { ...email('A'), size: emailCardSize(2000, 640, 28) };
    expect(tall.size).toEqual({ w: 260, h: 28 + Math.ceil((2000 * 260) / 640) });
    const layout = layoutBoard([tall, email('B')], emptyBoard());
    expect(layout.cards.find((c) => c.id === tall.id)).toMatchObject({ w: 260, h: tall.size!.h });
    expect(layout.cards.find((c) => c.id === 'email:B.template.json')).toMatchObject({ w: 260, h: 380 });
    const kept = layoutBoard([tall], moveCard(emptyBoard(), tall.id, 40, 40));
    expect(kept.cards[0]).toMatchObject({ x: 40, y: 40, h: tall.size!.h });
    expect(emailCardSize(10, 640, 28).h).toBe(68);
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

  it('puts a card beside the placed card it is linked to, and its own picture beside it in turn', () => {
    const email: CardSource = { id: 'email:a.template.json', kind: 'email', name: 'a' };
    const hero: CardSource = { id: 'frame:h', kind: 'frame', name: 'Hero' };
    const other: CardSource = { id: 'frame:o', kind: 'frame', name: 'Other' };
    const photo: CardSource = { id: 'picture:p.png', kind: 'picture', name: 'p.png' };
    const loose: CardSource = { id: 'picture:z.png', kind: 'picture', name: 'z.png' };
    const links: CardLink[] = [
      { from: 'frame:h', to: 'email:a.template.json', kind: 'follows' },
      { from: 'picture:p.png', to: 'frame:h', kind: 'uses' },
    ];
    const laid = layoutBoard([email, hero, other, photo, loose], emptyBoard(), [], links);
    const at = (id: string) => laid.cards.find((c) => c.id === id)!;
    const e = at(email.id);
    const h = at(hero.id);
    // The followed frame sits to the email's right, on the same row; the unlinked frame starts the frames' lane below.
    expect(h.x).toBe(e.x + e.w + 40);
    expect(h.y).toBe(e.y);
    expect(at(other.id).y).toBeGreaterThan(e.y + e.h);
    // The picture the frame shows sits beside the frame, not in the pictures' lane.
    const p = at(photo.id);
    expect(p.x).toBe(h.x + h.w + 40);
    expect(p.y).toBe(h.y);
    expect(at(loose.id).y).toBeGreaterThan(p.y + p.h);
    // Nothing lands on anything else.
    for (const a of laid.cards) for (const b of laid.cards) if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
  });

  it('tidies a board afresh with the links in mind, keeping the groups’ names', () => {
    const email: CardSource = { id: 'email:a.template.json', kind: 'email', name: 'a' };
    const hero: CardSource = { id: 'frame:h', kind: 'frame', name: 'Hero' };
    const filed: CardSource = { id: 'picture:photos/p.png', kind: 'picture', name: 'p.png' };
    const links: CardLink[] = [{ from: 'frame:h', to: 'email:a.template.json', kind: 'follows' }];
    // Arranged by hand, far apart, with the group renamed.
    let board = moveCard(moveCard(emptyBoard(), email.id, 0, 0), hero.id, 2000, 900);
    const first = layoutBoard([email, hero, filed], board, ['photos'], links);
    board = withPlaces(board, first.cards, first.groups.map((g) => ({ ...g, name: 'Shoot day' })));
    const tidy = tidyBoard([email, hero, filed], board, ['photos'], links);
    const laid = layoutBoard([email, hero, filed], tidy, ['photos'], links);
    const e = laid.cards.find((c) => c.id === email.id)!;
    const h = laid.cards.find((c) => c.id === hero.id)!;
    expect(h.x).toBe(e.x + e.w + 40);
    expect(laid.placed).toEqual([]);
    expect(laid.groups.map((g) => [g.folder, g.name])).toEqual([['photos', 'Shoot day']]);
    expect(laid.groups[0]!.members).toEqual([filed.id]);
  });

  it('tidies into families: the email, the frames it follows beside it, their pictures beyond, and the rest below', () => {
    const email: CardSource = { id: 'email:a', kind: 'email', name: 'A' };
    const other: CardSource = { id: 'email:b', kind: 'email', name: 'B' };
    const frame: CardSource = { id: 'frame:f', kind: 'frame', name: 'F' };
    const hero: CardSource = { id: 'picture:hero.png', kind: 'picture', name: 'hero.png' };
    const inFrame: CardSource = { id: 'picture:in-frame.png', kind: 'picture', name: 'in-frame.png' };
    const source: CardSource = { id: 'picture:hero-source.png', kind: 'picture', name: 'hero-source.png' };
    const lone: CardSource = { id: 'frame:lone', kind: 'frame', name: 'Lone' };
    const brief: CardSource = { id: 'doc:docs/brief.gdoc', kind: 'doc', name: 'Brief' };
    const filed: CardSource = { id: 'picture:photos/p.png', kind: 'picture', name: 'p.png' };
    const sources = [filed, brief, lone, source, inFrame, hero, frame, other, email];
    const links: CardLink[] = [
      { from: frame.id, to: email.id, kind: 'follows' },
      { from: hero.id, to: email.id, kind: 'uses' },
      { from: inFrame.id, to: frame.id, kind: 'uses' },
      { from: source.id, to: hero.id, kind: 'made' },
      { from: filed.id, to: email.id, kind: 'uses' },
    ];
    const tidy = tidyBoard(sources, emptyBoard(), ['photos'], links);
    const laid = layoutBoard(sources, tidy, ['photos'], links);
    const at = (s: CardSource) => laid.cards.find((c) => c.id === s.id)!;
    const e = at(email);
    expect([e.x, e.y]).toEqual([0, 0]);
    // The frame in the column beside the email; the pictures in the column beyond, the email's first, then the frame's, then what they were made from.
    expect([at(frame).x, at(frame).y]).toEqual([e.w + 40, 0]);
    expect(at(hero).x).toBe(at(frame).x + at(frame).w + 40);
    expect(at(hero).y).toBe(0);
    expect(at(inFrame).y).toBe(at(hero).h + 40);
    expect(at(source).y).toBe(at(inFrame).y + at(inFrame).h + 40);
    // The next email starts the next family along the row.
    expect(at(other).x).toBeGreaterThan(at(hero).x + at(hero).w);
    expect(at(other).y).toBe(0);
    // A picture filed in a folder stays in its group, below, with the document and the frame no email follows.
    const bottom = Math.max(e.h, at(source).y + at(source).h);
    for (const s of [lone, brief, filed]) expect(at(s).y).toBeGreaterThanOrEqual(bottom + 120);
    expect(laid.groups.map((g) => [g.folder, g.members])).toEqual([['photos', [filed.id]]]);
    expect(laid.placed).toEqual([]);
  });

  it('tidies onto the grid: every edge on a multiple of the step, gaps no smaller than usual', () => {
    const sources: CardSource[] = [
      { id: 'email:a', kind: 'email', name: 'A', size: { w: 260, h: 613 } },
      { id: 'frame:f', kind: 'frame', name: 'F' },
      { id: 'picture:hero.png', kind: 'picture', name: 'hero.png' },
      { id: 'picture:two.png', kind: 'picture', name: 'two.png' },
      { id: 'doc:docs/brief.gdoc', kind: 'doc', name: 'Brief' },
      { id: 'picture:photos/p.png', kind: 'picture', name: 'p.png' },
    ];
    const links: CardLink[] = [
      { from: 'frame:f', to: 'email:a', kind: 'follows' },
      { from: 'picture:hero.png', to: 'email:a', kind: 'uses' },
      { from: 'picture:two.png', to: 'frame:f', kind: 'uses' },
    ];
    const tidy = tidyBoard(sources, emptyBoard(), ['photos'], links, 24);
    const laid = layoutBoard(sources, tidy, ['photos'], links);
    for (const c of laid.cards) {
      expect(c.x % 24).toBe(0);
      expect(c.y % 24).toBe(0);
    }
    for (const g of laid.groups) {
      expect(g.x % 24).toBe(0);
      expect(g.y % 24).toBe(0);
    }
    const at = (id: string) => laid.cards.find((c) => c.id === id)!;
    expect(at('frame:f').x - (at('email:a').x + at('email:a').w)).toBeGreaterThanOrEqual(40);
    expect(at('picture:hero.png').x - (at('frame:f').x + at('frame:f').w)).toBeGreaterThanOrEqual(40);
    expect(at('picture:two.png').y - (at('picture:hero.png').y + at('picture:hero.png').h)).toBeGreaterThanOrEqual(40);
    expect(at('doc:docs/brief.gdoc').y).toBeGreaterThanOrEqual(at('email:a').h + 120);
    expect(laid.groups[0]!.members).toEqual(['picture:photos/p.png']);
    expect(laid.placed).toEqual([]);
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
