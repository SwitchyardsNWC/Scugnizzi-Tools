// The workspace: a folder of JSON files that everyone on the team already syncs.
//
// This is the whole point of v2. v1 kept designs in one browser's local storage and moved them
// between people as exported JSON, which was its main complaint (learnings 3.7). A folder in
// Dropbox or Drive means two designers see each other's templates without anyone exporting
// anything.
//
// Two back ends behind one interface. The File System Access API is the real one and is
// Chromium-only, which is fine — Chrome is the supported browser (brief.md). Everything else falls
// back to picking files by hand and downloading the result, so Safari and Firefox degrade rather
// than break.

import { META_DIR, RENDERED_PREFIX } from '../model/layout.ts';
import { migrate } from '../model/schema.ts';
import { importV1 } from '../model/import-v1.ts';
import { completeDesignSystem, type DesignSystem } from '../model/design-system.ts';
import { parsePattern, type Pattern } from '../model/patterns.ts';
import { patternFileName, systemFileName } from '../model/serialize.ts';
import type { Template } from '../model/types.ts';
import { zip } from '../model/zip.ts';

export interface TemplateFile {
  /** What to show in the list. */
  name: string;
  fileName: string;
  /** A v1 `.design.json` is imported on read; a v2 `.template.json` is migrated. */
  kind: 'v1' | 'v2';
  modified: number;
  load(): Promise<{ template: Template; warnings: string[] }>;
}

/**
 * An image sitting in the workspace's `assets/` folder.
 *
 * `url` is a blob URL and is for *looking at* — it exists in this tab and nowhere else. What goes in
 * the document is `name`, and the linter refuses to export a template whose images are still local,
 * because an email is read on somebody else's machine. That pairing is the point: design against
 * the real pictures, and be told exactly which ones still need a hosted URL.
 */
export interface AssetFile {
  name: string;
  /** Bytes. */
  size: number;
  /** Blob URL, for the panel and the canvas. Never written to a document. */
  url: string;
}

/** One file of a folder export: its path inside the folder, and its text or bytes. */
export interface ExportFile {
  path: string;
  data: string | Blob;
}

/** What a save did. `conflict` means somebody else's version is on disk and this one was not written. */
export type SaveResult = { ok: true; modified: number } | { ok: false; conflict: true; modified: number };

export interface Workspace {
  label: string;
  kind: 'folder' | 'files';
  /** The folder itself, for a folder workspace: what the project's own files are read through. */
  handle?: FileSystemDirectoryHandle;
  /**
   * Whether templates and exports can be written back, rather than downloaded.
   *
   * False for files picked by hand, and false for a folder Chrome opened **view-only**: its
   * picker asks "Edit files" or "View files", and the second answer gives a handle every write
   * throws on. That was a blank "could not save" and a stack trace about `getDirectoryHandle`
   * until it was named; now it is this flag, a line in Files, and `requestWrite`.
   */
  canWrite: boolean;
  /**
   * Asks Chrome for edit access to a folder it opened view-only. Only works from a click — the
   * prompt is a user-gesture one — and resolves to a writable workspace on the same folder when
   * granted, null when refused. Absent on the files fallback, which has nothing to ask.
   */
  requestWrite?(): Promise<Workspace | null>;
  list(): Promise<TemplateFile[]>;
  writeExport(fileName: string, html: string): Promise<string>;
  /**
   * Writes an export that is a folder: `exports/<folder>/<path>` for each file, making the folders on the way.
   * This is how a template travels with its pictures (model/export-package.ts). A workspace that cannot write
   * downloads the same files as one zip named for the folder. Returns where it went.
   */
  writeExportFiles(folder: string, files: ExportFile[]): Promise<string>;
  /**
   * Saves a template, refusing if the file changed on disk since `expectedModified`.
   *
   * The check re-stats immediately before writing rather than trusting what was read at load
   * (architecture.md §1). That ordering is the whole point: Dropbox and Drive resolve concurrent
   * writes by silently making a conflicted copy, which is worse than a merge conflict because
   * nobody is told. Last-writer-wins is fine for three people; last-writer-wins *without anyone
   * noticing* is not.
   *
   * A newer time alone is not a conflict, though. Drive for desktop (and Dropbox) rewrite a file's
   * modification time once the upload lands, seconds after the save, so a lone designer saw "someone
   * else saved this" on every second keystroke. So when the time has moved, what is on disk is read
   * and compared with `lastKnown`, the template as this editor last read or wrote it: the same
   * template under a new time is nobody else's work, and the save goes ahead and takes the new time.
   * Only a different template on disk is refused. `expectedModified` of 0 skips the check: a new
   * file, or a save the person has asked for anyway.
   */
  writeTemplate(fileName: string, json: string, expectedModified: number, lastKnown?: string): Promise<SaveResult>;
  /**
   * Removes a template file from the folder: every copy of that name in the places `list` looks, since the
   * panel shows a name once however many places hold it.
   *
   * Absent on a read-only workspace, which is how the panel knows not to offer it.
   *
   * There is no confirmation anywhere above this, by the project's own rule: destructive things
   * happen and offer Undo rather than asking first (learnings 3.2). That is only honest because
   * undo here is a real restore — the caller reads the template before deleting and writes the same
   * bytes back under the same name, so the file that returns is the file that left. The one thing
   * it cannot put back is the moment: on a synced folder somebody else's client may have already
   * seen the deletion, which is why the toast says so rather than implying the folder never moved.
   */
  deleteTemplate?(fileName: string): Promise<void>;
  /** Images in `assets/`. Empty when there is no such folder, which is not an error. */
  assets(): Promise<AssetFile[]>;
  /**
   * Writes an image into `assets/`, creating any folder on the way that does not exist yet.
   *
   * `path` may name a subfolder — `rendered/headline-a1.png` — and that is how rendered text is
   * kept: it is generated output sitting next to hand-made artwork, and a folder three people sync
   * should say which is which.
   *
   * Returns the name to put in the **document**, which is not always the path written: a workspace
   * that cannot write downloads the file instead, and a download has no folders, so the document
   * says the bare name that will be sitting in the designer's downloads. Either way it is a local
   * file name and never a URL, and `local-image` goes on refusing the export until a hosted one
   * replaces it.
   */
  writeAsset(path: string, blob: Blob): Promise<string>;
  /**
   * The folder's design systems, keyed by name: every `design-systems/<name>.system.json`.
   * A template names one and follows it (types.ts, `designSystem`). Empty when the folder has
   * none, which is every folder from before this existed.
   */
  designSystems(): Promise<Record<string, DesignSystem>>;
  /** Writes one system back, creating the folder on the way. */
  writeDesignSystem(name: string, json: string): Promise<void>;
  /** Every `patterns/<name>.pattern.json`. A file that is not a pattern is skipped, not fatal. */
  patterns(): Promise<Pattern[]>;
  writePattern(pattern: Pattern, json: string): Promise<void>;
}

const SYSTEM = '.system.json';
const PATTERN = '.pattern.json';
/** `switchyards.system.json` → `switchyards`. The name a template writes in `designSystem`. */
const systemName = (fileName: string) => fileName.slice(0, -SYSTEM.length);

/** A write Chrome refused. The message says what to do; the name lets the app offer to do it. */
export class WriteRefused extends Error {
  override name = 'WriteRefused';
}

export const isWriteRefused = (cause: unknown): cause is WriteRefused =>
  cause instanceof Error && cause.name === 'WriteRefused';

const refused = (folder: string) =>
  new WriteRefused(
    `Chrome is not allowing changes to “${folder}”. It opened the folder view-only, or the permission lapsed. Allow editing to save again — nothing you have done is lost.`,
  );

/** Runs a write, turning Chrome's NotAllowedError into a refusal the app can act on. */
async function writing<T>(folder: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'NotAllowedError') throw refused(folder);
    throw cause;
  }
}

type Permissible = {
  queryPermission?(options: { mode: string }): Promise<string>;
  requestPermission?(options: { mode: string }): Promise<string>;
};

/** What Chrome currently grants on a handle. `granted` when the browser has no such API at all. */
async function permissionOf(dir: FileSystemDirectoryHandle, mode: 'read' | 'readwrite'): Promise<string> {
  try {
    return (await (dir as unknown as Permissible).queryPermission?.({ mode })) ?? 'granted';
  } catch {
    return 'denied';
  }
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

/** Whether a file is something an email could show. */
export const isImageFile = (name: string) => IMAGE.test(name);

const V2 = '.template.json';
const V1 = '.design.json';

export const isTemplateFile = (name: string) => name.endsWith(V2) || name.endsWith(V1);

function parse(text: string): { template: Template; warnings: string[] } {
  const raw = JSON.parse(text);
  // A v1 design has a flat `blocks` array and no `sections`; anything else goes through the
  // migration chain, which refuses a document written by a newer build rather than downgrading it.
  const looksV1 = Array.isArray(raw?.blocks) && !raw?.sections;
  return looksV1 ? importV1(raw) : { template: migrate(raw), warnings: [] };
}

/**
 * Whether two texts hold the same template: each is read the way a file is, so spacing, key order and a v1
 * shape make no difference. Text that is not a template at all is compared as it is.
 */
export function sameTemplate(a: string, b: string): boolean {
  const seen = (text: string) => {
    try {
      return JSON.stringify(canonical(parse(text).template));
    } catch {
      return text.trim();
    }
  };
  return seen(a) === seen(b);
}

/** The value with every object's keys in order, so two writings of one template stringify alike. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

const displayName = (fileName: string) => fileName.replace(V2, '').replace(V1, '').replace(/[-_]+/g, ' ');

/**
 * What to call a template in a list: the name it carries, not the name of the file holding it.
 *
 * The two are deliberately allowed to differ. A file name is pinned at creation and never follows
 * the template's name afterwards, because renaming the template would otherwise leave a second file
 * behind — and because the project board identifies an email card by its file name, so a rename
 * would move somebody's card. That is the right call, and it had one bad consequence: this list
 * showed the *file* name, so renaming a template appeared to do nothing at all. A duplicate stayed
 * "drop step 1 copy" in the list however many times it was renamed, which is what Jared hit.
 *
 * So the file name stays an identifier and this reads the real name out of the file, which is what
 * the project board already did (Board.tsx). Parsed cheaply — the name is a top-level string and a
 * template is a few tens of kilobytes — and any file that will not parse falls back to its name on
 * disk rather than vanishing from the list.
 */
export function nameInside(text: string, fileName: string): string {
  try {
    const raw = JSON.parse(text) as { name?: unknown };
    return typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : displayName(fileName);
  } catch {
    return displayName(fileName);
  }
}

// --- the File System Access back end -----------------------------------------------------------

export const supportsFolders = () => typeof (globalThis as Record<string, unknown>)['showDirectoryPicker'] === 'function';

type Handle = FileSystemDirectoryHandle;

function folderWorkspace(dir: Handle, writable: boolean): Workspace {
  /**
   * The project's hidden folder (model/layout.ts), when the folder is a project. Its templates, design systems,
   * patterns and rendered pictures live there; a plain folder opened as a workspace keeps the old shape.
   */
  const meta = () => subdirectory(dir, META_DIR);
  /** A folder to write the tools' files into: inside .scug/ for a project, at the top otherwise. */
  const toolFolder = async (name: string): Promise<Handle> => {
    const m = await meta();
    return (m ?? dir).getDirectoryHandle(name, { create: true });
  };
  /** Every folder a tool's files may be in: the new place, and the old one until the project is opened for editing. */
  const toolFolders = async (name: string): Promise<Handle[]> => {
    const out: Handle[] = [];
    const m = await meta();
    const modern = m ? await subdirectory(m, name) : null;
    if (modern) out.push(modern);
    const legacy = await subdirectory(dir, name);
    if (legacy) out.push(legacy);
    return out;
  };
  return {
    label: dir.name,
    kind: 'folder',
    handle: dir,
    canWrite: writable,

    async requestWrite() {
      try {
        const state = await (dir as unknown as Permissible).requestPermission?.({ mode: 'readwrite' });
        return state === 'granted' ? folderWorkspace(dir, true) : null;
      } catch {
        return null;
      }
    },

    async list() {
      const out: TemplateFile[] = [];
      const seen = new Set<string>();
      // Templates live in `.scug/templates/` in a project, and at the top level or under `templates/` in a
      // workspace that has not been organised yet, so all three are walked; the first place wins a name.
      for (const source of [...(await toolFolders('templates')), dir]) {
        for await (const [fileName, entry] of source.entries()) {
          if (entry.kind !== 'file' || !isTemplateFile(fileName) || seen.has(fileName)) continue;
          seen.add(fileName);
          // The DOM lib does not discriminate the handle union on `kind`, so this narrows by hand.
          const handle = entry as FileSystemFileHandle;
          const file = await handle.getFile();
          out.push({
            name: nameInside(await file.text(), fileName),
            fileName,
            kind: fileName.endsWith(V1) ? 'v1' : 'v2',
            modified: file.lastModified,
            load: async () => parse(await (await handle.getFile()).text()),
          });
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },

    async writeAsset(path, blob) {
      // View-only: the same fallback as files picked by hand. A download has no folders, so the
      // name the document gets is the bare file name.
      if (!writable) {
        const fileName = path.split('/').pop()!;
        downloadBlob(fileName, blob);
        return fileName;
      }
      return writing(dir.name, async () => {
        const parts = path.split('/').filter(Boolean);
        const fileName = parts.pop()!;
        // A rendered picture goes into .scug/rendered/ in a project, and keeps its `rendered/…` name in documents.
        const m = parts[0] === RENDERED_PREFIX ? await meta() : null;
        let folder = m ? await m.getDirectoryHandle(parts.shift()!, { create: true }) : await dir.getDirectoryHandle('assets', { create: true });
        for (const part of parts) folder = await folder.getDirectoryHandle(part, { create: true });
        const handle = await folder.getFileHandle(fileName, { create: true });
        const out = await handle.createWritable();
        await out.write(blob);
        await out.close();
        return path;
      });
    },

    async designSystems() {
      const out: Record<string, DesignSystem> = {};
      for (const folder of await toolFolders('design-systems')) {
        for await (const [fileName, entry] of folder.entries()) {
          if (entry.kind !== 'file' || !fileName.endsWith(SYSTEM) || systemName(fileName) in out) continue;
          try {
            const text = await (await (entry as FileSystemFileHandle).getFile()).text();
            out[systemName(fileName)] = completeDesignSystem(JSON.parse(text));
          } catch {
            // A file that is not JSON is somebody's half-written edit, not a reason to lose the rest.
          }
        }
      }
      return out;
    },
    async writeDesignSystem(name, json) {
      if (!writable) {
        download(systemFileName(name), json);
        return;
      }
      await writing(dir.name, async () => {
        const folder = await toolFolder('design-systems');
        const handle = await folder.getFileHandle(systemFileName(name), { create: true });
        const out = await handle.createWritable();
        await out.write(json);
        await out.close();
      });
    },

    async patterns() {
      const out: Pattern[] = [];
      const seen = new Set<string>();
      for (const folder of await toolFolders('patterns')) {
        for await (const [fileName, entry] of folder.entries()) {
          if (entry.kind !== 'file' || !fileName.endsWith(PATTERN) || seen.has(fileName)) continue;
          seen.add(fileName);
          try {
            const text = await (await (entry as FileSystemFileHandle).getFile()).text();
            out.push(parsePattern(JSON.parse(text)));
          } catch {
            // Skipped, not fatal, for the same reason as a system file.
          }
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    async writePattern(pattern, json) {
      if (!writable) {
        download(patternFileName(pattern.name), json);
        return;
      }
      await writing(dir.name, async () => {
        const folder = await toolFolder('patterns');
        const handle = await folder.getFileHandle(patternFileName(pattern.name), { create: true });
        const out = await handle.createWritable();
        await out.write(json);
        await out.close();
      });
    },
    async writeExport(fileName, html) {
      if (!writable) {
        download(fileName, html);
        return fileName;
      }
      // plan.md puts the last export of each template in `exports/`.
      return writing(dir.name, async () => {
        const exports = await dir.getDirectoryHandle('exports', { create: true });
        const handle = await exports.getFileHandle(fileName, { create: true });
        const out = await handle.createWritable();
        await out.write(html);
        await out.close();
        return `${dir.name}/exports/${fileName}`;
      });
    },

    async writeExportFiles(folder, files) {
      if (!writable) return downloadZip(folder, files);
      return writing(dir.name, async () => {
        const exports = await dir.getDirectoryHandle('exports', { create: true });
        const root = await exports.getDirectoryHandle(folder, { create: true });
        for (const file of files) {
          const parts = file.path.split('/').filter(Boolean);
          const name = parts.pop()!;
          let at = root;
          for (const part of parts) at = await at.getDirectoryHandle(part, { create: true });
          const handle = await at.getFileHandle(name, { create: true });
          const out = await handle.createWritable();
          await out.write(file.data);
          await out.close();
        }
        return `${dir.name}/exports/${folder}`;
      });
    },

    async assets() {
      const out: AssetFile[] = [];
      // Rendered pictures first, from .scug/rendered/, under the `rendered/` name documents use; then assets/, where
      // the old layout kept them too, the first spelling of a name winning.
      const m = await meta();
      const rendered = m ? await subdirectory(m, RENDERED_PREFIX) : null;
      if (rendered) await collectImages(rendered, RENDERED_PREFIX, out, 2);
      const folder = await subdirectory(dir, 'assets');
      if (folder) await collectImages(folder, '', out, 3);
      const seen = new Set<string>();
      return out
        .filter((a) => {
          if (seen.has(a.name)) {
            URL.revokeObjectURL(a.url);
            return false;
          }
          seen.add(a.name);
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async writeTemplate(fileName, json, expectedModified, lastKnown) {
      if (!writable) throw refused(dir.name);
      return writing(dir.name, async () => {
        // Where the file goes: .scug/templates/ in a project; otherwise where the workspace keeps them, or the top.
        // The places it may already be are the ones `list` walks, in `list`'s order, so the first found is the file
        // the panel showed and the editor read (learnings 3.77: a template at the top of a project was copied into
        // .scug/templates on its first save and the copy at the top lived on, to come back when the other was deleted).
        const m = await meta();
        const modern = m ? await m.getDirectoryHandle('templates', { create: true }) : null;
        const legacy = [await subdirectory(dir, 'templates'), dir].filter((h): h is Handle => h !== null);
        const places = modern ? [modern, ...legacy] : legacy;
        const target = places[0]!;
        let shown: { source: Handle; handle: FileSystemFileHandle } | null = null;
        for (const source of places) {
          try {
            shown = { source, handle: await source.getFileHandle(fileName) };
            break;
          } catch {
            // Not in this place.
          }
        }

        // A file that moved underneath us is a conflict only when what is in it is not what this editor last saw: a
        // synced folder rewrites the time after every upload (see the interface). Nothing on disk yet is no conflict.
        if (shown) {
          const onDisk = await shown.handle.getFile();
          if (expectedModified > 0 && onDisk.size > 0 && onDisk.lastModified > expectedModified) {
            const same = lastKnown !== undefined && sameTemplate(await onDisk.text(), lastKnown);
            if (!same) return { ok: false as const, conflict: true as const, modified: onDisk.lastModified };
          }
        }

        const handle = await target.getFileHandle(fileName, { create: true });
        const out = await handle.createWritable();
        await out.write(json);
        await out.close();
        // The file the panel showed moves to where every tool writes now, so the folder does not keep two of it.
        if (shown && shown.source !== target) await shown.source.removeEntry(fileName);
        return { ok: true as const, modified: (await handle.getFile()).lastModified };
      });
    },

    async deleteTemplate(fileName) {
      if (!writable) throw refused(dir.name);
      return writing(dir.name, async () => {
        // Exactly the places `list` walks — `toolFolders` plus the folder itself — and every copy in them, not the
        // first: a name that sits in two places shows once in the panel, and removing one copy only brought the other
        // into view (learnings 3.77). Written by hand the first time and it was wrong twice over: it created
        // `.scug/templates` as a side effect of deleting (`create: true` on a folder that need not exist), and it
        // left out the top level, so a template sitting directly in a project folder was listed and then could not
        // be removed. Sharing the helper is what makes "everything the panel offered can be deleted" true by
        // construction rather than by coincidence.
        let removed = 0;
        for (const source of [...(await toolFolders('templates')), dir]) {
          try {
            await source.getFileHandle(fileName);
          } catch {
            continue;
          }
          await source.removeEntry(fileName);
          removed += 1;
        }
        if (removed === 0) throw new Error(`${fileName} is not in ${dir.name} any more. Somebody else may have removed it.`);
      });
    },
  };
}

/**
 * Every image under `assets/`, named by its path relative to it — `hero.png`, `rendered/lede.png`.
 *
 * Subfolders are walked because people organise a folder they share, and because rendered text goes
 * into one. The path *is* the name: it is what the document stores, what the canvas matches on to
 * swap in a blob URL, and what `local-image` reports — three things that only agree if there is one
 * spelling of it.
 *
 * Depth-capped rather than unbounded. Three is past anything anybody does on purpose, and a folder
 * somebody nests a symlinked node_modules into should not hang the editor.
 */
async function collectImages(folder: Handle, prefix: string, out: AssetFile[], depth: number): Promise<void> {
  for await (const [entryName, entry] of folder.entries()) {
    const path = prefix ? `${prefix}/${entryName}` : entryName;
    if (entry.kind === 'directory') {
      if (depth > 1) await collectImages(entry as Handle, path, out, depth - 1);
      continue;
    }
    if (!isImageFile(entryName)) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    out.push({ name: path, size: file.size, url: URL.createObjectURL(file) });
  }
}

async function subdirectory(dir: Handle, name: string): Promise<Handle | null> {
  try {
    return await dir.getDirectoryHandle(name);
  } catch {
    return null; // not there, which is normal
  }
}

export async function openFolder(): Promise<Workspace | null> {
  const picker = (globalThis as Record<string, unknown>)['showDirectoryPicker'] as
    | ((options?: { mode?: string }) => Promise<Handle>)
    | undefined;
  if (!picker) return null;
  try {
    const dir = await picker({ mode: 'readwrite' });
    await remember(dir);
    // The picker asked for edit access; whether it got it is a second prompt the user answers,
    // and "View files" is a perfectly ordinary answer to give by mistake.
    const writable = (await permissionOf(dir, 'readwrite')) === 'granted';
    return folderWorkspace(dir, writable);
  } catch {
    return null; // the picker was dismissed, which is not an error
  }
}

/** Reopens last session's folder, if the browser still grants it without another prompt. */
export async function restoreFolder(): Promise<Workspace | null> {
  const dir = await recall();
  if (!dir) return null;
  // Deliberately not requestPermission: that needs a user gesture, and prompting on load is how
  // an app teaches people to dismiss its dialogs. Whatever Chrome still grants is what is used —
  // edit access if it persisted, view-only if only that did, and Files offers the one click that
  // asks for the rest.
  if ((await permissionOf(dir, 'readwrite')) === 'granted') return folderWorkspace(dir, true);
  if ((await permissionOf(dir, 'read')) === 'granted') return folderWorkspace(dir, false);
  return null;
}

// --- the fallback ------------------------------------------------------------------------------

/** Files chosen by hand. Read-only, and exports download instead of being written back. */
export function workspaceFromFiles(files: File[]): Workspace {
  const templates = files.filter((f) => isTemplateFile(f.name));
  return {
    label: templates.length === 1 ? templates[0]!.name : `${templates.length} files`,
    kind: 'files',
    canWrite: false,
    async list() {
      const out = await Promise.all(
        templates.map(async (file) => ({
          name: nameInside(await file.text(), file.name),
          fileName: file.name,
          kind: (file.name.endsWith(V1) ? 'v1' : 'v2') as 'v1' | 'v2',
          modified: file.lastModified,
          load: async () => parse(await file.text()),
        })),
      );
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    async assets() {
      // Whatever images were handed over alongside the templates. No folder to walk, so this is all
      // of it.
      return files
        .filter((f) => isImageFile(f.name))
        .map((file) => ({ name: file.name, size: file.size, url: URL.createObjectURL(file) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async writeAsset(path, blob) {
      // No folder to write into, so it goes to the downloads folder and the designer puts it
      // wherever their assets live. A download has no folders, so the subfolder is dropped from
      // both the file and the name the document gets — otherwise the document would point at a
      // path that exists nowhere on this machine.
      const fileName = path.split('/').pop()!;
      downloadBlob(fileName, blob);
      return fileName;
    },
    async designSystems() {
      // Whatever system files were picked alongside the templates.
      const out: Record<string, DesignSystem> = {};
      for (const file of files.filter((f) => f.name.endsWith(SYSTEM))) {
        try {
          out[systemName(file.name)] = completeDesignSystem(JSON.parse(await file.text()));
        } catch {
          // Not JSON; skipped.
        }
      }
      return out;
    },
    async writeDesignSystem(name, json) {
      download(systemFileName(name), json);
    },
    async patterns() {
      const out: Pattern[] = [];
      for (const file of files.filter((f) => f.name.endsWith(PATTERN))) {
        try {
          out.push(parsePattern(JSON.parse(await file.text())));
        } catch {
          // Skipped.
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    async writePattern(pattern, json) {
      download(patternFileName(pattern.name), json);
    },
    async writeExport(fileName, html) {
      download(fileName, html);
      return fileName;
    },
    writeExportFiles: downloadZip,
    async writeTemplate(fileName, json) {
      // Nothing to write back to — the files were handed over one at a time, not as a folder.
      download(fileName, json);
      return { ok: true, modified: Date.now() };
    },
  };
}

export function download(fileName: string, html: string): void {
  downloadBlob(fileName, new Blob([html], { type: 'text/html' }));
}

/** The same, for bytes that are already a blob — a rendered PNG, say. */
/** The folder export as one zip, downloaded: for a workspace with nowhere to write it. Returns the zip's name. */
async function downloadZip(folder: string, files: ExportFile[]): Promise<string> {
  const encoder = new TextEncoder();
  const entries = await Promise.all(
    files.map(async (f) => ({ path: `${folder}/${f.path}`, data: typeof f.data === 'string' ? encoder.encode(f.data) : new Uint8Array(await f.data.arrayBuffer()) })),
  );
  const name = `${folder}.zip`;
  // The archive fills its buffer exactly, so the buffer is the file.
  downloadBlob(name, new Blob([zip(entries).buffer as ArrayBuffer], { type: 'application/zip' }));
  return name;
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- remembering the folder between sessions ----------------------------------------------------
//
// A directory handle survives in IndexedDB; localStorage cannot hold one. Re-picking the folder on
// every load would be friction for the one thing people do every single time.

const DB = 'template-studio';
const STORE = 'handles';

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null); // private windows and blocked storage both land here
    }
  });
}

async function remember(dir: Handle): Promise<void> {
  const db = await idb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(dir, 'workspace');
  } catch {
    /* not worth surfacing: the folder still works for this session */
  }
}

// --- the project folder -------------------------------------------------------------------------------------
//
// The folder remembered here is the project every page on this site opens (docs/projects.md). The pages
// share an origin, so a handle stored by the project board is the one Template Studio and Freeform find, and
// none of them has to show a picker again. These hand the handle itself to the pages that read a project's
// own files: project.json, board.json, frames.

export { folderWorkspace, permissionOf };

/**
 * Asks for a folder, and remembers it as the project. Null when the picker was dismissed or is not there.
 * With `remember: false` the folder is only handed back, for a caller that has to look at it first.
 */
export async function pickFolderHandle(options: { remember?: boolean } = {}): Promise<Handle | null> {
  const picker = (globalThis as Record<string, unknown>)['showDirectoryPicker'] as ((options?: { mode?: string }) => Promise<Handle>) | undefined;
  if (!picker) return null;
  try {
    const dir = await picker({ mode: 'readwrite' });
    if (options.remember !== false) await remember(dir);
    return dir;
  } catch {
    return null;
  }
}

// Every project this browser has opened is remembered by its id as well, so a `.scug` launch file, which
// carries the id and nothing about where the folder is, finds its folder without a picker.

const projectKey = (id: string) => `project:${id}`;

/** Remembers which folder holds the project with this id. */
export async function rememberProjectFolder(id: string, dir: Handle): Promise<void> {
  const db = await idb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(dir, projectKey(id));
  } catch {
    /* the project still opens by picking its folder */
  }
}

/** The folder remembered for a project id, whatever Chrome currently grants on it. */
export async function recallProjectFolder(id: string): Promise<Handle | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(projectKey(id));
      request.onsuccess = () => resolve((request.result as Handle) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** The remembered folder, whatever Chrome currently grants on it. */
export const recallFolderHandle = (): Promise<Handle | null> => recall();

/** Remembers a folder as the project, as picking it would: one Create a project just made, say. */
export const rememberFolderHandle = (dir: Handle): Promise<void> => remember(dir);

/** Forgets the folder, so no page opens it again until one is picked. */
export async function forgetFolderHandle(): Promise<void> {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete('workspace');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function recall(): Promise<Handle | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get('workspace');
      request.onsuccess = () => resolve((request.result as Handle) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
