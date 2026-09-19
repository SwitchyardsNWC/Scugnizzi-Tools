// The board's notes for this email, beside the canvas in Template Studio.
//
// Jared: "make the way to view them in the template studio." Each note as it looks on the board: its kind and
// colour, when it was written, the words, and the section it is about. Passing the pointer over one outlines
// that section on the canvas; clicking selects the section and brings it into view. Written on the board, not
// here: the board is where notes live, and this is the way to read them where the work is.

import { noteKind, type BoardNote } from '../model/project.ts';
import { agoShort } from '../project/board-helpers.ts';

export interface NotesRailProps {
  notes: BoardNote[];
  /** The email's sections, named as the board names them (model/project.ts, sectionLabels). */
  labels: Array<{ id: string; label: string }>;
  onHover(part: string | null): void;
  onPick(part: string | null): void;
  onOpenBoard(): void;
  onClose(): void;
}

export function NotesRail({ notes, labels, onHover, onPick, onOpenBoard, onClose }: NotesRailProps) {
  return (
    <aside class="notes-rail" aria-label="Notes from the board" onMouseLeave={() => onHover(null)}>
      <header class="notes-rail-head">
        <b>{notes.length === 1 ? '1 note' : `${notes.length} notes`}</b>
        <span class="notes-rail-from">from the board</span>
        <button class="link" onClick={onClose}>
          Hide
        </button>
      </header>
      {notes.map((n) => {
        const kind = noteKind(n);
        const part = n.part ? labels.find((l) => l.id === n.part) : undefined;
        const gone = Boolean(n.part && !part);
        return (
          <button
            key={n.id}
            class={`note-card note-${kind.id} ${n.part ? 'points' : ''}`}
            style={{ background: kind.color }}
            title={n.part ? (part ? `Select section ${part.label}` : 'The section this note pointed at is gone') : 'On the whole email'}
            onMouseEnter={() => onHover(part ? n.part : null)}
            onClick={() => onPick(part ? n.part : null)}
          >
            <span class="note-card-head">
              {kind.id !== 'note' && <b class="note-card-kind">{kind.name}</b>}
              <span class="note-card-when">{n.at ? agoShort(n.at) : 'new'}</span>
            </span>
            <span class="note-card-text">{n.text.trim() || 'Nothing written yet'}</span>
            {(part || gone) && <span class="note-card-on">{part ? `on ${part.label}` : 'on a section that is gone'}</span>}
          </button>
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
