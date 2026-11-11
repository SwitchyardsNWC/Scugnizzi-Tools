// The right-click menu on the freeform canvas: the everyday moves, each with its key, so the menu teaches the
// shortcuts. Closes on a pick, a click elsewhere, Escape or a scroll.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export type MenuItem = 'sep' | { label: string; keys?: string; run(): void; off?: boolean; danger?: boolean };

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose(): void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState({ x, y });

  // Kept on screen: opened near an edge, it flips to the other side of the pointer.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAt({
      x: x + r.width > window.innerWidth - 8 ? Math.max(8, x - r.width) : x,
      y: y + r.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - r.height - 8) : y,
    });
    el.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      e.stopPropagation();
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('wheel', away, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('wheel', away, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);

  return (
    <div ref={ref} class="fig-chrome fig-menu" role="menu" style={{ left: `${at.x}px`, top: `${at.y}px` }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === 'sep' ? (
          <hr key={`s${i}`} />
        ) : (
          <button
            key={it.label}
            role="menuitem"
            class={it.danger ? 'danger' : ''}
            disabled={it.off}
            onClick={() => {
              onClose();
              it.run();
            }}
          >
            <span>{it.label}</span>
            {it.keys && <kbd>{it.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
