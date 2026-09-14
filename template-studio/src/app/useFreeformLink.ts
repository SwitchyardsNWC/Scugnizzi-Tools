// The Freeform app and the email, both ways.
//
// This way: the Freeform app's frames, followed live (model/freeform-link.ts). Its tab writes on
// every change and this tab hears it; a block linked to a frame takes the frame's drawing. Pages
// with effects are printed (picture.ts) so the email canvas shows the print rather than the plain
// drawing. The other way: the Freeform app can send a frame here, into the open email.

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { freeformSvg } from '../compile/freeform.ts';
import { colorOf } from '../model/design-system.ts';
import { allBlocks, designSystemOf, siteOf } from '../model/edit.ts';
import { recipeHash } from '../model/freeform.ts';
import {
  addFrameBlock,
  followFrame,
  isCurrent,
  linkedBlocks,
  readAppFrames,
  readStudioPresence,
  STUDIO_PRESENCE,
  STUDIO_REQUEST,
  unlinkFrame,
  type AppFrame,
  type FrameScope,
} from '../model/freeform-link.ts';
import type { FreeformBlock, Template } from '../model/types.ts';
import { readProject } from '../project/folder.ts';
import type { AssetFile, Workspace } from '../workspace/workspace.ts';
import type { Notify } from './callbacks.ts';
import type { FreeformAppUi } from './Inspector.tsx';
import { loadKeptPictures } from './kept-pictures.ts';
import { withLocalAssets, withoutMissingPictures } from './local-assets.ts';
import { canvasBlob, freeformCanvas } from './picture.ts';
import type { Editor } from './useEditor.ts';

/** A freeform page with effects, printed: what the email canvas shows in its place (printed-preview.ts). */
export type Print = { key: string; url: string };

/** The Freeform app's frames, from this site's storage; none when it cannot be read. */
export function readFreeformFrames(scope: FrameScope | null = null, keep: string[] = []): AppFrame[] {
  try {
    return readAppFrames((key) => localStorage.getItem(key), scope, keep);
  } catch {
    return [];
  }
}

export function useFreeformLink({
  editor,
  workspace,
  shownTemplate,
  assets,
  notify,
}: {
  editor: Editor;
  workspace: Workspace | null;
  /** The template the canvas is showing, which lags the document by a beat. */
  shownTemplate: Template;
  /** The folder's assets. */
  assets: AssetFile[];
  notify: Notify;
}) {
  /** Pictures the Freeform app keeps (kept-pictures.ts), so a block linked to its frame shows them. The folder's win a clash of names. */
  const [kept, setKept] = useState<AssetFile[]>([]);
  const allAssets = useMemo(() => [...assets, ...kept.filter((k) => !assets.some((a) => a.name === k.name))], [assets, kept]);
  /** The Freeform app's frames, read from this site's storage (model/frame-store.ts, model/freeform-link.ts). */
  const [appFrames, setAppFrames] = useState<AppFrame[]>(readFreeformFrames);
  /**
   * With a project open, the frames it offers are that project's (model/freeform-link.ts): the browser keeps every
   * project's frames, and a list of all of them was the other projects' clutter.
   */
  const [frameScope, setFrameScope] = useState<FrameScope | null>(null);
  const frameScopeRef = useRef<FrameScope | null>(null);
  frameScopeRef.current = frameScope;
  useEffect(() => {
    const dir = workspace?.handle;
    if (!dir) {
      setFrameScope(null);
      return;
    }
    let cancelled = false;
    readProject(dir, false)
      .then((info) => {
        if (!cancelled) setFrameScope({ project: info.id, adopts: !info.type });
      })
      .catch(() => {
        if (!cancelled) setFrameScope(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  // --- prints: every page with effects, printed once its recipe settles ------------------------------------
  // Jared: "freeform in template studio does not carry the effect back after hitting done" — the canvas
  // printed it, the email drew it plain.
  const [prints, setPrints] = useState<Record<string, Print>>({});
  const printsRef = useRef<Record<string, Print>>({});
  useEffect(() => {
    const ds = designSystemOf(shownTemplate);
    const names = allAssets.map((a) => a.name).join('|');
    const wanted: Array<{ block: FreeformBlock; ground: string; key: string }> = [];
    for (const s of shownTemplate.sections)
      for (const r of s.rows)
        for (const c of r.columns)
          for (const b of c.blocks) {
            if (b.type !== 'freeform' || !b.effects?.length) continue;
            const ground = colorOf(ds, b.background) ?? s.containerColor ?? s.bandColor ?? '#ffffff';
            wanted.push({ block: b, ground, key: `${recipeHash(b)}|${ground}|${names}` });
          }
    if (wanted.length === 0 && Object.keys(printsRef.current).length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const next: Record<string, Print> = {};
      const made: string[] = [];
      for (const w of wanted) {
        const old = printsRef.current[w.block.id];
        if (old?.key === w.key) {
          next[w.block.id] = old;
          continue;
        }
        try {
          const blob = await canvasBlob(await freeformCanvas(w.block, ds, { assets: allAssets, scale: 2, ground: w.ground }));
          const url = URL.createObjectURL(blob);
          made.push(url);
          next[w.block.id] = { key: w.key, url };
        } catch {
          // The page stays drawn plain.
        }
        if (cancelled) break;
      }
      if (cancelled) return made.forEach((url) => URL.revokeObjectURL(url));
      for (const [id, p] of Object.entries(printsRef.current)) if (next[id]?.url !== p.url) URL.revokeObjectURL(p.url);
      printsRef.current = next;
      setPrints(next);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [shownTemplate, allAssets]);

  // --- the Freeform app's frames, followed live ---------------------------------------------------------------
  const framesKey = (frames: AppFrame[]) => frames.map((f) => `${f.key}:${f.hash}:${f.name}`).join('|');
  const framesSignature = framesKey(appFrames);
  // Frames this email already follows stay listed whatever project they belong to, so a link is never hidden.
  const followedKeys = useRef<string[]>([]);
  followedKeys.current = linkedBlocks(editor.template).flatMap((b) => (b.source ? [b.source.key] : []));
  useEffect(() => {
    const next = readFreeformFrames(frameScope, followedKeys.current);
    setAppFrames((old) => (framesKey(old) === framesKey(next) ? old : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameScope]);
  useEffect(() => {
    const read = () => {
      const next = readFreeformFrames(frameScopeRef.current, followedKeys.current);
      setAppFrames((old) => (framesKey(old) === framesKey(next) ? old : next));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith('scuggnizzi.freeform.')) read();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', read);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', read);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pictures the Freeform app keeps, read again whenever a frame changes, since that is when one may have been dropped.
  useEffect(() => {
    let cancelled = false;
    loadKeptPictures()
      .then((list) => {
        if (cancelled) return list.forEach((p) => URL.revokeObjectURL(p.url));
        setKept((old) => {
          old.forEach((p) => URL.revokeObjectURL(p.url));
          return list;
        });
      })
      .catch(() => {
        // No IndexedDB here: a linked frame's pictures show as missing.
      });
    return () => {
      cancelled = true;
    };
  }, [framesSignature]);

  // Linked blocks follow their frames. A burst of changes in the Freeform tab is one undo step here. A block
  // whose frame was deleted keeps the drawing it has.
  useEffect(() => {
    let next = editor.template;
    for (const b of linkedBlocks(next)) {
      const frame = appFrames.find((f) => f.key === b.source?.key);
      if (frame && !isCurrent(b, frame)) next = followFrame(next, b.id, frame);
    }
    if (next !== editor.template) editor.commit('Update from Freeform', next, { coalesce: 'freeform-link' });
  }, [appFrames, editor]);

  /** Opens the Freeform app in a new tab, on a frame when one is named. */
  const openFreeformApp = useCallback(
    (key?: string) => {
      const url = new URL(`freeform.html${key ? `?frame=${encodeURIComponent(key)}` : ''}`, window.location.href).href;
      const tab = window.open(url, '_blank');
      notify(tab ? 'Freeform is open in a new tab. What you change there shows up here.' : 'The browser blocked the new tab. Allow pop-ups for this page, or open Freeform from the dashboard.');
    },
    [notify],
  );

  /** The Freeform app's frames, for the selected freeform block's panel: see them, pick one to follow, open it. */
  const freeformApp = useMemo<FreeformAppUi | undefined>(() => {
    const sel = editor.selection;
    if (sel.kind !== 'block') return undefined;
    const block = allBlocks(editor.template).find((b) => b.id === sel.blockId);
    if (!block || block.type !== 'freeform') return undefined;
    const ds = designSystemOf(editor.template);
    const linkedKey = block.source?.app === 'freeform' ? block.source.key : null;
    const followed = linkedKey ? appFrames.find((f) => f.key === linkedKey) : undefined;
    return {
      frames: appFrames.map((f) => ({
        key: f.key,
        name: f.name,
        width: f.page.width,
        height: f.page.height,
        layers: f.page.layers.length,
        printed: Boolean(f.page.effects?.length),
        thumb: withoutMissingPictures(withLocalAssets(freeformSvg(f.page, ds), allAssets)),
      })),
      linkedKey,
      missing: Boolean(linkedKey && !followed),
      current: Boolean(followed && isCurrent(block, followed)),
      ...(prints[block.id] ? { print: prints[block.id]!.url } : {}),
      onLink: (key: string) => {
        const frame = appFrames.find((f) => f.key === key);
        if (frame) editor.commit(linkedKey ? `Follow ${frame.name}` : 'Link to Freeform', followFrame(editor.template, block.id, frame));
      },
      onUnlink: () => editor.commit('Unlink from Freeform', unlinkFrame(editor.template, block.id)),
      onOpen: (key?: string) => openFreeformApp(key ?? linkedKey ?? undefined),
    };
  }, [editor, appFrames, allAssets, prints, openFreeformApp]);

  // --- the other way: the Freeform app sends a frame here (model/freeform-link.ts) ------------------------

  const studioTab = useRef(Math.random().toString(36).slice(2));

  /** Shows a Freeform frame in this email: selects the block that follows it, or adds one above the footer. */
  const bringFrame = (key?: string) => {
    const frames = readFreeformFrames();
    const frame = key ? frames.find((f) => f.key === key) : frames[0];
    if (!frame) return notify(key ? 'That Freeform frame is gone.' : 'The Freeform app has no frame to bring in yet.');
    const t = editor.template;
    const already = linkedBlocks(t).find((b) => b.source?.key === frame.key);
    if (already) {
      const site = siteOf(t, already.id);
      if (site) editor.select({ kind: 'block', sectionId: site.section.id, blockId: already.id });
      return notify(`${frame.name} is here, in ${t.name}.`);
    }
    const added = addFrameBlock(t, frame, `ff${Date.now().toString(36)}-`);
    editor.commit(`Add ${frame.name}`, added.template, { select: { kind: 'block', sectionId: added.sectionId, blockId: added.blockId } });
    notify(`Added ${frame.name} to ${t.name}, above the footer. It follows the frame from now on.`, () => editor.undo());
  };
  const bringFrameRef = useRef(bringFrame);
  bringFrameRef.current = bringFrame;

  // Says this tab is open, which email it holds, and which frames that email follows. Every 20 seconds is
  // enough: a background tab's timers run about once a minute anyway, and presence lasts two.
  const linkedKeys = [...new Set(linkedBlocks(editor.template).map((b) => b.source!.key))];
  const linkedSignature = linkedKeys.join('|');
  useEffect(() => {
    const write = () => {
      try {
        localStorage.setItem(STUDIO_PRESENCE, JSON.stringify({ tab: studioTab.current, email: editor.template.name, linked: linkedKeys.length, keys: linkedKeys, at: Date.now() }));
      } catch {
        // Storage full or blocked: the Freeform app offers to open Template Studio instead.
      }
    };
    write();
    const timer = window.setInterval(write, 20_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.template.name, linkedSignature]);

  useEffect(() => {
    const leave = () => {
      try {
        if (readStudioPresence(localStorage.getItem(STUDIO_PRESENCE))?.tab === studioTab.current) localStorage.removeItem(STUDIO_PRESENCE);
      } catch {
        // Nothing to take back.
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STUDIO_REQUEST || !event.newValue) return;
      try {
        const request = JSON.parse(event.newValue) as { action?: string; tab?: string; key?: string };
        if (request.action === 'link' && request.tab === studioTab.current) bringFrameRef.current(request.key);
      } catch {
        // Not a request this tab understands.
      }
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('storage', onStorage);
    // Opened by the Freeform app with ?freeform=link&frame=<key>: bring that frame in once, and take the request off the address.
    const params = new URLSearchParams(window.location.search);
    if (params.get('freeform') === 'link') {
      const key = params.get('frame') ?? undefined;
      params.delete('freeform');
      params.delete('frame');
      const rest = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
      window.setTimeout(() => bringFrameRef.current(key), 300);
    }
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return { allAssets, prints, openFreeformApp, freeformApp };
}
