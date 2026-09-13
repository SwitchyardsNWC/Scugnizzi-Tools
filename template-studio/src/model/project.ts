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

export type CardKind = 'email' | 'frame' | 'picture';

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

export const kindOfCard = (id: string): CardKind | null => {
  const kind = id.slice(0, id.indexOf(':'));
  return kind === 'email' || kind === 'frame' || kind === 'picture' ? kind : null;
};

/** One size per kind, so the layout never waits on a picture to load to know where things go. */
export const CARD_SIZE: Record<CardKind, { w: number; h: number }> = {
  email: { w: 260, h: 380 },
  frame: { w: 300, h: 250 },
  picture: { w: 220, h: 210 },
};

// --- board.json ---------------------------------------------------------------------------------------------

export interface BoardDoc {
  version: 1;
  /** Where each card's top left corner sits, by card id. */
  cards: Record<string, { x: number; y: number }>;
}

export const emptyBoard = (): BoardDoc => ({ version: 1, cards: {} });

/** The board, checked. Anything unreadable is an empty board: every card then finds a place again. */
export function readBoard(raw: string | null): BoardDoc {
  let value: Partial<BoardDoc> | null = null;
  try {
    value = raw ? (JSON.parse(raw) as Partial<BoardDoc>) : null;
  } catch {
    return emptyBoard();
  }
  const cards: BoardDoc['cards'] = {};
  if (value && value.version === 1 && value.cards && typeof value.cards === 'object') {
    for (const [id, at] of Object.entries(value.cards)) {
      const p = at as { x?: unknown; y?: unknown } | null;
      if (!kindOfCard(id) || typeof p?.x !== 'number' || typeof p?.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      cards[id] = { x: Math.round(p.x), y: Math.round(p.y) };
    }
  }
  return { version: 1, cards };
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

export interface BoardLayout {
  cards: PlacedCard[];
  /** Cards the board has a place for whose file has gone. */
  missing: MissingCard[];
  /** Ids of cards that had no place and were just given one. Saving the board keeps those places. */
  placed: string[];
}

export const CARD_GAP = 40;
const LANE_GAP = 120;
const COLUMNS = 5;
const KIND_ORDER: CardKind[] = ['email', 'frame', 'picture'];

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + CARD_GAP && b.x < a.x + a.w + CARD_GAP && a.y < b.y + b.h + CARD_GAP && b.y < a.y + a.h + CARD_GAP;

/**
 * Where every card goes. A card with a place keeps it. A card without one joins the others of its kind, in
 * the first free spot of a grid that starts at their top left; the first of a kind starts a lane of its own
 * below everything else. Emails, then frames, then pictures, each by name, so the same folder always lays
 * out the same way.
 */
export function layoutBoard(sources: CardSource[], board: BoardDoc): BoardLayout {
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

  const placed: string[] = [];
  for (const kind of KIND_ORDER) {
    const waiting = sources.filter((s) => s.kind === kind && !board.cards[s.id]).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (waiting.length === 0) continue;
    const { w, h } = CARD_SIZE[kind];
    const taken: Rect[] = [...cards, ...missing];
    const same: Rect[] = [...cards.filter((c) => c.kind === kind), ...missing.filter((m) => m.kind === kind)];
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
  return { cards, missing, placed };
}

/** The board with every laid-out card's place written down, so a card that just found one keeps it. */
export function withPlaces(board: BoardDoc, cards: PlacedCard[]): BoardDoc {
  let next = board;
  for (const card of cards) {
    const at = board.cards[card.id];
    if (!at || at.x !== card.x || at.y !== card.y) next = moveCard(next, card.id, card.x, card.y);
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
