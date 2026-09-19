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

import { metaPath } from './layout.ts';
import type { ToolRecipe } from './tool-recipes.ts';
import type { Block, Template } from './types.ts';

/** In `.scug/` (model/layout.ts). The old layout kept them at the top of the project; folder.ts moves them. */
export const PROJECT_FILE = metaPath('project.json');
export const BOARD_FILE = metaPath('board.json');
export const LEGACY_PROJECT_FILE = 'project.json';
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
  /** Its own size when it has one, an email measured at its full length; otherwise `CARD_SIZE` for its kind. */
  size?: { w: number; h: number };
}

/** A card's size on the board: its own, or the one for its kind. */
export const cardSize = (card: Pick<CardSource, 'kind' | 'size'>): { w: number; h: number } => card.size ?? CARD_SIZE[card.kind];

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

/**
 * An email card tall enough for the whole email: the page's height, laid out `pageWidth` wide, scaled to the card's
 * width, under a title bar `head` tall. Jared: "Show the whole length of an email in this view." Never shorter than
 * a title bar and a line or two, whatever the page reported.
 */
export function emailCardSize(pageHeight: number, pageWidth: number, head: number): { w: number; h: number } {
  const w = CARD_SIZE.email.w;
  return { w, h: head + Math.max(40, Math.ceil((pageHeight * w) / pageWidth)) };
}

// --- board.json ---------------------------------------------------------------------------------------------

export interface BoardDoc {
  version: 1;
  /** Where each card's top left corner sits, by card id. */
  cards: Record<string, { x: number; y: number }>;
  /** Named regions of the board, each a folder under `assets/` (see groups, below). */
  groups: BoardGroup[];
  /** An editor's words left on the board, beside a card or on their own (see notes, below). */
  notes: BoardNote[];
}

/**
 * A note on the board. Jared: "add a 'notes' feature to the project board. so editor notes can be left next to
 * objects." It is the board's own, in board.json, so everyone who opens the folder reads it. Left on a card (`on`)
 * it moves with the card and a hairline joins the two; a card that goes leaves the note where it was.
 */
export interface BoardNote {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  /** What kind of note: an index into `NOTE_KINDS`, whose colour it wears. */
  color: number;
  /** The card it is left on, or null for one on its own. */
  on: string | null;
  /** On an email, the section it is about (its id), or null for the whole email. */
  part: string | null;
  /** When it was last written, ms since the epoch. */
  at: number;
  /** When it was resolved, ms since the epoch; 0 while it is open. Resolved on the board or in Template Studio. */
  resolvedAt: number;
  /** The thread under it, oldest first (Jared: "add a way to reply to the notes"). */
  replies: NoteReply[];
}

export interface NoteReply {
  id: string;
  text: string;
  /** When it was written, ms since the epoch. */
  at: number;
}

export const newReplyId = (): string => `reply:${Math.random().toString(36).slice(2, 10)}`;

/**
 * What a note's colour says. Jared: "colors, a purpose. yellow idea, green, move forward with; red, stop before
 * continuing." Plain paper for a note that is only a note.
 */
export const NOTE_KINDS: Array<{ id: string; name: string; meaning: string; color: string }> = [
  { id: 'note', name: 'Note', meaning: 'A note, nothing more', color: '#F5F1E4' },
  { id: 'idea', name: 'Idea', meaning: 'An idea to consider', color: '#FFE58A' },
  { id: 'go', name: 'Go', meaning: 'Agreed: move forward with this', color: '#CDEFC6' },
  { id: 'stop', name: 'Stop', meaning: 'Stop before continuing: this needs an answer', color: '#FFC9BF' },
];
export const NOTE_COLORS = NOTE_KINDS.map((k) => k.color);
export const noteKind = (note: Pick<BoardNote, 'color'>) => NOTE_KINDS[note.color] ?? NOTE_KINDS[0]!;
export const NOTE_WIDTH = 200;
const NOTE_TEXT_MAX = 4000;
export const NOTE_PREFIX = 'note:';
export const isNoteId = (id: string): boolean => id.startsWith(NOTE_PREFIX);
export const newNoteId = (): string => `${NOTE_PREFIX}${Math.random().toString(36).slice(2, 10)}`;

export const emptyBoard = (): BoardDoc => ({ version: 1, cards: {}, groups: [], notes: [] });

/** The board, checked. Anything unreadable is an empty board: every card then finds a place again. */
export function readBoard(raw: string | null): BoardDoc {
  type RawBoard = Partial<Omit<BoardDoc, 'groups' | 'notes'>> & { groups?: unknown; notes?: unknown };
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
  const notes: BoardNote[] = [];
  if (value && value.version === 1 && Array.isArray(value.notes)) {
    const ids = new Set<string>();
    for (const item of value.notes as unknown[]) {
      const n = (item && typeof item === 'object' ? item : {}) as Partial<Record<keyof BoardNote, unknown>>;
      if (typeof n.id !== 'string' || !isNoteId(n.id) || ids.has(n.id)) continue;
      if (typeof n.x !== 'number' || typeof n.y !== 'number' || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      ids.add(n.id);
      const w = typeof n.w === 'number' && Number.isFinite(n.w) ? Math.max(120, Math.min(480, Math.round(n.w))) : NOTE_WIDTH;
      const color = typeof n.color === 'number' && Number.isInteger(n.color) && n.color >= 0 && n.color < NOTE_COLORS.length ? n.color : 0;
      notes.push({
        id: n.id,
        text: typeof n.text === 'string' ? n.text.slice(0, NOTE_TEXT_MAX) : '',
        x: Math.round(n.x),
        y: Math.round(n.y),
        w,
        color,
        on: typeof n.on === 'string' && kindOfCard(n.on) ? n.on : null,
        part: typeof n.part === 'string' && n.part ? n.part : null,
        at: typeof n.at === 'number' && Number.isFinite(n.at) ? n.at : 0,
        resolvedAt: typeof n.resolvedAt === 'number' && Number.isFinite(n.resolvedAt) && n.resolvedAt > 0 ? n.resolvedAt : 0,
        replies: readReplies(n.replies),
      });
    }
  }
  return { version: 1, cards, groups, notes };
}

export const boardJson = (board: BoardDoc): string => `${JSON.stringify(board, null, 2)}\n`;

/** A card put somewhere. The notes left on it go with it, by the same distance, when it had a place before. */
export const moveCard = (board: BoardDoc, id: string, x: number, y: number): BoardDoc => {
  const to = { x: Math.round(x), y: Math.round(y) };
  const was = board.cards[id];
  const dx = was ? to.x - was.x : 0;
  const dy = was ? to.y - was.y : 0;
  const notes = dx || dy ? board.notes.map((n) => (n.on === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)) : board.notes;
  return { ...board, cards: { ...board.cards, [id]: to }, notes };
};

/** A card's place forgotten. A note left on it stays where it is, on its own from now on. */
export function forgetCard(board: BoardDoc, id: string): BoardDoc {
  if (!board.cards[id]) return board;
  const cards = { ...board.cards };
  delete cards[id];
  return { ...board, cards, notes: board.notes.map((n) => (n.on === id ? { ...n, on: null, part: null } : n)) };
}

// --- notes --------------------------------------------------------------------------------------------------

/** A note's replies as written, each checked; anything else is no reply. */
function readReplies(raw: unknown): NoteReply[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteReply[] = [];
  const ids = new Set<string>();
  for (const item of raw as unknown[]) {
    const r = (item && typeof item === 'object' ? item : {}) as Partial<Record<keyof NoteReply, unknown>>;
    if (typeof r.id !== 'string' || !r.id || ids.has(r.id) || typeof r.text !== 'string' || !r.text.trim()) continue;
    ids.add(r.id);
    out.push({ id: r.id, text: r.text.slice(0, NOTE_TEXT_MAX), at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0 });
  }
  return out;
}

export const addNote = (board: BoardDoc, note: BoardNote): BoardDoc => ({ ...board, notes: [...board.notes.filter((n) => n.id !== note.id), note] });

/** A reply under a note, at the end of its thread; nothing when the note is not there. */
export function addReply(board: BoardDoc, noteId: string, reply: NoteReply): BoardDoc {
  if (!reply.text.trim() || !board.notes.some((n) => n.id === noteId)) return board;
  return { ...board, notes: board.notes.map((n) => (n.id === noteId ? { ...n, replies: [...n.replies.filter((r) => r.id !== reply.id), reply] } : n)) };
}

export function removeReply(board: BoardDoc, noteId: string, replyId: string): BoardDoc {
  const note = board.notes.find((n) => n.id === noteId);
  if (!note || !note.replies.some((r) => r.id === replyId)) return board;
  return { ...board, notes: board.notes.map((n) => (n.id === noteId ? { ...n, replies: n.replies.filter((r) => r.id !== replyId) } : n)) };
}

export function updateNote(board: BoardDoc, id: string, patch: Partial<Omit<BoardNote, 'id'>>): BoardDoc {
  if (!board.notes.some((n) => n.id === id)) return board;
  return { ...board, notes: board.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

export const removeNote = (board: BoardDoc, id: string): BoardDoc => ({ ...board, notes: board.notes.filter((n) => n.id !== id) });

const SECTION_WORDS: Record<string, string> = {
  heading: 'Heading',
  richtext: 'Text',
  image: 'Image',
  button: 'Button',
  topbar: 'Top bar',
  stripes: 'Stripes',
  legal: 'Footer',
  freeform: 'Freeform',
  brand: 'Mark',
  spacer: 'Space',
  divider: 'Rule',
  dndarea: 'Drop area',
};

/**
 * Each section of an email, named for a note to point at: its number, what it is, and the first words in it.
 * "3. Heading: Big news: we're opening 2 more clubs", "6. Footer".
 */
export function sectionLabels(template: Template): Array<{ id: string; label: string }> {
  const words = (b: Block): string => {
    const raw = b.type === 'heading' || b.type === 'topbar' || b.type === 'button' ? b.text : b.type === 'richtext' ? b.html.replace(/<[^>]+>/g, ' ') : '';
    const flat = raw.replace(/&nbsp;|&amp;|&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
    return flat.length > 32 ? `${flat.slice(0, 31).trimEnd()}…` : flat;
  };
  return (template.sections ?? []).map((section, i) => {
    const blocks = (section.rows ?? []).flatMap((r) => (r.columns ?? []).flatMap((c) => c.blocks ?? []));
    const first = blocks[0];
    const spoken = blocks.find((b) => words(b));
    const what = section.domId === 'section-legal' ? 'Footer' : first ? (SECTION_WORDS[first.type] ?? first.type) : 'Empty';
    const said = spoken ? words(spoken) : '';
    return { id: section.id, label: `${i + 1}. ${what}${said ? `: ${said}` : ''}` };
  });
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
 * Where every card and group goes. A card with a place keeps it. A card without one that is linked to a card already
 * placed (the frame an email follows, a picture an email shows, the picture a print was made from) sits beside that
 * card: to its right, or below it, in the first free spot. Jared: "love the way files connect to each other. they
 * need to be grouped closer together." Otherwise it joins the others of its kind, in the first free spot of a grid
 * that starts at their top left; the first of a kind starts a lane of its own below everything else. Emails, then
 * documents, frames and pictures, each by name, so the same folder always lays out the same way.
 *
 * Pictures in a folder belong to that folder's group, and one without a place takes the first free spot inside it.
 * A folder with no group gets one, sized for its pictures, in a row below everything else; so does a folder in
 * `folders` with no pictures in it yet, so a project's starting folders and one made in Finder are on the board
 * before anything is filed in them. A group is drawn at least big enough to hold its members, wherever they have
 * been put.
 */
export function layoutBoard(sources: CardSource[], board: BoardDoc, folders: Iterable<string> = [], links: CardLink[] = []): BoardLayout {
  const present = new Set(sources.map((s) => s.id));
  const cards: PlacedCard[] = [];
  for (const source of sources) {
    const at = board.cards[source.id];
    if (at) cards.push({ ...source, ...cardSize(source), x: at.x, y: at.y });
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
    const taken: Rect[] = [...cards, ...missing, ...groups];
    const same: Rect[] = [...cards.filter((c) => c.kind === kind && !cardFolder(c)), ...missing.filter((m) => m.kind === kind)];
    const x0 = same.length ? Math.min(...same.map((c) => c.x)) : taken.length ? Math.min(...taken.map((c) => c.x)) : 0;
    const y0 = same.length ? Math.min(...same.map((c) => c.y)) : taken.length ? Math.max(...taken.map((c) => c.y + c.h)) + LANE_GAP : 0;
    let slot = 0;
    for (const source of waiting) {
      const { w, h } = cardSize(source);
      let spot = besideLinked(source.id, { w, h }, links, cards, taken);
      if (!spot) {
        let candidate: Rect;
        do {
          candidate = { x: x0 + (slot % COLUMNS) * (w + CARD_GAP), y: y0 + Math.floor(slot / COLUMNS) * (h + CARD_GAP), w, h };
          slot += 1;
        } while (taken.some((r) => overlaps(r, candidate)) && slot < 100_000);
        spot = candidate;
      }
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

const LINK_ORDER: Array<CardLink['kind']> = ['follows', 'uses', 'made'];

/**
 * A free spot beside the placed card this one is linked to, or null when it is linked to nothing that has a place.
 * The frame an email follows comes first, then what a card shows, then what it was made from. To the right of the
 * anchor first, then below it, then on along the row, so a family of files reads left to right.
 */
function besideLinked(id: string, size: { w: number; h: number }, links: CardLink[], placed: PlacedCard[], taken: Rect[]): Rect | null {
  const anchors = links
    .filter((l) => l.from === id || l.to === id)
    .sort((a, b) => LINK_ORDER.indexOf(a.kind) - LINK_ORDER.indexOf(b.kind))
    .map((l) => placed.find((c) => c.id === (l.from === id ? l.to : l.from)))
    .filter((c): c is PlacedCard => Boolean(c));
  for (const a of anchors) {
    const right = a.x + a.w + CARD_GAP;
    const below = a.y + a.h + CARD_GAP;
    const spots: Rect[] = [
      { x: right, y: a.y, ...size },
      { x: a.x, y: below, ...size },
      { x: right, y: below, ...size },
      ...[2, 3, 4].map((k) => ({ x: a.x + k * (size.w + CARD_GAP) + (a.w - size.w), y: a.y, ...size })),
      ...[2, 3].map((k) => ({ x: a.x, y: a.y + k * (size.h + CARD_GAP) + (a.h - size.h), ...size })),
    ];
    const free = spots.find((s) => !taken.some((r) => overlaps(r, s)));
    if (free) return free;
  }
  return null;
}

/** How wide a row of clusters may run before the next email starts a new row. */
const TIDY_ROW = 2400;

/**
 * The board laid out afresh, with the links in mind, as families (Jared: "bring all linked items close to each
 * other in an organized way with clear hierarchy"), and on the grid (Jared: "use the grid system to lock everything
 * into a nicely spaced grid"). Each email is a cluster: the email at the left, the frames it follows in a column to
 * its right, and beyond them the pictures the email and those frames show, with what those pictures were made from.
 * Clusters run in rows, emails by name, so the same folder always tidies the same way. Below the clusters, in a lane
 * per kind, everything no email holds: documents, frames and pictures on their own; and last the folders as groups,
 * their pictures inside, since a group is drawn around its members and a filed picture beside an email would stretch
 * its group across the board. Every edge lands on a multiple of `step`, gaps are the usual ones rounded up to it.
 * Groups keep their names. One deliberate step, undone as one.
 */
export function tidyBoard(sources: CardSource[], board: BoardDoc, folders: Iterable<string> = [], links: CardLink[] = [], step = 1): BoardDoc {
  const unit = Math.max(1, Math.round(step));
  /** `v`, or the next multiple of the grid step above it. */
  const grid = (v: number) => Math.ceil(v / unit) * unit;
  const gap = grid(CARD_GAP);
  const lane = grid(LANE_GAP);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const used = new Set<string>();
  const cards: PlacedCard[] = [];
  /** What feeds `id` by `kind`: the frames an email follows, the pictures an email or a frame shows, the picture a picture was made from. */
  const feeding = (id: string, kind: CardLink['kind']): CardSource[] =>
    links
      .filter((l) => l.kind === kind && l.to === id)
      .map((l) => byId.get(l.from))
      .filter((s): s is CardSource => Boolean(s))
      .sort(byName);
  /** Those of `list` that are `kind`, not yet placed, and (for pictures) not filed in a folder; taken, so a card joins one family only. */
  const take = (list: CardSource[], kind: CardKind): CardSource[] => {
    const out: CardSource[] = [];
    for (const s of list) {
      if (s.kind !== kind || used.has(s.id) || (kind === 'picture' && cardFolder(s))) continue;
      used.add(s.id);
      out.push(s);
    }
    return out;
  };
  const widest = (list: CardSource[]) => (list.length ? Math.max(...list.map((s) => cardSize(s).w)) : 0);
  /** A column of cards, each starting on the grid line after the one above it and a gap. */
  const stacked = (list: CardSource[]) => list.reduce((h, s, i) => h + (i ? grid(cardSize(list[i - 1]!).h + gap) : 0) + (i === list.length - 1 ? cardSize(s).h : 0), 0);

  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const email of sources.filter((s) => s.kind === 'email').sort(byName)) {
    used.add(email.id);
    const frames = take(feeding(email.id, 'follows'), 'frame');
    const shown = [...take(feeding(email.id, 'uses'), 'picture'), ...frames.flatMap((f) => take(feeding(f.id, 'uses'), 'picture'))];
    const pictures = [...shown, ...shown.flatMap((p) => take(feeding(p.id, 'made'), 'picture'))];
    const e = cardSize(email);
    const fw = widest(frames);
    const pw = widest(pictures);
    const w = grid(e.w + gap) + (fw ? grid(fw + gap) : 0) + (pw ? pw : fw ? -gap : -gap);
    const h = Math.max(e.h, stacked(frames), stacked(pictures));
    if (x > 0 && x + w > TIDY_ROW) {
      x = 0;
      y += grid(rowH + lane);
      rowH = 0;
    }
    cards.push({ ...email, ...e, x, y });
    const fx = x + grid(e.w + gap);
    let fy = y;
    for (const f of frames) {
      const s = cardSize(f);
      cards.push({ ...f, ...s, x: fx, y: fy });
      fy += grid(s.h + gap);
    }
    const px = fx + (fw ? grid(fw + gap) : 0);
    let py = y;
    for (const p of pictures) {
      const s = cardSize(p);
      cards.push({ ...p, ...s, x: px, y: py });
      py += grid(s.h + gap);
    }
    x += grid(w + lane);
    rowH = Math.max(rowH, h);
  }
  let below = cards.length ? grid(Math.max(...cards.map((c) => c.y + c.h)) + lane) : 0;

  // What no email holds, a lane per kind, on the grid.
  for (const kind of ['doc', 'frame', 'picture'] as CardKind[]) {
    const waiting = sources.filter((s) => s.kind === kind && !used.has(s.id) && !cardFolder(s)).sort(byName);
    if (waiting.length === 0) continue;
    let lx = 0;
    let ly = below;
    let laneH = 0;
    for (const s of waiting) {
      const size = cardSize(s);
      if (lx > 0 && lx + size.w > TIDY_ROW) {
        lx = 0;
        ly += grid(laneH + gap);
        laneH = 0;
      }
      cards.push({ ...s, ...size, x: lx, y: ly });
      used.add(s.id);
      lx += grid(size.w + gap);
      laneH = Math.max(laneH, size.h);
    }
    below = grid(ly + laneH + lane);
  }

  // The folders as groups, their pictures inside, moved as one onto the grid; names kept.
  const filed = sources.filter((s) => !used.has(s.id));
  const fresh = layoutBoard(filed, emptyBoard(), folders, links);
  const names = new Map(board.groups.map((g) => [g.folder, g.name]));
  const groups: BoardGroup[] = [];
  const inGroups: PlacedCard[] = [];
  for (const g of fresh.groups) {
    const gx = grid(g.x);
    const gy = below + grid(g.y);
    // The pictures inside on the grid too, each at its offset from the group's corner rounded up; the group grows to hold them.
    const members: PlacedCard[] = [];
    for (const id of g.members) {
      const m = fresh.cards.find((c) => c.id === id);
      if (m) members.push({ ...m, x: gx + grid(m.x - g.x), y: gy + grid(m.y - g.y) });
    }
    inGroups.push(...members);
    const w = grid(Math.max(g.w, ...members.map((m) => m.x + m.w + GROUP_PAD - gx)));
    const h = grid(Math.max(g.h, ...members.map((m) => m.y + m.h + GROUP_PAD - gy)));
    groups.push({ id: g.id, name: names.get(g.folder) ?? g.name, folder: g.folder, x: gx, y: gy, w, h });
  }
  const loose = fresh.cards.filter((c) => !inGroups.some((m) => m.id === c.id)).map((c) => ({ ...c, x: grid(c.x), y: below + grid(c.y) }));
  const all = [...cards, ...inGroups, ...loose];
  // A note left on a card goes where its card went; one on its own, or on a card that has gone, stays put.
  const notes = board.notes.map((n) => {
    const was = n.on ? board.cards[n.on] : undefined;
    const now = n.on ? all.find((c) => c.id === n.on) : undefined;
    return was && now ? { ...n, x: n.x + (now.x - was.x), y: n.y + (now.y - was.y) } : n;
  });
  return withPlaces({ ...emptyBoard(), notes }, all, groups);
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
