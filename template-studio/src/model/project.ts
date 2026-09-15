// A project: one folder every tool reads from and saves into, and the board that shows all of it at once.
//
// Jared: "add the project folder - this could be a new tool that starts linking all these projects
// together and can turn into the project canvas that brings everything to one endless canvas."
// (docs/projects.md: phase 0, and board phases B1 and B2.)
//
// The folder is the truth and the board is only a view of it. `board.json` says where each card sits and
// nothing else; the emails, frames and pictures stay where the folder keeps them. A file added in Finder
// or Drive gets a place of its own the next time the board looks, and a card whose file has gone is shown
// as missing rather than quietly losing its spot.
//
// Pure, so what the board shows for a folder is decided here and tested on plain data.

import type { ToolRecipe } from './tool-recipes.ts';
import type { Block, Template } from './types.ts';

export const PROJECT_FILE = 'project.json';
export const BOARD_FILE = 'board.json';
/** Pages on this site tell each other a project was opened or closed. */
export const PROJECT_CHANNEL = 'scuggnizzi.project';

// --- project.json -------------------------------------------------------------------------------------------

export interface ProjectInfo {
  version: 1;
  /** Stable for the life of the project, whatever the folder is renamed to. Frames remember it. */
  id: string;
  name: string;
  createdAt: number;
  /** The project type it was created as (model/project-types.ts). Absent for a folder opened as it was. */
  type?: string;
}

export function readProjectInfo(raw: string | null): ProjectInfo | null {
  let value: Partial<ProjectInfo> | null = null;
  try {
    value = raw ? (JSON.parse(raw) as Partial<ProjectInfo>) : null;
  } catch {
    return null;
  }
  if (!value || value.version !== 1 || typeof value.id !== 'string' || !value.id) return null;
  const info: ProjectInfo = {
    version: 1,
    id: value.id,
    name: (typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '') || 'Project',
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
  };
  if (typeof value.type === 'string' && value.type) info.type = value.type;
  return info;
}

export const newProjectInfo = (folderName: string, id: string, now = Date.now()): ProjectInfo => ({
  version: 1,
  id,
  name: folderName.trim().slice(0, 80) || 'Project',
  createdAt: now,
});

export const projectJson = (info: ProjectInfo): string => `${JSON.stringify(info, null, 2)}\n`;

// --- the launch file ------------------------------------------------------------------------------------------
//
// Jared: "is there a way to create a .scug file that lives in a project folder that when clicked on launches
// the dashboard in a browser."
//
// Every project folder gets `<name>.scug`. With the tools installed as a Chrome app, Finder opens the file
// with the app, and the Project page opens the project it names. The file carries the project's id, not its
// folder: a page can only reach a folder through a handle Chrome already stored for it, so the id is what the
// page looks the folder up by, and it asks for the folder once when it has never seen it.

export const LAUNCHER_EXT = '.scug';

export interface Launcher {
  version: 1;
  id: string;
  name: string;
  /** The Project page on the site that wrote it, for anyone who opens the file without the app. */
  open: string;
}

export const LAUNCHER_NOTE =
  'Double-click this file to open the project in Scugnizzi Tools. It works once the tools are installed as an app from Chrome: open the Project tool and choose Install.';

export const launcherJson = (info: ProjectInfo, open: string): string =>
  `${JSON.stringify({ scug: 1, id: info.id, name: info.name, open, note: LAUNCHER_NOTE }, null, 2)}\n`;

export function readLauncher(raw: string | null): Launcher | null {
  type Raw = { scug?: unknown; id?: unknown; name?: unknown; open?: unknown };
  let value: Raw | null = null;
  try {
    value = raw ? (JSON.parse(raw) as Raw) : null;
  } catch {
    return null;
  }
  if (!value || value.scug !== 1 || typeof value.id !== 'string' || !value.id) return null;
  return {
    version: 1,
    id: value.id,
    name: (typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '') || 'Project',
    open: typeof value.open === 'string' ? value.open : '',
  };
}

export const isLauncherFile = (fileName: string): boolean => fileName.toLowerCase().endsWith(LAUNCHER_EXT) && !fileName.startsWith('.');

/** `Spring launch.scug`: the project's name as a file name any file system takes. */
export function launcherFileName(name: string): string {
  const stem =
    name
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.]+|[\s.]+$/g, '')
      .slice(0, 80)
      .trim() || 'Project';
  return stem + LAUNCHER_EXT;
}

// --- cards --------------------------------------------------------------------------------------------------

export type CardKind = 'email' | 'frame' | 'picture' | 'doc';

/** Something in the folder the board shows. The id says what it is and where it lives. */
export interface CardSource {
  id: string;
  kind: CardKind;
  name: string;
}

export const emailCardId = (fileName: string) => `email:${fileName}`;
export const frameCardId = (key: string) => `frame:${key}`;
/** By its path under `assets/`, which is the name documents use for it. */
export const pictureCardId = (path: string) => `picture:${path}`;
/** A document (a Google Doc, Sheet or Slides file, or a link file) by its path in the project (model/docs.ts). */
export const docCardId = (path: string) => `doc:${path}`;

export const kindOfCard = (id: string): CardKind | null => {
  const kind = id.slice(0, id.indexOf(':'));
  return kind === 'email' || kind === 'frame' || kind === 'picture' || kind === 'doc' ? kind : null;
};

/** One size per kind, so the layout never waits on a picture to load to know where things go. */
export const CARD_SIZE: Record<CardKind, { w: number; h: number }> = {
  email: { w: 260, h: 380 },
  frame: { w: 300, h: 250 },
  picture: { w: 220, h: 210 },
  doc: { w: 240, h: 132 },
};

// --- board.json ---------------------------------------------------------------------------------------------

export interface BoardDoc {
  version: 1;
  /** Where each card's top left corner sits, by card id. */
  cards: Record<string, { x: number; y: number }>;
  /** Named regions of the board, each a folder under `assets/` (see groups, below). */
  groups: BoardGroup[];
}

export const emptyBoard = (): BoardDoc => ({ version: 1, cards: {}, groups: [] });

/** The board, checked. Anything unreadable is an empty board: every card then finds a place again. */
export function readBoard(raw: string | null): BoardDoc {
  type RawBoard = Partial<Omit<BoardDoc, 'groups'>> & { groups?: unknown };
  let value: RawBoard | null = null;
  try {
    value = raw ? (JSON.parse(raw) as RawBoard) : null;
  } catch {
    return emptyBoard();
  }
  const cards: BoardDoc['cards'] = {};
  const groups: BoardGroup[] = [];
  if (value && value.version === 1 && value.cards && typeof value.cards === 'object') {
    for (const [id, at] of Object.entries(value.cards)) {
      const p = at as { x?: unknown; y?: unknown } | null;
      if (!kindOfCard(id) || typeof p?.x !== 'number' || typeof p?.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      cards[id] = { x: Math.round(p.x), y: Math.round(p.y) };
    }
  }
  if (value && value.version === 1 && Array.isArray(value.groups)) {
    const ids = new Set<string>();
    const folders = new Set<string>();
    for (const item of value.groups as unknown[]) {
      const g = (item && typeof item === 'object' ? item : {}) as Partial<Record<keyof BoardGroup, unknown>>;
      if (typeof g.id !== 'string' || !g.id || ids.has(g.id) || !isGroupFolder(g.folder) || folders.has(g.folder)) continue;
      const [x, y, w, h] = [g.x, g.y, g.w, g.h];
      if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
      ids.add(g.id);
      folders.add(g.folder);
      const name = typeof g.name === 'string' ? g.name.trim().slice(0, 60) : '';
      groups.push(sizedGroup({ id: g.id, name: name || g.folder, folder: g.folder, x: x as number, y: y as number, w: w as number, h: h as number }));
    }
  }
  return { version: 1, cards, groups };
}

export const boardJson = (board: BoardDoc): string => `${JSON.stringify(board, null, 2)}\n`;

export const moveCard = (board: BoardDoc, id: string, x: number, y: number): BoardDoc => ({
  ...board,
  cards: { ...board.cards, [id]: { x: Math.round(x), y: Math.round(y) } },
});

export function forgetCard(board: BoardDoc, id: string): BoardDoc {
  if (!board.cards[id]) return board;
  const cards = { ...board.cards };
  delete cards[id];
  return { ...board, cards };
}

// --- layout -------------------------------------------------------------------------------------------------

export interface PlacedCard extends CardSource {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MissingCard {
  id: string;
  kind: CardKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

// --- groups -------------------------------------------------------------------------------------------------
//
// Jared, on the board: "Frames could be made for assets that can be used in tools. I make a frame and name it
// 'social media'." On the board that is a group, so it is not mistaken for a Freeform frame: a named region
// that is a folder under `assets/`. Membership is the folder, never the region: a picture is in Social media
// because its file is in `assets/social-media/`. Dropping a picture into a group moves its file there, and a
// folder made in Finder shows up as a group of its own. The region only says where the group sits and how big.

export interface BoardGroup {
  id: string;
  name: string;
  /** Its folder under `assets/`: one name, never a path. */
  folder: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const GROUP_HEAD = 48;
export const GROUP_PAD = 28;
const GROUP_COLUMNS = 4;
/** Room for one picture card and its margins. */
const GROUP_MIN = { w: GROUP_PAD * 2 + CARD_SIZE.picture.w, h: GROUP_HEAD + CARD_SIZE.picture.h + GROUP_PAD };

/** A folder a group can own under `assets/`: one name, not hidden, not Template Studio's `rendered`. */
export const isGroupFolder = (name: unknown): name is string =>
  typeof name === 'string' && name.length > 0 && name.length <= 80 && !/[\\/]/.test(name) && !name.startsWith('.') && name !== 'rendered';

/** `social-media/photo.png` → `social-media`; null for a picture straight in `assets/`. */
export const folderOfPicture = (path: string): string | null => {
  const slash = path.indexOf('/');
  return slash > 0 ? path.slice(0, slash) : null;
};

/** "Social media" → `social-media`, or `social-media-2` when another group or folder has that. */
export function groupFolderName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  const slug =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'group';
  const base = slug === 'rendered' ? 'rendered-group' : slug;
  let folder = base;
  for (let n = 2; used.has(folder); n += 1) folder = `${base}-${n}`;
  return folder;
}

function sizedGroup(g: BoardGroup): BoardGroup {
  return { ...g, x: Math.round(g.x), y: Math.round(g.y), w: Math.round(Math.max(GROUP_MIN.w, g.w)), h: Math.round(Math.max(GROUP_MIN.h, g.h)) };
}

export const addGroup = (board: BoardDoc, group: BoardGroup): BoardDoc => ({
  ...board,
  groups: [...board.groups.filter((g) => g.id !== group.id && g.folder !== group.folder), sizedGroup(group)],
});

export function updateGroup(board: BoardDoc, id: string, patch: Partial<Pick<BoardGroup, 'name' | 'x' | 'y' | 'w' | 'h'>>): BoardDoc {
  if (!board.groups.some((g) => g.id === id)) return board;
  return {
    ...board,
    groups: board.groups.map((g) => (g.id === id ? sizedGroup({ ...g, ...patch, name: (patch.name ?? g.name).trim().slice(0, 60) || g.name }) : g)),
  };
}

export const removeGroup = (board: BoardDoc, id: string): BoardDoc => ({ ...board, groups: board.groups.filter((g) => g.id !== id) });

/**
 * A group moved, and the cards riding along with it. `group` is the group as laid out, so a group the board has
 * only drawn for a folder, and never stored, is stored where it was moved to.
 */
export function moveGroupWith(board: BoardDoc, group: BoardGroup, dx: number, dy: number, cardIds: string[]): BoardDoc {
  const { id, name, folder, x, y, w, h } = group;
  let next = addGroup(board, { id, name, folder, x: x + dx, y: y + dy, w, h });
  for (const cardId of cardIds) {
    const at = next.cards[cardId];
    if (at) next = moveCard(next, cardId, at.x + dx, at.y + dy);
  }
  return next;
}

/** The topmost group under a point on the board. */
export function groupAt<T extends { x: number; y: number; w: number; h: number }>(groups: T[], x: number, y: number): T | null {
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const g = groups[i]!;
    if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return g;
  }
  return null;
}

// --- layout -------------------------------------------------------------------------------------------------

export interface PlacedGroup extends BoardGroup {
  /** The cards whose files are in its folder. The group is drawn at least big enough to hold them. */
  members: string[];
}

export interface BoardLayout {
  cards: PlacedCard[];
  /** Cards the board has a place for whose file has gone. */
  missing: MissingCard[];
  /** Ids of cards that had no place and were just given one. Saving the board keeps those places. */
  placed: string[];
  groups: PlacedGroup[];
  /** Ids of groups just made for folders the board had no group for. Saving the board keeps them. */
  groupsPlaced: string[];
}

export const CARD_GAP = 40;
const LANE_GAP = 120;
const COLUMNS = 5;
const KIND_ORDER: CardKind[] = ['email', 'doc', 'frame', 'picture'];
const PICTURE = 'picture:';

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + CARD_GAP && b.x < a.x + a.w + CARD_GAP && a.y < b.y + b.h + CARD_GAP && b.y < a.y + a.h + CARD_GAP;
const byName = (a: CardSource, b: CardSource) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** The group folder a card belongs to: a picture's folder under `assets/`, when it is one a group can own. */
export function cardFolder(card: { id: string; kind: CardKind }): string | null {
  if (card.kind !== 'picture') return null;
  const folder = folderOfPicture(card.id.slice(PICTURE.length));
  return isGroupFolder(folder) ? folder : null;
}

/**
 * Where every card and group goes. A card with a place keeps it. A card without one joins the others of its kind,
 * in the first free spot of a grid that starts at their top left; the first of a kind starts a lane of its own below
 * everything else. Emails, then frames, then pictures, each by name, so the same folder always lays out the same way.
 *
 * Pictures in a folder belong to that folder's group, and one without a place takes the first free spot inside it.
 * A folder with no group gets one, sized for its pictures, in a row below everything else; so does a folder in
 * `folders` with no pictures in it yet, so a project's starting folders and one made in Finder are on the board
 * before anything is filed in them. A group is drawn at least big enough to hold its members, wherever they have
 * been put.
 */
export function layoutBoard(sources: CardSource[], board: BoardDoc, folders: Iterable<string> = []): BoardLayout {
  const present = new Set(sources.map((s) => s.id));
  const cards: PlacedCard[] = [];
  for (const source of sources) {
    const at = board.cards[source.id];
    if (at) cards.push({ ...source, ...CARD_SIZE[source.kind], x: at.x, y: at.y });
  }
  const missing: MissingCard[] = [];
  for (const [id, at] of Object.entries(board.cards)) {
    const kind = kindOfCard(id);
    if (!present.has(id) && kind) missing.push({ id, kind, x: at.x, y: at.y, ...CARD_SIZE[kind] });
  }
  const groups: BoardGroup[] = (board.groups ?? []).map((g) => ({ ...g }));

  // Cards in no group, in lanes that keep clear of the groups.
  const placed: string[] = [];
  for (const kind of KIND_ORDER) {
    const waiting = sources.filter((s) => s.kind === kind && !board.cards[s.id] && !cardFolder(s)).sort(byName);
    if (waiting.length === 0) continue;
    const { w, h } = CARD_SIZE[kind];
    const taken: Rect[] = [...cards, ...missing, ...groups];
    const same: Rect[] = [...cards.filter((c) => c.kind === kind && !cardFolder(c)), ...missing.filter((m) => m.kind === kind)];
    const x0 = same.length ? Math.min(...same.map((c) => c.x)) : taken.length ? Math.min(...taken.map((c) => c.x)) : 0;
    const y0 = same.length ? Math.min(...same.map((c) => c.y)) : taken.length ? Math.max(...taken.map((c) => c.y + c.h)) + LANE_GAP : 0;
    let slot = 0;
    for (const source of waiting) {
      let spot: Rect;
      do {
        spot = { x: x0 + (slot % COLUMNS) * (w + CARD_GAP), y: y0 + Math.floor(slot / COLUMNS) * (h + CARD_GAP), w, h };
        slot += 1;
      } while (taken.some((r) => overlaps(r, spot)) && slot < 100_000);
      const card = { ...source, ...spot };
      cards.push(card);
      taken.push(card);
      placed.push(source.id);
    }
  }

  // A group for every folder that has none, sized for its pictures.
  const groupsPlaced: string[] = [];
  const wanted = [...new Set([...sources.map(cardFolder), ...[...folders].map((f) => (isGroupFolder(f) ? f : null))].filter((f): f is string => f !== null))].sort();
  let row: { x: number; y: number } | null = null;
  for (const folder of wanted) {
    if (groups.some((g) => g.folder === folder)) continue;
    if (!row) {
      const taken: Rect[] = [...cards, ...missing, ...groups];
      row = { x: taken.length ? Math.min(...taken.map((r) => r.x)) : 0, y: taken.length ? Math.max(...taken.map((r) => r.y + r.h)) + LANE_GAP : 0 };
    }
    const count = sources.filter((s) => cardFolder(s) === folder).length;
    const cols = Math.min(Math.max(count, 1), GROUP_COLUMNS);
    const rows = Math.max(1, Math.ceil(count / GROUP_COLUMNS));
    const { w: pw, h: ph } = CARD_SIZE.picture;
    let id = `group:${folder}`;
    for (let n = 2; groups.some((g) => g.id === id); n += 1) id = `group:${folder}-${n}`;
    const group = sizedGroup({ id, name: folder, folder, x: row.x, y: row.y, w: GROUP_PAD * 2 + cols * pw + (cols - 1) * CARD_GAP, h: GROUP_HEAD + rows * ph + (rows - 1) * CARD_GAP + GROUP_PAD });
    groups.push(group);
    groupsPlaced.push(id);
    row.x += group.w + LANE_GAP;
  }

  // Pictures without a place, inside their group.
  for (const group of groups) {
    const waiting = sources.filter((s) => cardFolder(s) === group.folder && !board.cards[s.id]).sort(byName);
    if (waiting.length === 0) continue;
    const { w, h } = CARD_SIZE.picture;
    const cols = Math.max(1, Math.floor((group.w - GROUP_PAD * 2 + CARD_GAP) / (w + CARD_GAP)));
    const taken: Rect[] = [...cards, ...missing];
    let slot = 0;
    for (const source of waiting) {
      let spot: Rect;
      do {
        spot = { x: group.x + GROUP_PAD + (slot % cols) * (w + CARD_GAP), y: group.y + GROUP_HEAD + Math.floor(slot / cols) * (h + CARD_GAP), w, h };
        slot += 1;
      } while (taken.some((r) => overlaps(r, spot)) && slot < 100_000);
      const card = { ...source, ...spot };
      cards.push(card);
      taken.push(card);
      placed.push(source.id);
    }
  }

  const placedGroups: PlacedGroup[] = groups.map((group) => {
    const members = cards.filter((c) => cardFolder(c) === group.folder);
    let [x0, y0, x1, y1] = [group.x, group.y, group.x + group.w, group.y + group.h];
    for (const m of members) {
      x0 = Math.min(x0, m.x - GROUP_PAD);
      y0 = Math.min(y0, m.y - GROUP_HEAD);
      x1 = Math.max(x1, m.x + m.w + GROUP_PAD);
      y1 = Math.max(y1, m.y + m.h + GROUP_PAD);
    }
    return { ...group, x: x0, y: y0, w: x1 - x0, h: y1 - y0, members: members.map((m) => m.id) };
  });

  return { cards, missing, placed, groups: placedGroups, groupsPlaced };
}

/**
 * The board with every laid-out card's place written down, so a card that just found one keeps it, and, when
 * `groups` is given, the groups as laid out, so a group just made for a folder is kept too.
 */
export function withPlaces(board: BoardDoc, cards: PlacedCard[], groups?: BoardGroup[]): BoardDoc {
  let next = board;
  for (const card of cards) {
    const at = board.cards[card.id];
    if (!at || at.x !== card.x || at.y !== card.y) next = moveCard(next, card.id, card.x, card.y);
  }
  if (groups) {
    const stored = groups.map(({ id, name, folder, x, y, w, h }) => sizedGroup({ id, name, folder, x, y, w, h }));
    if (JSON.stringify(stored) !== JSON.stringify(board.groups)) next = { ...next, groups: stored };
  }
  return next;
}

// --- links --------------------------------------------------------------------------------------------------

export interface CardLink {
  from: string;
  to: string;
  /**
   * `follows`: an email's freeform block is drawn in that frame. `uses`: a picture appears in it. `made`: a tool made
   * this picture from that one (model/tool-recipes.ts).
   */
  kind: 'follows' | 'uses' | 'made';
}

function* blocksOf(template: Template): Generator<Block> {
  for (const section of template.sections ?? []) for (const row of section.rows ?? []) for (const column of row.columns ?? []) yield* column.blocks ?? [];
}

/**
 * What in the project is made from what: the frames an email's blocks follow, and the pictures emails and
 * frames show. A block that follows a frame carries copies of the frame's layers, so its pictures are the
 * frame's to link, not the email's.
 */
export function projectLinks(
  emails: Array<{ id: string; template: Template }>,
  frames: Array<{ id: string; key: string; template: Template }>,
  pictures: Array<{ id: string; path: string }>,
  recipes: ToolRecipe[] = [],
): CardLink[] {
  const frameByKey = new Map(frames.map((f) => [f.key, f.id]));
  const pictureByPath = new Map(pictures.map((p) => [p.path, p.id]));
  const out: CardLink[] = [];
  const seen = new Set<string>();
  const add = (from: string | undefined, to: string | undefined, kind: CardLink['kind']) => {
    if (!from || !to || from === to || seen.has(`${from}>${to}`)) return;
    seen.add(`${from}>${to}`);
    out.push({ from, to, kind });
  };
  for (const holder of [...emails, ...frames]) {
    for (const block of blocksOf(holder.template)) {
      if (block.type === 'image') add(pictureByPath.get(block.src), holder.id, 'uses');
      if (block.type !== 'freeform') continue;
      const followed = block.source?.app === 'freeform' ? frameByKey.get(block.source.key) : undefined;
      if (followed) {
        add(followed, holder.id, 'follows');
        continue;
      }
      for (const layer of block.layers ?? []) if (layer.kind === 'image') add(pictureByPath.get(layer.src), holder.id, 'uses');
    }
  }
  for (const recipe of recipes) for (const source of recipe.sources) add(pictureByPath.get(source), pictureByPath.get(recipe.output), 'made');
  return out;
}
