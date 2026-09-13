import { useEffect, useRef } from 'preact/hooks';

import type { SlashItem } from './slash.ts';

// The menu itself. Dumb on purpose: Preview.tsx owns the query, the index and the keys, because
// the keys arrive in the preview document and this component lives in the editor's. It draws the
// list, marks the active row, and reports a click or a hover.
//
// Rendered over the canvas rather than inside it, like the action bar and the drop indicator, so
// nothing here can reach an exported template.

export interface SlashMenuProps {
  items: SlashItem[];
  index: number;
  top: number;
  left: number;
  /** What was typed, so an empty result can say so. */
  query: string;
  /**
   * One heading for the whole list instead of one per group, and no tag on the rows. The type
   * menu on a block's bar uses the same list to say what a block could *become*, and "Add below"
   * would be the wrong word for it.
   */
  title?: string;
  onPick(item: SlashItem): void;
  onHover(index: number): void;
}

const GROUP_NAMES: Record<SlashItem['group'], string> = { recent: 'Recent', format: 'Format', block: 'Add below' };

export function SlashMenu({ items, index, top, left, query, title, onPick, onHover }: SlashMenuProps) {
  const list = useRef<HTMLDivElement | null>(null);

  // The active row follows the arrow keys into view. `nearest`, so the list does not jump when the
  // row is already visible — the same rule the layer tree uses (reveal.ts).
  useEffect(() => {
    const row = list.current?.querySelector('.sy-slash-item.on') as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }, [index, items]);

  // Focus stays in the preview. A click here must not take it, or the editable commits and the
  // command runs against nothing — the same rule the old toolbar lived by.
  const hold = (event: Event) => event.preventDefault();

  let lastGroup: SlashItem['group'] | null = null;

  return (
    <div class="sy-slash" style={{ top: `${top}px`, left: `${left}px` }} onMouseDown={hold} role="listbox" ref={list}>
      {items.length === 0 && (
        <div class="sy-slash-empty">
          Nothing matches “{query}”.
        </div>
      )}
      {items.map((item, i) => {
        const header = title ? i === 0 : item.group !== lastGroup;
        lastGroup = item.group;
        return (
          <div key={item.id}>
            {header && <div class="sy-slash-group">{title ?? GROUP_NAMES[item.group]}</div>}
            <button
              type="button"
              class={`sy-slash-item ${i === index ? 'on' : ''}`}
              role="option"
              aria-selected={i === index}
              title={item.hint}
              onMouseDown={hold}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(item)}
            >
              <span class="sy-slash-label">{item.label}</span>
              {item.group !== 'format' && !title && <span class="sy-slash-tag">block</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
