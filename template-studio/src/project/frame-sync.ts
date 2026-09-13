// Freeform frames between this browser and a project's `frames/` folder.
//
// The rules are model/frame-file.ts's; this reads and writes the files and applies the result to the
// browser's store. The Freeform app runs it when a project opens and when it comes back into focus, and the
// project board runs it so frames drawn before the project existed are on the board from the first look.

import { FRAME_EXT, FRAMES_DIR, frameFileJson, frameFileName, planFrameSync, readFrameFile, type FrameFile } from '../model/frame-file.ts';
import { applyPulls, dropFrames, readFrames, tagFrames, type FrameIndex, type KeyValue } from '../model/frame-store.ts';
import type { Template } from '../model/types.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { childDir, removeFile, writeFile } from './folder.ts';

type Dir = FileSystemDirectoryHandle;

export interface FolderFrame extends FrameFile {
  fileName: string;
}

/** Every frame file in the project, by name. Two files claiming one frame (a copy made in Finder): the later save. */
export async function readFolderFrames(dir: Dir): Promise<FolderFrame[]> {
  const folder = await childDir(dir, [FRAMES_DIR]);
  if (!folder) return [];
  const byKey = new Map<string, FolderFrame>();
  for await (const [fileName, entry] of folder.entries()) {
    if (entry.kind !== 'file' || !fileName.endsWith(FRAME_EXT)) continue;
    try {
      const frame = readFrameFile(await (await (entry as FileSystemFileHandle).getFile()).text());
      if (!frame) continue;
      const other = byKey.get(frame.key);
      if (!other || other.savedAt < frame.savedAt) byKey.set(frame.key, { ...frame, fileName });
    } catch {
      // A file mid-sync or unreadable: the rest still count.
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Writes one frame's file. A renamed frame moves to a file named for it, and the old file goes. */
export async function writeFrame(dir: Dir, frame: FrameFile, folder: FolderFrame[]): Promise<FolderFrame> {
  const current = folder.find((f) => f.key === frame.key);
  const fileName = frameFileName(
    frame.name,
    folder.filter((f) => f.key !== frame.key).map((f) => f.fileName),
  );
  await writeFile(dir, `${FRAMES_DIR}/${fileName}`, frameFileJson(frame));
  if (current && current.fileName !== fileName) await removeFile(dir, `${FRAMES_DIR}/${current.fileName}`);
  return { ...frame, fileName };
}

/**
 * Pictures frames show that were kept only in this browser, from before there was a project: copied into
 * `assets/`, so the folder has everything its frames are drawn with. Returns the names written.
 */
export async function copyKeptPictures(dir: Dir, frames: FrameFile[], pictures: Array<{ path: string }>, kept: AssetFile[]): Promise<string[]> {
  const have = new Set(pictures.map((p) => p.path));
  const wanted = new Set<string>();
  for (const frame of frames)
    for (const section of frame.template.sections ?? [])
      for (const row of section.rows ?? [])
        for (const column of row.columns ?? [])
          for (const block of column.blocks ?? []) {
            if (block.type !== 'freeform') continue;
            for (const layer of block.layers ?? []) if (layer.kind === 'image' && layer.src && !have.has(layer.src)) wanted.add(layer.src);
          }
  const written: string[] = [];
  for (const name of wanted) {
    const picture = kept.find((k) => k.name === name);
    if (!picture || name.includes('/')) continue;
    try {
      await writeFile(dir, `assets/${name}`, await (await fetch(picture.url)).blob());
      written.push(name);
    } catch {
      // It stays in this browser, where the frame can still draw it.
    }
  }
  return written;
}

export async function deleteFrameFile(dir: Dir, key: string, folder: FolderFrame[]): Promise<void> {
  for (const f of folder) if (f.key === key) await removeFile(dir, `${FRAMES_DIR}/${f.fileName}`);
}

export interface FrameSyncResult {
  index: FrameIndex | null;
  folder: FolderFrame[];
  pulled: string[];
  pushed: string[];
  dropped: string[];
  /** Why writing stopped, when it did. */
  failed: string | null;
}

/**
 * Brings this browser's frames and the project's frame files together. Writes only when `writable`. Frames no
 * project has are taken in only when `adopt` is set (model/frame-file.ts).
 */
export async function syncFrames(dir: Dir, project: string, store: KeyValue, writable: boolean, adopt = true): Promise<FrameSyncResult> {
  let folder = await readFolderFrames(dir);
  let index = readFrames(store);
  const local = (index?.frames ?? []).filter((f) => store.getItem(f.key) !== null);
  const steps = planFrameSync(project, local, folder, adopt);
  const byKey = new Map(folder.map((f) => [f.key, f]));
  const keys = (op: string) => steps.filter((s) => s.op === op).map((s) => s.key);

  const pulls = keys('pull').flatMap((key) => byKey.get(key) ?? []);
  index = applyPulls(store, index, pulls, project);

  const pushed: string[] = [];
  let failed: string | null = null;
  if (writable && index) {
    for (const key of keys('push')) {
      const entry = index.frames.find((f) => f.key === key);
      const raw = store.getItem(key);
      if (!entry || raw === null) continue;
      try {
        const written = await writeFrame(dir, { key, name: entry.name, savedAt: entry.updatedAt, template: JSON.parse(raw) as Template }, folder);
        folder = [...folder.filter((f) => f.key !== key), written];
        pushed.push(key);
      } catch (cause) {
        failed = cause instanceof Error ? cause.message : 'A frame could not be written into the project folder.';
        break;
      }
    }
  }
  const dropped = keys('drop');
  if (index) {
    index = tagFrames(store, index, [...keys('tag'), ...pushed], project);
    index = dropFrames(store, index, dropped);
  }
  folder.sort((a, b) => a.name.localeCompare(b.name));
  return { index, folder, pulled: pulls.map((p) => p.key), pushed, dropped, failed };
}
