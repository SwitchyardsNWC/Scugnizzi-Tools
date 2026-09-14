// Groups on the project board, and moving pictures into and out of them.
//
// Defended: board.json keeps groups and refuses any whose folder could reach outside assets/; a group's pictures
// find places inside it and everything else stays clear of it; a folder with no group gets one, which the board keeps
// once written down; moving a group carries its cards; and moving a picture renames it in the emails, frames and
// recipes that name it, without touching anything else.

import { describe, expect, it } from 'vitest';

import { renameInRecipe, renameSrc, freeAssetPath, movedPath } from '../src/model/asset-moves.ts';
import { createSection } from '../src/model/catalog.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import {
  addGroup,
  boardJson,
  emptyBoard,
  folderOfPicture,
  groupAt,
  groupFolderName,
  layoutBoard,
  moveGroupWith,
  readBoard,
  removeGroup,
  updateGroup,
  withPlaces,
  type CardSource,
} from '../src/model/project.ts';
import { blankTemplate } from '../src/model/starters.ts';
import type { FreeformBlock, ImageBlock, Template } from '../src/model/types.ts';

const picture = (path: string): CardSource => ({ id: `picture:${path}`, kind: 'picture', name: path.split('/').pop()! });
const email = (name: string): CardSource => ({ id: `email:${name}.template.json`, kind: 'email', name });
const at = (cards: Array<{ id: string; x: number; y: number }>) => Object.fromEntries(cards.map((c) => [c.id, [c.x, c.y]]));
const SOCIAL = { id: 'g1', name: 'Social media', folder: 'social', x: 0, y: 600, w: 560, h: 400 };

describe('groups in board.json', () => {
  it('read back as written, and refuse a folder that is not one name inside assets/', () => {
    const board = addGroup(emptyBoard(), SOCIAL);
    expect(readBoard(boardJson(board))).toEqual(board);
    const raw = JSON.stringify({
      version: 1,
      cards: {},
      groups: [
        { id: 'a', name: 'A', folder: 'social', x: 0, y: 0, w: 400, h: 300 },
        { id: 'a', name: 'Again', folder: 'other', x: 0, y: 0, w: 400, h: 300 },
        { id: 'b', name: 'B', folder: '../outside', x: 0, y: 0, w: 400, h: 300 },
        { id: 'c', name: 'C', folder: 'rendered', x: 0, y: 0, w: 400, h: 300 },
        { id: 'd', name: 'D', folder: 'social', x: 0, y: 0, w: 400, h: 300 },
        { id: 'e', name: 'E', folder: 'marks', x: 'left', y: 0, w: 400, h: 300 },
        { id: 'f', name: '', folder: 'a/b', x: 0, y: 0, w: 400, h: 300 },
      ],
    });
    expect(readBoard(raw).groups).toEqual([{ id: 'a', name: 'A', folder: 'social', x: 0, y: 0, w: 400, h: 300 }]);
    expect(readBoard('{"version":1,"cards":{}}').groups).toEqual([]);
  });

  it('name folders so no two groups share one', () => {
    expect(groupFolderName('Social media', [])).toBe('social-media');
    expect(groupFolderName('Social media', ['Social-Media'])).toBe('social-media-2');
    expect(groupFolderName('Rendered', [])).toBe('rendered-group');
    expect(groupFolderName('!!!', [])).toBe('group');
    expect(folderOfPicture('social/photo.png')).toBe('social');
    expect(folderOfPicture('photo.png')).toBeNull();
  });

  it('keep a group big enough for a picture, and a name when the new one is blank', () => {
    const board = updateGroup(addGroup(emptyBoard(), SOCIAL), 'g1', { w: 10, h: 10, name: '   ' });
    expect(board.groups[0]).toMatchObject({ name: 'Social media', w: 276, h: 286 });
    expect(removeGroup(board, 'g1').groups).toEqual([]);
  });
});

describe('laying out a board with groups', () => {
  it('puts a group’s pictures inside it and keeps every other card clear of it', () => {
    const board = addGroup(emptyBoard(), SOCIAL);
    const layout = layoutBoard([email('E'), picture('c.png'), picture('social/b.png'), picture('social/a.png')], board);
    expect(at(layout.cards)).toEqual({
      'email:E.template.json': [0, 1120],
      'picture:c.png': [0, 1620],
      'picture:social/a.png': [28, 648],
      'picture:social/b.png': [288, 648],
    });
    expect(layout.groups).toEqual([{ ...SOCIAL, members: ['picture:social/a.png', 'picture:social/b.png'] }]);
    expect(layout.groupsPlaced).toEqual([]);
    expect(groupAt(layout.groups, 100, 700)?.id).toBe('g1');
    expect(groupAt(layout.groups, 100, 1100)).toBeNull();
  });

  it('makes a group for a folder that has none, and lays out the same once it is written down', () => {
    const sources = [picture('marks/logo.svg'), picture('photo.png')];
    const first = layoutBoard(sources, emptyBoard());
    expect(first.groups).toEqual([{ id: 'group:marks', name: 'marks', folder: 'marks', x: 0, y: 330, w: 276, h: 286, members: ['picture:marks/logo.svg'] }]);
    expect(first.groupsPlaced).toEqual(['group:marks']);
    expect(at(first.cards)).toEqual({ 'picture:photo.png': [0, 0], 'picture:marks/logo.svg': [28, 378] });

    const saved = withPlaces(emptyBoard(), first.cards, first.groups);
    expect(readBoard(boardJson(saved))).toEqual(saved);
    const again = layoutBoard(sources, saved);
    expect(again.placed).toEqual([]);
    expect(again.groupsPlaced).toEqual([]);
    expect(again.groups).toEqual(first.groups);
    expect(at(again.cards)).toEqual(at(first.cards));
  });

  it('draws a group big enough for a member put past its edge', () => {
    let board = addGroup(emptyBoard(), SOCIAL);
    board = { ...board, cards: { 'picture:social/a.png': { x: 700, y: 648 } } };
    const [group] = layoutBoard([picture('social/a.png')], board).groups;
    expect(group).toMatchObject({ x: 0, y: 600, w: 948, h: 400 });
  });

  it('moves a group with the cards riding along, and stores a group it only drew', () => {
    const layout = layoutBoard([picture('marks/logo.svg')], emptyBoard());
    const board = withPlaces(emptyBoard(), layout.cards);
    const moved = moveGroupWith(board, layout.groups[0]!, 10, 20, ['picture:marks/logo.svg']);
    expect(moved.groups).toEqual([{ id: 'group:marks', name: 'marks', folder: 'marks', x: 10, y: 20, w: 276, h: 286 }]);
    expect(moved.cards['picture:marks/logo.svg']).toEqual({ x: 38, y: 68 });
  });
});

describe('moving a picture', () => {
  it('renames it wherever an email or frame shows it, and nowhere else', () => {
    const ids = (p: string) => {
      let n = 0;
      return { id: () => `${p}${(n += 1)}`, taken: new Set<string>() };
    };
    const image = createSection('image', ids('i'), DEFAULT_DESIGN_SYSTEM);
    (image.rows[0]!.columns[0]!.blocks[0] as ImageBlock).src = 'photo.png';
    const drawing = createSection('freeform', ids('f'), DEFAULT_DESIGN_SYSTEM);
    (drawing.rows[0]!.columns[0]!.blocks[0] as FreeformBlock).layers = [
      { id: 'l1', kind: 'image', src: 'photo.png', x: 0, y: 0, width: 10, height: 10, opacity: 1 },
      { id: 'l2', kind: 'image', src: 'other.png', x: 0, y: 0, width: 10, height: 10, opacity: 1 },
    ];
    const template: Template = { ...blankTemplate(), sections: [image, drawing] };
    const before = JSON.stringify(template);

    const { value, changed } = renameSrc(template, 'photo.png', 'social/photo.png');
    expect(changed).toBe(true);
    expect((value.sections[0]!.rows[0]!.columns[0]!.blocks[0] as ImageBlock).src).toBe('social/photo.png');
    expect((value.sections[1]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock).layers.map((l) => (l.kind === 'image' ? l.src : ''))).toEqual(['social/photo.png', 'other.png']);
    expect(JSON.stringify(template)).toBe(before);
    expect(value.sections[0]!.id).toBe(template.sections[0]!.id);

    const untouched = renameSrc(template, 'nope.png', 'x.png');
    expect(untouched.changed).toBe(false);
    expect(untouched.value).toBe(template);
  });

  it('renames it in the recipes of what made it and what it made', () => {
    const recipe = { version: 1, tool: 'riso', output: 'assets/photo-riso.png', sources: ['assets/photo.png'], settings: { seed: 2 } };
    expect(renameInRecipe(recipe, 'photo.png', 'social/photo.png')).toEqual({ value: { ...recipe, sources: ['assets/social/photo.png'] }, changed: true });
    expect(renameInRecipe(recipe, 'photo-riso.png', 'social/photo-riso.png').value).toMatchObject({ output: 'assets/social/photo-riso.png' });
    expect(renameInRecipe(recipe, 'else.png', 'x.png')).toEqual({ value: recipe, changed: false });
  });

  it('goes to its own name in the group’s folder, beside any picture of that name', () => {
    expect(movedPath('photo.png', 'social')).toBe('social/photo.png');
    expect(movedPath('social/photo.png', null)).toBe('photo.png');
    expect(freeAssetPath('social/photo.png', ['Social/Photo.png'])).toBe('social/photo-2.png');
    expect(freeAssetPath('photo.png', ['photo.png', 'photo-2.png'])).toBe('photo-3.png');
    expect(freeAssetPath('photo.png', ['social/photo.png'])).toBe('photo.png');
  });
});
