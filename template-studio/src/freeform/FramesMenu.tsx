import { useEffect, useState } from 'preact/hooks';

import { freeformSvg } from '../compile/freeform.ts';
import type { DesignSystem } from '../model/design-system.ts';
import type { FrameIndex } from '../model/frame-store.ts';
import { FRAME_SIZES, STARTERS, type FrameSize } from '../model/frame-sizes.ts';
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
  /** A new frame of a size, begun from a starter. */
  onNew(size?: FrameSize, starter?: string): void;
  onDuplicate(key: string): void;
  onRename(key: string, name: string): void;
  onRemove(key: string): void;
}

export function FramesMenu({ frames, ds, assets, activeDoc, docOf, linkedKeys, onOpen, onNew, onDuplicate, onRename, onRemove }: FramesMenuProps) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<{ key: string; value: string } | null>(null);
  /** The new-frame picker: a size and a starter, then Create. */
  const [making, setMaking] = useState<{ size: string; starter: string } | null>(null);
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
          {making ? (
            <div class="ff-new">
              {(['Email', 'Social', 'Print'] as const).map((g) => (
                <div key={g} class="ff-new-group">
                  <div class="fig-fx-sub">{g}</div>
                  <div class="ff-sizes">
                    {FRAME_SIZES.filter((s) => s.group === g).map((s) => {
                      const k = 34 / Math.max(s.width, s.height);
                      return (
                        <button key={s.key} class={`ff-size ${making.size === s.key ? 'on' : ''}`} aria-pressed={making.size === s.key} title={`${s.label}, ${s.width} × ${s.height}`} onClick={() => setMaking({ ...making, size: s.key })}>
                          <svg class="ff-size-shape" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
                            <rect x={20 - (s.width * k) / 2} y={20 - (s.height * k) / 2} width={s.width * k} height={s.height * k} rx="2" />
                          </svg>
                          <b>{s.label}</b>
                          <small>
                            {s.width} × {s.height}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div class="fig-fx-sub">Start from</div>
              <div class="fig-fx-chips" role="group" aria-label="Starter">
                {STARTERS.map((st) => (
                  <button key={st.key} class={`fig-fx-chip ${making.starter === st.key ? 'on' : ''}`} aria-pressed={making.starter === st.key} title={st.help} onClick={() => setMaking({ ...making, starter: st.key })}>
                    {st.label}
                  </button>
                ))}
              </div>
              <div class="fig-fx-actions">
                <button class="fig-chip" onClick={() => setMaking(null)}>
                  Cancel
                </button>
                <button
                  class="fig-chip primary"
                  onClick={() => {
                    onNew(FRAME_SIZES.find((s) => s.key === making.size), making.starter);
                    setMaking(null);
                    setOpen(false);
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button class="ff-frames-new" onClick={() => setMaking({ size: 'email-header', starter: 'blank' })}>
              + New frame
            </button>
          )}
        </div>
      )}
    </div>
  );
}
