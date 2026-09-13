// The Freeform app's frames: which there are, what they are called, which one is open, and each one's drawing.
//
// Jared, on what comes next: multiple freeform frames. Each frame is what the app always kept, a template
// holding one freeform block, under a key of its own. An index names them and says which one is open. The
// frame kept before there were frames becomes the first, under the key it always had, so every email block
// already following it still does.
//
// Pure, with the storage passed in, so the tests run on a Map and the project folder (docs/projects.md)
// can take the same place later without the app or the links changing.

import type { Template } from './types.ts';

/** The one frame kept before there were frames, and now the first frame's key. */
export const FREEFORM_APP_FRAME = 'scuggnizzi.freeform.v1';
export const FRAMES_INDEX = 'scuggnizzi.freeform.frames';
export const FRAME_PREFIX = 'scuggnizzi.freeform.frame.';

export interface FrameEntry {
  key: string;
  name: string;
  updatedAt: number;
}

export interface FrameIndex {
  version: 1;
  active: string;
  frames: FrameEntry[];
}

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The index, checked; null when there is none worth reading. */
export function readFrameIndex(raw: string | null): FrameIndex | null {
  let value: Partial<FrameIndex> | null = null;
  try {
    value = raw ? (JSON.parse(raw) as Partial<FrameIndex>) : null;
  } catch {
    return null;
  }
  if (!value || value.version !== 1 || !Array.isArray(value.frames)) return null;
  const seen = new Set<string>();
  const frames: FrameEntry[] = [];
  for (const f of value.frames as unknown[]) {
    const e = (f && typeof f === 'object' ? f : {}) as Partial<FrameEntry>;
    if (typeof e.key !== 'string' || !e.key.startsWith('scuggnizzi.freeform.') || seen.has(e.key)) continue;
    seen.add(e.key);
    frames.push({ key: e.key, name: (typeof e.name === 'string' ? e.name.trim().slice(0, 60) : '') || 'Frame', updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : 0 });
  }
  if (frames.length === 0) return null;
  const active = typeof value.active === 'string' && seen.has(value.active) ? value.active : frames[0]!.key;
  return { version: 1, active, frames };
}

const writeIndex = (store: KeyValue, index: FrameIndex): FrameIndex => {
  store.setItem(FRAMES_INDEX, JSON.stringify(index));
  return index;
};

/** A unique id for a new frame. */
export const newFrameId = (now = Date.now()): string => `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** "Frame 3": the next number no frame is already called. */
export function frameName(index: FrameIndex | null, base = 'Frame'): string {
  const taken = new Set((index?.frames ?? []).map((f) => f.name.toLowerCase()));
  let n = (index?.frames.length ?? 0) + 1;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

/**
 * The frames, set up on first use. An index whose frames have lost their drawings is tidied. A frame kept
 * before there were frames becomes the first one. With nothing at all, one empty frame is made.
 */
export function loadFrames(store: KeyValue, makeFrame: (name: string, id: string) => Template, now = Date.now()): FrameIndex {
  const index = readFrameIndex(store.getItem(FRAMES_INDEX));
  if (index) {
    const present = index.frames.filter((f) => store.getItem(f.key) !== null);
    if (present.length === index.frames.length) return index;
    if (present.length) return writeIndex(store, { ...index, frames: present, active: present.some((f) => f.key === index.active) ? index.active : present[0]!.key });
  }
  if (store.getItem(FREEFORM_APP_FRAME) !== null) {
    return writeIndex(store, { version: 1, active: FREEFORM_APP_FRAME, frames: [{ key: FREEFORM_APP_FRAME, name: 'Frame 1', updatedAt: now }] });
  }
  const id = newFrameId(now);
  const key = FRAME_PREFIX + id;
  store.setItem(key, JSON.stringify(makeFrame('Frame 1', id)));
  return writeIndex(store, { version: 1, active: key, frames: [{ key, name: 'Frame 1', updatedAt: now }] });
}

/** A new frame with its drawing, open. */
export function addFrame(store: KeyValue, index: FrameIndex, name: string, doc: Template, id: string, now = Date.now()): FrameIndex {
  const key = FRAME_PREFIX + id;
  store.setItem(key, JSON.stringify(doc));
  return writeIndex(store, { ...index, active: key, frames: [...index.frames, { key, name, updatedAt: now }] });
}

export function openFrame(store: KeyValue, index: FrameIndex, key: string): FrameIndex {
  if (index.active === key || !index.frames.some((f) => f.key === key)) return index;
  return writeIndex(store, { ...index, active: key });
}

export function renameFrame(store: KeyValue, index: FrameIndex, key: string, name: string, now = Date.now()): FrameIndex {
  const clean = name.trim().slice(0, 60);
  if (!clean || !index.frames.some((f) => f.key === key && f.name !== clean)) return index;
  return writeIndex(store, { ...index, frames: index.frames.map((f) => (f.key === key ? { ...f, name: clean, updatedAt: now } : f)) });
}

export interface RemovedFrame {
  entry: FrameEntry;
  doc: string | null;
  at: number;
}

/** Deletes a frame, keeping what is needed to bring it back. The last frame stays: there is always one to draw on. */
export function removeFrame(store: KeyValue, index: FrameIndex, key: string): { index: FrameIndex; removed: RemovedFrame | null } {
  const at = index.frames.findIndex((f) => f.key === key);
  if (at === -1 || index.frames.length <= 1) return { index, removed: null };
  const entry = index.frames[at]!;
  const doc = store.getItem(key);
  store.removeItem(key);
  const frames = index.frames.filter((f) => f.key !== key);
  const active = index.active === key ? frames[Math.min(at, frames.length - 1)]!.key : index.active;
  return { index: writeIndex(store, { ...index, frames, active }), removed: { entry, doc, at } };
}

/** Undoes a delete: the frame back where it was, with its drawing, open. */
export function restoreFrame(store: KeyValue, index: FrameIndex, removed: RemovedFrame): FrameIndex {
  if (removed.doc !== null) store.setItem(removed.entry.key, removed.doc);
  const frames = index.frames.filter((f) => f.key !== removed.entry.key);
  frames.splice(Math.min(removed.at, frames.length), 0, removed.entry);
  return writeIndex(store, { ...index, frames, active: removed.entry.key });
}

/**
 * A copy of a frame's drawing with ids of its own, so a hand-off to Riso from one frame can never land on
 * the other. The layers keep theirs: they only have to be unique within their block.
 */
export function copyFrameDoc(doc: Template, id: string, name: string): Template {
  return {
    ...doc,
    name,
    hubspotLabel: name,
    sections: doc.sections.map((s, si) => ({
      ...s,
      id: `${id}-s${si}`,
      rows: s.rows.map((r, ri) => ({
        ...r,
        id: `${id}-r${si}.${ri}`,
        columns: r.columns.map((c, ci) => ({ ...c, id: `${id}-c${si}.${ri}.${ci}`, blocks: c.blocks.map((b, bi) => ({ ...b, id: `${id}-b${si}.${ri}.${ci}.${bi}` })) })),
      })),
    })),
  };
}
