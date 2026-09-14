// The ⋯ menu on a row of the canvas.

import type { RowMenuSpec } from './types.ts';

/**
 * The row's menu: the structure decisions in one place on the row itself, so a designer who has
 * just clicked something on the canvas is not sent to a side panel for the number of columns.
 * Layout, phones, background, then the verbs; each closes the menu when it has acted.
 */
export function RowMenu({ spec, top, left, onClose }: { spec: RowMenuSpec | null; top: number; left: number; onClose(): void }) {
  if (!spec) return null;
  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <div class="sy-rowmenu" style={{ top: `${top}px`, left: `${left}px` }} onPointerDown={(e) => e.stopPropagation()}>
      {spec.columns && (
        <div class="sy-rowmenu-group">
          <span class="sy-rowmenu-label">Columns</span>
          <div class="seg" role="group" aria-label="Number of columns">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} class={`seg-btn ${spec.columns!.count === n ? 'on' : ''}`} aria-pressed={spec.columns!.count === n} onClick={done(() => spec.columns!.onPick(n))}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
      {spec.mobile && (
        <div class="sy-rowmenu-group">
          <span class="sy-rowmenu-label">On phones</span>
          <select value={spec.mobile.value} onChange={(e) => spec.mobile!.onPick((e.target as HTMLSelectElement).value as 'stack' | 'side-by-side')}>
            <option value="stack">Stack, full width each</option>
            <option value="side-by-side">Stay side by side</option>
          </select>
        </div>
      )}
      {spec.background && (
        <div class="sy-rowmenu-group">
          <span class="sy-rowmenu-label">Background</span>
          <select value={spec.background.value} onChange={(e) => spec.background!.onPick((e.target as HTMLSelectElement).value)}>
            {spec.background.options.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div class="sy-rowmenu-actions">
        {spec.actions.map((a) => (
          <button key={a.label} class={a.danger ? 'danger' : ''} title={a.title} onClick={done(a.onClick)}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
