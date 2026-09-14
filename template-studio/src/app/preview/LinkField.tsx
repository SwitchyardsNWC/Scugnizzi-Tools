// The URL field a link is typed into, over the canvas.

import { useEffect, useRef } from 'preact/hooks';

/**
 * The URL field a link is typed into. Over the canvas, at the caret, where the menu was.
 *
 * It takes focus — it has to — which is why the editable's `focusout` is told to ignore the
 * departure (`linking`). Enter makes the link; Escape or leaving the field puts the caret back
 * where it was without one.
 */
export function LinkField({ top, left, onSubmit, onCancel }: { top: number; left: number; onSubmit(url: string): void; onCancel(): void }) {
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <form
      class="sy-tools sy-link"
      style={{ top: `${top}px`, left: `${left}px` }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(input.current?.value ?? '');
      }}
    >
      <span class="sy-link-label">Link to</span>
      <input
        ref={input}
        type="text"
        placeholder="https://…"
        spellcheck={false}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          // Handled here as well as by the form: implicit submission rides on a keypress that a
          // synthetic Enter does not always carry (learnings 3.52).
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit(input.current?.value ?? '');
          }
        }}
        onBlur={onCancel}
      />
      <button type="submit" title="Make the link">
        ↵
      </button>
    </form>
  );
}
