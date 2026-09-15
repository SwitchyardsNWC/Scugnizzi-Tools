// Touch gestures and momentum (app/gestures.ts, app/inertia.ts), on plain objects.
//
// Defended: two fingers start a pinch and report its midpoint and scale; a quick still two-finger tap
// undoes and a three-finger tap redoes; fingers that moved, or lingered, do not tap; a touch while the
// pen is down or just lifted is a palm; and the pan tracker reads the hand's speed from its last moments,
// none when it had stopped.

import { describe, expect, it } from 'vitest';

import { TouchGestures, type GestureHandlers, type Pinch } from '../src/app/gestures.ts';
import { PanTracker } from '../src/app/inertia.ts';

const touch = (id: number, x: number, y: number) => ({ pointerId: id, pointerType: 'touch', clientX: x, clientY: y });
const pen = (id: number, x = 0, y = 0) => ({ pointerId: id, pointerType: 'pen', clientX: x, clientY: y });

function harness() {
  const log: string[] = [];
  const pinches: Pinch[] = [];
  const handlers: GestureHandlers = {
    onStart: (mid) => log.push(`start ${mid.x},${mid.y}`),
    onPinch: (p) => pinches.push(p),
    onEnd: () => log.push('end'),
    onTap: (n) => log.push(`tap ${n}`),
  };
  return { g: new TouchGestures(handlers), log, pinches };
}

describe('touch gestures', () => {
  it('pinch with two fingers: the midpoint and the scale, then the end', () => {
    const { g, log, pinches } = harness();
    expect(g.down(touch(1, 100, 100), 0)).toBe('touch');
    expect(g.down(touch(2, 200, 100), 0)).toBe('gesture');
    expect(log).toEqual(['start 150,100']);
    expect(g.active()).toBe(true);
    expect(g.move(touch(2, 300, 100))).toBe(true);
    expect(pinches[0]).toEqual({ start: { x: 150, y: 100 }, mid: { x: 200, y: 100 }, scale: 2 });
    g.up(touch(2, 300, 100), 500);
    expect(log).toEqual(['start 150,100', 'end']);
    expect(g.active()).toBe(false);
    // One finger left: its moves are the caller's again.
    expect(g.move(touch(1, 120, 100))).toBe(false);
  });

  it('two fingers tapped together undo, three redo', () => {
    const { g, log } = harness();
    g.down(touch(1, 100, 100), 0);
    g.down(touch(2, 140, 100), 10);
    g.up(touch(1, 101, 100), 120);
    g.up(touch(2, 140, 101), 130);
    expect(log.at(-1)).toBe('tap 2');
    g.down(touch(1, 100, 100), 1000);
    g.down(touch(2, 140, 100), 1010);
    g.down(touch(3, 180, 100), 1020);
    g.up(touch(3, 180, 100), 1100);
    g.up(touch(2, 140, 100), 1110);
    g.up(touch(1, 100, 100), 1120);
    expect(log.at(-1)).toBe('tap 3');
  });

  it('do not tap when the fingers moved, or took too long', () => {
    const { g, log } = harness();
    g.down(touch(1, 100, 100), 0);
    g.down(touch(2, 140, 100), 0);
    g.move(touch(2, 170, 100));
    g.up(touch(2, 170, 100), 100);
    g.up(touch(1, 100, 100), 110);
    expect(log.filter((l) => l.startsWith('tap'))).toEqual([]);
    g.down(touch(1, 100, 100), 1000);
    g.down(touch(2, 140, 100), 1000);
    g.up(touch(1, 100, 100), 1500);
    g.up(touch(2, 140, 100), 1500);
    expect(log.filter((l) => l.startsWith('tap'))).toEqual([]);
  });

  it('take a touch while the pen is down, or just lifted, for the palm', () => {
    const { g, log } = harness();
    expect(g.down(pen(9), 0)).toBe('pen');
    expect(g.down(touch(1, 0, 0), 10)).toBe('palm');
    g.up(pen(9), 100);
    expect(g.down(touch(2, 0, 0), 200)).toBe('palm');
    expect(g.down(touch(3, 0, 0), 600)).toBe('touch');
    // The pen landing vetoes a tap that two fingers had started.
    g.up(touch(3, 0, 0), 610);
    g.down(touch(4, 0, 0), 2000);
    g.down(touch(5, 40, 0), 2000);
    g.down(pen(9), 2010);
    g.up(pen(9), 2020);
    g.up(touch(4, 0, 0), 2030);
    g.up(touch(5, 40, 0), 2040);
    expect(log.filter((l) => l.startsWith('tap'))).toEqual([]);
    expect(g.down({ pointerId: 7, pointerType: 'mouse', clientX: 0, clientY: 0 })).toBe('other');
  });
});

describe('the pan tracker', () => {
  it('reads the hand’s speed from its last moments', () => {
    const t = new PanTracker();
    for (let i = 0; i <= 10; i++) t.push(i * 20, 0, i * 16);
    expect(t.velocity(160)).toEqual({ vx: 1.25, vy: 0 });
  });

  it('reads nothing when the hand had stopped, or barely started', () => {
    const t = new PanTracker();
    t.push(0, 0, 0);
    t.push(100, 0, 16);
    expect(t.velocity(200)).toBeNull();
    const short = new PanTracker();
    short.push(0, 0, 0);
    expect(short.velocity(5)).toBeNull();
  });

  it('forgets what happened more than 120ms ago', () => {
    const t = new PanTracker();
    t.push(0, 0, 0);
    for (let i = 1; i <= 12; i++) t.push(1000, 0, i * 16);
    // Every kept sample is at x=1000: the early rush is gone.
    expect(t.velocity(192)).toEqual({ vx: 0, vy: 0 });
  });
});
