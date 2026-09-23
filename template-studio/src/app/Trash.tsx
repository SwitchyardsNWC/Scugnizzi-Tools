// The project's trash, for whichever page is looking at it.
//
// The rules are pure, in model/trash.ts. The reading and writing is workspace/trash.ts. This is the third piece:
// the can and the panel, and the small amount of state a page needs to keep behind them.
//
// It lives here rather than in the board because the board was never the only page that deletes. Template Studio
// deletes a template, the Studio library deletes a starter, Freeform deletes a frame — and for a week all four
// went into the same folder and exactly one of them could open it. The comment at the top of workspace/trash.ts
// had already said the IO belonged to no single page; the way out had simply not been moved to match.
//
// Each page owns its own wiring: what to say afterwards, and what to refresh. The hook owns what is in the folder
// and whether the panel is up, because those are the same everywhere.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { daysLeft, TRASH_CAPS, trashBytes, type TrashRecord } from '../model/trash.ts';
import { emptyTrash, readTrash, restoreFromTrash, sweepTrash } from '../workspace/trash.ts';

type Dir = FileSystemDirectoryHandle;

const CAP_MB = Math.round(TRASH_CAPS.bytes / 1024 / 1024);

/** `n thing` or `n things`. Local so a page can mount the trash without pulling the board's helpers in with it. */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The 1 KB floor keeps a small file from reading as nothing; nothing at all is exempt. */
const sizeOf = (n: number) => (n <= 0 ? '0 KB' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** How long ago, in days rather than a date: this is a list about what is nearly swept. */
const agoDays = (t: number) => {
  const h = Math.round((Date.now() - t) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} h ago`;
  return `${plural(Math.round(h / 24), 'day')} ago`;
};

export interface TrashHandle {
  records: TrashRecord[];
  open: boolean;
  setOpen(open: boolean): void;
  /** True for a moment after something new lands, for the can's shake. */
  jolt: boolean;
  /** Read the folder again. */
  reread(): Promise<void>;
  /** One back where it came from. The path it landed at, or null when the bytes are gone. Throws with a sentence. */
  restore(record: TrashRecord): Promise<string | null>;
  /** Everything, gone for good. How many went. */
  empty(): Promise<number>;
}

/**
 * What is in the trash, kept current.
 *
 * `epoch` is anything that changes when the folder might have: the board passes its file-listing epoch, Studio
 * its template list. Passing nothing is fine — the panel rereads when it opens either way.
 */
export function useTrash(dir: Dir | null, options: { writable: boolean; epoch?: unknown } = { writable: false }): TrashHandle {
  const [records, setRecords] = useState<TrashRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [jolt, setJolt] = useState(false);
  const { writable, epoch } = options;

  const reread = useCallback(async () => {
    setRecords(dir ? await readTrash(dir).catch(() => []) : []);
  }, [dir]);

  useEffect(() => {
    void reread();
  }, [reread, epoch]);

  /** And whenever it is opened, so the list is never a page's stale idea of the folder. */
  useEffect(() => {
    if (open) void reread();
  }, [open, reread]);

  /** Swept on opening, so a project shut for a month is not still carrying last month's deletes. */
  useEffect(() => {
    if (!dir || !writable) return;
    void sweepTrash(dir, Date.now())
      .then((gone) => {
        if (gone) void reread();
      })
      .catch(() => undefined);
  }, [dir, writable, reread]);

  /** One shake when something lands. The arrival is the only part of this worth animating. */
  const was = useRef(records.length);
  useEffect(() => {
    const before = was.current;
    was.current = records.length;
    if (records.length <= before) return undefined;
    setJolt(true);
    const timer = window.setTimeout(() => setJolt(false), 620);
    return () => window.clearTimeout(timer);
  }, [records.length]);

  const restore = useCallback(
    async (record: TrashRecord) => {
      if (!dir) return null;
      const at = await restoreFromTrash(dir, record);
      await reread();
      return at;
    },
    [dir, reread],
  );

  const empty = useCallback(async () => {
    if (!dir) return 0;
    const gone = await emptyTrash(dir).catch(() => 0);
    await reread();
    return gone;
  }, [dir, reread]);

  return { records, open, setOpen, jolt, reread, restore, empty };
}

/**
 * The can.
 *
 * Faded when empty and solid with a count when it is holding something, so a delete has a visible somewhere to go
 * before you have made one. `className` is where the page puts it: the board pins it to a corner of the canvas,
 * the other pages sit it in a bar.
 */
export function TrashCan({ trash, className = '' }: { trash: TrashHandle; className?: string }) {
  const { records, open, setOpen, jolt } = trash;
  return (
    <button
      type="button"
      class={`sy-can ${className} ${open ? 'on' : ''} ${records.length ? 'full' : 'empty'} ${jolt ? 'jolt' : ''}`}
      aria-expanded={open}
      aria-label={records.length ? `Recently deleted — ${plural(records.length, 'file')}` : 'Recently deleted — nothing here'}
      title={
        records.length
          ? `${plural(records.length, 'deleted file')} in here, taking ${sizeOf(trashBytes(records))}. Kept ${TRASH_CAPS.days} days, up to ${CAP_MB} MB.`
          : `Nothing deleted lately. What you delete waits in here ${TRASH_CAPS.days} days, so it can come back.`
      }
      onClick={() => setOpen(!open)}
    >
      <span class="sy-can-art" aria-hidden="true">
        <svg viewBox="0 0 28 30">
          <g class="sy-can-lid">
            <path d="M4.6 8.6h18.8" />
            <path d="M11 8.6V5.6h6v3" />
          </g>
          <path class="sy-can-body" d="M7 10.6h14l-1.15 16.1a1.7 1.7 0 0 1-1.7 1.6h-8.3a1.7 1.7 0 0 1-1.7-1.6Z" />
          <path class="sy-can-ribs" d="M11.7 14.6v9.2M16.3 14.6v9.2" />
        </svg>
      </span>
      {records.length > 0 && <span class="sy-can-count">{records.length}</span>}
    </button>
  );
}

/**
 * Recently deleted.
 *
 * `onRestore` and `onEmpty` are the page's, because what to say afterwards and what to refresh differ: the board
 * redraws its cards, Studio its file list. The panel does the reading and the writing; the page does the telling.
 */
export function TrashPanel({
  trash,
  writable,
  onRestore,
  onEmpty,
}: {
  trash: TrashHandle;
  writable: boolean;
  onRestore(record: TrashRecord): void;
  onEmpty(): void;
}) {
  const { records, open, setOpen } = trash;
  if (!open) return null;
  const now = Date.now();
  return (
    <div class="sy-sheet-backdrop" onClick={() => setOpen(false)}>
      <div class="sy-sheet sy-trash" role="dialog" aria-label="Recently deleted" onClick={(e) => e.stopPropagation()}>
        <header>
          <b>Recently deleted</b>
          <button type="button" class="sy-sheet-done" onClick={() => setOpen(false)}>
            Done
          </button>
        </header>
        <p class="sy-trash-lead">
          Deleting puts a file here instead of throwing it away, so it can come back after the tab is closed and Undo
          is gone. It keeps the last {TRASH_CAPS.days} days, up to {CAP_MB} MB and {TRASH_CAPS.count} files — the
          oldest goes when the newest arrives, so it never becomes weight.
        </p>
        <ul class="sy-trash-list">
          {records.length === 0 && <li class="sy-trash-none">Nothing in here. What you delete lands in the can, and waits.</li>}
          {records.map((record) => (
            <li key={record.id}>
              <span class="sy-trash-main">
                <b>{record.name}</b>
                <span class="sy-trash-facts">
                  {record.kind} · {sizeOf(record.size)} · {record.deletedAt ? agoDays(record.deletedAt) : 'some time ago'}
                  {record.deletedAt && daysLeft(record, now) <= 7 ? ` · ${plural(daysLeft(record, now), 'day')} left` : ''}
                </span>
              </span>
              <button
                type="button"
                class="sy-sheet-done"
                disabled={!writable}
                title={`Put it back in ${record.path.slice(0, record.path.lastIndexOf('/')) || 'the folder'}.`}
                onClick={() => onRestore(record)}
              >
                Put back
              </button>
            </li>
          ))}
        </ul>
        <footer class="sy-trash-foot">
          <span>
            {plural(records.length, 'file')} · {sizeOf(trashBytes(records))} of {CAP_MB} MB
          </span>
          <button
            type="button"
            class="sy-trash-empty"
            disabled={!writable || records.length === 0}
            title="Everything here, gone for good. There is no undo for this one."
            onClick={onEmpty}
          >
            Empty it
          </button>
        </footer>
      </div>
    </div>
  );
}
