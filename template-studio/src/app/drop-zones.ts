// What the pointer means over a block while a block is carried on the email canvas.
//
// Jared, 2026-11-11: "dragging layers had issues with items getting auto-grouped, and sometimes I could not move
// them where I needed." Measured on the Switchyards email: three quarters of every block's height meant "join this
// block's cell", which makes a group, and an 18px strip at each end meant "a section of its own". He chose the
// rule here (learnings 3.104): **a drag never makes a group.** Over a block on its own, the halves are a section
// above or below it. Over a block that already shares a cell — a group, or a column of a row — the inside is a
// place to land, because joining or reordering there is what the drag is for. A new group is ⌘G on a selection.
//
// Geometry in, a decision out, so the rule can be tested without a browser. `Preview.tsx` measures the live
// document and draws the indicator; nothing here knows about markup.

export type Zone =
  /** A full-width section of its own, above or below the band the block is in. */
  | { kind: 'section'; before: boolean }
  /** In the block's own cell, above or below it: reordering a group, or joining one that already exists. */
  | { kind: 'beside'; before: boolean }
  /** The block itself: a carried picture replacing an Image's. */
  | { kind: 'onto' };

export interface BlockUnder {
  /** The pointer and the block's edges, in one coordinate space. */
  y: number;
  top: number;
  bottom: number;
  /** Draws its own band, so it has no inside at all. */
  band: boolean;
  /** Already shares a cell — a group, or a column of a row of columns. */
  grouped: boolean;
  /** First and last among its cell's blocks, counted without the one being carried (`endsOf`). */
  first: boolean;
  last: boolean;
  /** A carried picture may land on it. */
  onto: boolean;
}

/** The strip at a group's open ends that means "out of it": a quarter of the block, kept between 8 and 18px. */
export const edgeOf = (height: number): number => Math.min(18, Math.max(8, height * 0.28));

export function blockZone(b: BlockUnder): Zone {
  const height = Math.max(0, b.bottom - b.top);
  const upper = b.y < b.top + height / 2;
  if (b.band) return { kind: 'section', before: upper };
  const middle = height * 0.3;
  if (b.onto && b.y > b.top + middle && b.y < b.bottom - middle) return { kind: 'onto' };
  // On its own, a block has no inside to offer: the whole of it is "above" or "below".
  if (!b.grouped) return { kind: 'section', before: upper };
  const edge = edgeOf(height);
  if (b.first && b.y < b.top + edge) return { kind: 'section', before: true };
  if (b.last && b.y > b.bottom - edge) return { kind: 'section', before: false };
  return { kind: 'beside', before: upper };
}

/**
 * Whether a block is the first and the last of its cell, leaving out the one in your hand.
 *
 * Counting the carried block made a group's own ends unreachable from inside it: lift the first card of a group
 * and the block under it was never "first", so the edge that means "out, above" was never offered there.
 */
export function endsOf(siblings: string[], blockId: string, carried: string | null): { first: boolean; last: boolean } {
  const others = siblings.filter((id) => id !== carried);
  return { first: others[0] === blockId, last: others[others.length - 1] === blockId };
}
