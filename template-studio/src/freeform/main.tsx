// Freeform, as a tool of its own.
//
// Jared: "as a test for how I want to connect the projects in the future. create freeform as it's
// own mini tool. So I can tweak it further."
//
// Not a copy. This page mounts the same `Surface` and the same model as the block inside Template Studio,
// so a tweak to the canvas lands in both. It keeps several frames (model/frame-store.ts). Each is a
// template holding one freeform block, the shape the model already understands. With a project open
// (src/project), every frame is also a file in its `frames/` folder, and pictures dropped on the canvas go
// into its `assets/`, so the project board and the rest of the team see them.

import { render } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { freeformSvg } from '../compile/freeform.ts';
import { createSection } from '../model/catalog.ts';
import { colorOf, DEFAULT_DESIGN_SYSTEM } from '../model/design-system.ts';
import { designSystemOf } from '../model/edit.ts';
import {
  addFrame,
  copyFrameDoc,
  FRAME_PREFIX,
  FRAMES_INDEX,
  frameName,
  loadFrames,
  newFrameId,
  openFrame,
  projectFrames,
  readFrameIndex,
  removeFrame,
  renameFrame,
  restoreFrame,
  tagFrames,
  touchFrame,
  type FrameIndex,
} from '../model/frame-store.ts';
import { blankTemplate } from '../model/starters.ts';
import type { FreeformBlock, Template } from '../model/types.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { canvasBlob, freeformCanvas } from '../app/picture.ts';
import { keepPicture, loadKeptPictures } from '../app/kept-pictures.ts';
import { readStudioPresence, STUDIO_PRESENCE, STUDIO_REQUEST, type StudioPresence } from '../model/freeform-link.ts';
import { CanvasMenu } from '../app/CanvasMenu.tsx';
import { Surface, type SurfaceApi } from '../app/Surface.tsx';
import { useEditor } from '../app/useEditor.ts';
import { listPictures, writePicture, type PictureEntry } from '../project/folder.ts';
import { copyKeptPictures, deleteFrameFile, syncFrames, writeFrame, type FolderFrame } from '../project/frame-sync.ts';
import { siteStore } from '../project/site-store.ts';
import { useProject, type Project } from '../project/useProject.ts';
import { FramesMenu } from './FramesMenu.tsx';
import '../app/app.css';
import './freeform.css';

const store = siteStore();

/** An empty frame. Its ids start with the frame's own, so no two frames' blocks share one. */
function makeFrame(name: string, id: string): Template {
  const base = blankTemplate();
  let n = 0;
  const section = createSection('freeform', { id: () => `${id}-${(n += 1)}`, taken: new Set() }, DEFAULT_DESIGN_SYSTEM);
  return { ...base, name, hubspotLabel: name, sections: [section] };
}

function blockOf(t: Template): { block: FreeformBlock; sectionId: string } | null {
  for (const s of t.sections)
    for (const r of s.rows)
      for (const c of r.columns)
        for (const b of c.blocks) if (b.type === 'freeform') return { block: b, sectionId: s.id };
  return null;
}

/** A frame's drawing from the store, or an empty one when it cannot be read. */
function frameDoc(key: string, name: string): Template {
  try {
    const raw = store.getItem(key);
    if (raw) {
      const t = JSON.parse(raw) as Template;
      if (blockOf(t)) return t;
    }
  } catch {
    // Unreadable: an empty frame rather than none.
  }
  return makeFrame(name, key.split('.').pop() || newFrameId());
}

/** The frame `?new=1` made, which belongs to whatever project is open once it is known. */
let freshKey: string | null = null;

/**
 * What the address asks for, read once and taken off it: a frame to open (Template Studio's "Edit in
 * Freeform" and the project board say which), or a new frame (the board's New frame).
 */
const request = (() => {
  const params = new URLSearchParams(window.location.search);
  const frame = params.get('frame');
  const fresh = params.get('new') === '1';
  if (frame || fresh) {
    params.delete('frame');
    params.delete('new');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  }
  return { frame, fresh };
})();

function startingFrames(): FrameIndex {
  let index = loadFrames(store, makeFrame);
  if (request.frame) index = openFrame(store, index, request.frame);
  if (request.fresh) {
    const id = newFrameId();
    const name = frameName(index);
    index = addFrame(store, index, name, makeFrame(name, id), id);
    freshKey = index.active;
  }
  return index;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'frame';

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FreeformTool() {
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const notify = useCallback((message: string, undo?: () => void) => {
    setToast(undo ? { message, undo } : { message });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 3600);
  }, []);
  const [frames, setFrames] = useState<FrameIndex>(startingFrames);
  const framesRef = useRef(frames);
  framesRef.current = frames;
  // A frame the address named that this browser does not have yet: it may arrive with the project's files.
  const pendingFrame = useRef<string | null>(request.frame && !frames.frames.some((f) => f.key === request.frame) ? request.frame : null);
  const [initialDoc] = useState(() => {
    const entry = frames.frames.find((f) => f.key === frames.active) ?? frames.frames[0]!;
    return frameDoc(entry.key, entry.name);
  });
  const editor = useEditor({ initial: initialDoc, workspace: null, notify });
  const found = blockOf(editor.template);
  const [layer, setLayer] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const api = useRef<SurfaceApi | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  // Remount the surface whenever a different drawing is on it, so it fits that page.
  const [session, setSession] = useState(0);

  // --- the project -----------------------------------------------------------------------------------------

  const project = useProject();
  const projectRef = useRef(project);
  projectRef.current = project;
  const projectId = project.info && (project.status === 'ready' || project.status === 'view-only') ? project.info.id : null;
  /** The project's frame files as last read or written. */
  const folder = useRef<FolderFrame[]>([]);
  const projectPictures = useRef<PictureEntry[]>([]);
  const pictureUrls = useRef(new Map<string, { modified: number; url: string }>());
  const [projectAssets, setProjectAssets] = useState<AssetFile[]>([]);
  /** Writes to the folder, one at a time and in order. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const run = useCallback(
    (task: () => Promise<void>) => {
      queue.current = queue.current.then(task).catch((cause: unknown) => notify(cause instanceof Error ? cause.message : 'The project folder could not be written.'));
      return queue.current;
    },
    [notify],
  );

  /** The drawing on the canvas as last written to the store, to tell a change made elsewhere from our own. */
  const lastWritten = useRef<string | null>(null);
  /** Set while a drawing is being loaded, so loading it does not count as an edit. */
  const loading = useRef(true);
  /**
   * Edits count as newer than the folder's copy only once the folder has been looked at. Otherwise a stale
   * drawing kept in this browser would be dated now, the moment the page opens, and written over a newer file.
   */
  const settled = useRef(false);
  useEffect(() => {
    if (project.status === 'none' || project.status === 'unsupported' || project.status === 'asking') settled.current = true;
  }, [project.status]);

  /** Puts another frame's drawing on the canvas. Undo history is the frame's own, so it starts again. */
  const show = (next: FrameIndex, doc: Template) => {
    framesRef.current = next;
    setFrames(next);
    loading.current = true;
    editor.load(doc, null);
    setLayer(null);
    setSession((n) => n + 1);
  };
  const showRef = useRef(show);
  showRef.current = show;

  /** Writes one frame's file, and marks the frame as the project's. */
  const pushKey = useCallback(async (key: string) => {
    const p = projectRef.current;
    if (!p.dir || !p.info || !p.writable) return;
    const index = readFrameIndex(store.getItem(FRAMES_INDEX));
    const entry = index?.frames.find((f) => f.key === key);
    const raw = store.getItem(key);
    if (!index || !entry || raw === null || (entry.project && entry.project !== p.info.id)) return;
    const written = await writeFrame(p.dir, { key, name: entry.name, savedAt: entry.updatedAt, template: JSON.parse(raw) as Template }, folder.current);
    folder.current = [...folder.current.filter((f) => f.key !== key), written];
    if (entry.project === p.info.id) return;
    const id = p.info.id;
    tagFrames(store, index, [key], id);
    setFrames((cur) => {
      const next = { ...cur, frames: cur.frames.map((f) => (f.key === key ? { ...f, project: id } : f)) };
      framesRef.current = next;
      return next;
    });
  }, []);

  const pushTimer = useRef(0);
  const schedulePush = useCallback(
    (key: string) => {
      if (!projectRef.current.writable) return;
      window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(() => void run(() => pushKey(key)), 700);
    },
    [run, pushKey],
  );

  // The open frame's drawing, saved as it changes: to the store at once, to the project's file a moment later.
  // A switch of frame loads the new drawing and names the new frame in the same render, so a drawing is never
  // written under another frame's key.
  useEffect(() => {
    const key = framesRef.current.active;
    const json = JSON.stringify(editor.template);
    const quiet = loading.current;
    loading.current = false;
    lastWritten.current = json;
    let changed = false;
    try {
      if (store.getItem(key) !== json) {
        store.setItem(key, json);
        changed = true;
      }
    } catch {
      // Storage full or blocked: the canvas still works for this visit.
    }
    if (!changed || quiet || !settled.current) return;
    const next = touchFrame(store, framesRef.current, key);
    framesRef.current = next;
    setFrames(next);
    schedulePush(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.template]);

  /** The project's pictures, as assets the canvas can draw. */
  const usePictures = useCallback((pictures: PictureEntry[]) => {
    projectPictures.current = pictures;
    const urls = pictureUrls.current;
    const next: AssetFile[] = pictures.map((p) => {
      const old = urls.get(p.path);
      if (old && old.modified === p.modified) return { name: p.path, size: p.size, url: old.url };
      if (old) URL.revokeObjectURL(old.url);
      const url = URL.createObjectURL(p.file);
      urls.set(p.path, { modified: p.modified, url });
      return { name: p.path, size: p.size, url };
    });
    for (const [path, old] of urls) {
      if (pictures.some((p) => p.path === path)) continue;
      URL.revokeObjectURL(old.url);
      urls.delete(path);
    }
    setProjectAssets(next);
  }, []);

  /** Brings this browser's frames and the project's files together, and shows the result. */
  const resync = useCallback(
    () =>
      run(async () => {
        const p = projectRef.current;
        if (!p.dir || !p.info || (p.status !== 'ready' && p.status !== 'view-only')) return;
        try {
          const id = p.info.id;
          // A project made from a type starts with its own frames only; an existing folder takes in the loose ones.
          const adopts = !p.info.type;
          if (freshKey && p.writable) {
            // The board's New frame: this one is the project's whatever else is loose, and it is numbered among the
            // project's frames rather than every frame this browser keeps.
            const before = readFrameIndex(store.getItem(FRAMES_INDEX));
            const fresh = before?.frames.find((f) => f.key === freshKey);
            if (before && fresh) {
              const theirs = projectFrames(before, id, adopts).filter((f) => f.key !== freshKey);
              renameFrame(store, before, fresh.key, frameName({ ...before, frames: theirs }));
            }
            await pushKey(freshKey);
            freshKey = null;
          }
          const result = await syncFrames(p.dir, id, store, p.writable, adopts);
          folder.current = result.folder;
          if (result.failed) notify(result.failed);
          let index = result.index ?? loadFrames(store, makeFrame);

          if (projectFrames(index, id, adopts).length === 0) {
            // A project with no frames of its own yet: one to draw on, written into it.
            const frameId = newFrameId();
            const doc = makeFrame('Frame 1', frameId);
            index = addFrame(store, index, 'Frame 1', doc, frameId);
            if (p.writable) {
              const entry = index.frames[index.frames.length - 1]!;
              folder.current = [...folder.current, await writeFrame(p.dir, { key: entry.key, name: entry.name, savedAt: entry.updatedAt, template: doc }, folder.current)];
              index = tagFrames(store, index, [entry.key], id);
            }
          }
          const visible = projectFrames(index, id, adopts);
          const wanted = pendingFrame.current;
          if (wanted && visible.some((f) => f.key === wanted)) {
            index = openFrame(store, index, wanted);
            pendingFrame.current = null;
          }
          if (!visible.some((f) => f.key === index.active)) index = openFrame(store, index, visible[0]!.key);

          const before = framesRef.current.active;
          const stored = store.getItem(index.active);
          if (index.active !== before || (stored !== null && stored !== lastWritten.current)) {
            const entry = index.frames.find((f) => f.key === index.active)!;
            showRef.current(index, frameDoc(entry.key, entry.name));
            if (index.active === before) notify(`${entry.name} changed in the project folder. This is the latest version.`);
          } else {
            framesRef.current = index;
            setFrames(index);
          }

          let pictures = await listPictures(p.dir).catch(() => [] as PictureEntry[]);
          if (p.writable) {
            // Pictures kept only in this browser, from before the project, go into its assets.
            const kept = await loadKeptPictures().catch(() => [] as AssetFile[]);
            if ((await copyKeptPictures(p.dir, result.folder, pictures, kept)).length) pictures = await listPictures(p.dir).catch(() => pictures);
          }
          usePictures(pictures);
        } finally {
          settled.current = true;
        }
      }),
    [run, notify, usePictures, pushKey],
  );

  useEffect(() => {
    if (project.status === 'ready' || project.status === 'view-only') void resync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.generation]);

  useEffect(() => {
    let last = 0;
    const onFocus = () => {
      const status = projectRef.current.status;
      if (Date.now() - last < 2000 || (status !== 'ready' && status !== 'view-only')) return;
      last = Date.now();
      void resync();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [resync]);

  // Another tab changed the frames: the project board taking a newer file, or a second Freeform tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === FRAMES_INDEX && event.newValue) {
        const next = readFrameIndex(event.newValue);
        if (!next) return;
        const own = framesRef.current.active;
        const merged = { ...next, active: next.frames.some((f) => f.key === own) ? own : next.active };
        if (merged.active !== own) {
          const entry = merged.frames.find((f) => f.key === merged.active)!;
          showRef.current(merged, frameDoc(entry.key, entry.name));
        } else {
          framesRef.current = merged;
          setFrames(merged);
        }
      } else if (event.key && event.key === framesRef.current.active && event.newValue !== null && event.newValue !== lastWritten.current) {
        const entry = framesRef.current.frames.find((f) => f.key === event.key);
        if (entry) showRef.current(framesRef.current, frameDoc(entry.key, entry.name));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // The selection is always the frame's one block.
  useEffect(() => {
    if (!found) return;
    const sel = editor.selection;
    if (sel.kind !== 'block' || sel.blockId !== found.block.id) editor.select({ kind: 'block', sectionId: found.sectionId, blockId: found.block.id });
  }, [editor, found]);

  // ⌘Z and ⇧⌘Z come with useEditor, which binds them itself. This page once bound them a second time,
  // and every ⌘Z undid two steps.

  // An open Template Studio, if there is one, for the way there (model/freeform-link.ts).
  const readStudio = () => {
    try {
      return readStudioPresence(localStorage.getItem(STUDIO_PRESENCE));
    } catch {
      return null;
    }
  };
  const [studio, setStudio] = useState<StudioPresence | null>(readStudio);
  useEffect(() => {
    const refresh = () => setStudio(readStudio());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STUDIO_PRESENCE) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, []);

  // The pictures kept from earlier visits, before anything is drawn with them.
  useEffect(() => {
    loadKeptPictures()
      .then((kept) => setAssets((old) => [...kept.filter((k) => !old.some((a) => a.name === k.name)), ...old]))
      .catch(() => {
        // No IndexedDB here (a private window, say): pictures last for this visit only.
      });
  }, []);

  /** What the canvas can draw: the project's pictures first, then the ones this browser keeps. */
  const allAssets = useMemo(() => [...projectAssets, ...assets.filter((a) => !projectAssets.some((p) => p.name === a.name))], [projectAssets, assets]);

  /**
   * Pictures from the computer. The layer stores the file's name. With a project open for editing the file
   * goes into its `assets/`, where every tool finds it; otherwise it is kept in this browser's IndexedDB
   * under that name, so it is still there after a reload.
   */
  const addFiles = useCallback(
    (files: FileList | File[], at: { x: number; y: number } | null) => {
      for (const file of [...files].filter((f) => f.type.startsWith('image/'))) {
        const p = projectRef.current;
        if (p.dir && p.writable) {
          void writePicture(p.dir, file, projectPictures.current)
            .then((name) => {
              projectPictures.current = [...projectPictures.current, { path: name, size: file.size, modified: Date.now(), file }];
              const asset: AssetFile = { name, size: file.size, url: URL.createObjectURL(file) };
              setProjectAssets((old) => [...old.filter((a) => a.name !== name), asset]);
              api.current?.dropAsset(asset, at);
            })
            .catch((cause: unknown) => notify(cause instanceof Error ? `${file.name} could not go into the project: ${cause.message}` : `${file.name} could not go into the project.`));
          continue;
        }
        const asset: AssetFile = { name: file.name, size: file.size, url: URL.createObjectURL(file) };
        setAssets((old) => [...old.filter((a) => a.name !== asset.name), asset]);
        keepPicture(file.name, file).catch(() => notify(`${file.name} is on the canvas, but this browser would not keep it for next time.`));
        api.current?.dropAsset(asset, at);
      }
    },
    [notify],
  );

  if (!found) return null;
  const { block } = found;
  const activeEntry = frames.frames.find((f) => f.key === frames.active) ?? frames.frames[0]!;
  const adopts = !project.info?.type;
  /** The frames the menu lists: with a project open, its own (and loose ones, when it takes those in), and the one on the canvas. */
  const listed: FrameIndex = projectId
    ? { ...frames, frames: frames.frames.filter((f) => f.key === frames.active || projectFrames(frames, projectId, adopts).includes(f)) }
    : frames;
  /** A frame made while a project is open for editing belongs to it from the start; its file follows a moment later. */
  const born = (index: FrameIndex, key: string) => (projectId && projectRef.current.writable ? tagFrames(store, index, [key], projectId) : index);

  // --- frames ----------------------------------------------------------------------------------------------

  const pushLater = (key: string) => {
    if (projectRef.current.writable) void run(() => pushKey(key));
  };
  const openKey = (key: string) => {
    if (key === frames.active) return;
    const next = openFrame(store, frames, key);
    const entry = next.frames.find((f) => f.key === key);
    if (entry) show(next, frameDoc(entry.key, entry.name));
  };
  const newFrame = () => {
    const id = newFrameId();
    const name = frameName(listed);
    const doc = makeFrame(name, id);
    show(born(addFrame(store, frames, name, doc, id), FRAME_PREFIX + id), doc);
    pushLater(FRAME_PREFIX + id);
  };
  const duplicateKey = (key: string) => {
    const entry = frames.frames.find((f) => f.key === key);
    if (!entry) return;
    const id = newFrameId();
    const name = frameName(listed, `${entry.name} copy`.replace(/ copy copy$/, ' copy'));
    const doc = copyFrameDoc(key === frames.active ? editor.template : frameDoc(key, entry.name), id, name);
    show(born(addFrame(store, frames, name, doc, id), FRAME_PREFIX + id), doc);
    pushLater(FRAME_PREFIX + id);
  };
  const renameKey = (key: string, name: string) => {
    const next = renameFrame(store, frames, key, name);
    if (next === frames) return;
    framesRef.current = next;
    setFrames(next);
    pushLater(key);
  };
  const removeKey = (key: string) => {
    const entry = frames.frames.find((f) => f.key === key);
    const p = projectRef.current;
    if (listed.frames.length <= 1) return notify('The last frame stays: there is always one to draw on.');
    if (entry?.project && p.info && entry.project === p.info.id && !p.writable) {
      return notify(`${p.info.name} is open view-only, so ${entry.name} cannot be deleted from it. Allow editing first.`);
    }
    const { index, removed } = removeFrame(store, frames, key);
    if (!removed) return notify('The last frame stays: there is always one to draw on.');
    if (key === frames.active) {
      const shown = projectId ? projectFrames(index, projectId, adopts) : index.frames;
      const target = shown.some((f) => f.key === index.active) ? index : openFrame(store, index, shown[0]!.key);
      const next = target.frames.find((f) => f.key === target.active)!;
      show(target, frameDoc(next.key, next.name));
    } else {
      framesRef.current = index;
      setFrames(index);
    }
    if (removed.entry.project && p.dir && p.writable) {
      const dir = p.dir;
      void run(async () => {
        await deleteFrameFile(dir, key, folder.current);
        folder.current = folder.current.filter((f) => f.key !== key);
      });
    }
    notify(`Deleted ${removed.entry.name}.`, () => {
      show(restoreFrame(store, framesRef.current, removed), frameDoc(removed.entry.key, removed.entry.name));
      pushLater(removed.entry.key);
    });
  };

  // --- to Template Studio ----------------------------------------------------------------------------------

  const inEmail = Boolean(studio?.keys.includes(frames.active));

  /** To Template Studio: the open one, by request, or a new one with this frame already in the email. */
  const toStudio = () => {
    let presence: StudioPresence | null = null;
    try {
      presence = readStudioPresence(localStorage.getItem(STUDIO_PRESENCE));
    } catch {
      presence = null;
    }
    if (presence) {
      try {
        localStorage.setItem(STUDIO_REQUEST, JSON.stringify({ action: 'link', key: frames.active, tab: presence.tab, at: Date.now() }));
      } catch {
        return notify('This browser would not pass the frame along. Open Template Studio from the dashboard.');
      }
      // Opened from Template Studio: close this tab, and that one is where you land.
      let opener: Window | null = null;
      try {
        opener = window.opener && !window.opener.closed && String(window.opener.location.pathname).endsWith('/index.html') ? window.opener : null;
      } catch {
        opener = null;
      }
      if (opener) {
        try {
          opener.focus();
        } catch {
          // Focus is the browser's to give.
        }
        window.setTimeout(() => window.close(), 300);
        return;
      }
      return notify(
        presence.keys.includes(frames.active)
          ? `${activeEntry.name} is in ${presence.email}. Switch to the Template Studio tab to see it.`
          : `Sent ${activeEntry.name} to ${presence.email}, above the footer. Switch to the Template Studio tab to see it.`,
      );
    }
    const url = new URL(`index.html?freeform=link&frame=${encodeURIComponent(frames.active)}`, window.location.href).href;
    // Freeform saves as it goes, so opening Template Studio in this same tab loses nothing.
    if (!window.open(url, '_blank')) window.location.href = url;
  };

  // --- export ----------------------------------------------------------------------------------------------

  const ds = designSystemOf(editor.template);
  // What the page sits on. A plain export keeps a transparent page; a print needs paper under it.
  const section = editor.template.sections.find((s) => s.id === found.sectionId);
  const ground = colorOf(ds, block.background) ?? section?.containerColor ?? section?.bandColor ?? '#ffffff';
  const printed = Boolean(block.effects?.length);
  const fileBase = slug(activeEntry.name);
  const failed = (cause: unknown) => notify(cause instanceof Error ? cause.message : 'The picture could not be drawn.');
  const exportPng = async () => {
    try {
      const canvas = await freeformCanvas(block, ds, { assets: allAssets, scale: 2, ground: printed ? ground : (colorOf(ds, block.background) ?? 'rgba(0,0,0,0)') });
      download(`${fileBase}@2x.png`, await canvasBlob(canvas));
    } catch (cause) {
      failed(cause);
    }
  };
  const exportSvg = async () => {
    if (!printed) return download(`${fileBase}.svg`, new Blob([freeformSvg(block, ds)], { type: 'image/svg+xml' }));
    // A print is pixels, which SVG cannot describe: the printed picture goes inside it as an image.
    try {
      const canvas = await freeformCanvas(block, ds, { assets: allAssets, scale: 2, ground });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${block.width}" height="${block.height}" viewBox="0 0 ${block.width} ${block.height}"><image href="${canvas.toDataURL('image/png')}" width="${block.width}" height="${block.height}"/></svg>`;
      download(`${fileBase}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
    } catch (cause) {
      failed(cause);
    }
  };

  return (
    <div class="app ff-app">
      <main
        class="ff-stage"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (!e.dataTransfer?.files.length) return;
          e.preventDefault();
          addFiles(e.dataTransfer.files, { x: e.clientX, y: e.clientY });
        }}
      >
        <Surface
          key={`${frames.active}:${session}`}
          editor={editor}
          blockId={block.id}
          assets={allAssets}
          layer={layer}
          onSelectLayer={setLayer}
          onDone={() => setLayer(null)}
          api={api}
          standalone={{
            left: (
              <>
                <a class="fig-pill fig-back" href="../../index.html" title="Back to Scugnizzi tools">
                  <span aria-hidden="true">←</span> Tools
                </a>
                <ProjectPill project={project} />
                <FramesMenu
                  frames={listed}
                  ds={ds}
                  assets={allAssets}
                  activeDoc={editor.template}
                  docOf={(key) => frameDoc(key, frames.frames.find((f) => f.key === key)?.name ?? 'Frame')}
                  linkedKeys={studio?.keys ?? []}
                  onOpen={openKey}
                  onNew={newFrame}
                  onDuplicate={duplicateKey}
                  onRename={renameKey}
                  onRemove={removeKey}
                />
                <button
                  class="fig-pill fig-studio"
                  title={
                    studio
                      ? inEmail
                        ? `Template Studio has ${activeEntry.name} in ${studio.email}. Go to it.`
                        : `Template Studio is open with ${studio.email}. Add ${activeEntry.name} to it, above the footer.`
                      : `Open Template Studio with ${activeEntry.name} in the email, above the footer. It follows the frame from then on.`
                  }
                  onClick={toStudio}
                >
                  <span class={`fig-studio-dot ${studio ? 'live' : ''}`} aria-hidden="true" />
                  {studio ? (inEmail ? `In ${studio.email}` : `Send to ${studio.email}`) : 'Use in Template Studio'}
                  <span aria-hidden="true">↗</span>
                </button>
              </>
            ),
            right: (
              <>
                <CanvasMenu pill />
                <button class="fig-pill" title="Add a picture from your computer. Dropping one on the canvas works too." onClick={() => picker.current?.click()}>
                  Image
                </button>
                <button class="fig-pill" title="Download this frame as SVG" onClick={() => void exportSvg()}>
                  SVG
                </button>
                <button class="fig-pill fig-done" title="Download this frame as a PNG at 2×, printed through its effects" onClick={() => void exportPng()}>
                  Export PNG
                </button>
              </>
            ),
          }}
        />
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const input = e.currentTarget;
            if (input.files) addFiles(input.files, null);
            input.value = '';
          }}
        />
        {toast && (
          <div class="ff-toast" role="status">
            {toast.message}
            {toast.undo && (
              <button
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/** Which project the frames save into, and the one click each state needs. */
function ProjectPill({ project }: { project: Project }) {
  const name = project.info?.name ?? project.dir?.name ?? 'Project';
  switch (project.status) {
    case 'loading':
    case 'unsupported':
      return null;
    case 'none':
      return (
        <button
          class="fig-pill ff-project"
          title="Open a project folder. Frames save into it as files, and the project board shows them beside its emails."
          onClick={() => void project.open()}
        >
          <span class="fig-studio-dot" aria-hidden="true" />
          Open project…
        </button>
      );
    case 'asking':
      return (
        <button class="fig-pill ff-project" title={`Chrome needs one click to open ${name} again.`} onClick={() => void project.allow()}>
          <span class="fig-studio-dot warn" aria-hidden="true" />
          <span class="ff-project-name">Reopen {name}</span>
        </button>
      );
    case 'view-only':
      return (
        <button class="fig-pill ff-project" title={`${name} is open view-only, so frames are not saved into it. One click asks Chrome for edit access.`} onClick={() => void project.allow()}>
          <span class="fig-studio-dot warn" aria-hidden="true" />
          <span class="ff-project-name">{name}</span> · Allow editing
        </button>
      );
    default:
      return (
        <a class="fig-pill ff-project" href="project.html" title={`Frames save into ${name}/frames. Open the project board.`}>
          <span class="fig-studio-dot live" aria-hidden="true" />
          <span class="ff-project-name">{name}</span>
        </a>
      );
  }
}

const root = document.getElementById('app');
if (root) render(<FreeformTool />, root);
