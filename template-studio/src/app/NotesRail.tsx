// The board's notes for this email, beside the canvas in Template Studio.
//
// Jared: "make the way to view them in the template studio." Each note as it looks on the board: its kind and
// colour, when it was written, the words, and the section it is about. Passing the pointer over one outlines
// that section on the canvas; clicking selects the section and brings it into view. Resolving is the one thing
// done from here (Jared: "a final state of 'resolved' ... changed in the template studio and canvas"); writing
// stays on the board, where notes live.

import { useState } from 'preact/hooks';

import { noteKind, type BoardNote } from '../model/project.ts';
import { agoShort } from '../project/board-helpers.ts';

export interface NotesRailProps {
  notes: BoardNote[];
  /** The email's sections, named as the board names them (model/project.ts, sectionLabels). */
  labels: Array<{ id: string; label: string }>;
  /** The folder can be written, so a note can be resolved from here. */
  writable: boolean;
  onHover(part: string | null): void;
  onPick(part: string | null): void;
  onResolve(id: string, resolved: boolean): void;
  onReply(id: string, text: string): void;
  onOpenBoard(): void;
  onClose(): void;
}

export function NotesRail({ notes, labels, writable, onHover, onPick, onResolve, onReply, onOpenBoard, onClose }: NotesRailProps) {
  /** The note whose reply field is open. */
  const [replying, setReplying] = useState<string | null>(null);
  const open = notes.filter((n) => !n.resolvedAt).length;
  const done = notes.length - open;
  return (
    <aside class="notes-rail" aria-label="Notes from the board" onMouseLeave={() => onHover(null)}>
      <header class="notes-rail-head">
        <b>{open === 1 ? '1 note' : `${open} notes`}</b>
        <span class="notes-rail-from">{done ? `· ${done} resolved` : 'from the board'}</span>
        <button class="link" onClick={onClose}>
          Hide
        </button>
      </header>
      {notes.map((n) => {
        const kind = noteKind(n);
        const part = n.part ? labels.find((l) => l.id === n.part) : undefined;
        const gone = Boolean(n.part && !part);
        const resolved = n.resolvedAt > 0;
        return (
          <div
            key={n.id}
            class={`note-card note-${kind.id} ${n.part ? 'points' : ''} ${resolved ? 'resolved' : ''}`}
            style={{ background: kind.color }}
            role="button"
            tabIndex={0}
            title={n.part ? (part ? `Select section ${part.label}` : 'The section this note pointed at is gone') : 'On the whole email'}
            onMouseEnter={() => onHover(part ? n.part : null)}
            onClick={() => onPick(part ? n.part : null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPick(part ? n.part : null);
            }}
          >
            <span class="note-card-head">
              {resolved ? <b class="note-card-kind">Resolved</b> : kind.id !== 'note' && <b class="note-card-kind">{kind.name}</b>}
              <span class="note-card-when">{resolved ? agoShort(n.resolvedAt) : n.at ? agoShort(n.at) : 'new'}</span>
              {writable && (
                <button
                  class={`note-card-check ${resolved ? 'on' : ''}`}
                  aria-pressed={resolved}
                  aria-label={resolved ? 'Open this note again' : 'Resolve this note'}
                  title={resolved ? 'Resolved. Click to open it again.' : 'Resolve: this is dealt with.'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onResolve(n.id, !resolved);
                  }}
                >
                  ✓
                </button>
              )}
            </span>
            <span class="note-card-text">{n.text.trim() || 'Nothing written yet'}</span>
            {(part || gone) && <span class="note-card-on">{part ? `on ${part.label}` : 'on a section that is gone'}</span>}
            {n.replies.length > 0 && (
              <span class="note-card-replies">
                {n.replies.map((r) => (
                  <span class="note-card-reply" key={r.id}>
                    <span class="note-card-reply-when">{r.at ? agoShort(r.at) : 'now'}</span>
                    <span class="note-card-reply-text">{r.text}</span>
                  </span>
                ))}
              </span>
            )}
            {writable &&
              (replying === n.id ? (
                <textarea
                  class="note-card-reply-field"
                  placeholder="Reply…"
                  rows={2}
                  aria-label="Reply"
                  ref={(el) => el?.focus({ preventScroll: true })}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Escape') {
                      e.currentTarget.value = '';
                      e.currentTarget.blur();
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={(e) => {
                    const text = e.currentTarget.value.trim();
                    setReplying(null);
                    if (text) onReply(n.id, text);
                  }}
                />
              ) : (
                <button
                  class="note-card-reply-btn"
                  title="Answer this note; the reply shows here and on the board"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReplying(n.id);
                  }}
                >
                  Reply
                </button>
              ))}
          </div>
        );
      })}
      <footer class="notes-rail-foot">
        <button class="link" onClick={onOpenBoard}>
          Write and reply on the board
        </button>
      </footer>
    </aside>
  );
}
