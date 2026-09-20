// What a delete leaves behind, and what is swept away.
//
// Jared, on the board's missing-card note: "should deleted items go in an 'archive' so they can be restored?"
// Then: "build it, put a cap on how much trash stays in a project, so it doesn't accidentally become weight."
//
// Until now the only net under a delete was Undo, and Undo lives in memory: it holds the file's bytes in a
// closure and dies with the tab. Deleting an email and closing the browser lost it, from a folder a whole team
// shares. The project already admitted the gap in one place — it refuses to delete a Google Doc and points at
// Drive, "where the trash can give it back" — and had no equivalent of its own.
//
// So a delete moves the file into `.scug/trash/` instead of removing it, as two files: the bytes, and a record
// saying where they came from. Nothing reads that folder except the trash view. That is the whole reason it is
// safe: it is never a second place to look for a template or a picture, so it cannot become the two-copies bug
// this codebase keeps catching — it is a holding pen with one door in and one door out.
//
// Pure. The reading and writing is workspace/trash.ts.

import { newId } from './ids.ts';
import { SCHEMA_VERSION } from './schema.ts';

/** What a trashed thing was, for the list to say so. `file` is anything the tools do not name. */
export type TrashKind = 'email' | 'frame' | 'picture' | 'doc' | 'starter' | 'project-type' | 'system' | 'file';

export interface TrashRecord {
  schema: number;
  id: string;
  /** Where it was, relative to the project folder. Restore puts it back here. */
  path: string;
  /** What to call it in the list. */
  name: string;
  kind: TrashKind;
  /** ms since the epoch. */
  deletedAt: number;
  /** The bytes it takes, which is what the cap is spent on. */
  size: number;
}

/**
 * How much of a project the trash may be.
 *
 * Three caps rather than one, because each catches a different way of becoming weight: a folder nobody has
 * deleted from in months, one picture too many, and a thousand tiny frames. Bytes is the one that matters —
 * Jared's words were "so it doesn't accidentally become weight" — and forty megabytes is a handful of photos,
 * which is about as much of somebody's Drive as a safety net has any business taking.
 */
export const TRASH_CAPS = { days: 30, bytes: 40 * 1024 * 1024, count: 100 } as const;

export type TrashCaps = { days: number; bytes: number; count: number };

/** Unique across a folder, so random rather than document-local. */
export const newTrashId = (): string => newId('tr');

/** The two files one trashed thing is: the record, and the bytes beside it. */
export const trashRecordName = (id: string): string => `${id}.trash.json`;
export const trashDataName = (id: string): string => `${id}.data`;

export function parseTrashRecord(raw: unknown): TrashRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a trash record.');
  const r = raw as Partial<TrashRecord>;
  if (typeof r.id !== 'string' || !r.id || typeof r.path !== 'string' || !r.path) {
    throw new Error('Not a trash record: it needs an id and the path it came from.');
  }
  return {
    schema: typeof r.schema === 'number' ? r.schema : SCHEMA_VERSION,
    id: r.id,
    path: r.path,
    name: typeof r.name === 'string' && r.name ? r.name : (r.path.split('/').pop() ?? r.path),
    kind: KINDS.includes(r.kind as TrashKind) ? (r.kind as TrashKind) : 'file',
    deletedAt: typeof r.deletedAt === 'number' && Number.isFinite(r.deletedAt) ? r.deletedAt : 0,
    size: typeof r.size === 'number' && Number.isFinite(r.size) && r.size >= 0 ? r.size : 0,
  };
}

const KINDS: TrashKind[] = ['email', 'frame', 'picture', 'doc', 'starter', 'project-type', 'system', 'file'];

/** What the tools call a file at this path, so the list says "email" rather than the folder it sat in. */
export function trashKindOf(path: string): TrashKind {
  if (path.endsWith('.template.json') || path.endsWith('.design.json')) return 'email';
  if (path.endsWith('.frame.json')) return 'frame';
  if (path.endsWith('.system.json')) return 'system';
  if (path.endsWith('.starter.json')) return 'starter';
  if (path.endsWith('.type.json')) return 'project-type';
  if (path.endsWith('.link.json') || path.endsWith('.gdoc')) return 'doc';
  if (path.startsWith('assets/')) return 'picture';
  return 'file';
}

/**
 * What stays and what goes, so the trash keeps to its caps.
 *
 * Age first, because a month-old delete is not a mistake anybody is still fixing. Then newest first while the
 * bytes and the count allow, so the thing most likely to be wanted back is the last thing thrown away. A single
 * item larger than the whole cap is kept when it is the newest — a cap that silently ate the only copy of what
 * you just deleted would be worse than no cap at all — and swept as soon as anything newer arrives.
 */
export function planSweep(entries: TrashRecord[], now: number, caps: TrashCaps = TRASH_CAPS): { keep: TrashRecord[]; drop: TrashRecord[] } {
  const oldest = now - caps.days * 24 * 60 * 60 * 1000;
  const keep: TrashRecord[] = [];
  const drop: TrashRecord[] = [];
  let bytes = 0;
  const newestFirst = [...entries].sort((a, b) => b.deletedAt - a.deletedAt || a.id.localeCompare(b.id));
  for (const entry of newestFirst) {
    const tooOld = entry.deletedAt < oldest;
    const tooMany = keep.length >= caps.count;
    const tooBig = keep.length > 0 && bytes + entry.size > caps.bytes;
    if (tooOld || tooMany || tooBig) {
      drop.push(entry);
      continue;
    }
    keep.push(entry);
    bytes += entry.size;
  }
  return { keep, drop };
}

/**
 * Whole days before the sweep takes this one, so the list can warn rather than surprise.
 *
 * Rounded up, and floored at zero: a thing with four hours left has "1 day left" rather than "0", because a zero
 * next to something you might still want back reads as already gone.
 */
export const daysLeft = (record: TrashRecord, now: number, caps: TrashCaps = TRASH_CAPS): number =>
  Math.max(0, Math.ceil((record.deletedAt + caps.days * 24 * 60 * 60 * 1000 - now) / (24 * 60 * 60 * 1000)));

/** What the trash is taking right now, for the panel to say so. */
export const trashBytes = (entries: TrashRecord[]): number => entries.reduce((n, e) => n + e.size, 0);

/**
 * Where a restore puts a file back.
 *
 * Its own path, unless something is there now — a new file under the old name, or the same thing deleted and
 * remade. Then it comes back numbered, and the caller says so, rather than writing over whatever took its place.
 */
export function restorePath(path: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(path)) return path;
  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  // The whole tail of suffixes, so `a.template.json` becomes `a 2.template.json` rather than `a.template 2.json`.
  const dot = file.indexOf('.');
  const stem = dot === -1 ? file : file.slice(0, dot);
  const ext = dot === -1 ? '' : file.slice(dot);
  for (let n = 2; n < 1000; n += 1) {
    const tried = `${dir}${stem} ${n}${ext}`;
    if (!used.has(tried)) return tried;
  }
  return `${dir}${stem} ${used.size}${ext}`;
}
