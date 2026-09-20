// The studio library: the starter emails and the project types a folder carries of its own.
//
// Jared: "allows me to edit the default templates and create new ones", and "creating and editing the project
// start templates too". Both were arrays in code — `STARTERS` in app/starters-list.ts, `PROJECT_TYPES` in
// project-types.ts — so the only way to change them was to change the app.
//
// They are files now, in the project folder beside the design systems and the patterns it already holds
// (`.scug/starters/*.starter.json`, `.scug/project-types/*.type.json`). Three reasons that is the right home
// rather than this browser or a second "library" folder:
//   - It is the established grain. `design-systems/` and `patterns/` are already user-authored things kept per
//     folder, read by the same `toolFolders` walk, shared by the same Drive sync.
//   - It adds no second folder to pick, no second permission to re-grant, and no second place a design system
//     can live — which would be two copies of one idea, and this project keeps catching that bug.
//   - The code's own set stays as the floor, so the New menu and Create a project still work with nothing open.
// A team that wants one library for every project keeps one folder for it and opens that: the tool works on
// whatever folder is open, so that costs nothing and needs no new concept.
//
// Pure. The reading and writing is the workspace's.

import { newId } from './ids.ts';
import { SCHEMA_VERSION } from './schema.ts';
import type { ProjectType, StarterFrame, StarterGroup } from './project-types.ts';
import type { Template } from './types.ts';

// --- a starter email --------------------------------------------------------------------------------------

/**
 * A starter, as a file. A template with a name and a line about it — which is what `Starter` already is in the
 * app, minus the `make()`, because a file holds the email rather than a way of building one.
 */
export interface StarterFile {
  schema: number;
  id: string;
  name: string;
  /** One line, on hover: what you get. */
  summary: string;
  /** Bumped on every save, so two people editing one folder can see whose is newer (learnings 3.54). */
  version: number;
  template: Template;
}

/** Unique across a folder, so random rather than document-local. */
export const newStarterId = (): string => newId('st');

export function parseStarter(raw: unknown): StarterFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a starter file.');
  const s = raw as Partial<StarterFile>;
  if (typeof s.id !== 'string' || typeof s.name !== 'string' || !s.template || typeof s.template !== 'object') {
    throw new Error('Not a starter file: it needs an id, a name and a template.');
  }
  return {
    schema: typeof s.schema === 'number' ? s.schema : SCHEMA_VERSION,
    id: s.id,
    name: s.name,
    summary: typeof s.summary === 'string' ? s.summary : '',
    version: typeof s.version === 'number' ? s.version : 1,
    template: s.template as Template,
  };
}

// --- a project type ---------------------------------------------------------------------------------------

/**
 * A project type, as a file. The same shape `planProject` already takes, so nothing downstream changes: what
 * "Create a project" makes is still decided by a `ProjectType`, it is just no longer only ever a literal.
 */
export interface ProjectTypeFile {
  schema: number;
  version: number;
  type: ProjectType;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

const parseGroups = (v: unknown): StarterGroup[] =>
  Array.isArray(v)
    ? v.flatMap((g) => {
        const item = g as Partial<StarterGroup> | null;
        return item && typeof item.folder === 'string' && item.folder ? [{ folder: item.folder, note: typeof item.note === 'string' ? item.note : '' }] : [];
      })
    : [];

const parseFrames = (v: unknown): StarterFrame[] =>
  Array.isArray(v)
    ? v.flatMap((f) => {
        const item = f as Partial<StarterFrame> | null;
        if (!item || typeof item.name !== 'string' || !item.name) return [];
        const width = Math.round(Number(item.width));
        const height = Math.round(Number(item.height));
        if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return [];
        return [{ name: item.name, width, height }];
      })
    : [];

export function parseProjectType(raw: unknown): ProjectTypeFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a project type file.');
  const f = raw as Partial<ProjectTypeFile>;
  const t = (f.type ?? raw) as Partial<ProjectType>;
  if (typeof t.id !== 'string' || !t.id || typeof t.name !== 'string' || !t.name) {
    throw new Error('Not a project type file: it needs an id and a name.');
  }
  return {
    schema: typeof f.schema === 'number' ? f.schema : SCHEMA_VERSION,
    version: typeof f.version === 'number' ? f.version : 1,
    type: {
      id: t.id,
      name: t.name,
      blurb: typeof t.blurb === 'string' ? t.blurb : '',
      folders: isStringArray(t.folders) ? t.folders : ['assets'],
      groups: parseGroups(t.groups),
      frames: parseFrames(t.frames),
      emails: isStringArray(t.emails) ? t.emails : [],
    },
  };
}

// --- merging the folder's onto the code's -------------------------------------------------------------------

/**
 * The folder's items over the built-in ones, by id: a folder entry with a built-in's id replaces it, so a team
 * can retune "Switchyards email" without losing the name, and anything new is appended in the order the folder
 * gave. The built-ins are the floor and are never removed, because they are what works with nothing open.
 */
export function mergeById<T extends { id: string }>(builtIn: T[], folder: T[]): T[] {
  const out = builtIn.map((item) => folder.find((f) => f.id === item.id) ?? item);
  const seen = new Set(out.map((i) => i.id));
  for (const item of folder) if (!seen.has(item.id)) out.push(item);
  return out;
}

/** An id a folder file can carry: lowercase, hyphens, never empty, never colliding with one already taken. */
export function libraryId(name: string, taken: Iterable<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${used.size}`;
}
