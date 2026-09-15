// The board's undo stack (project/history.ts), and the canvas settings (app/canvas-settings.ts).
//
// Defended: steps undo and redo in order and say what they are; a new step forgets what had been undone;
// the stack is capped; asynchronous steps are awaited and run one at a time; a step that throws is on
// neither stack; and settings read back clamped, with garbage falling to the defaults.

import { describe, expect, it } from 'vitest';

import { CANVAS_RANGES, DEFAULT_CANVAS_SETTINGS, parseCanvasSettings } from '../src/app/canvas-settings.ts';
import { History } from '../src/project/history.ts';

const step = (label: string, log: string[]) => ({ label, undo: () => void log.push(`undo ${label}`), redo: () => void log.push(`redo ${label}`) });

describe('the undo stack', () => {
  it('undoes and redoes in order, and says what', async () => {
    const h = new History();
    const log: string[] = [];
    expect(h.canUndo).toBe(false);
    h.push(step('a', log));
    h.push(step('b', log));
    expect(h.undoLabel).toBe('b');
    expect((await h.undo())?.label).toBe('b');
    expect((await h.undo())?.label).toBe('a');
    expect(await h.undo()).toBeNull();
    expect(h.redoLabel).toBe('a');
    expect((await h.redo())?.label).toBe('a');
    expect(log).toEqual(['undo b', 'undo a', 'redo a']);
    expect(h.canUndo && h.canRedo).toBe(true);
  });

  it('forgets what had been undone once something new is done, and is capped', async () => {
    const h = new History(3);
    const log: string[] = [];
    h.push(step('a', log));
    h.push(step('b', log));
    await h.undo();
    expect(h.canRedo).toBe(true);
    h.push(step('c', log));
    expect(h.canRedo).toBe(false);
    h.push(step('d', log));
    h.push(step('e', log));
    expect(h.undoLabel).toBe('e');
    await h.undo();
    await h.undo();
    await h.undo();
    expect(h.canUndo).toBe(false); // a fell off the end
    expect(log).toEqual(['undo b', 'undo e', 'undo d', 'undo c']);
  });

  it('awaits an asynchronous step and runs one at a time', async () => {
    const h = new History();
    const log: string[] = [];
    let release: () => void = () => {};
    h.push({
      label: 'slow',
      undo: () => new Promise<void>((res) => {
        release = () => {
          log.push('slow undone');
          res();
        };
      }),
      redo: () => {},
    });
    h.push(step('quick', log));
    // The stack is busy from the call itself, until the step's promise settles: even a synchronous step waits a tick.
    const first = h.undo();
    expect(h.working).toBe(true);
    await first;
    expect(h.working).toBe(false);
    const slow = h.undo();
    expect(h.working).toBe(true);
    expect(h.canUndo).toBe(false);
    expect(await h.redo()).toBeNull(); // busy: nothing happens
    release();
    expect((await slow)?.label).toBe('slow');
    expect(log).toEqual(['undo quick', 'slow undone']);
    expect(h.working).toBe(false);
  });

  it('drops a step that throws, from both stacks', async () => {
    const h = new History();
    h.push({ label: 'bad', undo: () => Promise.reject(new Error('the file moved')), redo: () => {} });
    h.push({ label: 'good', undo: () => {}, redo: () => {} });
    await h.undo();
    await expect(h.undo()).rejects.toThrow('the file moved');
    expect(h.canUndo).toBe(false);
    expect(h.redoLabel).toBe('good');
    expect(h.working).toBe(false);
  });

  it('tells listeners when anything changes', async () => {
    const h = new History();
    let heard = 0;
    const off = h.subscribe(() => (heard += 1));
    h.push(step('a', []));
    await h.undo();
    off();
    h.push(step('b', []));
    expect(heard).toBe(3); // push, busy, done
  });
});

describe('canvas settings', () => {
  it('read the defaults from nothing or garbage', () => {
    expect(parseCanvasSettings(null)).toEqual(DEFAULT_CANVAS_SETTINGS);
    expect(parseCanvasSettings('nope')).toEqual(DEFAULT_CANVAS_SETTINGS);
    expect(parseCanvasSettings('[1,2]')).toEqual(DEFAULT_CANVAS_SETTINGS);
    expect(parseCanvasSettings('{"pencilOnly":"sometimes","friction":"fast"}')).toEqual(DEFAULT_CANVAS_SETTINGS);
  });

  it('keep what is set and clamp what is out of range', () => {
    const s = parseCanvasSettings(JSON.stringify({ momentum: false, friction: 5000, pinchGain: 0.1, gridStep: 24, snap: true, holdMs: 200, pencilOnly: 'on' }));
    expect(s).toMatchObject({ momentum: false, friction: CANVAS_RANGES.friction.max, pinchGain: CANVAS_RANGES.pinchGain.min, gridStep: 24, snap: true, holdMs: 200, pencilOnly: 'on' });
    expect(s.grid).toBe(true);
    expect(s.wheelGain).toBe(DEFAULT_CANVAS_SETTINGS.wheelGain);
    expect(parseCanvasSettings(JSON.stringify({ presenceHost: '  localhost:1999 ', presenceName: 'x'.repeat(60) }))).toMatchObject({ presenceHost: 'localhost:1999', presenceName: 'x'.repeat(40) });
    expect(parseCanvasSettings(JSON.stringify({ presenceHost: 4 })).presenceHost).toBe('');
  });
});
