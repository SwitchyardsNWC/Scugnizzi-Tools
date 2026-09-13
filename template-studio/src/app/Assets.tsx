import { useRef } from 'preact/hooks';

import { CATALOG } from '../model/catalog.ts';
import { siteOf } from '../model/edit.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { capture, release } from './pointer.ts';
import type { Editor } from './useEditor.ts';

// Pictures sitting in the workspace's `assets/` folder.
//
// The honest part, and the reason this is paired with a lint rule rather than shipped alone: a blob
// URL exists in this tab and nowhere else. What goes into the document is the **file name**, which
// is not a URL an email client can fetch — so a template whose images are still local is not
// sendable, and `local-image` says so before Export does anything.
//
// That pairing is what makes the folder useful instead of a trap. Design against the real pictures
// at the real dimensions, then be told exactly which ones still need a hosted URL. The alternative
// — writing a blob URL into the template — would produce a file that looks finished and arrives in
// somebody's inbox with every image broken.

export interface AssetsProps {
  editor: Editor;
  assets: AssetFile[];
  /** Null while a folder has not been opened. Empty array means opened, with nothing in `assets/`. */
  folder: string | null;
  onOpenFolder(): void;
  /**
   * A freeform surface is open: a picture dragged out of the panel lands where it is dropped on
   * the surface, and one clicked lands in the middle. Absent otherwise.
   */
  onDropAsset?(asset: AssetFile, at: { x: number; y: number } | null): void;
}

/** `rendered/lede.png` → `rendered`, and `hero.png` → null. */
const folderOf = (name: string) => (name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : null);
const baseOf = (name: string) => name.slice(name.lastIndexOf('/') + 1);

const kb = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`);

export function Assets({ editor, assets, folder, onOpenFolder, onDropAsset }: AssetsProps) {
  const site = editor.selection.kind === 'block' ? siteOf(editor.template, editor.selection.blockId) : null;
  const picked = site?.column.blocks[site.index];
  const target = picked?.type === 'image' ? picked : null;
  /** A picture being dragged towards the surface: where it started, and whether it has left. */
  const dragging = useRef<{ asset: AssetFile; x: number; y: number; moved: boolean } | null>(null);

  const onPointerDown = (event: PointerEvent, asset: AssetFile) => {
    if (!onDropAsset || event.button !== 0) return;
    capture(event.currentTarget as HTMLElement, event.pointerId);
    dragging.current = { asset, x: event.clientX, y: event.clientY, moved: false };
  };
  const onPointerMove = (event: PointerEvent) => {
    const d = dragging.current;
    if (!d || d.moved) return;
    if (Math.hypot(event.clientX - d.x, event.clientY - d.y) > 5) d.moved = true;
  };
  const onPointerUp = (event: PointerEvent) => {
    const d = dragging.current;
    release(event.currentTarget as HTMLElement, event.pointerId);
    dragging.current = null;
    if (!d || !onDropAsset) return;
    // Dropped on the surface: there. A plain click: the middle of it.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    if (d.moved) {
      if (under?.closest('.surface-svg')) onDropAsset(d.asset, { x: event.clientX, y: event.clientY });
    } else onDropAsset(d.asset, null);
  };

  if (!folder) {
    return (
      <div class="assets-pane">
        <p class="empty">
          Open a folder and anything in its <code>assets</code> directory shows up here.
        </p>
        <button class="btn wide" onClick={onOpenFolder}>
          Open folder…
        </button>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div class="assets-pane">
        <p class="empty">
          No images in <code>{folder}/assets</code>, or in any folder inside it. Put some there and
          reopen the folder.
        </p>
      </div>
    );
  }

  // Grouped by folder, top level first, then folders in name order.
  const byFolder = new Map<string | null, AssetFile[]>();
  for (const asset of assets) {
    const folder = folderOf(asset.name);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), asset]);
  }
  const groups = [...byFolder.entries()].sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)));

  return (
    <div class="assets-pane">
      <p class="hint" title="A file name is not a URL an email client can fetch, so Checks will refuse to export until every image points at a hosted one. Design with these, then swap them for HubSpot Files URLs.">
        {onDropAsset ? 'Drag one onto the surface, or click to drop it in the middle.' : target ? `Click one to use it in the selected ${CATALOG.image.name}.` : 'Select an Image block, then click one of these.'}
      </p>

      {/* One group per folder, the top of `assets/` first. A grid that mixes `hero.png` with
          `rendered/lede.png` and `logos/mark.svg` has to be read to the middle of every name;
          grouped, the folder is read once and the names are only the names. */}
      {groups.map(([folder, items]) => (
        <section class="assets-group" key={folder ?? ''}>
          <h3 title={folder ? `assets/${folder}/` : 'The top of the assets folder.'}>
            {folder ? `${folder}/` : 'assets/'}
            <span class="muted">{items.length}</span>
          </h3>
      <div class="assets-grid">
        {items.map((asset) => {
          const used = target?.src === asset.name;
          return (
            <button
              key={asset.name}
              class={`asset ${used ? 'on' : ''} ${onDropAsset ? 'droppable' : ''}`}
              disabled={!target && !onDropAsset}
              title={
                onDropAsset
                  ? `Drag ${asset.name} onto the surface, or click to drop it in the middle.`
                  : target
                    ? `Use ${asset.name} in the selected image. It stays a local file until you paste a hosted URL over it.`
                    : `${asset.name} — select an Image block first.`
              }
              onClick={() => !onDropAsset && target && editor.set('block.src', asset.name)}
              onPointerDown={(e) => onPointerDown(e, asset)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <span class="asset-thumb">
                <img src={asset.url} alt="" loading="lazy" />
              </span>
              {/* The folder in front, quieter than the file. A grid of `rendered/…` all reading
                  the same for the first nine characters is a grid you have to read to the middle
                  of every time. */}
              <span class="asset-name">{baseOf(asset.name)}</span>
              <span class="asset-size">{kb(asset.size)}</span>
            </button>
          );
        })}
      </div>
        </section>
      ))}
    </div>
  );
}
