// A project's own files: project.json, board.json, pictures under assets/, and any file by path.
//
// Template Studio's workspace (workspace/workspace.ts) already reads templates and design systems from the
// same folder, and the board uses it for those. This is the rest: the files that exist because the folder is
// a project, not only a place emails are kept.

import { newProjectInfo, PROJECT_FILE, projectJson, readProjectInfo, type ProjectInfo } from '../model/project.ts';
import { isImageFile } from '../workspace/workspace.ts';

type Dir = FileSystemDirectoryHandle;

const split = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop() ?? '';
  return { parts, name };
};

/** A folder inside the project, made on the way when `create` is set. Null when it is not there. */
export async function childDir(dir: Dir, parts: string[], create = false): Promise<Dir | null> {
  let at = dir;
  for (const part of parts) {
    try {
      at = await at.getDirectoryHandle(part, { create });
    } catch {
      return null;
    }
  }
  return at;
}

export async function readText(dir: Dir, path: string): Promise<{ text: string; modified: number } | null> {
  const { parts, name } = split(path);
  const folder = await childDir(dir, parts);
  if (!folder) return null;
  try {
    const file = await (await folder.getFileHandle(name)).getFile();
    return { text: await file.text(), modified: file.lastModified };
  } catch {
    return null;
  }
}

/** Writes a file, making its folders. Returns the time the folder gives the saved file. */
export async function writeFile(dir: Dir, path: string, data: string | Blob): Promise<number> {
  const { parts, name } = split(path);
  const folder = await childDir(dir, parts, true);
  if (!folder) throw new Error(`Could not make the folder for ${path}.`);
  const handle = await folder.getFileHandle(name, { create: true });
  const out = await handle.createWritable();
  await out.write(data);
  await out.close();
  return (await handle.getFile()).lastModified;
}

/** Removes a file. One that is already gone is not an error. */
export async function removeFile(dir: Dir, path: string): Promise<void> {
  const { parts, name } = split(path);
  const folder = await childDir(dir, parts);
  if (!folder) return;
  try {
    await folder.removeEntry(name);
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'NotFoundError')) throw cause;
  }
}

/**
 * The project's details. A folder opened for the first time gets a project.json when it can be written. The id
 * comes from the folder's name rather than chance, so two pages opening the same new folder at once agree on
 * it, and once written it stays whatever the folder is renamed to.
 */
export async function readProject(dir: Dir, writable: boolean): Promise<ProjectInfo> {
  const found = readProjectInfo((await readText(dir, PROJECT_FILE))?.text ?? null);
  if (found) return found;
  const info = newProjectInfo(dir.name, `folder:${dir.name}`);
  if (writable) {
    try {
      await writeFile(dir, PROJECT_FILE, projectJson(info));
    } catch {
      // Not written this time: the same id is worked out again next time.
    }
  }
  return info;
}

// --- pictures -----------------------------------------------------------------------------------------------

export interface PictureEntry {
  /** Under `assets/`, which is the name emails and frames use for it. */
  path: string;
  size: number;
  modified: number;
  file: File;
}

/**
 * Every picture under `assets/`, three folders deep, as Template Studio's Assets panel finds them. That
 * includes `assets/rendered/`, the pictures Template Studio draws from an email's own text: the board uses
 * them to draw emails, and leaves them off the board as cards of their own.
 */
export async function listPictures(dir: Dir): Promise<PictureEntry[]> {
  const assets = await childDir(dir, ['assets']);
  const out: PictureEntry[] = [];
  const walk = async (folder: Dir, prefix: string, depth: number) => {
    for await (const [name, entry] of folder.entries()) {
      if (name.startsWith('.')) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') {
        if (depth > 1) await walk(entry as Dir, path, depth - 1);
        continue;
      }
      if (!isImageFile(name)) continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      out.push({ path, size: file.size, modified: file.lastModified, file });
    }
  };
  if (assets) await walk(assets, '', 3);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Puts a picture from the computer into `assets/` and returns its name there. The same picture dropped twice
 * is found rather than copied; a different picture with a name already taken gets `-2`.
 */
export async function writePicture(dir: Dir, file: File, existing: PictureEntry[]): Promise<string> {
  const clean = file.name.replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '') || 'picture.png';
  const same = existing.find((p) => p.path.toLowerCase() === clean.toLowerCase());
  if (same && same.size === file.size) return same.path;
  const taken = new Set(existing.map((p) => p.path.toLowerCase()));
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  let name = clean;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${stem}-${n}${ext}`;
  await writeFile(dir, `assets/${name}`, file);
  return name;
}
