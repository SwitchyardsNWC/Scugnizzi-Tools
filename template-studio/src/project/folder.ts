// A project's own files: project.json, board.json, pictures under assets/, and any file by path.
//
// Template Studio's workspace (workspace/workspace.ts) already reads templates and design systems from the
// same folder, and the board uses it for those. This is the rest: the files that exist because the folder is
// a project, not only a place emails are kept.

import {
  isLauncherFile,
  launcherFileName,
  launcherJson,
  newProjectInfo,
  PROJECT_FILE,
  projectJson,
  readProjectInfo,
  type Launcher,
  type ProjectInfo,
} from '../model/project.ts';
import type { ProjectPlan } from '../model/project-types.ts';
import { readRecipe, RECIPE_TOOLS, type RecipeTool, type ToolRecipe } from '../model/tool-recipes.ts';
import { renameInRecipe, renameSrc } from '../model/asset-moves.ts';
import { FRAME_EXT, FRAMES_DIR } from '../model/frame-file.ts';
import { isImageFile, isTemplateFile } from '../workspace/workspace.ts';

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

// --- the launch file -----------------------------------------------------------------------------------------

/** The names of the `.scug` files at the top of the folder. */
export async function listLaunchers(dir: Dir): Promise<string[]> {
  const out: string[] = [];
  try {
    for await (const [name, entry] of dir.entries()) if (entry.kind === 'file' && isLauncherFile(name)) out.push(name);
  } catch {
    return out;
  }
  return out.sort();
}

/**
 * Makes sure the project has a `.scug` file to open it from Finder. Written once, when a project is open for
 * editing and has none, so a folder opened as it was gets one as a created project does. A file of any name
 * counts: the one written on create is named for the project, and one renamed since is still the project's.
 */
export async function ensureLauncher(dir: Dir, info: ProjectInfo, openUrl: string): Promise<string | null> {
  if ((await listLaunchers(dir)).length) return null;
  const name = launcherFileName(info.name);
  try {
    await writeFile(dir, name, launcherJson(info, openUrl));
  } catch {
    return null;
  }
  return name;
}

/**
 * Whether a folder someone chose is the one a launch file came from. Its project.json carrying the launcher's
 * id settles it. Failing that, holding the launched file by name does: the file was in this folder. Null when
 * it is, and otherwise what to tell the person.
 */
export async function launcherMismatch(dir: Dir, launcher: Launcher, fileName: string): Promise<string | null> {
  const info = readProjectInfo((await readText(dir, PROJECT_FILE))?.text ?? null);
  if (info?.id === launcher.id) return null;
  try {
    await dir.getFileHandle(fileName);
    return null;
  } catch {
    // Not in this folder.
  }
  if (info) return `${dir.name} is “${info.name}”, a different project. Choose the folder that holds ${fileName}.`;
  return `${dir.name} doesn't hold ${fileName}. Choose the folder the file is in.`;
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

// --- groups: folders under assets/ ------------------------------------------------------------------------------

export async function makeGroupFolder(dir: Dir, folder: string): Promise<void> {
  if (!(await childDir(dir, ['assets', folder], true))) throw new Error(`Could not make assets/${folder}.`);
}

/** Removes a group's folder when nothing but Finder's leftovers is in it. */
export async function removeFolderIfEmpty(dir: Dir, folder: string): Promise<boolean> {
  const assets = await childDir(dir, ['assets']);
  const at = assets ? await childDir(assets, [folder]) : null;
  if (!assets || !at || !(await isEmptyDir(at))) return false;
  try {
    await assets.removeEntry(folder, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves a picture under `assets/` and renames it in everything that names it: emails (image blocks and freeform
 * layers), frame files, and the recipes of the tools that made it or made something from it (model/asset-moves.ts).
 * The copy is written first and the original removed last, so a move that stops half-way leaves two copies rather
 * than none. A rewritten frame file is dated now, so every browser keeping the frame takes the new copy. Returns how
 * many documents were rewritten.
 */
export async function movePicture(dir: Dir, from: string, to: string, now = Date.now()): Promise<number> {
  if (from === to) return 0;
  const parts = from.split('/');
  const name = parts.pop()!;
  const folder = await childDir(dir, ['assets', ...parts]);
  let file: File | null = null;
  try {
    file = folder ? await (await folder.getFileHandle(name)).getFile() : null;
  } catch {
    file = null;
  }
  if (!file) throw new Error(`assets/${from} is not in the project any more.`);
  await writeFile(dir, `assets/${to}`, file);

  let rewritten = 0;
  const rewrite = async (path: string, entry: FileSystemHandle, change: (raw: unknown) => { value: unknown; changed: boolean }) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await (await (entry as FileSystemFileHandle).getFile()).text());
    } catch {
      return; // Not JSON: nothing in it names the picture.
    }
    const { value, changed } = change(raw);
    if (!changed) return;
    await writeFile(dir, path, `${JSON.stringify(value, null, 2)}\n`);
    rewritten += 1;
  };

  for (const [prefix, sub] of [['', null], ['templates/', 'templates']] as Array<[string, string | null]>) {
    const at = sub ? await childDir(dir, [sub]) : dir;
    if (!at) continue;
    const names: Array<[string, FileSystemHandle]> = [];
    for await (const item of at.entries()) if (item[1].kind === 'file' && isTemplateFile(item[0])) names.push(item);
    for (const [fileName, entry] of names) await rewrite(prefix + fileName, entry, (raw) => renameSrc(raw, from, to));
  }

  const frames = await childDir(dir, [FRAMES_DIR]);
  if (frames) {
    const names: Array<[string, FileSystemHandle]> = [];
    for await (const item of frames.entries()) if (item[1].kind === 'file' && item[0].endsWith(FRAME_EXT)) names.push(item);
    for (const [fileName, entry] of names) {
      await rewrite(`${FRAMES_DIR}/${fileName}`, entry, (raw) => {
        const renamed = renameSrc(raw, from, to);
        return renamed.changed ? { value: { ...(renamed.value as Record<string, unknown>), savedAt: now }, changed: true } : renamed;
      });
    }
  }

  for (const tool of Object.keys(RECIPE_TOOLS) as RecipeTool[]) {
    const { dir: sub, ext } = RECIPE_TOOLS[tool];
    const at = await childDir(dir, [sub]);
    if (!at) continue;
    const names: Array<[string, FileSystemHandle]> = [];
    for await (const item of at.entries()) if (item[1].kind === 'file' && item[0].endsWith(ext)) names.push(item);
    for (const [fileName, entry] of names) await rewrite(`${sub}/${fileName}`, entry, (raw) => renameInRecipe(raw, from, to));
  }

  await removeFile(dir, `assets/${from}`);
  return rewritten;
}

// --- what tools made --------------------------------------------------------------------------------------------

/** Every recipe Riso and Ink bleed wrote into the project (model/tool-recipes.ts). One that cannot be read is skipped. */
export async function listRecipes(dir: Dir): Promise<ToolRecipe[]> {
  const out: ToolRecipe[] = [];
  for (const tool of Object.keys(RECIPE_TOOLS) as RecipeTool[]) {
    const { dir: name, ext } = RECIPE_TOOLS[tool];
    const folder = await childDir(dir, [name]);
    if (!folder) continue;
    for await (const [fileName, entry] of folder.entries()) {
      if (entry.kind !== 'file' || !fileName.endsWith(ext)) continue;
      try {
        const recipe = readRecipe(await (await (entry as FileSystemFileHandle).getFile()).text(), `${name}/${fileName}`);
        if (recipe?.tool === tool) out.push(recipe);
      } catch {
        // Half-written or unreadable: the rest still count.
      }
    }
  }
  return out;
}

// --- creating a project -----------------------------------------------------------------------------------------

const LEFT_BEHIND = new Set(['.DS_Store', 'desktop.ini', 'Thumbs.db', 'Icon\r']);

/** A folder with nothing in it but what Finder and Windows leave behind. */
export async function isEmptyDir(dir: Dir): Promise<boolean> {
  for await (const name of dir.keys()) if (!LEFT_BEHIND.has(name)) return false;
  return true;
}

/** Where to put a new project. Null when the picker was dismissed or this browser has none. */
export async function pickDestination(): Promise<Dir | null> {
  const picker = (globalThis as Record<string, unknown>)['showDirectoryPicker'] as ((options?: Record<string, string>) => Promise<Dir>) | undefined;
  if (!picker) return null;
  try {
    // The id makes Chrome start where the last project went.
    return await picker({ id: 'scuggnizzi-projects', mode: 'readwrite', startIn: 'documents' });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return null;
    throw cause;
  }
}

export class FolderTaken extends Error {
  override name = 'FolderTaken';
}

/**
 * Writes a planned project into the folder chosen for it, as a new folder named for the project. A chosen folder
 * that already has the project's name and nothing in it is used as it is: that is someone making the folder in
 * the picker first. A folder of that name with things in it is never written into.
 */
export async function createProjectFolder(parent: Dir, plan: ProjectPlan): Promise<Dir> {
  let dir: Dir;
  if (parent.name.toLowerCase() === plan.folder.toLowerCase()) {
    if (!(await isEmptyDir(parent))) throw new FolderTaken(`“${parent.name}” already has things in it. Choose the folder to put the project in, or give it another name.`);
    dir = parent;
  } else {
    const existing = await childDir(parent, [plan.folder]);
    if (existing && !(await isEmptyDir(existing))) {
      throw new FolderTaken(`${parent.name} already has a folder called “${plan.folder}” with things in it. Give the project another name, or choose somewhere else.`);
    }
    dir = existing ?? (await parent.getDirectoryHandle(plan.folder, { create: true }));
  }
  for (const folder of plan.folders) await childDir(dir, folder.split('/'), true);
  for (const file of plan.files) await writeFile(dir, file.path, file.text);
  return dir;
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
