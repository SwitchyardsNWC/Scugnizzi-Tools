// The folder workspace on a folder made of plain objects: where a template is written, which copy the
// conflict guard reads, and what a delete removes.
//
// Jared, 2026-09-19, from the Files panel: the × said "Deleted" and the file stayed. A template at the top of a
// project had been copied into .scug/templates on its first save; the delete took the copy and the original
// came back into view.

import { describe, expect, it } from 'vitest';

import { folderWorkspace } from '../src/workspace/workspace.ts';

type Entry = FakeDir | FakeFile;

class FakeFile {
  readonly kind = 'file' as const;
  constructor(
    public name: string,
    public text = '',
    public lastModified = 1000,
  ) {}
  getFile() {
    const { text, lastModified, name } = this;
    return Promise.resolve({ name, size: text.length, lastModified, text: () => Promise.resolve(text) });
  }
  createWritable() {
    return Promise.resolve({
      write: (data: string) => {
        this.text = data;
        this.lastModified += 1;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    });
  }
}

class FakeDir {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, Entry>();
  constructor(public name: string) {}
  getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const found = this.children.get(name);
    if (found?.kind === 'directory') return Promise.resolve(found);
    if (!options?.create) return Promise.reject(new DOMException(`${name} not found`, 'NotFoundError'));
    const made = new FakeDir(name);
    this.children.set(name, made);
    return Promise.resolve(made);
  }
  getFileHandle(name: string, options?: { create?: boolean }) {
    const found = this.children.get(name);
    if (found?.kind === 'file') return Promise.resolve(found);
    if (!options?.create) return Promise.reject(new DOMException(`${name} not found`, 'NotFoundError'));
    const made = new FakeFile(name, '', 0);
    this.children.set(name, made);
    return Promise.resolve(made);
  }
  removeEntry(name: string) {
    if (!this.children.delete(name)) return Promise.reject(new DOMException(`${name} not found`, 'NotFoundError'));
    return Promise.resolve();
  }
  async *entries(): AsyncGenerator<[string, Entry]> {
    for (const [name, entry] of this.children) yield [name, entry];
  }
  /** `a/b/c` as the tree has it, or null. */
  at(path: string): Entry | null {
    let here: Entry = this;
    for (const part of path.split('/')) {
      if (here.kind !== 'directory') return null;
      const next = here.children.get(part);
      if (!next) return null;
      here = next;
    }
    return here;
  }
  put(path: string, text: string, lastModified = 1000): FakeFile {
    const parts = path.split('/');
    const fileName = parts.pop()!;
    let here: FakeDir = this;
    for (const part of parts) {
      const next = here.children.get(part);
      here = next?.kind === 'directory' ? next : (here.children.set(part, new FakeDir(part)), here.children.get(part) as FakeDir);
    }
    const file = new FakeFile(fileName, text, lastModified);
    here.children.set(fileName, file);
    return file;
  }
}

const tpl = (name: string, id = 't1') => JSON.stringify({ schema: 6, id, name, sections: [] });
const NAME = 'spring.template.json';
const workspace = (dir: FakeDir) => folderWorkspace(dir as unknown as FileSystemDirectoryHandle, true);

describe('a template file in a project folder', () => {
  it('moves from the top of the project into .scug/templates on its first save, rather than being copied', async () => {
    const dir = new FakeDir('Spring');
    dir.put('.scug/project.json', '{}');
    dir.put(NAME, tpl('Spring'), 1000);
    const ws = workspace(dir);
    expect((await ws.list()).map((f) => f.fileName)).toEqual([NAME]);

    const result = await ws.writeTemplate(NAME, tpl('Spring, edited'), 1000, tpl('Spring'));
    expect(result.ok).toBe(true);
    expect(dir.at(NAME)).toBeNull();
    expect((dir.at(`.scug/templates/${NAME}`) as FakeFile).text).toBe(tpl('Spring, edited'));
    expect((await ws.list()).map((f) => f.name)).toEqual(['Spring, edited']);
  });

  it('checks for a conflict against the file the panel showed, not the empty place it is moving to', async () => {
    const dir = new FakeDir('Spring');
    dir.put('.scug/project.json', '{}');
    // Someone else's later, different version sits where the editor read the file from.
    dir.put(NAME, tpl('Theirs', 'other'), 2000);
    const ws = workspace(dir);
    const result = await ws.writeTemplate(NAME, tpl('Mine'), 1000, tpl('Spring'));
    expect(result).toMatchObject({ ok: false, conflict: true, modified: 2000 });
    expect((dir.at(NAME) as FakeFile).text).toBe(tpl('Theirs', 'other'));
    expect(dir.at(`.scug/templates/${NAME}`)).toBeNull();
  });

  it('saves in place once the file is in .scug/templates, and in a plain folder stays where the folder keeps them', async () => {
    const project = new FakeDir('Spring');
    project.put('.scug/project.json', '{}');
    project.put(`.scug/templates/${NAME}`, tpl('Spring'), 1000);
    await workspace(project).writeTemplate(NAME, tpl('Again'), 1000, tpl('Spring'));
    expect((project.at(`.scug/templates/${NAME}`) as FakeFile).text).toBe(tpl('Again'));
    expect(project.at(NAME)).toBeNull();

    const plain = new FakeDir('Emails');
    plain.put(`templates/${NAME}`, tpl('Spring'), 1000);
    await workspace(plain).writeTemplate(NAME, tpl('Again'), 1000, tpl('Spring'));
    expect((plain.at(`templates/${NAME}`) as FakeFile).text).toBe(tpl('Again'));
    expect(plain.at('.scug')).toBeNull();

    const flat = new FakeDir('Emails');
    await workspace(flat).writeTemplate(NAME, tpl('New'), 0);
    expect((flat.at(NAME) as FakeFile).text).toBe(tpl('New'));
  });
});

describe('deleting a template file', () => {
  it('removes every copy of the name, so the one the panel hid cannot come back', async () => {
    const dir = new FakeDir('Spring');
    dir.put(`.scug/templates/${NAME}`, tpl('Newer'), 2000);
    dir.put(`templates/${NAME}`, tpl('Older'), 1500);
    dir.put(NAME, tpl('Oldest'), 1000);
    const ws = workspace(dir);
    expect((await ws.list()).map((f) => f.name)).toEqual(['Newer']);

    await ws.deleteTemplate!(NAME);
    expect(dir.at(`.scug/templates/${NAME}`)).toBeNull();
    expect(dir.at(`templates/${NAME}`)).toBeNull();
    expect(dir.at(NAME)).toBeNull();
    expect(await ws.list()).toEqual([]);
  });

  it('says so when there is nothing of that name to remove', async () => {
    const dir = new FakeDir('Spring');
    dir.put('.scug/project.json', '{}');
    await expect(workspace(dir).deleteTemplate!(NAME)).rejects.toThrow(/not in Spring any more/);
    // Deleting did not make the templates folder as a side effect.
    expect(dir.at('.scug/templates')).toBeNull();
  });
});
