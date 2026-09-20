// The trash, as files in the project folder.
//
// One door in (`keepInTrash`) and one door out (`restoreFromTrash`), and nothing else in the app reads
// `.scug/trash/` — which is what keeps it from becoming a second place to look for a template or a picture.
// The rules about what stays are in model/trash.ts, which is pure and tested; this is the part that touches
// the disk.
//
// It lives in the workspace layer rather than beside the board's own folder helpers because both the board and
// Template Studio delete things, and a page should not have to reach across into another page's module to get
// its deletes onto the same footing.

import {
  newTrashId,
  parseTrashRecord,
  planSweep,
  restorePath,
  trashDataName,
  trashKindOf,
  trashRecordName,
  TRASH_CAPS,
  type TrashCaps,
  type TrashKind,
  type TrashRecord,
} from '../model/trash.ts';
import { META_DIR } from '../model/layout.ts';
import { SCHEMA_VERSION } from '../model/schema.ts';

type Dir = FileSystemDirectoryHandle;

export const TRASH_DIR = `${META_DIR}/trash`;
const PARTS = TRASH_DIR.split('/');

const split = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop() ?? '';
  return { parts, name };
};

async function childDir(dir: Dir, parts: string[], create = false): Promise<Dir | null> {
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

const trashDir = (dir: Dir, create = false) => childDir(dir, PARTS, create);

async function write(dir: Dir, path: string, data: string | Blob): Promise<void> {
  const { parts, name } = split(path);
  const folder = await childDir(dir, parts, true);
  if (!folder) throw new Error(`Could not make the folder for ${path}.`);
  const handle = await folder.getFileHandle(name, { create: true });
  const out = await handle.createWritable();
  await out.write(data);
  await out.close();
}

async function readFile(dir: Dir, path: string): Promise<File | null> {
  const { parts, name } = split(path);
  const folder = await childDir(dir, parts);
  if (!folder) return null;
  try {
    return await (await folder.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

async function remove(dir: Dir, path: string): Promise<void> {
  const { parts, name } = split(path);
  const folder = await childDir(dir, parts);
  if (!folder) return;
  try {
    await folder.removeEntry(name);
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'NotFoundError')) throw cause;
  }
}

/** Every record in the trash, newest first. A file that is not one is skipped rather than fatal. */
export async function readTrash(dir: Dir): Promise<TrashRecord[]> {
  const folder = await trashDir(dir);
  if (!folder) return [];
  const out: TrashRecord[] = [];
  for await (const [fileName, entry] of folder.entries()) {
    if (entry.kind !== 'file' || !fileName.endsWith('.trash.json')) continue;
    try {
      out.push(parseTrashRecord(JSON.parse(await (await (entry as FileSystemFileHandle).getFile()).text())));
    } catch {
      // Skipped, not fatal: one half-synced record must not take the whole list down.
    }
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt || a.id.localeCompare(b.id));
}

/** Throws away whatever is over the caps, and says how many went. Safe to call whenever the trash is touched. */
export async function sweepTrash(dir: Dir, now: number, caps: TrashCaps = TRASH_CAPS): Promise<number> {
  const { drop } = planSweep(await readTrash(dir), now, caps);
  for (const record of drop) await forgetTrashed(dir, record);
  return drop.length;
}

/**
 * A file into the trash, and off the disk where it was.
 *
 * Returns the record, or null when there was nothing at that path — a delete of something already gone is not
 * an error anywhere else either. The sweep runs after, so the caps are kept at the moment they are exceeded
 * rather than at some later opening.
 */
export async function keepInTrash(
  dir: Dir,
  path: string,
  options: { name?: string; kind?: TrashKind; now?: number; caps?: TrashCaps } = {},
): Promise<TrashRecord | null> {
  const file = await readFile(dir, path);
  if (!file) return null;
  const record = await keepBytesInTrash(dir, path, file, options);
  await remove(dir, path);
  return record;
}

/**
 * The same, for a caller that already holds the bytes and knows where they came from.
 *
 * The workspace's own delete walks the three places a template can sit and has the handle in its hand; making
 * it hand the path back only so this module could open the file again would be a second read for nothing.
 */
export async function keepBytesInTrash(
  dir: Dir,
  path: string,
  file: Blob,
  options: { name?: string; kind?: TrashKind; now?: number; caps?: TrashCaps } = {},
): Promise<TrashRecord | null> {
  const id = newTrashId();
  const record: TrashRecord = {
    schema: SCHEMA_VERSION,
    id,
    path,
    name: options.name ?? (path.split('/').pop() ?? path),
    kind: options.kind ?? trashKindOf(path),
    deletedAt: options.now ?? Date.now(),
    size: file.size,
  };
  await write(dir, `${TRASH_DIR}/${trashDataName(id)}`, file);
  await write(dir, `${TRASH_DIR}/${trashRecordName(id)}`, `${JSON.stringify(record, null, 2)}\n`);
  await sweepTrash(dir, record.deletedAt, options.caps);
  return record;
}

/** Both of a trashed thing's files, gone for good. */
export async function forgetTrashed(dir: Dir, record: TrashRecord): Promise<void> {
  await remove(dir, `${TRASH_DIR}/${trashDataName(record.id)}`);
  await remove(dir, `${TRASH_DIR}/${trashRecordName(record.id)}`);
}

/**
 * A trashed thing back where it came from, and out of the trash.
 *
 * `taken` is whatever is at that path now: a restore never writes over what took the old name, so it comes back
 * numbered instead and the caller says where it landed. Returns the path it went to, or null when the bytes are
 * gone — which can happen if somebody emptied the folder by hand between the list and the click.
 */
export async function restoreFromTrash(dir: Dir, record: TrashRecord): Promise<string | null> {
  const data = await readFile(dir, `${TRASH_DIR}/${trashDataName(record.id)}`);
  if (!data) {
    await forgetTrashed(dir, record);
    return null;
  }
  const at = await readFile(dir, record.path);
  const path = restorePath(record.path, at ? [record.path] : []);
  await write(dir, path, data);
  await forgetTrashed(dir, record);
  return path;
}

/** Everything in the trash, gone for good. */
export async function emptyTrash(dir: Dir): Promise<number> {
  const records = await readTrash(dir);
  for (const record of records) await forgetTrashed(dir, record);
  return records.length;
}
