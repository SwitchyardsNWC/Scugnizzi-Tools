// The Freeform app's Export menu: every way a frame leaves the canvas, in one place at the right of the top bar.
// Downloads first, then Template Studio, which takes the frame into an email rather than a file.

import { useRef, useState } from 'preact/hooks';

import { ContextMenu, type MenuItem } from '../app/ContextMenu.tsx';

export interface ExportMenuProps {
  /** What the frame is called, for the menu's tips. */
  name: string;
  onPng(scale: 1 | 2): void;
  onSvg(): void;
  onCopy(): void;
  /** Template Studio: its label now (Send to an email, In an email, Use in Template Studio) and whether one is open. */
  studio: { label: string; live: boolean };
  onStudio(): void;
}

export function ExportMenu({ onPng, onSvg, onCopy, studio, onStudio }: ExportMenuProps) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  /** The press that closed the menu also clicks the button: that click should not open it again. */
  const closedAt = useRef(0);
  const items: MenuItem[] = [
    { label: 'PNG', keys: '2×  ⇧⌘E', run: () => onPng(2) },
    { label: 'PNG', keys: '1×', run: () => onPng(1) },
    { label: 'SVG', keys: 'vector', run: onSvg },
    { label: 'Copy as PNG', keys: '2×', run: onCopy },
    'sep',
    { label: `${studio.label} ↗`, keys: studio.live ? 'open' : '', run: onStudio },
  ];
  return (
    <>
      <button
        ref={button}
        class="fig-pill fig-done ff-export"
        aria-haspopup="menu"
        aria-expanded={Boolean(at)}
        title="Download this frame, copy it, or take it into Template Studio"
        onClick={() => {
          if (at || Date.now() - closedAt.current < 250) return;
          const r = button.current!.getBoundingClientRect();
          setAt({ x: r.right, y: r.bottom + 6 });
        }}
      >
        Export <span class="caret" aria-hidden="true">▾</span>
      </button>
      {at && (
        <ContextMenu
          x={at.x}
          y={at.y}
          items={items}
          onClose={() => {
            closedAt.current = Date.now();
            setAt(null);
          }}
        />
      )}
    </>
  );
}
