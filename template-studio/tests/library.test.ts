// The studio library: starters and project types a folder carries of its own.
//
// Defended: a file reads back as what was written and a file that is not one throws a sentence rather than
// crashing the list; a project type read from a folder is the same shape `planProject` takes, with anything
// malformed inside it dropped rather than carried; and the folder's items sit over the app's by id without ever
// removing one, which is what keeps the New menu working with nothing open.

import { describe, expect, it } from 'vitest';

import { libraryId, mergeById, newStarterId, parseProjectType, parseStarter, type ProjectTypeFile, type StarterFile } from '../src/model/library.ts';
import { PROJECT_TYPES, planProject, type ProjectType } from '../src/model/project-types.ts';
import { blankTemplate } from '../src/model/starters.ts';
import { serializeProjectType, serializeStarter } from '../src/model/serialize.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';

describe('a starter file', () => {
  const starter = (): StarterFile => ({
    schema: SCHEMA_VERSION,
    id: 'monthly-note',
    name: 'Monthly note',
    summary: 'One fact, the sign-off, and nothing else.',
    version: 2,
    template: blankTemplate(),
  });

  it('reads back as what was written', () => {
    const file = starter();
    expect(parseStarter(JSON.parse(serializeStarter(file)))).toEqual(file);
  });

  it('fills in what an older file did not carry', () => {
    const read = parseStarter({ id: 'a', name: 'A', template: blankTemplate() });
    expect(read.summary).toBe('');
    expect(read.version).toBe(1);
    expect(read.schema).toBe(SCHEMA_VERSION);
  });

  it('refuses what is not one, with a sentence', () => {
    expect(() => parseStarter(null)).toThrow(/Not a starter file/);
    expect(() => parseStarter([1, 2])).toThrow(/Not a starter file/);
    expect(() => parseStarter({ id: 'a', name: 'A' })).toThrow(/needs an id, a name and a template/);
  });

  it('gives every starter an id of its own', () => {
    expect(newStarterId()).not.toBe(newStarterId());
    expect(newStarterId().startsWith('st')).toBe(true);
  });
});

describe('a project type file', () => {
  const type = (): ProjectType => ({
    id: 'newsletter',
    name: 'Newsletter',
    blurb: 'One email a month, and the pictures for it.',
    folders: ['assets', 'docs', 'exports'],
    groups: [{ folder: 'photos', note: 'photography, as it arrived' }],
    frames: [{ name: 'Email hero', width: 600, height: 300 }],
    emails: ['{project}'],
  });

  it('reads back as what was written, and is what planProject takes', () => {
    const file: ProjectTypeFile = { schema: SCHEMA_VERSION, version: 1, type: type() };
    const read = parseProjectType(JSON.parse(serializeProjectType(file)));
    expect(read).toEqual(file);
    const plan = planProject(read.type, 'October', { id: 'p1', newId: () => 'f1', now: 0 });
    expect(plan.folder).toBe('October');
    expect(plan.files.some((f) => f.path.endsWith('.frame.json'))).toBe(true);
    expect(plan.files.some((f) => f.path.endsWith('.template.json'))).toBe(true);
  });

  it('drops what is malformed inside it rather than carrying it', () => {
    const read = parseProjectType({
      type: {
        id: 'x',
        name: 'X',
        folders: ['assets', 7],
        groups: [{ folder: 'photos' }, { note: 'no folder' }, null],
        frames: [{ name: 'Good', width: 100, height: 50 }, { name: 'No size' }, { name: 'Bad', width: 0, height: 10 }],
        emails: 'not a list',
      },
    });
    // A list with a non-string in it is not a list of folders, so the shipped floor stands.
    expect(read.type.folders).toEqual(['assets']);
    expect(read.type.groups).toEqual([{ folder: 'photos', note: '' }]);
    expect(read.type.frames).toEqual([{ name: 'Good', width: 100, height: 50 }]);
    expect(read.type.emails).toEqual([]);
  });

  it('takes a bare type as well as a wrapped one', () => {
    expect(parseProjectType(type()).type.id).toBe('newsletter');
  });

  it('refuses what is not one, with a sentence', () => {
    expect(() => parseProjectType(null)).toThrow(/Not a project type file/);
    expect(() => parseProjectType({ type: { name: 'No id' } })).toThrow(/needs an id and a name/);
  });
});

describe('the folder over the app', () => {
  it('replaces a built-in by id, keeps the order, and appends what is new', () => {
    const app = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }];
    const folder = [{ id: 'b', n: 20 }, { id: 'c', n: 30 }];
    expect(mergeById(app, folder)).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 20 }, { id: 'c', n: 30 }]);
  });

  it('never removes a built-in, so the app still works with nothing open', () => {
    expect(mergeById(PROJECT_TYPES, [])).toEqual(PROJECT_TYPES);
    const merged = mergeById(PROJECT_TYPES, [{ ...PROJECT_TYPES[0]!, name: 'Ours' }]);
    expect(merged.length).toBe(PROJECT_TYPES.length);
    expect(merged[0]!.name).toBe('Ours');
  });
});

describe('an id for a new library item', () => {
  it('is a slug, and never one already taken', () => {
    expect(libraryId('Monthly note', [])).toBe('monthly-note');
    expect(libraryId('Monthly note', ['monthly-note'])).toBe('monthly-note-2');
    expect(libraryId('Monthly note', ['monthly-note', 'monthly-note-2'])).toBe('monthly-note-3');
    expect(libraryId('  ???  ', [])).toBe('untitled');
  });
});
