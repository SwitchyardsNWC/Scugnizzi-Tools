// What floats over the whole app: the shortcut sheet, the toast, and the ghost of a block being dragged in.

import { CATALOG } from '../model/catalog.ts';
import { glyphFor } from './icons.tsx';
import { isPatternKind, patternIdOf, type PaletteKind, type PatternCard } from './Palette.tsx';
import { SHORTCUTS } from './slash.ts';

/** The sheet `?` opens. Data from slash.ts, so what it says and what the keys do come from one list. */
export function KeysSheet({ onClose }: { onClose(): void }) {
  return (
    <div class="keys-backdrop" onClick={onClose}>
      <div class="keys" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div class="drawer-head">
          <b>Keyboard</b>
          <span class="muted">Esc closes this</span>
          <button class="link" onClick={onClose}>
            Close
          </button>
        </div>
        <table class="keys-table">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={`${s.keys}-${s.does}`}>
                <td>
                  <kbd>{s.keys}</kbd>
                </td>
                <td>
                  {s.does}
                  {s.when && <i class="keys-when"> · {s.when}</i>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Toast({ toast, onClose }: { toast: { message: string; undo?: () => void }; onClose(): void }) {
  return (
    <div class="toast">
      {toast.message}
      {toast.undo && (
        <button
          class="toast-undo"
          onClick={() => {
            toast.undo?.();
            onClose();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

/**
 * The ghost. It is what turns "the pointer moved" into "I am carrying something", and it is the
 * piece that was missing: a drop indicator alone tells you where it would land but not that
 * anything is in your hand.
 */
export function DragGhost({ dragType, at, patterns }: { dragType: PaletteKind; at: { x: number; y: number }; patterns: PatternCard[] }) {
  const Glyph = glyphFor(dragType);
  return (
    <div class="sy-ghost" style={{ left: `${at.x}px`, top: `${at.y}px` }} aria-hidden="true">
      <Glyph />
      {dragType === 'columns'
        ? 'Columns'
        : isPatternKind(dragType)
          ? (patterns.find((p) => p.id === patternIdOf(dragType))?.name ?? 'Pattern')
          : CATALOG[dragType].name}
    </div>
  );
}
