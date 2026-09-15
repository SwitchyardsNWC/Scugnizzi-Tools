// The board's undo stack.
//
// Every arrangement the hand makes on the board is recorded as a step that knows how to take itself
// back and how to do itself again: a card moved, a group made, renamed, moved or removed, a picture
// filed into a folder. Steps that move files are asynchronous and run one at a time; a step that fails
// half-way is dropped from both stacks rather than left to be undone twice. What the board does on its
// own, placing a new file where there is room, is not a step: nobody asked for it, so nobody undoes it.

import { useEffect, useState } from 'preact/hooks';

export interface HistoryEntry {
  /** What was done, as the button will say it: "Move Spring launch", "File hero.png in Photos". */
  label: string;
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
}

export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private busy = false;
  private readonly listeners = new Set<() => void>();

  constructor(readonly limit = 100) {}

  get canUndo(): boolean {
    return this.past.length > 0 && !this.busy;
  }
  get canRedo(): boolean {
    return this.future.length > 0 && !this.busy;
  }
  get undoLabel(): string | null {
    return this.past[this.past.length - 1]?.label ?? null;
  }
  get redoLabel(): string | null {
    return this.future[this.future.length - 1]?.label ?? null;
  }
  /** A step is running: the files it moves are not all where they will be. */
  get working(): boolean {
    return this.busy;
  }

  /** Records a step that has just been done. Anything that had been undone can no longer be redone. */
  push(entry: HistoryEntry): void {
    this.past.push(entry);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.notify();
  }

  /** Takes the last step back. The step, or null when there was none or one is still running. Throws what the step threw. */
  async undo(): Promise<HistoryEntry | null> {
    return this.step(this.past, this.future, 'undo');
  }

  async redo(): Promise<HistoryEntry | null> {
    return this.step(this.future, this.past, 'redo');
  }

  private async step(from: HistoryEntry[], to: HistoryEntry[], which: 'undo' | 'redo'): Promise<HistoryEntry | null> {
    if (this.busy) return null;
    const entry = from.pop();
    if (!entry) return null;
    this.busy = true;
    this.notify();
    try {
      await entry[which]();
      to.push(entry);
      return entry;
    } finally {
      // A failed step is on neither stack: the board may be half-changed, and doing it again blind would not help.
      this.busy = false;
      this.notify();
    }
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.notify();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

/** The stack's state for rendering: whether there is anything to undo or redo, and what it is. */
export function useHistory(history: History): { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null; working: boolean } {
  const read = () => ({ canUndo: history.canUndo, canRedo: history.canRedo, undoLabel: history.undoLabel, redoLabel: history.redoLabel, working: history.working });
  const [state, setState] = useState(read);
  useEffect(() => history.subscribe(() => setState(read())), [history]);
  return state;
}
