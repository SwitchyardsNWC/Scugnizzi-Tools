// What leaves the editor: the exported file, the code on the clipboard, and a block drawn as a picture.

import { useCallback, useState, type Dispatch, type StateUpdater } from 'preact/hooks';

import { compile } from '../compile/compile.ts';
import { allBlocks, designSystemOf, renderAsImage } from '../model/edit.ts';
import { download, downloadBlob, type AssetFile, type Workspace } from '../workspace/workspace.ts';
import type { Failed, Notify } from './callbacks.ts';
import { canvasBlob, freeformCanvas } from './picture.ts';
import { fileNameFor, foreignImages, rasterise, textOf, xhtmlOf } from './rasterise.ts';
import { slug } from './starters.ts';
import type { Editor } from './useEditor.ts';

export function useOutput({
  editor,
  workspace,
  frame,
  allAssets,
  notify,
  failed,
  refreshAssets,
  setAssets,
  setError,
}: {
  editor: Editor;
  workspace: Workspace | null;
  /** The canvas's iframe, which a rasterised block is drawn from. */
  frame: { current: HTMLIFrameElement | null };
  allAssets: AssetFile[];
  notify: Notify;
  failed: Failed;
  refreshAssets(where: Workspace | null): Promise<void>;
  setAssets: Dispatch<StateUpdater<AssetFile[]>>;
  setError(message: string | null): void;
}) {
  const [rasterising, setRasterising] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * Draws a block as a picture of itself.
   *
   * The source is the **canvas**, not a second render: the block is found in the preview by its
   * `data-sy-block` marker, and what gets drawn is the cell's own contents, the cell's own inline
   * style minus its padding, and every rule in the preview's head. So the picture is the thing on
   * screen, by construction, rather than by two code paths agreeing.
   *
   * The padding stays outside the picture — it belongs to the column and has dials of its own, and
   * baking it in would mean moving a dial that no longer moves anything.
   */
  const rasteriseBlock = useCallback(
    async (blockId: string) => {
      const doc = frame.current?.contentDocument;
      const marked = doc?.querySelector(`[data-sy-block="${blockId}"]`) as HTMLElement | null;
      // A block on its own wears `hs_padded`; a block in a group does not — the group's column cell
      // wears it once for the whole stack, and each block is a plain row cell of its own inside it.
      const cell = (marked?.querySelector('td.hs_padded') ??
        (marked?.matches('td') ? marked : marked?.querySelector('td'))) as HTMLElement | null;
      if (!doc || !cell) {
        setError('That block is not on the canvas, so there is nothing to draw. Scroll it into view and try again.');
        return;
      }

      setRasterising(true);
      try {
        const style = getComputedStyle(cell);
        const width = Math.round(
          cell.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        );
        // The first ancestor that actually paints. An email is bands inside bands and most of them
        // are transparent; drawing on to whichever one has a colour is the only way the picture
        // sits on the same ground the text did.
        let ground = '#ffffff';
        for (let node: HTMLElement | null = cell; node; node = node.parentElement) {
          const bg = getComputedStyle(node).backgroundColor;
          if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0)')) {
            ground = bg;
            break;
          }
        }
        const css = [...doc.querySelectorAll('style')].map((tag) => tag.textContent ?? '').join('\n');
        const inherited = (cell.getAttribute('style') ?? '').replace(/padding[^;]*;?/g, '');

        // Said before drawing rather than discovered as a SecurityError halfway through: a canvas
        // that has had a cross-origin image drawn into it cannot be read back at all.
        const foreign = foreignImages(cell);
        if (foreign.length > 0) {
          setError(
            `This block shows an image from another site (${new URL(foreign[0]!).hostname}), and a browser will not let me draw one into a picture. Render the block without it, or use an image from the folder's assets.`,
          );
          return;
        }

        // A freeform page with effects is printed from its recipe: a print is pixels, which the page's
        // markup on the canvas cannot carry.
        const printed = allBlocks(editor.template).find((b) => b.id === blockId);
        const shot =
          printed?.type === 'freeform' && printed.effects?.length
            ? await (async () => {
                const canvas = await freeformCanvas(printed, designSystemOf(editor.template), { assets: allAssets, scale: 2, ground });
                const blob = await canvasBlob(canvas);
                return { blob, url: URL.createObjectURL(blob), width: printed.width, height: printed.height };
              })()
            : await rasterise({
                // Serialised as XHTML, not `innerHTML`: a `<br>` in the copy is fatal inside the SVG.
                html: xhtmlOf(cell),
                css,
                width,
                background: ground,
                style: inherited,
                // The classes as well as the style. Nearly every rule that styles this markup is scoped
                // to one of them — `.sy-rich p`, `.sy-rtl-<hex> a` — and they match the cell, not what
                // is inside it.
                className: cell.className,
              });
        const alt = textOf(cell.innerHTML);
        const name = fileNameFor(alt, blockId);

        // With no folder open there is nowhere to write, and the first version simply did not —
        // it named a file it had never produced. The block became an image whose `src` pointed at
        // nothing, so the picture never appeared and the feature read as broken (learnings 3.49).
        // A download is the fallback, and it drops the folder because a download has none.
        let stored: string;
        if (workspace) {
          stored = await workspace.writeAsset(name, shot.blob);
        } else {
          stored = name.split('/').pop()!;
          downloadBlob(stored, shot.blob);
        }

        // The picture on the canvas, now, rather than after a folder re-read — and at all, when
        // there is no folder to re-read. `withLocalAssets` maps a document's file name to a blob
        // URL through this list; the shot already has one, so it goes in under the name the
        // document is about to store.
        setAssets((old) => [...old.filter((a) => a.name !== stored), { name: stored, size: shot.blob.size, url: shot.url }]);

        editor.commit('Render as image', renderAsImage(editor.template, blockId, { src: stored, alt, width }));
        // Only when there is a folder: this re-reads it and revokes the blob above, replacing it
        // with one backed by the file that is actually on disk.
        if (workspace) void refreshAssets(workspace);
        notify(
          workspace?.canWrite
            ? `Drew it into assets/${stored}. Upload it to HubSpot Files and paste the URL in — Checks will not let it export until you do.`
            : `Downloaded ${stored}. Put it somewhere hosted and paste the URL in — Checks will not let it export until you do.`,
          () => editor.undo(),
        );
      } catch (cause) {
        failed(cause, 'The block could not be drawn.');
      } finally {
        setRasterising(false);
      }
    },
    [editor, workspace, notify, refreshAssets, failed, allAssets, frame, setAssets, setError],
  );

  const exportTemplate = useCallback(async () => {
    const name = `${slug(editor.template.name)}.html`;
    const out = compile(editor.template, { mode: 'hubl' });
    if (!workspace?.canWrite) {
      download(name, out.html);
      notify(`Downloaded ${name}. Upload it in Design Manager, open it once so it validates, then publish.`);
      return;
    }
    try {
      const at = await workspace.writeExport(name, out.html);
      notify(`Wrote ${at}. Upload it in Design Manager, open it once so it validates, then publish.`);
    } catch (cause) {
      failed(cause, `Could not write ${name}. Check the folder is still there and writable.`);
    }
  }, [workspace, editor, notify, failed]);

  /**
   * Copy, with the oldest fallback in the book.
   *
   * `navigator.clipboard` needs a secure context and a permission that a browser may simply
   * refuse; when it does, selecting the textarea and asking the document to copy still works
   * everywhere. If both fail the text is already on screen and selectable, which is why this says
   * so rather than throwing.
   */
  const copyCode = useCallback(async () => {
    const text = compile(editor.template, { mode: 'hubl' }).html;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const field = document.querySelector('textarea.code') as HTMLTextAreaElement | null;
      if (field) {
        field.select();
        ok = document.execCommand('copy');
      }
    }
    if (!ok) {
      setError('This browser would not let me reach the clipboard. The text is selectable — ⌘A then ⌘C.');
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [editor.template, setError]);

  return { rasteriseBlock, rasterising, exportTemplate, copyCode, copied };
}
