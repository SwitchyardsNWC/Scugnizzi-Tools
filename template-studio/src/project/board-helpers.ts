// Small pure helpers the board is made of: the view and its storage, sizes, wording, how a card opens, where
// groups and cards were for a step to put back, and the geometry of links and drops. Moved out of Board.tsx
// as they were (learnings 3.78).

import { DOC_OPENS_IN, docDisplayName, type DocKind } from '../model/docs.ts';
import { RECIPE_TOOLS, type ToolRecipe } from '../model/tool-recipes.ts';
import {
  addGroup,
  kindOfCard,
  moveCard,
  removeGroup,
  type BoardDoc,
  type BoardGroup,
  type CardKind,
  type PlacedCard,
  type PlacedGroup,
} from '../model/project.ts';

export type View = { x: number; y: number; z: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** The card's title bar. */
export const HEAD = 28;
/** The width an email is laid out at inside its card, a little wider than the email so its edges show. */
export const EMAIL_PAGE = 640;
export const clampZoom = (z: number) => Math.min(3, Math.max(0.05, z));

export const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
};
export const sizeOf = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Opens what a card is. Our own tools open here, in this tab (Jared, 2026-09-19: "when I open an item from the
 * project board, don't open it in a new window"); their back arrows lead to the board. A document that lives
 * elsewhere, a Google Doc, opens in a new tab, since it leaves the site and has no way back to it.
 */
export function openTool(url: string, elsewhere = false) {
  const href = new URL(url, window.location.href).href;
  if (elsewhere && window.open(href, '_blank')) return;
  window.location.href = href;
}

export function readView(key: string): View | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<View> | null;
    if (v && [v.x, v.y, v.z].every((n) => typeof n === 'number' && Number.isFinite(n))) return { x: v.x!, y: v.y!, z: clampZoom(v.z!) };
  } catch {
    // Nothing kept: the board fits itself.
  }
  return null;
}

export const KIND_LABEL: Record<CardKind, string> = { email: 'Email', frame: 'Frame', picture: 'Picture', doc: 'Document' };

/** A card's kind from its id, `picture` when the id is not one the board knows. */
export const kindOfCardOr = (id: string): CardKind => kindOfCard(id) ?? 'picture';

/** Where a group and the cards riding with it are, as the board stores them, for a step to put back. */
export interface Places {
  group: BoardGroup;
  cards: Record<string, { x: number; y: number }>;
}

export function placesOf(board: BoardDoc, group: PlacedGroup, cardIds: string[]): Places {
  const stored = board.groups.find((g) => g.id === group.id);
  const { id, name, folder, x, y, w, h } = stored ?? group;
  const cards: Places['cards'] = {};
  for (const cardId of cardIds) {
    const at = board.cards[cardId];
    if (at) cards[cardId] = at;
  }
  return { group: { id, name, folder, x, y, w, h }, cards };
}

export function restorePlaces(board: BoardDoc, places: Places): BoardDoc {
  let next = addGroup(removeGroup(board, places.group.id), places.group);
  for (const [cardId, at] of Object.entries(places.cards)) next = moveCard(next, cardId, at.x, at.y);
  return next;
}

export function openTitle(card: PlacedCard, madeBy: ToolRecipe | undefined, docKind: DocKind | undefined): string {
  if (card.kind === 'email') return 'Open in Template Studio';
  if (card.kind === 'frame') return 'Open in Freeform';
  if (card.kind === 'doc') return `Open in ${DOC_OPENS_IN[docKind ?? 'link']}`;
  if (madeBy) return `Open in ${RECIPE_TOOLS[madeBy.tool].name}, with the settings that made it`;
  return /\.svg$/i.test(card.id) ? 'Stamp it in Ink bleed' : 'Open in Riso';
}

export function missingName(id: string, kind: CardKind): string {
  const rest = id.slice(id.indexOf(':') + 1);
  if (kind === 'frame') return 'A frame';
  if (kind === 'doc') return docDisplayName(rest.split('/').pop() ?? rest);
  return rest.split('/').pop()?.replace(/\.(template|design)\.json$/, '') ?? rest;
}

/** A line from one card's side to the facing side of another, and its middle, where its verb sits. */
export function linkPath(a: Rect, b: Rect): { d: string; end: { x: number; y: number }; mid: { x: number; y: number } } {
  const rightward = a.x + a.w / 2 <= b.x + b.w / 2;
  const sx = rightward ? a.x + a.w : a.x;
  const sy = a.y + a.h / 2;
  const tx = rightward ? b.x : b.x + b.w;
  const ty = b.y + b.h / 2;
  const bend = Math.max(60, Math.abs(tx - sx) / 2) * (rightward ? 1 : -1);
  // With the two control points mirrored, the curve's midpoint is exactly halfway between the ends.
  return { d: `M${sx},${sy} C${sx + bend},${sy} ${tx - bend},${ty} ${tx},${ty}`, end: { x: tx, y: ty }, mid: { x: (sx + tx) / 2, y: (sy + ty) / 2 } };
}

/** The topmost card under a point that the dragged card can be put into: a picture into a frame or an email, a frame into an email. */
export function cardUnder(cards: PlacedCard[], p: { x: number; y: number }, dragged: PlacedCard): PlacedCard | null {
  const takes = (into: CardKind) => (dragged.kind === 'picture' ? into === 'frame' || into === 'email' : dragged.kind === 'frame' ? into === 'email' : false);
  for (let i = cards.length - 1; i >= 0; i -= 1) {
    const c = cards[i]!;
    if (c.id === dragged.id || !takes(c.kind)) continue;
    if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) return c;
  }
  return null;
}
