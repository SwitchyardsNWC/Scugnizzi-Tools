// A Freeform frame as a file in a project folder: `frames/<name>.frame.json`.
//
// Jared: "add the project folder - this could be a new tool that starts linking all these projects
// together". Frames were kept only in this browser's storage (model/frame-store.ts). In a project they are
// files as well, so a synced folder carries them to the team and the project board can show them.
//
// The browser's copy stays the working copy. It is instant, it is what an open Template Studio follows
// through storage events, and it keeps a frame safe while the folder is out of reach. Which copy wins is
// decided here, one frame at a time, from when each was last saved.
//
// Pure: the files are read and written by src/project/frame-sync.ts.

import type { Template } from './types.ts';

export const FRAMES_DIR = 'frames';
export const FRAME_EXT = '.frame.json';
const KIND = 'scuggnizzi.freeform-frame';

export interface FrameFile {
  /** The key the frame is kept under in the browser, and the one an email block's link names. It never changes. */
  key: string;
  name: string;
  /** When the drawing was last changed, wherever that was. The later of two copies wins. */
  savedAt: number;
  template: Template;
}

export function frameFileJson(frame: FrameFile): string {
  const file = { version: 1, kind: KIND, key: frame.key, name: frame.name, savedAt: frame.savedAt, template: frame.template };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function hasFreeform(template: Template): boolean {
  for (const section of Array.isArray(template.sections) ? template.sections : [])
    for (const row of Array.isArray(section?.rows) ? section.rows : [])
      for (const column of Array.isArray(row?.columns) ? row.columns : [])
        for (const block of Array.isArray(column?.blocks) ? column.blocks : []) if (block?.type === 'freeform') return true;
  return false;
}

/** A frame file, checked; null for anything else, including a half-written one. */
export function readFrameFile(text: string): FrameFile | null {
  let raw: Record<string, unknown> | null = null;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || raw['version'] !== 1 || raw['kind'] !== KIND) return null;
  const { key, name, savedAt, template } = raw;
  if (typeof key !== 'string' || !key.startsWith('scuggnizzi.freeform.')) return null;
  if (!template || typeof template !== 'object' || !hasFreeform(template as Template)) return null;
  return {
    key,
    name: (typeof name === 'string' ? name.trim().slice(0, 60) : '') || 'Frame',
    savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : 0,
    template: template as Template,
  };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'frame';

/** "Social media" → `social-media.frame.json`, or `social-media-2.frame.json` when another frame has that name. */
export function frameFileName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  const base = slug(name);
  let file = `${base}${FRAME_EXT}`;
  for (let n = 2; used.has(file); n += 1) file = `${base}-${n}${FRAME_EXT}`;
  return file;
}

// --- which copy wins ----------------------------------------------------------------------------------------

/** A frame in this browser, as the frame index lists it. `project` is set once its file is in that project's folder. */
export interface LocalFrameState {
  key: string;
  updatedAt: number;
  project?: string;
}

export interface FolderFrameState {
  key: string;
  savedAt: number;
}

export type FrameSyncStep =
  /** The folder's copy is newer, or this browser has never had the frame: take it. */
  | { op: 'pull'; key: string }
  /** This browser's copy is newer, or has never been in the folder: write it. */
  | { op: 'push'; key: string }
  /** Both copies are the same save; mark the frame as the project's. */
  | { op: 'tag'; key: string }
  /** The frame was in this project's folder and its file has gone: someone deleted it there. */
  | { op: 'drop'; key: string };

/**
 * What to do with each frame to bring this browser and a project's folder together.
 *
 * A frame in this browser that belongs to another project is left alone, so opening a second project does
 * not pour the first one's frames into it. A frame that belongs to no project yet, drawn before any folder
 * was open, is written into this one when `adopt` is set: it is where the work now lives. A project made
 * fresh from a type does not adopt, so it starts with its own frames and nothing else.
 */
export function planFrameSync(project: string, local: LocalFrameState[], folder: FolderFrameState[], adopt = true): FrameSyncStep[] {
  const steps: FrameSyncStep[] = [];
  const mine = new Map(local.map((f) => [f.key, f]));
  const there = new Set(folder.map((f) => f.key));
  for (const file of folder) {
    const here = mine.get(file.key);
    if (!here || here.updatedAt < file.savedAt) steps.push({ op: 'pull', key: file.key });
    else if (here.updatedAt > file.savedAt) steps.push({ op: 'push', key: file.key });
    else if (here.project !== project) steps.push({ op: 'tag', key: file.key });
  }
  for (const here of local) {
    if (there.has(here.key)) continue;
    if (here.project === project) steps.push({ op: 'drop', key: here.key });
    else if (!here.project && adopt) steps.push({ op: 'push', key: here.key });
  }
  return steps;
}
