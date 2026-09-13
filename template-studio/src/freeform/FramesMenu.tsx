import { useEffect, useState } from 'preact/hooks';

import { freeformSvg } from '../compile/freeform.ts';
import type { DesignSystem } from '../model/design-system.ts';
import type { FrameIndex } from '../model/frame-store.ts';
import type { FreeformBlock, Template } from '../model/types.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { withLocalAssets, withoutMissingPictures } from '../app/local-assets.ts';

// The Freeform app's frames: a pill naming the frame on the canvas, and a list to switch, add, rename,
// duplicate and delete. Every change goes through the frame store (model/frame-store.ts), which the page
// owns; this only says what was asked for.

function pageOf(t: Template): FreeformBlock | null {
  for (const s of t.sections) for (const r of s.rows) for (const c of r.columns) for (const b of c.blocks) if (b.type === 'freeform') return b;
  return null;
}

export interface FramesMenuProps {
  frames: FrameIndex;
  ds: DesignSystem;
  assets: AssetFile[];
  /** The open frame's drawing as it is now, which the store may be a moment behind. */
  activeDoc: Template;
  docOf(key: string): Template;
  /** Frames an open Template Studio's email follows. */
  linkedKeys: string[];
  onOpen(key: string): void;
  onNew(): void;
  onDuplicate(key: string): void;
  onRename(key: string, name: string): void;
  onRemove(key: string): void;
}

export function FramesMenu({ frames, ds, assets, activeDoc, docOf, linkedKeys, onOpen, onNew, onDuplicate, onRename, onRemove }: FramesMenuProps) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<{ key: string; value: string } | null>(null);
  const active = frames.frames.find((f) => f.key === frames.active);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.('.ff-frames')) return;
      setOpen(false);
      setNaming(null);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const commitName = () => {
    if (naming) onRename(naming.key, naming.value);
    setNaming(null);
  };

  return (
    <div class="ff-frames">
      <button class={`fig-pill ff-frames-pill ${open ? 'on' : ''}`} aria-expanded={open} title="Frames: switch between them, add one, rename, duplicate or delete" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M7 3v18M17 3v18M3 7h18M3 17h18" />
        </svg>
        <b>{active?.name ?? 'Frame'}</b>
        <span class="fig-count">{frames.frames.length}</span>
        <span class="caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div class="ff-frames-pop" role="menu">
          <ul class="ff-frame-list">
            {frames.frames.map((f) => {
              const on = f.key === frames.active;
              const page = pageOf(on ? activeDoc : docOf(f.key));
              const thumb = page ? withoutMissingPictures(withLocalAssets(freeformSvg(page, ds), assets)) : '';
              const inEmail = linkedKeys.includes(f.key);
              const renaming = naming?.key === f.key;
              return (
                <li key={f.key} class={`ff-frame ${on ? 'on' : ''}`}>
                  <div
                    class="ff-frame-main"
                    role="button"
                    tabIndex={0}
                    title={on ? 'The frame on the canvas. Double-click to rename.' : `Open ${f.name}. Double-click to rename.`}
                    onClick={() => {
                      if (renaming) return;
                      onOpen(f.key);
                      setOpen(false);
                    }}
                    onDblClick={() => setNaming({ key: f.key, value: f.name })}
                  >
                    <span class="ff-frame-thumb" dangerouslySetInnerHTML={{ __html: thumb }} />
                    <span class="ff-frame-text">
                      {renaming ? (
                        <input
                          class="ff-frame-input"
                          value={naming.value}
                          maxLength={60}
                          aria-label="Frame name"
                          ref={(el) => {
                            if (el && document.activeElement !== el) {
                              el.focus();
                              el.select();
                            }
                          }}
                          onInput={(e) => setNaming({ key: f.key, value: (e.target as HTMLInputElement).value })}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') commitName();
                            if (e.key === 'Escape') setNaming(null);
                          }}
                          onBlur={commitName}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <b class="ff-frame-name">{f.name}</b>
                      )}
                      <span class="ff-frame-facts">
                        {page ? `${page.width} × ${page.height}` : ''}
                        {page?.effects?.length ? ' · Riso' : ''}
                        {inEmail ? ' · in the email' : ''}
                      </span>
                    </span>
                  </div>
                  <span class="ff-frame-actions">
                    <button title="Rename" aria-label={`Rename ${f.name}`} onClick={() => setNaming({ key: f.key, value: f.name })}>
                      ✎
                    </button>
                    <button
                      title="Duplicate"
                      aria-label={`Duplicate ${f.name}`}
                      onClick={() => {
                        onDuplicate(f.key);
                        setOpen(false);
                      }}
                    >
                      ⧉
                    </button>
                    <button
                      class="danger"
                      disabled={frames.frames.length <= 1}
                      title={frames.frames.length <= 1 ? 'The last frame stays: there is always one to draw on.' : inEmail ? `Delete ${f.name}. The email that follows it keeps the drawing it has.` : `Delete ${f.name}`}
                      aria-label={`Delete ${f.name}`}
                      onClick={() => onRemove(f.key)}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <button
            class="ff-frames-new"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
          >
            + New frame
          </button>
        </div>
      )}
    </div>
  );
}
