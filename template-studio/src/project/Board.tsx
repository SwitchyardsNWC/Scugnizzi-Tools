// The project board: everything in a project folder on one endless canvas.
//
// Jared: "this could be a new tool that starts linking all these projects together and can turn into the
// project canvas that brings everything to one endless canvas." Every email, Freeform frame and picture in
// the folder is a card. Lines show what is made from what: the frame an email's block follows, the emails
// and frames a picture appears in. Double-click a card and the board zooms into it and opens the tool that
// owns it. Where the cards sit is `board.json`; everything else is the folder's own files
// (model/project.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MutableRef } from 'preact/hooks';

import { compile } from '../compile/compile.ts';
import { freeformSvg } from '../compile/freeform.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../model/design-system.ts';
import { materialiseFolderSystem } from '../model/edit.ts';
import { readAppFrame, type AppFrame } from '../model/freeform-link.ts';
import {
  BOARD_FILE,
  boardJson,
  CARD_GAP,
  CARD_SIZE,
  emailCardId,
  emptyBoard,
  forgetCard,
  frameCardId,
  layoutBoard,
  moveCard,
  pictureCardId,
  projectLinks,
  readBoard,
  withPlaces,
  type BoardDoc,
  type CardKind,
  type CardSource,
  type PlacedCard,
} from '../model/project.ts';
import type { Template } from '../model/types.ts';
import { folderWorkspace, isImageFile, type AssetFile } from '../workspace/workspace.ts';
import { loadKeptPictures } from '../app/kept-pictures.ts';
import { withLocalAssets, withoutMissingPictures } from '../app/local-assets.ts';
import { freeformCanvas } from '../app/picture.ts';
import { listPictures, readText, writeFile, writePicture } from './folder.ts';
import { copyKeptPictures, syncFrames } from './frame-sync.ts';
import { siteStore } from './site-store.ts';
import type { Project } from './useProject.ts';

type View = { x: number; y: number; z: number };
type Rect = { x: number; y: number; w: number; h: number };

const HEAD = 40;
/** The width an email is laid out at inside its card, a little wider than the email so its edges show. */
const EMAIL_PAGE = 640;
const clampZoom = (z: number) => Math.min(3, Math.max(0.05, z));

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
};
const sizeOf = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function openTool(url: string) {
  const href = new URL(url, window.location.href).href;
  if (!window.open(href, '_blank')) window.location.href = href;
}

function readView(key: string): View | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<View> | null;
    if (v && [v.x, v.y, v.z].every((n) => typeof n === 'number' && Number.isFinite(n))) return { x: v.x!, y: v.y!, z: clampZoom(v.z!) };
  } catch {
    // Nothing kept: the board fits itself.
  }
  return null;
}

// --- what is in the folder ------------------------------------------------------------------------------------

interface EmailItem {
  id: string;
  fileName: string;
  name: string;
  modified: number;
  template: Template | null;
  /** The compiled preview, before local pictures are swapped in. */
  html: string;
  error?: string;
}

interface FrameItem {
  id: string;
  key: string;
  name: string;
  savedAt: number;
  fileName: string;
  template: Template;
  frame: AppFrame | null;
}

interface PictureItem {
  id: string;
  path: string;
  size: number;
  modified: number;
  url: string;
  /** Under `assets/rendered/`: drawn by Template Studio from an email's text. Used by previews, not a card. */
  rendered: boolean;
}

interface Files {
  emails: EmailItem[];
  frames: FrameItem[];
  pictures: PictureItem[];
  read: boolean;
}

function useProjectFiles(project: MutableRef<Project>, notify: (message: string) => void) {
  const [files, setFiles] = useState<Files>({ emails: [], frames: [], pictures: [], read: false });
  const [kept, setKept] = useState<AssetFile[]>([]);
  const cache = useRef({ emails: new Map<string, EmailItem>(), pictures: new Map<string, PictureItem>(), systems: '' });
  const busy = useRef(false);
  const again = useRef(false);
  const keptRef = useRef<AssetFile[] | null>(null);
  const lastFailure = useRef('');

  const refresh = useCallback(async (): Promise<void> => {
    const { dir, info, writable } = project.current;
    if (!dir || !info) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      const ws = folderWorkspace(dir, writable);
      const [list, systems, found] = await Promise.all([
        ws.list().catch(() => []),
        ws.designSystems().catch(() => ({})),
        listPictures(dir).catch(() => []),
      ]);
      const c = cache.current;

      const pictures = found.map((p) => {
        const old = c.pictures.get(p.path);
        if (old && old.modified === p.modified && old.size === p.size) return old;
        if (old) URL.revokeObjectURL(old.url);
        const item: PictureItem = { id: pictureCardId(p.path), path: p.path, size: p.size, modified: p.modified, url: URL.createObjectURL(p.file), rendered: p.path.startsWith('rendered/') };
        c.pictures.set(p.path, item);
        return item;
      });
      for (const [path, old] of c.pictures) {
        if (found.some((p) => p.path === path)) continue;
        URL.revokeObjectURL(old.url);
        c.pictures.delete(path);
      }

      if (!keptRef.current) {
        keptRef.current = await loadKeptPictures().catch(() => []);
        setKept(keptRef.current);
      }

      // Frames drawn in this browser join the project's files, so the board shows them from the first look.
      const synced = await syncFrames(dir, info.id, siteStore(), writable);
      if (synced.failed && synced.failed !== lastFailure.current) notify(synced.failed);
      lastFailure.current = synced.failed ?? '';
      if (writable && keptRef.current.length) {
        const copied = await copyKeptPictures(dir, synced.folder, found, keptRef.current);
        if (copied.length) again.current = true;
      }
      const frames: FrameItem[] = synced.folder.map((f) => ({
        id: frameCardId(f.key),
        key: f.key,
        name: f.name,
        savedAt: f.savedAt,
        fileName: f.fileName,
        template: f.template,
        frame: readAppFrame(JSON.stringify(f.template), f.key),
      }));

      const systemsKey = JSON.stringify(systems);
      if (systemsKey !== c.systems) {
        c.emails.clear();
        c.systems = systemsKey;
      }
      const emails: EmailItem[] = [];
      for (const file of list) {
        const old = c.emails.get(file.fileName);
        if (old && old.modified === file.modified) {
          emails.push(old);
          continue;
        }
        let item: EmailItem;
        try {
          const loaded = await file.load();
          const { template } = materialiseFolderSystem(loaded.template, systems);
          item = { id: emailCardId(file.fileName), fileName: file.fileName, name: template.name || file.name, modified: file.modified, template, html: compile(template, { mode: 'preview' }).html };
        } catch (cause) {
          item = { id: emailCardId(file.fileName), fileName: file.fileName, name: file.name, modified: file.modified, template: null, html: '', error: cause instanceof Error ? cause.message : `${file.fileName} could not be read.` };
        }
        c.emails.set(file.fileName, item);
        emails.push(item);
      }
      for (const name of [...c.emails.keys()]) if (!list.some((f) => f.fileName === name)) c.emails.delete(name);

      setFiles({ emails, frames, pictures, read: true });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The project folder could not be read.');
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, [project, notify]);

  return { files, kept, refresh };
}

// --- the board ------------------------------------------------------------------------------------------------

export interface BoardProps {
  project: Project;
  notify(message: string): void;
}

export function Board({ project, notify }: BoardProps) {
  const dir = project.dir!;
  const info = project.info!;
  const projectRef = useRef(project);
  projectRef.current = project;
  const { files, kept, refresh } = useProjectFiles(projectRef, notify);

  // --- board.json ---
  const [board, setBoard] = useState<BoardDoc>(emptyBoard);
  const [boardRead, setBoardRead] = useState(false);
  const boardRef = useRef(board);
  const boardReadRef = useRef(false);
  const boardModified = useRef(0);
  const saveTimer = useRef(0);

  const loadBoard = useCallback(async () => {
    const found = await readText(dir, BOARD_FILE).catch(() => null);
    // Our own save is on its way, and it is the newer arrangement.
    if (saveTimer.current) return;
    if (!found) {
      if (!boardReadRef.current) {
        boardReadRef.current = true;
        setBoardRead(true);
      }
      return;
    }
    if (found.modified === boardModified.current) return;
    boardModified.current = found.modified;
    const next = readBoard(found.text);
    boardRef.current = next;
    setBoard(next);
    boardReadRef.current = true;
    setBoardRead(true);
  }, [dir]);

  const saveBoard = useCallback(
    (next: BoardDoc) => {
      boardRef.current = next;
      setBoard(next);
      if (!projectRef.current.writable) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        try {
          boardModified.current = await writeFile(dir, BOARD_FILE, boardJson(boardRef.current));
        } catch (cause) {
          notify(cause instanceof Error ? `The board could not be saved: ${cause.message}` : 'The board could not be saved.');
        } finally {
          saveTimer.current = 0;
        }
      }, 400);
    },
    [dir, notify],
  );

  const refreshAll = useCallback(() => {
    void loadBoard();
    void refresh();
  }, [loadBoard, refresh]);

  useEffect(() => {
    refreshAll();
  }, [project.generation, refreshAll]);

  useEffect(() => {
    const onFocus = () => refreshAll();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshAll();
    }, 5000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [refreshAll]);

  // --- layout ---
  const sources = useMemo<CardSource[]>(
    () => [
      ...files.emails.map((e) => ({ id: e.id, kind: 'email' as const, name: e.name })),
      ...files.frames.map((f) => ({ id: f.id, kind: 'frame' as const, name: f.name })),
      ...files.pictures.filter((p) => !p.rendered).map((p) => ({ id: p.id, kind: 'picture' as const, name: p.path.split('/').pop() ?? p.path })),
    ],
    [files],
  );
  const layout = useMemo(() => layoutBoard(sources, board), [sources, board]);

  // A card that just found a place keeps it, so a file added tomorrow does not shuffle today's board.
  useEffect(() => {
    if (!files.read || !boardRead || layout.placed.length === 0) return;
    saveBoard(withPlaces(boardRef.current, layout.cards));
  }, [files.read, boardRead, layout, saveBoard]);

  const emailsById = useMemo(() => new Map(files.emails.map((e) => [e.id, e])), [files.emails]);
  const framesById = useMemo(() => new Map(files.frames.map((f) => [f.id, f])), [files.frames]);
  const picturesById = useMemo(() => new Map(files.pictures.map((p) => [p.id, p])), [files.pictures]);
  const assets = useMemo<AssetFile[]>(
    () => [...files.pictures.map((p) => ({ name: p.path, size: p.size, url: p.url })), ...kept.filter((k) => !files.pictures.some((p) => p.path === k.name))],
    [files.pictures, kept],
  );
  const links = useMemo(
    () =>
      projectLinks(
        files.emails.flatMap((e) => (e.template ? [{ id: e.id, template: e.template }] : [])),
        files.frames.map((f) => ({ id: f.id, key: f.key, template: f.template })),
        files.pictures.filter((p) => !p.rendered).map((p) => ({ id: p.id, path: p.path })),
      ),
    [files],
  );

  // --- printed frames ---
  const [prints, setPrints] = useState<Record<string, string>>({});
  const printsRef = useRef(prints);
  printsRef.current = prints;
  const assetSignature = assets.map((a) => a.url).join('|');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const f of files.frames) {
        const fr = f.frame;
        if (!fr?.page.effects?.length) continue;
        const id = `${f.key}:${fr.hash}:${assetSignature.length}`;
        if (printsRef.current[id]) continue;
        try {
          const canvas = await freeformCanvas(fr.page, f.template.ds ?? DEFAULT_DESIGN_SYSTEM, { assets, scale: 1, ground: fr.ground });
          if (cancelled) return;
          const url = canvas.toDataURL('image/png');
          setPrints((p) => ({ ...p, [id]: url }));
        } catch {
          // The drawing without its print is still a fair picture of the frame.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.frames, assetSignature]);
  const printOf = (f: FrameItem) => (f.frame?.page.effects?.length ? prints[`${f.key}:${f.frame.hash}:${assetSignature.length}`] : undefined);

  // --- view ---
  const stage = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const viewKey = `scuggnizzi.project.view.${info.id}`;
  const [view, setViewState] = useState<View>(() => readView(viewKey) ?? { x: 80, y: 90, z: 0.8 });
  const viewRef = useRef(view);
  const viewSettled = useRef(readView(viewKey) !== null);
  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(viewKey, JSON.stringify(view));
      } catch {
        // The board fits itself next time instead.
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [view, viewKey]);

  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const anim = useRef(0);
  const animateTo = useCallback(
    (to: View, ms = 360, done?: () => void) => {
      cancelAnimationFrame(anim.current);
      if (reduced) {
        setView(to);
        done?.();
        return;
      }
      const from = viewRef.current;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        const e = 1 - Math.pow(1 - t, 3);
        setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z * Math.pow(to.z / from.z, e) });
        if (t < 1) anim.current = requestAnimationFrame(step);
        else done?.();
      };
      anim.current = requestAnimationFrame(step);
    },
    [reduced, setView],
  );

  const bounds = useMemo<Rect | null>(() => {
    const all: Rect[] = [...layout.cards, ...layout.missing];
    if (all.length === 0) return null;
    const x = Math.min(...all.map((r) => r.x));
    const y = Math.min(...all.map((r) => r.y));
    return { x, y, w: Math.max(...all.map((r) => r.x + r.w)) - x, h: Math.max(...all.map((r) => r.y + r.h)) - y };
  }, [layout]);

  const fitView = useCallback((): View | null => {
    if (!bounds) return null;
    const top = 76;
    const bottom = 110;
    const room = { w: size.w - 120, h: size.h - top - bottom };
    const z = clampZoom(Math.min(room.w / bounds.w, room.h / bounds.h, 1));
    return { z, x: (size.w - bounds.w * z) / 2 - bounds.x * z, y: top + (room.h - bounds.h * z) / 2 - bounds.y * z };
  }, [bounds, size]);

  useEffect(() => {
    if (viewSettled.current || !bounds || !files.read) return;
    const f = fitView();
    if (!f) return;
    setView(f);
    viewSettled.current = true;
  }, [bounds, files.read, fitView, setView]);

  const zoomTo = useCallback(
    (z: number, about?: { x: number; y: number }, smooth = false) => {
      const v = viewRef.current;
      const next = clampZoom(z);
      const px = about?.x ?? size.w / 2;
      const py = about?.y ?? size.h / 2;
      const to = { z: next, x: px - ((px - v.x) * next) / v.z, y: py - ((py - v.y) * next) / v.z };
      if (smooth) animateTo(to, 220);
      else {
        cancelAnimationFrame(anim.current);
        setView(to);
      }
    },
    [size, animateTo, setView],
  );
  const fit = useCallback(() => {
    const f = fitView();
    if (f) animateTo(f, 420);
  }, [fitView, animateTo]);

  // Wheel: ⌘ or a pinch zooms about the pointer, a plain wheel pans. Non-passive, or the page scrolls.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoomTo(viewRef.current.z * Math.exp(-event.deltaY * 0.0025), { x: event.clientX - r.left, y: event.clientY - r.top });
      else {
        cancelAnimationFrame(anim.current);
        const v = viewRef.current;
        setView({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo, setView]);

  // --- selecting, moving, opening ---
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<
    | { kind: 'pan'; x: number; y: number; view: View; moved: boolean }
    | { kind: 'card'; id: string; x: number; y: number; from: { x: number; y: number }; moved: boolean }
    | null
  >(null);

  const cards = layout.cards.map((c) => (moving?.id === c.id ? { ...c, x: moving.x, y: moving.y } : c));
  const missing = layout.missing.map((c) => (moving?.id === c.id ? { ...c, x: moving.x, y: moving.y } : c));
  const rects = new Map<string, Rect>([...cards, ...missing].map((c) => [c.id, c]));

  const openCard = useCallback(
    (card: PlacedCard) => {
      const before = viewRef.current;
      const z = clampZoom(Math.min((size.w * 0.72) / card.w, (size.h * 0.72) / card.h, 2.5));
      const to = { z, x: size.w / 2 - (card.x + card.w / 2) * z, y: size.h / 2 - (card.y + card.h / 2) * z };
      let url: string | null = null;
      const email = emailsById.get(card.id);
      const frame = framesById.get(card.id);
      if (email) url = `index.html?open=${encodeURIComponent(email.fileName)}`;
      if (frame) url = `freeform.html?frame=${encodeURIComponent(frame.key)}`;
      setSelected(card.id);
      animateTo(to, 420, () => {
        if (!url) return;
        openTool(url);
        // Back to where the board was, for when you come back to it.
        window.setTimeout(() => animateTo(before, 420), 700);
      });
    },
    [size, emailsById, framesById, animateTo],
  );

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as Element;
    if (target.closest('button, a, input')) return;
    const cardEl = event.button === 0 ? (target.closest('[data-card]') as HTMLElement | null) : null;
    const id = cardEl?.dataset['card'];
    const rect = id ? rects.get(id) : undefined;
    cancelAnimationFrame(anim.current);
    if (id && rect) drag.current = { kind: 'card', id, x: event.clientX, y: event.clientY, from: { x: rect.x, y: rect.y }, moved: false };
    else {
      drag.current = { kind: 'pan', x: event.clientX, y: event.clientY, view: viewRef.current, moved: false };
      setPanning(true);
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    // Captured only once it is a drag: a capture taken on press sends the click, and so the double-click that
    // opens a card, to the stage instead of the card.
    if (!d.moved) stage.current?.setPointerCapture(event.pointerId);
    d.moved = true;
    if (d.kind === 'pan') setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
    else {
      const z = viewRef.current.z;
      setMoving({ id: d.id, x: d.from.x + dx / z, y: d.from.y + dy / z });
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    if (!d) return;
    if (d.kind === 'pan') {
      if (!d.moved) setSelected(null);
      return;
    }
    if (d.moved && moving) {
      saveBoard(moveCard(boardRef.current, d.id, moving.x, moving.y));
      if (!projectRef.current.writable) notify(`${info.name} is open view-only, so the arrangement lasts until the page reloads. Allow editing to keep it.`);
    }
    setSelected(d.id);
    setMoving(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === 'Escape') setSelected(null);
      else if (event.key === 'Enter' && selected) {
        const card = layout.cards.find((c) => c.id === selected);
        if (card) openCard(card);
      } else if (event.shiftKey && event.code === 'Digit1') {
        event.preventDefault();
        fit();
      } else if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        zoomTo(viewRef.current.z * 1.25, undefined, true);
      } else if (mod && event.key === '-') {
        event.preventDefault();
        zoomTo(viewRef.current.z / 1.25, undefined, true);
      } else if (mod && event.key === '0') {
        event.preventDefault();
        zoomTo(1, undefined, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, layout, openCard, fit, zoomTo]);

  // --- pictures in ---
  const picker = useRef<HTMLInputElement | null>(null);
  const addPictures = useCallback(
    async (list: File[], at: { x: number; y: number } | null) => {
      const images = list.filter((f) => f.type.startsWith('image/') || isImageFile(f.name));
      if (images.length === 0) return;
      if (!projectRef.current.writable) {
        notify(`${info.name} is open view-only. Allow editing to add pictures to it.`);
        return;
      }
      const v = viewRef.current;
      const r = stage.current?.getBoundingClientRect();
      const screen = at && r ? { x: at.x - r.left, y: at.y - r.top } : { x: size.w / 2, y: size.h / 2 };
      const origin = { x: (screen.x - v.x) / v.z, y: (screen.y - v.y) / v.z };
      const { w, h } = CARD_SIZE.picture;
      let existing = await listPictures(dir).catch(() => []);
      let next = boardRef.current;
      const names: string[] = [];
      for (const [i, file] of images.entries()) {
        try {
          const name = await writePicture(dir, file, existing);
          names.push(name);
          existing = [...existing, { path: name, size: file.size, modified: Date.now(), file }];
          const id = pictureCardId(name);
          if (!next.cards[id]) next = moveCard(next, id, origin.x - w / 2 + (i % 5) * (w + CARD_GAP), origin.y - h / 2 + Math.floor(i / 5) * (h + CARD_GAP));
        } catch (cause) {
          notify(cause instanceof Error ? `${file.name} could not be added: ${cause.message}` : `${file.name} could not be added.`);
          break;
        }
      }
      if (names.length === 0) return;
      saveBoard(next);
      void refresh();
      notify(names.length === 1 ? `Added ${names[0]} to assets.` : `Added ${names.length} pictures to assets.`);
    },
    [dir, info.name, notify, refresh, saveBoard, size],
  );

  // --- drawing ---
  const left = -view.x / view.z;
  const top = -view.y / view.z;
  const margin = 300 / view.z;
  const seen = useRef(new Set<string>());
  const isLive = (r: Rect & { id: string }) => {
    const inView = r.x + r.w > left - margin && r.x < left + size.w / view.z + margin && r.y + r.h > top - margin && r.y < top + size.h / view.z + margin;
    if (inView && view.z > 0.12) seen.current.add(r.id);
    return seen.current.has(r.id);
  };

  const spacing = 22 * view.z * (view.z < 0.4 ? 4 : 1);
  const counts = [
    [files.emails.length, 'email'],
    [files.frames.length, 'frame'],
    [files.pictures.filter((p) => !p.rendered).length, 'picture'],
  ]
    .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)
    .join(' · ');

  return (
    <div class="pb-board">
      <div
        ref={stage}
        class={`pb-stage ${panning ? 'panning' : ''}`}
        style={{ backgroundSize: `${spacing}px ${spacing}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (!e.dataTransfer?.files.length) return;
          e.preventDefault();
          void addPictures([...e.dataTransfer.files], { x: e.clientX, y: e.clientY });
        }}
      >
        <div class="pb-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <svg class="pb-links" width="1" height="1" aria-hidden="true">
            {links.map((link) => {
              const a = rects.get(link.from);
              const b = rects.get(link.to);
              if (!a || !b) return null;
              const on = selected !== null && (link.from === selected || link.to === selected);
              const { d, end } = linkPath(a, b);
              return (
                <g key={`${link.from}>${link.to}`} class={`pb-link ${link.kind} ${on ? 'on' : ''}`}>
                  <path d={d} />
                  <circle cx={end.x} cy={end.y} r={4 / view.z} />
                </g>
              );
            })}
          </svg>

          {missing.map((m) => (
            <div key={m.id} class={`pb-card pb-missing ${selected === m.id ? 'on' : ''}`} data-card={m.id} style={{ left: m.x, top: m.y, width: m.w, height: m.h }}>
              <header class="pb-card-head">
                <span class="pb-kind">Missing</span>
                <b class="pb-card-name">{missingName(m.id, m.kind)}</b>
              </header>
              <div class="pb-card-note">
                <p>This {m.kind === 'email' ? 'email' : m.kind === 'frame' ? 'frame' : 'picture'} is no longer in the folder. If it was moved or renamed, it shows up again as a new card.</p>
                <button class="pb-link-btn" onClick={() => saveBoard(forgetCard(boardRef.current, m.id))}>
                  Forget its place
                </button>
              </div>
            </div>
          ))}

          {cards.map((card, i) => {
            const email = emailsById.get(card.id);
            const frame = framesById.get(card.id);
            const picture = picturesById.get(card.id);
            const live = isLive(card);
            const facts = email
              ? `${email.fileName} · saved ${ago(email.modified)}`
              : frame
                ? `${frame.fileName}${frame.frame ? ` · ${frame.frame.page.width} × ${frame.frame.page.height}` : ''}`
                : picture
                  ? `${picture.path} · ${sizeOf(picture.size)}`
                  : '';
            return (
              <div
                key={card.id}
                class={`pb-card pb-${card.kind} ${selected === card.id ? 'on' : ''} ${moving?.id === card.id ? 'lifted' : ''}`}
                data-card={card.id}
                title={facts}
                style={{ left: card.x, top: card.y, width: card.w, height: card.h, animationDelay: `${Math.min(i, 24) * 22}ms` }}
                onDblClick={() => openCard(card)}
              >
                <header class="pb-card-head">
                  <span class="pb-kind">{KIND_LABEL[card.kind]}</span>
                  <b class="pb-card-name">{card.name}</b>
                  {frame?.frame?.page.effects?.length ? <span class="pb-chip">Riso</span> : null}
                  {card.kind !== 'picture' && (
                    <button class="pb-card-open" title={card.kind === 'email' ? 'Open in Template Studio' : 'Open in Freeform'} aria-label={`Open ${card.name}`} onClick={() => openCard(card)}>
                      ↗
                    </button>
                  )}
                </header>
                <div class="pb-card-body">
                  {email && <EmailBody item={email} assets={assets} live={live} width={card.w} height={card.h - HEAD} />}
                  {frame && <FrameBody item={frame} assets={assets} print={printOf(frame)} width={card.w} height={card.h - HEAD} />}
                  {picture && (live ? <img class="pb-picture-img" src={picture.url} alt="" draggable={false} /> : null)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!files.read && <div class="pb-empty pb-reading">Reading {dir.name}…</div>}
      {files.read && cards.length === 0 && missing.length === 0 && (
        <div class="pb-empty">
          <b>{info.name} is empty.</b>
          <span>Make a frame or an email, or drop pictures here. Everything in the folder shows up on this board.</span>
        </div>
      )}

      <div class="pb-chrome pb-top pb-top-left">
        <a class="fig-pill" href="../../index.html" title="Back to Scugnizzi tools">
          <span aria-hidden="true">←</span> Tools
        </a>
        <ProjectMenu project={project} counts={counts} />
      </div>

      <div class="pb-chrome pb-top pb-top-right">
        {project.status === 'view-only' && (
          <button class="fig-pill pb-allow" title="Chrome opened the folder view-only. One click asks for edit access." onClick={() => void project.allow()}>
            <span class="pb-dot view-only" aria-hidden="true" /> View only · Allow editing
          </button>
        )}
        <div class="fig-pill fig-zoom">
          <button title="Zoom out  ·  ⌘−" aria-label="Zoom out" onClick={() => zoomTo(view.z / 1.25, undefined, true)}>
            −
          </button>
          <button class="pct" title="Zoom to 100%  ·  ⌘0" onClick={() => zoomTo(1, undefined, true)}>
            {Math.round(view.z * 100)}%
          </button>
          <button title="Zoom in  ·  ⌘+" aria-label="Zoom in" onClick={() => zoomTo(view.z * 1.25, undefined, true)}>
            +
          </button>
        </div>
        <button class="fig-pill" title="Fit everything  ·  ⇧1" onClick={fit}>
          Fit
        </button>
      </div>

      <div class="pb-chrome pb-hint">Drag cards to arrange · double-click to open · drop pictures to add them</div>
      <div class="pb-chrome pb-dock">
        <button class="pb-dock-btn" title="Open Template Studio on this project" onClick={() => openTool('index.html')}>
          <span class="pb-dock-icon email" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </span>
          Template Studio
        </button>
        <button class="pb-dock-btn" title="A new Freeform frame, saved into this project" onClick={() => openTool('freeform.html?new=1')}>
          <span class="pb-dock-icon frame" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M7 3v18M17 3v18M3 7h18M3 17h18" />
            </svg>
          </span>
          New frame
        </button>
        <button class="pb-dock-btn" disabled={!project.writable} title={project.writable ? 'Add pictures to assets/. Dropping them on the board works too.' : 'Allow editing to add pictures'} onClick={() => picker.current?.click()}>
          <span class="pb-dock-icon picture" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="2" />
              <path d="m21 16-5-5-9 9" />
            </svg>
          </span>
          Add pictures
        </button>
        <span class="fig-sep" aria-hidden="true" />
        <span class="pb-dock-count">{counts}</span>
      </div>

      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const input = e.currentTarget;
          if (input.files) void addPictures([...input.files], null);
          input.value = '';
        }}
      />
    </div>
  );
}

const KIND_LABEL: Record<CardKind, string> = { email: 'Email', frame: 'Frame', picture: 'Picture' };

function missingName(id: string, kind: CardKind): string {
  const rest = id.slice(id.indexOf(':') + 1);
  if (kind === 'frame') return 'A frame';
  return rest.split('/').pop()?.replace(/\.(template|design)\.json$/, '') ?? rest;
}

/** A line from one card's side to the facing side of another. */
function linkPath(a: Rect, b: Rect): { d: string; end: { x: number; y: number } } {
  const rightward = a.x + a.w / 2 <= b.x + b.w / 2;
  const sx = rightward ? a.x + a.w : a.x;
  const sy = a.y + a.h / 2;
  const tx = rightward ? b.x : b.x + b.w;
  const ty = b.y + b.h / 2;
  const bend = Math.max(60, Math.abs(tx - sx) / 2) * (rightward ? 1 : -1);
  return { d: `M${sx},${sy} C${sx + bend},${sy} ${tx - bend},${ty} ${tx},${ty}`, end: { x: tx, y: ty } };
}

// --- card bodies ------------------------------------------------------------------------------------------------

function EmailBody({ item, assets, live, width, height }: { item: EmailItem; assets: AssetFile[]; live: boolean; width: number; height: number }) {
  const html = useMemo(() => (item.html && live ? withLocalAssets(item.html, assets) : ''), [item.html, assets, live]);
  if (item.error) return <div class="pb-card-note">{item.error}</div>;
  if (!live) return <div class="pb-card-skeleton" />;
  const scale = width / EMAIL_PAGE;
  return (
    <iframe
      class="pb-email-frame"
      title={item.name}
      srcdoc={html}
      sandbox="allow-same-origin"
      tabIndex={-1}
      style={{ width: EMAIL_PAGE, height: height / scale, transform: `scale(${scale})` }}
    />
  );
}

function FrameBody({ item, assets, print, width, height }: { item: FrameItem; assets: AssetFile[]; print: string | undefined; width: number; height: number }) {
  const page = item.frame?.page;
  const ds = item.template.ds ?? DEFAULT_DESIGN_SYSTEM;
  const svg = useMemo(() => (page && !print ? withoutMissingPictures(withLocalAssets(freeformSvg(page, ds), assets)) : ''), [page, ds, assets, print]);
  if (!page) return <div class="pb-card-note">This frame could not be drawn.</div>;
  const pad = 18;
  const fitZ = Math.min((width - pad * 2) / page.width, (height - pad * 2) / page.height);
  const w = Math.max(1, Math.round(page.width * fitZ));
  const h = Math.max(1, Math.round(page.height * fitZ));
  return (
    <div class="pb-frame-thumb">
      <div class="pb-frame-page" style={{ width: w, height: h, background: item.frame?.ground }}>
        {print ? <img src={print} alt="" draggable={false} /> : <span dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
    </div>
  );
}

// --- the project pill -----------------------------------------------------------------------------------------

function ProjectMenu({ project, counts }: { project: Project; counts: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.('.pb-menu')) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);
  const info = project.info!;
  const status = project.status === 'ready' ? 'Saving into the folder' : 'View only';
  return (
    <div class="pb-menu">
      <button class={`fig-pill pb-project-pill ${open ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span class={`pb-dot ${project.status}`} aria-hidden="true" />
        <b>{info.name}</b>
        <span class="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div class="pb-menu-pop" role="menu">
          <div class="pb-menu-head">
            <b>{info.name}</b>
            <span>
              {project.dir?.name} · {status}
            </span>
            <span>{counts}</span>
          </div>
          <p class="pb-menu-note">Template Studio and Freeform open this folder too, on their own.</p>
          <button
            onClick={() => {
              setOpen(false);
              void project.open();
            }}
          >
            Open another folder…
          </button>
          <button
            class="danger"
            onClick={() => {
              setOpen(false);
              void project.close();
            }}
          >
            Close project
          </button>
        </div>
      )}
    </div>
  );
}
