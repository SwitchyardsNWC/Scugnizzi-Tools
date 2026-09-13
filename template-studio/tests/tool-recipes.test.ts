// Riso and Ink bleed in a project: the recipes they write beside what they save, and Template Studio's frame list
// in a project.
//
// Defended: a recipe reads back as the pictures the board's cards are named by, and anything outside assets/ or
// climbing out of it is refused; the latest recipe for a picture wins; a picture opens in the tool that made it,
// otherwise Riso, or Ink bleed for an SVG; the board links a result to what it was made from; and Template Studio
// lists a project's frames, loose ones only when the project takes those in, and always a frame an email follows.

import { describe, expect, it } from 'vitest';

import { createSection } from '../src/model/catalog.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { FRAME_PREFIX, FRAMES_INDEX } from '../src/model/frame-store.ts';
import { readAppFrames } from '../src/model/freeform-link.ts';
import { projectLinks } from '../src/model/project.ts';
import { blankTemplate } from '../src/model/starters.ts';
import { assetPath, readRecipe, recipesByOutput, toolAddress } from '../src/model/tool-recipes.ts';
import type { Template } from '../src/model/types.ts';

const recipe = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, tool: 'riso', output: 'assets/photo-riso.png', sources: ['assets/photo.png'], settings: { seed: 3 }, savedAt: 5, ...over });

describe('tool recipes', () => {
  it('read what made a picture, by the names the board uses', () => {
    expect(readRecipe(recipe(), 'riso/photo-riso.riso.json')).toEqual({ tool: 'riso', path: 'riso/photo-riso.riso.json', output: 'photo-riso.png', sources: ['photo.png'], savedAt: 5 });
    const stamps = readRecipe(recipe({ tool: 'ink-bleed', sources: ['assets/logo.svg', 'assets/logo.svg', 'frames/x.frame.json', 'assets/photo-riso.png'] }), 'ink-bleed/card.ink-bleed.json');
    expect(stamps?.sources).toEqual(['logo.svg']);
  });

  it('read anything else as nothing', () => {
    expect(readRecipe('nope', 'x')).toBeNull();
    expect(readRecipe(recipe({ version: 2 }), 'x')).toBeNull();
    expect(readRecipe(recipe({ tool: 'poster' }), 'x')).toBeNull();
    expect(readRecipe(recipe({ output: 'photo.png' }), 'x')).toBeNull();
    expect(readRecipe(recipe({ output: 'assets/../project.json' }), 'x')).toBeNull();
    expect(readRecipe(recipe({ sources: 'assets/photo.png' }), 'x')?.sources).toEqual([]);
    expect(assetPath('assets/a//b.png')).toBeNull();
    expect(assetPath('assets/')).toBeNull();
    expect(assetPath('assets/marks/logo.svg')).toBe('marks/logo.svg');
  });

  it('keep the latest recipe for each picture', () => {
    const older = readRecipe(recipe({ savedAt: 1 }), 'riso/a.riso.json')!;
    const newer = readRecipe(recipe({ savedAt: 9 }), 'riso/b.riso.json')!;
    expect(recipesByOutput([newer, older]).get('photo-riso.png')?.path).toBe('riso/b.riso.json');
    expect(recipesByOutput([older, newer]).get('photo-riso.png')?.path).toBe('riso/b.riso.json');
  });

  it('open a picture in the tool that made it, otherwise the one that fits it', () => {
    const made = readRecipe(recipe(), 'riso/photo riso.riso.json')!;
    expect(toolAddress('../../', 'photo-riso.png', made)).toBe('../../riso/riso.html?recipe=riso%2Fphoto%20riso.riso.json');
    expect(toolAddress('../../', 'photo.png', undefined)).toBe('../../riso/riso.html?picture=assets%2Fphoto.png');
    expect(toolAddress('../../', 'marks/logo.svg', undefined)).toBe('../../text%20bleed/ink-bleed.html?stamp=assets%2Fmarks%2Flogo.svg');
    const inked = readRecipe(recipe({ tool: 'ink-bleed', output: 'assets/card.png' }), 'ink-bleed/card.ink-bleed.json')!;
    expect(toolAddress('../../', 'card.png', inked)).toBe('../../text%20bleed/ink-bleed.html?recipe=ink-bleed%2Fcard.ink-bleed.json');
  });

  it('link a result to what it was made from, when both are on the board', () => {
    const pictures = ['photo.png', 'photo-riso.png'].map((path) => ({ id: `picture:${path}`, path }));
    const recipes = [readRecipe(recipe(), 'riso/a.riso.json')!, readRecipe(recipe({ output: 'assets/gone.png' }), 'riso/b.riso.json')!];
    expect(projectLinks([], [], pictures, recipes)).toEqual([{ from: 'picture:photo.png', to: 'picture:photo-riso.png', kind: 'made' }]);
  });
});

describe('Template Studio’s frames in a project', () => {
  it('lists the project’s own, loose ones when it takes those in, and any frame the email already follows', () => {
    const store = new Map<string, string>();
    for (const id of ['a', 'b', 'c']) {
      let n = 0;
      const template: Template = { ...blankTemplate(), sections: [createSection('freeform', { id: () => `${id}-${(n += 1)}`, taken: new Set() }, DEFAULT_DESIGN_SYSTEM)] };
      store.set(FRAME_PREFIX + id, JSON.stringify(template));
    }
    store.set(
      FRAMES_INDEX,
      JSON.stringify({
        version: 1,
        active: `${FRAME_PREFIX}a`,
        frames: [
          { key: `${FRAME_PREFIX}a`, name: 'A', updatedAt: 1, project: 'P' },
          { key: `${FRAME_PREFIX}b`, name: 'B', updatedAt: 1 },
          { key: `${FRAME_PREFIX}c`, name: 'C', updatedAt: 1, project: 'Q' },
        ],
      }),
    );
    const get = (key: string) => store.get(key) ?? null;
    const names = (...args: Parameters<typeof readAppFrames> extends [unknown, ...infer R] ? R : never) => readAppFrames(get, ...args).map((f) => f.name);

    expect(names()).toEqual(['A', 'B', 'C']);
    expect(names({ project: 'P', adopts: false })).toEqual(['A']);
    expect(names({ project: 'P', adopts: true })).toEqual(['A', 'B']);
    expect(names({ project: 'P', adopts: false }, [`${FRAME_PREFIX}c`])).toEqual(['A', 'C']);
  });
});
