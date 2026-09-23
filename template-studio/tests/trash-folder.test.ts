// The trash against a folder, rather than against its rules.
//
// tests/trash.test.ts defends model/trash.ts, which is pure. This defends workspace/trash.ts, which is where the
// bytes actually move, and it exists because the first bug in the trash lived exactly in the seam between the
// two: `restorePath` had always numbered correctly past every name it was given, and the caller was only ever
// giving it one. A rule that is right and a caller that asks it the wrong question is invisible to a test of
// either half on its own.
//
// The folder is faked in memory: the module only ever calls getDirectoryHandle, getFileHandle, createWritable,
// getFile, removeEntry and entries, so a Map behind those six is a truthful stand-in and needs no browser.
//
// Defended: a delete moves the file rather than copying it; a restore puts it back where it came from; a restore
// numbers past every name already in the folder, so two things deleted under one name both survive coming back;
// the caps are kept against what is really on disk; emptying takes both of each thing's two files; and the undo
// the workspace hands back with a delete both returns the file and clears its record, so the folder and the trash
// never hold the same thing at once.

import { describe, expect, it } from 'vitest';

import { emptyTrash, keepInTrash, readTrash, restoreFromTrash, sweepTrash, TRASH_DIR } from '../src/workspace/trash.ts';
import { folderWorkspace } from '../src/workspace/workspace.ts';
import { deleteFrameFile } from '../src/project/frame-sync.ts';

// --- a folder, in memory ------------------------------------------------------------------------------------

type Entry = FakeDir | FakeFile;

class FakeFile {
  readonly kind = 'file';
  data: Blob;
  constructor(readonly name: string, data: Blob = new Blob([])) {
    this.data = data;
  }
  async getFile(): Promise<Blob> {
    return this.data;
  }
  async createWritable() {
    const chunks: BlobPart[] = [];
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const owner = this;
    return {
      async write(chunk: BlobPart) {
        chunks.push(chunk);
      },
      async close() {
        owner.data = new Blob(chunks);
      },
    };
  }
}

class FakeDir {
  readonly kind = 'directory';
  readonly children = new Map<string, Entry>();
  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDir> {
    const got = this.children.get(name);
    if (got?.kind === 'directory') return got;
    if (got) throw new DOMException(`${name} is a file`, 'TypeMismatchError');
    if (!options?.create) throw new DOMException(`${name} not found`, 'NotFoundError');
    const made = new FakeDir(name);
    this.children.set(name, made);
    return made;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFile> {
    const got = this.children.get(name);
    if (got?.kind === 'file') return got;
    if (got) throw new DOMException(`${name} is a directory`, 'TypeMismatchError');
    if (!options?.create) throw new DOMException(`${name} not found`, 'NotFoundError');
    const made = new FakeFile(name);
    this.children.set(name, made);
    return made;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.children.delete(name)) throw new DOMException(`${name} not found`, 'NotFoundError');
  }

  async *entries(): AsyncGenerator<[string, Entry]> {
    for (const pair of [...this.children]) yield pair;
  }
}

type Dir = FileSystemDirectoryHandle;
const project = () => new FakeDir('project') as unknown as Dir;

const at = async (dir: Dir, path: string): Promise<{ folder: FakeDir; name: string }> => {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop() ?? '';
  let folder = dir as unknown as FakeDir;
  for (const part of parts) folder = await folder.getDirectoryHandle(part, { create: true });
  return { folder, name };
};

const put = async (dir: Dir, path: string, text: string): Promise<void> => {
  const { folder, name } = await at(dir, path);
  const handle = await folder.getFileHandle(name, { create: true });
  const out = await handle.createWritable();
  await out.write(text);
  await out.close();
};

const read = async (dir: Dir, path: string): Promise<string | null> => {
  const { folder, name } = await at(dir, path);
  const got = folder.children.get(name);
  return got?.kind === 'file' ? await got.data.text() : null;
};

const listing = async (dir: Dir, path: string): Promise<string[]> => {
  let folder = dir as unknown as FakeDir;
  for (const part of path.split('/').filter(Boolean)) {
    const next = folder.children.get(part);
    if (next?.kind !== 'directory') return [];
    folder = next;
  }
  return [...folder.children.keys()].sort();
};

const TEMPLATES = '.scug/templates';
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// --- what it does -------------------------------------------------------------------------------------------

describe('a delete, against a folder', () => {
  it('moves the file rather than leaving a copy behind', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/a.template.json`, 'the email');

    const record = await keepInTrash(dir, `${TEMPLATES}/a.template.json`, { name: 'Spring launch', now: NOW });

    expect(record?.name).toBe('Spring launch');
    expect(record?.kind).toBe('email');
    expect(record?.path).toBe(`${TEMPLATES}/a.template.json`);
    expect(await read(dir, `${TEMPLATES}/a.template.json`)).toBe(null);
    expect(await listing(dir, TEMPLATES)).toEqual([]);
    expect(await listing(dir, TRASH_DIR)).toEqual([`${record!.id}.data`, `${record!.id}.trash.json`]);
  });

  it('is not an error when there was nothing there', async () => {
    const dir = project();
    expect(await keepInTrash(dir, `${TEMPLATES}/gone.template.json`)).toBe(null);
    expect(await readTrash(dir)).toEqual([]);
  });
});

describe('putting something back, against a folder', () => {
  it('goes to the path it came from', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/a.template.json`, 'the email');
    const record = (await keepInTrash(dir, `${TEMPLATES}/a.template.json`, { now: NOW }))!;

    expect(await restoreFromTrash(dir, record)).toBe(`${TEMPLATES}/a.template.json`);
    expect(await read(dir, `${TEMPLATES}/a.template.json`)).toBe('the email');
    expect(await listing(dir, TRASH_DIR)).toEqual([]);
  });

  /**
   * The bug this file was written for.
   *
   * Two things deleted under one name, and something else holding that name when they come back. The first
   * restore takes the numbered name; the second must number past it rather than writing over it. Asking the
   * folder what is taken is the whole fix: the rule was always right, the caller was telling it that only the
   * original name was spoken for.
   */
  it('numbers past every name in the folder, so two deletes under one name both come back', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/a.template.json`, 'the first one');
    const first = (await keepInTrash(dir, `${TEMPLATES}/a.template.json`, { now: NOW - 2000 }))!;
    await put(dir, `${TEMPLATES}/a.template.json`, 'the second one');
    const second = (await keepInTrash(dir, `${TEMPLATES}/a.template.json`, { now: NOW - 1000 }))!;
    // Something new has taken the name in the meantime.
    await put(dir, `${TEMPLATES}/a.template.json`, 'whatever took the name');

    expect(await restoreFromTrash(dir, second)).toBe(`${TEMPLATES}/a 2.template.json`);
    expect(await restoreFromTrash(dir, first)).toBe(`${TEMPLATES}/a 3.template.json`);

    expect(await read(dir, `${TEMPLATES}/a.template.json`)).toBe('whatever took the name');
    expect(await read(dir, `${TEMPLATES}/a 2.template.json`)).toBe('the second one');
    expect(await read(dir, `${TEMPLATES}/a 3.template.json`)).toBe('the first one');
    expect(await listing(dir, TRASH_DIR)).toEqual([]);
  });

  it('numbers past a name a folder already held before anything was deleted', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/a.template.json`, 'the email');
    await put(dir, `${TEMPLATES}/a 2.template.json`, 'an unrelated file');
    const record = (await keepInTrash(dir, `${TEMPLATES}/a.template.json`, { now: NOW }))!;
    await put(dir, `${TEMPLATES}/a.template.json`, 'whatever took the name');

    expect(await restoreFromTrash(dir, record)).toBe(`${TEMPLATES}/a 3.template.json`);
    expect(await read(dir, `${TEMPLATES}/a 2.template.json`)).toBe('an unrelated file');
  });

  it('says so, and forgets the record, when the bytes are gone', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/a.template.json`, 'the email');
    const record = (await keepInTrash(dir, `${TEMPLATES}/a.template.json`, { now: NOW }))!;
    // Somebody emptied the folder by hand between the list and the click.
    const trash = await (dir as unknown as FakeDir).getDirectoryHandle('.scug');
    await (await trash.getDirectoryHandle('trash')).removeEntry(`${record.id}.data`);

    expect(await restoreFromTrash(dir, record)).toBe(null);
    expect(await listing(dir, TRASH_DIR)).toEqual([]);
  });
});

describe('the caps, against a folder', () => {
  it('sweeps as something lands, not only when the project is next opened', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/old.template.json`, 'long gone');
    await put(dir, `${TEMPLATES}/new.template.json`, 'recent');
    const gone = (await keepInTrash(dir, `${TEMPLATES}/old.template.json`, { now: NOW - 40 * DAY }))!;
    const kept = (await keepInTrash(dir, `${TEMPLATES}/new.template.json`, { now: NOW - 2 * DAY }))!;

    // The second delete swept the first: 38 days lay between them, so nothing is left for a later sweep to find.
    expect((await readTrash(dir)).map((r) => r.id)).toEqual([kept.id]);
    expect(await listing(dir, TRASH_DIR)).toEqual([`${kept.id}.data`, `${kept.id}.trash.json`]);
    expect(await sweepTrash(dir, NOW)).toBe(0);
    expect(await restoreFromTrash(dir, gone)).toBe(null);
  });

  it('sweeps a project that has been shut since before the cap', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/a.template.json`, 'the email');
    // Deleted while the project was last open, then nobody touched the folder for a month.
    const record = (await keepInTrash(dir, `${TEMPLATES}/a.template.json`, { now: NOW }))!;
    expect((await readTrash(dir)).length).toBe(1);

    expect(await sweepTrash(dir, NOW + 31 * DAY)).toBe(1);
    expect(await readTrash(dir)).toEqual([]);
    expect(await listing(dir, TRASH_DIR)).toEqual([]);
    expect(record.id).toBeTruthy();
  });

  it('drops the oldest as the newest arrives, once the bytes are over', async () => {
    const dir = project();
    const caps = { days: 30, bytes: 40, count: 100 };
    for (const [i, text] of ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'].entries()) {
      await put(dir, `${TEMPLATES}/f${i}.template.json`, text);
      await keepInTrash(dir, `${TEMPLATES}/f${i}.template.json`, { now: NOW + i * 1000, caps });
    }
    const left = await readTrash(dir);
    expect(left.length).toBe(1);
    expect(await restoreFromTrash(dir, left[0]!)).toBe(`${TEMPLATES}/f1.template.json`);
    expect(await read(dir, `${TEMPLATES}/f1.template.json`)).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('leaves nothing of either file behind when it is emptied', async () => {
    const dir = project();
    for (const n of ['a', 'b', 'c']) {
      await put(dir, `${TEMPLATES}/${n}.template.json`, n);
      await keepInTrash(dir, `${TEMPLATES}/${n}.template.json`, { now: NOW });
    }
    expect(await emptyTrash(dir)).toBe(3);
    expect(await listing(dir, TRASH_DIR)).toEqual([]);
    expect(await readTrash(dir)).toEqual([]);
  });
});

// --- the undo a delete hands back -----------------------------------------------------------------------------

/**
 * Freeform's own delete.
 *
 * The board and Freeform delete the same file. For a week the board's went through the trash and Freeform's was a
 * bare removal, so which door you used decided whether the frame could come back — from a folder a whole team
 * shares. Nobody chose that; it was just the half that was wired.
 */
describe('deleting a frame from Freeform', () => {
  const FRAMES = '.scug/frames';
  const folderFrame = (key: string, path: string) => ({ key, path, fileName: path.split('/').pop()!, name: 'A frame' }) as never;

  it('puts the file in the trash under the frame’s own name, rather than removing it', async () => {
    const dir = project();
    await put(dir, `${FRAMES}/hero.frame.json`, '{"key":"k1"}');
    const record = await deleteFrameFile(dir, 'k1', [folderFrame('k1', `${FRAMES}/hero.frame.json`)], 'Hero');

    expect(record?.name).toBe('Hero');
    expect(record?.kind).toBe('frame');
    expect(await read(dir, `${FRAMES}/hero.frame.json`)).toBe(null);
    expect((await readTrash(dir)).length).toBe(1);
    // And it comes back where it was, which is the whole point of the change.
    expect(await restoreFromTrash(dir, record!)).toBe(`${FRAMES}/hero.frame.json`);
    expect(await read(dir, `${FRAMES}/hero.frame.json`)).toBe('{"key":"k1"}');
  });

  it('does nothing for a frame the folder does not hold, which is every frame with no project open', async () => {
    const dir = project();
    expect(await deleteFrameFile(dir, 'k1', [])).toBe(null);
    expect(await readTrash(dir)).toEqual([]);
  });
});

describe('deleting a template through the workspace', () => {
  const email = (name: string) => JSON.stringify({ schema: 6, id: 'e1', name, blocks: [] });

  it('puts the file back and takes the record out of the trash, so neither holds a second copy', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/a.template.json`, email('Spring launch'));
    const ws = folderWorkspace(dir, true);

    const undo = await ws.deleteTemplate!('a.template.json');
    expect(await read(dir, `${TEMPLATES}/a.template.json`)).toBe(null);
    expect((await readTrash(dir)).map((r) => r.name)).toEqual(['Spring launch']);

    expect(await undo!.restore()).toBe('a.template.json');
    expect(await read(dir, `${TEMPLATES}/a.template.json`)).toBe(email('Spring launch'));
    // The bug this defends: the old undo saved the template again and left the record standing, so the can went
    // on offering a file that was already back, and Put back then made a second copy of it.
    expect(await readTrash(dir)).toEqual([]);
    expect(await listing(dir, TRASH_DIR)).toEqual([]);
  });

  it('offers an undo for a template it cannot read, because the trash keeps bytes rather than templates', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/broken.template.json`, 'this is not a template at all');
    const ws = folderWorkspace(dir, true);

    const undo = await ws.deleteTemplate!('broken.template.json');
    expect(undo).not.toBe(null);
    expect(await undo!.restore()).toBe('broken.template.json');
    expect(await read(dir, `${TEMPLATES}/broken.template.json`)).toBe('this is not a template at all');
  });

  it('says where it landed when something has taken the name back', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/a.template.json`, email('The first'));
    const ws = folderWorkspace(dir, true);

    const undo = await ws.deleteTemplate!('a.template.json');
    await put(dir, `${TEMPLATES}/a.template.json`, email('Something else'));

    expect(await undo!.restore()).toBe('a 2.template.json');
    expect(await read(dir, `${TEMPLATES}/a.template.json`)).toBe(email('Something else'));
    expect(await read(dir, `${TEMPLATES}/a 2.template.json`)).toBe(email('The first'));
  });

  it('refuses a second undo with a sentence rather than writing an empty file', async () => {
    const dir = project();
    await put(dir, `${TEMPLATES}/a.template.json`, email('Spring launch'));
    const ws = folderWorkspace(dir, true);

    const undo = await ws.deleteTemplate!('a.template.json');
    await undo!.restore();
    await expect(undo!.restore()).rejects.toThrow(/no longer in the trash/);
  });

  it('throws when the file was already gone, and offers nothing to undo', async () => {
    const dir = project();
    const ws = folderWorkspace(dir, true);
    await expect(ws.deleteTemplate!('missing.template.json')).rejects.toThrow(/not in project any more/);
  });
});
