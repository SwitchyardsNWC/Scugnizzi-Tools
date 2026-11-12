// What the pointer means over a block while a block is carried on the email canvas (src/app/drop-zones.ts).
//
// Jared: "dragging layers had issues with items getting auto-grouped, and sometimes I could not move them where I
// needed." Three quarters of every lone block meant "join its cell", which made a group. He chose the rule these
// tests hold (learnings 3.104): a drag never makes a group. The live canvas wiring was checked in the browser; this
// is the decision it delegates to.

import { describe, expect, it } from 'vitest';

import { blockZone, edgeOf, endsOf, type BlockUnder } from '../src/app/drop-zones.ts';

/** A 134px block, the size of the Switchyards email's second paragraph, at 222–356. */
const at = (y: number, over: Partial<BlockUnder> = {}): BlockUnder => ({ y, top: 222, bottom: 356, band: false, grouped: false, first: true, last: true, onto: false, ...over });
const sweep = (over: Partial<BlockUnder> = {}) => Array.from({ length: 134 }, (_, i) => blockZone(at(222 + i, over)));

describe('a drag never makes a group', () => {
  it('a block on its own is a section above or below it, by halves, from edge to edge', () => {
    const zones = sweep();
    expect(zones.every((z) => z.kind === 'section')).toBe(true);
    expect(blockZone(at(222))).toEqual({ kind: 'section', before: true });
    expect(blockZone(at(288))).toEqual({ kind: 'section', before: true });
    expect(blockZone(at(289))).toEqual({ kind: 'section', before: false });
    expect(blockZone(at(355))).toEqual({ kind: 'section', before: false });
  });

  it('a block that draws its own band is the same: halves, and no inside', () => {
    expect(blockZone(at(250, { band: true, grouped: true, first: false, last: false }))).toEqual({ kind: 'section', before: true });
    expect(blockZone(at(300, { band: true, grouped: true, first: false, last: false }))).toEqual({ kind: 'section', before: false });
  });
});

describe('a block that already shares a cell', () => {
  it('takes a block beside it in the middle — reordering the group, or joining it', () => {
    expect(blockZone(at(260, { grouped: true }))).toEqual({ kind: 'beside', before: true });
    expect(blockZone(at(320, { grouped: true }))).toEqual({ kind: 'beside', before: false });
  });

  it('still offers a section of its own at the open ends of the cell', () => {
    const edge = edgeOf(134);
    expect(edge).toBe(18);
    expect(blockZone(at(222 + edge - 1, { grouped: true }))).toEqual({ kind: 'section', before: true });
    expect(blockZone(at(356 - edge + 1, { grouped: true }))).toEqual({ kind: 'section', before: false });
  });

  it('has no section edge between two of its blocks', () => {
    const middle = { grouped: true, first: false, last: false };
    expect(sweep(middle).every((z) => z.kind === 'beside')).toBe(true);
  });
});

describe('a carried picture', () => {
  it('lands on an Image in its middle, wherever that Image sits', () => {
    expect(blockZone(at(289, { onto: true }))).toEqual({ kind: 'onto' });
    expect(blockZone(at(289, { onto: true, grouped: true }))).toEqual({ kind: 'onto' });
    expect(blockZone(at(230, { onto: true }))).toEqual({ kind: 'section', before: true });
  });
});

describe('the ends of a cell, without the block in your hand', () => {
  it('make its neighbour the end, so the group’s own edge offers the way out', () => {
    // Lift the first card of a group of three: the second is now first, and its top edge means "above the group".
    expect(endsOf(['a', 'b', 'c'], 'b', 'a')).toEqual({ first: true, last: false });
    expect(endsOf(['a', 'b', 'c'], 'b', 'c')).toEqual({ first: false, last: true });
    // Counting the carried block, as before, hid both.
    expect(endsOf(['a', 'b', 'c'], 'b', null)).toEqual({ first: false, last: false });
  });

  it('make a group of two, with one lifted, a cell of one: both ends open', () => {
    expect(endsOf(['a', 'b'], 'b', 'a')).toEqual({ first: true, last: true });
    const zones = Array.from({ length: 134 }, (_, i) => blockZone(at(222 + i, { grouped: true, ...endsOf(['a', 'b'], 'b', 'a') })));
    expect(zones[0]).toEqual({ kind: 'section', before: true });
    expect(zones[133]).toEqual({ kind: 'section', before: false });
  });
});
