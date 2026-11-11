import { describe, expect, it } from 'vitest';

import { BOARD_GAP, boardBounds, frameAt, placeOnBoard, viewAcross } from '../src/model/board.ts';
import { placeFrames, readFrameIndex, type KeyValue } from '../src/model/frame-store.ts';

const memory = (): KeyValue & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe('board', () => {
  it('keeps placed frames, and sets the rest in a row to their right', () => {
    const out = placeOnBoard([
      { key: 'a', x: 0, y: 40, width: 100, height: 50 },
      { key: 'b', width: 200, height: 80 },
      { key: 'c', width: 60, height: 60 },
    ]);
    expect(out[0]).toMatchObject({ x: 0, y: 40 });
    expect(out[1]).toMatchObject({ x: 100 + BOARD_GAP, y: 40 });
    expect(out[2]).toMatchObject({ x: 100 + BOARD_GAP + 200 + BOARD_GAP, y: 40 });
  });

  it('starts an empty board at the origin', () => {
    expect(placeOnBoard([{ key: 'a', width: 10, height: 10 }])[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('finds the frame under a point, and the box around them all', () => {
    const frames = placeOnBoard([{ key: 'a', x: 0, y: 0, width: 100, height: 100 }, { key: 'b', x: 200, y: 50, width: 50, height: 50 }]);
    expect(frameAt(frames, { x: 220, y: 60 })?.key).toBe('b');
    expect(frameAt(frames, { x: 150, y: 60 })).toBeNull();
    expect(boardBounds(frames)).toEqual({ x: 0, y: 0, width: 250, height: 100 });
  });

  it('keeps the board still when another frame is edited', () => {
    // Frame b is 300 right of a; at zoom 2 its origin is 600 screen pixels right of a's.
    expect(viewAcross({ z: 2, x: 10, y: 20 }, { x: 0, y: 0 }, { x: 300, y: -10 })).toEqual({ z: 2, x: 610, y: 0 });
  });

  it('keeps places in the index, and reads them back', () => {
    const store = memory();
    const index = { version: 1 as const, active: 'scuggnizzi.freeform.a', frames: [{ key: 'scuggnizzi.freeform.a', name: 'A', updatedAt: 5 }] };
    const next = placeFrames(store, index, { 'scuggnizzi.freeform.a': { x: 12.4, y: -30 } });
    expect(next.frames[0]).toMatchObject({ x: 12, y: -30, updatedAt: 5 });
    expect(readFrameIndex(store.data.get('scuggnizzi.freeform.frames') ?? [...store.data.values()][0]!)?.frames[0]).toMatchObject({ x: 12, y: -30 });
    expect(placeFrames(store, next, { 'scuggnizzi.freeform.a': { x: 12, y: -30 } })).toBe(next);
  });
});
