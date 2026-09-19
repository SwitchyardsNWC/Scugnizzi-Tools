// A note on the board: an editor's words, on a paper colour, beside the thing they are about.
//
// Jared: "add a 'notes' feature to the project board. so editor notes can be left next to objects." The note is
// the board's (model/project.ts, `BoardNote`): where it sits, what it says, which card it is on, and on an email
// which section. This draws one: a strip with its kind and when it was written and, on hover, its kinds and
// Delete; the section it is about, picked from a list that outlines each as the pointer passes; the words, or a
// field for them.

import { useEffect, useRef, useState } from 'preact/hooks';

import { NOTE_KINDS, noteKind, type BoardNote } from '../model/project.ts';
import { agoShort } from './board-helpers.ts';

export interface NoteCardProps {
  note: BoardNote;
  /** Where to draw it: the note's own place, or where a drag has it right now. */
  x: number;
  y: number;
  selected: boolean;
  /** Being carried. */
  lifted: boolean;
  editing: boolean;
  writable: boolean;
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  onBeginEdit(): void;
  /** The field closed: what it holds, or null when Escape threw the edit away. */
  onEndEdit(text: string | null): void;
  onColor(index: number): void;
  onRemove(): void;
  /** On an email: its sections, for the note to point at one. Absent otherwise. */
  parts?: Array<{ id: string; label: string }>;
  onPart?(id: string | null): void;
  /** The pointer is over a section in the list, or has left it: the board outlines that section on the email. */
  onPreviewPart?(id: string | null): void;
  /**
   * The pin at the note's edge, taken hold of: dragged onto a card, or a section of an email, it pins the note
   * there; let go on the paper, it unpins it (Jared: "drag a node from the note directly to a section").
   */
  onPinDown?(event: PointerEvent): void;
}

export function NoteCard({ note, x, y, selected, lifted, editing, writable, onPointerDown, onPointerMove, onPointerUp, onBeginEdit, onEndEdit, onColor, onRemove, parts, onPart, onPreviewPart, onPinDown }: NoteCardProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);
  /** Escape closes the field without keeping what was typed; the focus leaving must know. */
  const cancelled = useRef(false);
  const fit = (el: HTMLTextAreaElement) => {
    el.style.height = '0px';
    el.style.height = `${Math.max(40, el.scrollHeight)}px`;
  };
  useEffect(() => {
    const el = field.current;
    if (!editing || !el) return;
    cancelled.current = false;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    fit(el);
  }, [editing]);
  /** Back to the words after a kind or a section was picked, so the edit is one sitting. */
  const refocus = () => {
    if (editing) window.setTimeout(() => field.current?.focus({ preventScroll: true }), 0);
  };
  const when = note.at ? agoShort(note.at) : 'new';
  const kind = noteKind(note);
  const part = parts?.find((p) => p.id === note.part);
  return (
    <div
      ref={root}
      class={`pb-note pb-note-${kind.id} ${selected ? 'on' : ''} ${lifted ? 'lifted' : ''} ${editing ? 'editing' : ''}`}
      data-note={note.id}
      style={{ left: x, top: y, width: note.w, background: kind.color }}
      title={editing ? undefined : `${kind.id === 'note' ? 'A note' : `${kind.name}: ${kind.meaning}`}${part ? `, on section ${part.label}` : note.on ? ', left on a card' : ''} · ${when}. Double-click to write.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDblClick={(e) => {
        e.stopPropagation();
        if (writable && !editing) onBeginEdit();
      }}
      // The edit ends when focus leaves the note, not the field: picking a kind or a section on the way is part of
      // the same sitting (Jared: "allow me to choose the 'on' for the note before I add text").
      onFocusOut={(e: FocusEvent) => {
        if (!editing) return;
        const to = e.relatedTarget as Node | null;
        if (to && root.current?.contains(to)) return;
        onEndEdit(cancelled.current ? null : (field.current?.value ?? note.text));
      }}
    >
      {writable && onPinDown && (
        <span
          class={`pb-note-pin ${note.on ? 'pinned' : ''}`}
          data-note-pin={note.id}
          title={note.on ? 'Pinned. Drag to another card or section, or onto the paper to unpin.' : 'Drag onto a card, or a section of an email, to pin this note there.'}
          onPointerDown={onPinDown}
        />
      )}
      <div class="pb-note-head">
        <span class="pb-note-when">
          {kind.id !== 'note' && <b class="pb-note-kind">{kind.name}</b>}
          {when}
        </span>
        {writable && (
          <span class="pb-note-tools">
            {NOTE_KINDS.map((k, i) => (
              <button
                key={k.id}
                class={`pb-note-swatch ${i === note.color ? 'on' : ''}`}
                style={{ background: k.color }}
                aria-label={k.name}
                title={`${k.name}: ${k.meaning}`}
                onClick={() => {
                  onColor(i);
                  refocus();
                }}
              />
            ))}
            <button class="pb-note-x" aria-label="Remove this note" title="Remove this note. ⌘Z puts it back." onClick={onRemove}>
              ×
            </button>
          </span>
        )}
      </div>
      {parts && parts.length > 0 && (writable || part) && (
        <PartPicker
          parts={parts}
          value={note.part}
          writable={writable}
          onPick={(id) => {
            onPart?.(id);
            refocus();
          }}
          onPreview={(id) => onPreviewPart?.(id)}
        />
      )}
      {editing ? (
        <textarea
          ref={field}
          class="pb-note-text"
          defaultValue={note.text}
          placeholder="A note…"
          spellcheck={true}
          aria-label="Note"
          onInput={(e) => fit(e.currentTarget)}
          onKeyDown={(e) => {
            // The board's keys stay out of the words; Escape drops the edit, ⌘Enter keeps it.
            e.stopPropagation();
            if (e.key === 'Escape') {
              cancelled.current = true;
              e.currentTarget.blur();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <div class={`pb-note-body ${note.text.trim() ? '' : 'empty'}`}>{note.text.trim() ? note.text : writable ? 'Double-click to write' : 'Nothing written yet'}</div>
      )}
    </div>
  );
}

/**
 * Which part of the email the note is about: a row that says it, and a list to change it. Its own list rather
 * than a `<select>`, so the section under the pointer can be outlined on the email as the choice is made.
 */
function PartPicker({ parts, value, writable, onPick, onPreview }: { parts: Array<{ id: string; label: string }>; value: string | null; writable: boolean; onPick(id: string | null): void; onPreview(id: string | null): void }) {
  const [open, setOpen] = useState(false);
  const current = parts.find((p) => p.id === value);
  const choose = (id: string | null) => {
    setOpen(false);
    onPreview(null);
    onPick(id);
  };
  return (
    <div class={`pb-note-part ${open ? 'open' : ''}`}>
      <button
        class="pb-note-part-btn"
        disabled={!writable}
        aria-expanded={open}
        title={writable ? 'The section of the email this note is about. Click to change it.' : 'The section of the email this note is about.'}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <span class="pb-note-part-word">on</span>
        <span class="pb-note-part-value">{current ? current.label : 'the whole email'}</span>
        {writable && <span class="pb-note-part-caret" aria-hidden="true" />}
      </button>
      {open && (
        <ul class="pb-note-parts" role="listbox" onMouseLeave={() => onPreview(null)}>
          <li>
            <button class={`pb-note-part-option ${value === null ? 'on' : ''}`} role="option" aria-selected={value === null} onMouseEnter={() => onPreview(null)} onClick={() => choose(null)}>
              the whole email
            </button>
          </li>
          {parts.map((p) => (
            <li key={p.id}>
              <button class={`pb-note-part-option ${value === p.id ? 'on' : ''}`} role="option" aria-selected={value === p.id} onMouseEnter={() => onPreview(p.id)} onClick={() => choose(p.id)}>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
