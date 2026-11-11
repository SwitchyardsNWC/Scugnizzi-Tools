// The brand library: the marks, the project's own pictures and the palette, in one panel beside the canvas.
//
// Jared asked for a brand library in place of the Stamp tool: "Logos, club marks, approved photography and
// patterns, in one panel and dropped in at the right size and colour." The marks are the bundled brand marks
// (model/marks.ts), drawn in the colour you pick; the pictures are the project's assets and the ones kept in
// this browser; the colours are the design system's palette, each with its name and hex, so none is told by
// its swatch alone. Click to place in the middle of the page, or drag onto the page to place it there.

import { useMemo, useState } from 'preact/hooks';

import { colorOf, type ColorRef, type DesignSystem } from '../model/design-system.ts';
import { MARKS } from '../model/marks.ts';
import type { AssetFile } from '../workspace/workspace.ts';

/** What a drag from the library carries to the canvas. */
export const BRAND_DRAG = 'application/x-sy-brand';
export type BrandItem = { kind: 'mark'; key: string } | { kind: 'picture'; name: string; url: string };

const PICTURE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

export interface BrandLibraryProps {
  ds: DesignSystem;
  assets: AssetFile[];
  /** The colour marks are drawn in: the dock's paint, or the ink. */
  ink: ColorRef;
  onInk(color: ColorRef): void;
  onPlace(item: BrandItem): void;
  /** Paints what is picked, as the dock's colour does. */
  onPaint(color: ColorRef): void;
  onClose(): void;
}

export function BrandLibrary({ ds, assets, ink, onInk, onPlace, onPaint, onClose }: BrandLibraryProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const pictures = useMemo(() => assets.filter((a) => PICTURE.test(a.name) && a.url), [assets]);
  const marks = MARKS.filter((m) => !q || `${m.name} ${m.key}`.toLowerCase().includes(q));
  const shown = pictures.filter((p) => !q || p.name.toLowerCase().includes(q));
  const colours = Object.entries(ds.colors).filter(([name, hex]) => !q || `${name} ${hex}`.toLowerCase().includes(q));
  const inkHex = colorOf(ds, ink) ?? '#1e1c19';
  const drag = (item: BrandItem) => (e: DragEvent) => {
    e.dataTransfer?.setData(BRAND_DRAG, JSON.stringify(item));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside class="fig-chrome fig-library" aria-label="Brand library">
      <div class="fig-panel-head">
        <b>Brand</b>
        <span class="grow" />
        <button class="fig-icon-btn" title="Close  ·  E" aria-label="Close the brand library" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div class="fig-library-body">
        <input class="fig-library-search" type="search" placeholder="Search marks, pictures, colours" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Search the brand library" />

        <div class="fig-page-row">
          <span class="fig-fx-sub">Marks</span>
          <span class="grow" />
          <span class="fig-library-ink" title={`Marks are placed in ${typeof ink === 'string' && ds.colors[ink] ? ink : 'the ink'}, ${inkHex}`}>
            <i style={{ background: inkHex }} aria-hidden="true" />
            <code>{inkHex.toUpperCase()}</code>
          </span>
        </div>
        <div class="fig-library-grid">
          {marks.map((m) => (
            <button key={m.key} class="fig-library-item" draggable title={`${m.name}. Click to place it, or drag it onto the page.`} onDragStart={drag({ kind: 'mark', key: m.key })} onClick={() => onPlace({ kind: 'mark', key: m.key })}>
              <svg viewBox={m.viewBox} fill={inkHex} aria-hidden="true" dangerouslySetInnerHTML={{ __html: m.body }} />
              <span>{m.name}</span>
            </button>
          ))}
          {marks.length === 0 && <p class="fig-fx-hint">No marks match.</p>}
        </div>

        <span class="fig-fx-sub">Pictures</span>
        {shown.length > 0 ? (
          <div class="fig-library-grid pictures">
            {shown.map((p) => (
              <button key={p.name} class="fig-library-item" draggable title={`${p.name}. Click to place it, or drag it onto the page.`} onDragStart={drag({ kind: 'picture', name: p.name, url: p.url })} onClick={() => onPlace({ kind: 'picture', name: p.name, url: p.url })}>
                <img src={p.url} alt="" loading="lazy" />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p class="fig-fx-hint">{q ? 'No pictures match.' : 'The project’s photographs and logos show here. Add them with Image, or by dropping files on the page.'}</p>
        )}

        <span class="fig-fx-sub">Colours</span>
        <ul class="fig-library-colours">
          {colours.map(([name, hex]) => (
            <li key={name}>
              <button title={`Paint what is picked ${name}, and draw marks in it`} onClick={() => (onInk(name), onPaint(name))}>
                <i style={{ background: hex }} aria-hidden="true" />
                <b>{name}</b>
                <code>{hex.toUpperCase()}</code>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
