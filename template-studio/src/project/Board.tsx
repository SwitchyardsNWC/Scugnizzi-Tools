// The project board: everything in a project folder on one endless canvas.
//
// Jared: "this could be a new tool that starts linking all these projects together and can turn into the
// project canvas that brings everything to one endless canvas." Every email, document, Freeform frame and
// picture in the folder is a card. Lines show what is made from what: the frame an email's block follows, the
// emails and frames a picture appears in. Double-click a card and the board zooms into it and opens the tool
// that owns it. Where the cards sit is `board.json`; everything else is the folder's own files
// (model/project.ts).
//
// Second pass (docs/projects.md, "The board, second pass"): a table to work on rather than a toy. The shape is
// the dashboard's, Enkel: one sans for words, mono for figures, hairlines for structure, square everything but
// what you press, and nothing that bounces. A card is a small window with a thin title bar. A picture is only
// the picture until the pointer is over it. The bar at the top holds the project and the verbs; the strip at
// the bottom is a status line, as a window used to have.

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULT_DESIGN_SYSTEM } from '../model/design-system.ts';
import { DOC_KIND_NAMES, DOC_OPENS_IN, docKindOfUrl, isLinkFile } from '../model/docs.ts';
import { recipesByOutput, RECIPE_TOOLS, toolAddress } from '../model/tool-recipes.ts';
import {
  addGroup,
  BOARD_FILE,
  boardJson,
  CARD_GAP,
  CARD_SIZE,
  cardFolder,
  docCardId,
  emailCardId,
  emailCardSize,
  emptyBoard,
  folderOfPicture,
  forgetCard,
  frameCardId,
  groupAt,
  groupFolderName,
  layoutBoard,
  moveCard,
  moveGroupWith,
  pictureCardId,
  PROJECT_CHANNEL,
  projectLinks,
  readBoard,
  removeGroup,
  tidyBoard,
  withPlaces,
  type BoardDoc,
  type BoardGroup,
  type BoardLayout,
  type CardLink,
  type CardSource,
  type PlacedCard,
  type PlacedGroup,
} from '../model/project.ts';
import { freeAssetPath, movedPath } from '../model/asset-moves.ts';
import {
  addFrameToEmail,
  addPictureToEmail,
  addPictureToFrame,
  dropSourceFromRecipe,
  duplicateFrameFile,
  removePictureFrom,
  unfollowFrame,
} from '../model/board-edits.ts';
import { duplicateTemplate } from '../model/edit.ts';
import { FRAME_PREFIX, newFrameId } from '../model/frame-store.ts';
import { META } from '../model/layout.ts';
import { serializeTemplate, templateFileName } from '../model/serialize.ts';
import type { Template } from '../model/types.ts';
import { isImageFile, type AssetFile } from '../workspace/workspace.ts';
import { useCanvasSettings } from '../app/canvas-settings.ts';
import { CanvasMenu } from '../app/CanvasMenu.tsx';
import { TouchGestures } from '../app/gestures.ts';
import { glide, PanTracker } from '../app/inertia.ts';
import { capture } from '../app/pointer.ts';
import { freeformCanvas } from '../app/picture.ts';
import { listPictures, makeGroupFolder, movePicture, readText, removeFile, removeFolderIfEmpty, writeDocLink, writeFile, writePicture } from './folder.ts';
import { readFolderFrames, writeFrame } from './frame-sync.ts';
import { underStyle } from './ground.ts';
import { History, useHistory } from './history.ts';
import type { Project } from './useProject.ts';
import {
  type View,
  type Rect,
  HEAD,
  EMAIL_PAGE,
  clampZoom,
  ago,
  sizeOf,
  plural,
  openTool,
  readView,
  KIND_LABEL,
  kindOfCardOr,
  placesOf,
  restorePlaces,
  openTitle,
  missingName,
  linkPath,
  cardUnder,
} from './board-helpers.ts';
import { type EmailItem, type FrameItem, type PrintedPage, printId, printedIn, useProjectFiles } from './files.ts';
import { EmailBody, FrameBody, DocBody } from './cards.tsx';
import { LinkForm, ProjectMenu } from './menus.tsx';
import { ArrowLeft, FitAll, FitOne, Minus, Plus } from './glyphs.tsx';

// --- the board ------------------------------------------------------------------------------------------------

/** What the keyboard does on the board, as the sheet `?` opens lists it. Keep it beside `onKey`, which is the truth. */
const BOARD_KEYS: Array<[string[], string]> = [
  [['⌘Z', '⇧⌘Z'], 'Undo, redo'],
  [['Enter'], 'Open the selected card in its tool'],
  [['⌫', '⌦'], 'Remove the selected file; press twice, ⌘Z puts it back'],
  [['Esc'], 'Let go of the selection, a picked line or a new group'],
  [['⇧1'], 'Fit everything'],
  [['⇧2'], 'Zoom to the selected card'],
  [['⌘+', '⌘−'], 'Zoom in and out'],
  [['⌘0'], 'Zoom to 100%'],
  [['Space'], 'Pan with any drag while held; holding still on the board pans too'],
  [['⌥ drag'], 'Leave a copy of a card behind'],
  [['?'], 'This sheet'],
];

export interface BoardProps {
  project: Project;
  notify(message: string): void;
  onCreateProject(): void;
}

export function Board({ project, notify, onCreateProject }: BoardProps) {
  const dir = project.dir!;
  const info = project.info!;
  const projectRef = useRef(project);
  projectRef.current = project;
  const { files, kept, refresh, stale, current } = useProjectFiles(projectRef, notify);

  // How the board moves (canvas-settings.ts), read through a ref by handlers bound once.
  const settings = useCanvasSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  /** A board position on the grid, when snapping is on. */
  const snap = (v: number) => (settingsRef.current.snap ? Math.round(v / settingsRef.current.gridStep) * settingsRef.current.gridStep : v);

  // --- undo (history.ts) ---
  const history = useRef(new History()).current;
  const past = useHistory(history);
  /** Runs one step back or forward, and says what went wrong rather than leaving the board half-changed in silence. */
  const step = async (which: 'undo' | 'redo') => {
    try {
      await (which === 'undo' ? history.undo() : history.redo());
    } catch (cause) {
      notify(cause instanceof Error ? `Could not ${which}: ${cause.message}` : `Could not ${which}.`);
    }
  };

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

  // A tool saved into the project (project.js): show it now rather than at the next look.
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(PROJECT_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if ((event.data as { type?: string } | null)?.type === 'saved') refreshAll();
      };
    } catch {
      channel = null;
    }
    return () => channel?.close();
  }, [refreshAll]);

  /** Each email's height in its own page pixels, once its preview has laid out; its card is then as tall as the whole email. */
  const [emailHeights, setEmailHeights] = useState<Record<string, number>>({});
  const measured = useCallback((id: string, height: number) => {
    setEmailHeights((old) => (old[id] === height ? old : { ...old, [id]: height }));
  }, []);
  // --- layout ---
  const sources = useMemo<CardSource[]>(
    () => [
      ...files.emails.map((e) => {
        const measuredHeight = emailHeights[e.id];
        return { id: e.id, kind: 'email' as const, name: e.name, size: measuredHeight ? emailCardSize(measuredHeight, EMAIL_PAGE, HEAD) : undefined };
      }),
      ...files.docs.map((d) => ({ id: d.id, kind: 'doc' as const, name: d.link.name })),
      ...files.frames.map((f) => ({ id: f.id, kind: 'frame' as const, name: f.name })),
      ...files.pictures.filter((p) => !p.rendered).map((p) => ({ id: p.id, kind: 'picture' as const, name: p.path.split('/').pop() ?? p.path })),
    ],
    [files, emailHeights],
  );
  // What is made from what, before the layout: a card with no place yet goes beside what it is linked to.
  const links = useMemo(
    () =>
      projectLinks(
        files.emails.flatMap((e) => (e.template ? [{ id: e.id, template: e.template }] : [])),
        files.frames.map((f) => ({ id: f.id, key: f.key, template: f.template })),
        files.pictures.filter((p) => !p.rendered).map((p) => ({ id: p.id, path: p.path })),
        files.recipes,
      ),
    [files],
  );
  const layout = useMemo(() => layoutBoard(sources, board, files.folders, links), [sources, board, files.folders, links]);
  /** The layout as it is now, for undo steps recorded earlier. */
  const layoutRef = useRef<BoardLayout>(layout);
  layoutRef.current = layout;

  // A card that just found a place keeps it, so a file added tomorrow does not shuffle today's board.
  // A group just made for a folder is kept the same way. Not from a read older than a move the board just made: that
  // read still has the picture's old name, and writing its places down put a removed group and its old card back.
  useEffect(() => {
    if (!files.read || !boardRead || !current(files) || (layout.placed.length === 0 && layout.groupsPlaced.length === 0)) return;
    saveBoard(withPlaces(boardRef.current, layout.cards, layout.groupsPlaced.length ? layout.groups : undefined));
  }, [files, boardRead, layout, saveBoard, current]);

  const emailsById = useMemo(() => new Map(files.emails.map((e) => [e.id, e])), [files.emails]);
  const framesById = useMemo(() => new Map(files.frames.map((f) => [f.id, f])), [files.frames]);
  const picturesById = useMemo(() => new Map(files.pictures.map((p) => [p.id, p])), [files.pictures]);
  const docsById = useMemo(() => new Map(files.docs.map((d) => [d.id, d])), [files.docs]);
  const assets = useMemo<AssetFile[]>(
    () => [...files.pictures.map((p) => ({ name: p.path, size: p.size, url: p.url })), ...kept.filter((k) => !files.pictures.some((p) => p.path === k.name))],
    [files.pictures, kept],
  );
  const recipeOf = useMemo(() => recipesByOutput(files.recipes), [files.recipes]);

  // --- printed pages ---
  // A freeform page with effects is pixels its drawing cannot show, so the board prints it: the frame's own
  // card, and every page in an email that has effects, which is how a followed riso frame looks the same on the
  // email's card as on the frame's and in Template Studio. One print per recipe on one ground, so a frame and
  // the emails that follow it share one.
  const [prints, setPrints] = useState<Record<string, string>>({});
  const printsRef = useRef(prints);
  printsRef.current = prints;
  const assetSignature = assets.map((a) => a.url).join('|');
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const printedPages = useMemo(() => {
    const wanted: PrintedPage[] = [];
    for (const f of files.frames) {
      const fr = f.frame;
      if (fr?.page.effects?.length) wanted.push({ page: fr.page, hash: fr.hash, ground: fr.ground, ds: f.template.ds ?? DEFAULT_DESIGN_SYSTEM });
    }
    for (const e of files.emails) if (e.template) wanted.push(...printedIn(e.template));
    return wanted;
  }, [files.frames, files.emails]);
  useEffect(() => {
    let cancelled = false;
    // Prints nothing on the board asks for any more (a frame edited on, a picture changed) are let go, so a long
    // session of edits does not keep every print it ever made.
    const wanted = new Set(printedPages.map((w) => printId(w.hash, w.ground, assetSignature.length)));
    if (Object.keys(printsRef.current).some((id) => !wanted.has(id))) {
      setPrints((p) => Object.fromEntries(Object.entries(p).filter(([id]) => wanted.has(id))));
    }
    void (async () => {
      for (const w of printedPages) {
        const id = printId(w.hash, w.ground, assetSignature.length);
        if (printsRef.current[id]) continue;
        try {
          const canvas = await freeformCanvas(w.page, w.ds, { assets: assetsRef.current, scale: 1, ground: w.ground });
          if (cancelled) return;
          const url = canvas.toDataURL('image/png');
          setPrints((p) => ({ ...p, [id]: url }));
        } catch {
          // The drawing without its print is still a fair picture of the page.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [printedPages, assetSignature]);
  const printOf = (f: FrameItem) => (f.frame?.page.effects?.length ? prints[printId(f.frame.hash, f.frame.ground, assetSignature.length)] : undefined);
  /** For each email, the prints of its pages with effects by block id: what its card shows in the drawings' place. */
  const emailPrints = useMemo(() => {
    const out = new Map<string, Record<string, { url: string }>>();
    for (const e of files.emails) {
      if (!e.template) continue;
      const byBlock: Record<string, { url: string }> = {};
      for (const w of printedIn(e.template)) {
        const url = prints[printId(w.hash, w.ground, assetSignature.length)];
        if (url && w.blockId) byBlock[w.blockId] = { url };
      }
      if (Object.keys(byBlock).length > 0) out.set(e.id, byBlock);
    }
    return out;
  }, [files.emails, prints, assetSignature]);

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
  /** A slide after a pan lets go (inertia.ts), stopped by the next touch. */
  const glideStop = useRef<(() => void) | null>(null);
  /** Stops whatever the view is doing on its own: a flight, or a slide. */
  const stopMotion = useCallback(() => {
    cancelAnimationFrame(anim.current);
    glideStop.current?.();
    glideStop.current = null;
  }, []);
  const animateTo = useCallback(
    (to: View, ms = 360, done?: () => void) => {
      stopMotion();
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
    [reduced, setView, stopMotion],
  );

  const bounds = useMemo<Rect | null>(() => {
    const all: Rect[] = [...layout.cards, ...layout.missing, ...layout.groups];
    if (all.length === 0) return null;
    const x = Math.min(...all.map((r) => r.x));
    const y = Math.min(...all.map((r) => r.y));
    return { x, y, w: Math.max(...all.map((r) => r.x + r.w)) - x, h: Math.max(...all.map((r) => r.y + r.h)) - y };
  }, [layout]);

  const fitView = useCallback((): View | null => {
    if (!bounds) return null;
    const top = 40;
    const bottom = 40;
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
        stopMotion();
        setView(to);
      }
    },
    [size, animateTo, setView, stopMotion],
  );
  const fit = useCallback(() => {
    const f = fitView();
    if (f) animateTo(f, 420);
  }, [fitView, animateTo]);
  /** The view with one rectangle filling most of the window, the way a double-click zooms into a card. */
  const fitTo = useCallback(
    (r: Rect) => {
      const z = clampZoom(Math.min((size.w * 0.72) / r.w, (size.h * 0.72) / r.h, 2.5));
      animateTo({ z, x: size.w / 2 - (r.x + r.w / 2) * z, y: size.h / 2 - (r.y + r.h / 2) * z }, 420);
    },
    [size, animateTo],
  );

  // Wheel: ⌘ or a pinch zooms about the pointer, a plain wheel pans. Non-passive, or the page scrolls.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoomTo(viewRef.current.z * Math.exp(-event.deltaY * 0.0025 * settingsRef.current.wheelGain), { x: event.clientX - r.left, y: event.clientY - r.top });
      else {
        stopMotion();
        const v = viewRef.current;
        setView({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo, setView, stopMotion]);

  // --- selecting, moving, opening ---
  const [selected, setSelected] = useState<string | null>(null);
  /** `copy`: Option is held, so the original stays and a copy is being carried. */
  const [moving, setMoving] = useState<{ id: string; x: number; y: number; copy: boolean } | null>(null);
  /** A frame or an email a dragged picture, or a dragged frame, would be put into on letting go. */
  const [dropCard, setDropCard] = useState<string | null>(null);
  /** A line picked on the board, as `from>to`, ready to be broken. */
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  /** ⇧2, and the zoom group's Selection: the selected card fills the window. */
  const fitSelection = useCallback(() => {
    const card = layout.cards.find((c) => c.id === selected);
    if (card) fitTo(card);
  }, [layout, selected, fitTo]);
  /** The sheet `?` opens: every key the board answers to, in one place. */
  const [showKeys, setShowKeys] = useState(false);
  const [panning, setPanning] = useState(false);
  /** A group being moved or resized, as it is drawn until the pointer lets go, with the cards riding along. */
  const [groupDrag, setGroupDrag] = useState<{ id: string; dx: number; dy: number; dw: number; dh: number; riders: string[] } | null>(null);
  /** Where a picture being dragged would be filed: a group's id, or `out` for straight into assets/. */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  /** + Group was pressed: the next drag on the board draws the new group's region. */
  const [grouping, setGrouping] = useState(false);
  const groupingRef = useRef(false);
  groupingRef.current = grouping;
  /** The region being dragged out for a new group, on the board. */
  const [marquee, setMarquee] = useState<Rect | null>(null);
  /** Space is down: every press is the hand, whatever it lands on. */
  const spaceRef = useRef(false);
  const [hand, setHand] = useState(false);
  /** A press held still on a card or group becomes the hand after a beat (Canvas menu, Hold to pan). */
  const holdTimer = useRef(0);
  const drag = useRef<
    /** `over`: the card a held press began on, selected when the hand lets go without having moved. */
    | { kind: 'pan'; x: number; y: number; view: View; moved: boolean; tracker: PanTracker; over?: string | null }
    | { kind: 'card'; id: string; x: number; y: number; from: { x: number; y: number }; moved: boolean; copy: boolean }
    | { kind: 'group'; id: string; x: number; y: number; riders: string[]; moved: boolean }
    | { kind: 'resize'; id: string; x: number; y: number; moved: boolean }
    | { kind: 'marquee'; from: { x: number; y: number }; moved: boolean }
    | null
  >(null);

  /** The view when the second finger landed, which a pinch is measured against. */
  const gestureView = useRef<View | null>(null);
  // Fingers: two pan and pinch the board, whatever one was doing; a palm beside a pencil is ignored (gestures.ts).
  const gestures = useRef<TouchGestures | null>(null);
  if (!gestures.current) {
    gestures.current = new TouchGestures({
      onStart: () => {
        drag.current = null;
        setMoving(null);
        setGroupDrag(null);
        setDropTarget(null);
        setMarquee(null);
        setPanning(false);
        stopMotion();
        gestureView.current = viewRef.current;
      },
      onPinch: ({ start, mid, scale }) => {
        const from = gestureView.current;
        const r = stage.current?.getBoundingClientRect();
        if (!from || !r) return;
        // The gain makes the zoom more eager than the fingers' own spread: ×1 is one to one.
        const z = clampZoom(from.z * Math.pow(scale, settingsRef.current.pinchGain));
        const k = z / from.z;
        setView({ z, x: mid.x - r.left - (start.x - r.left - from.x) * k, y: mid.y - r.top - (start.y - r.top - from.y) * k });
      },
      onEnd: () => {
        gestureView.current = null;
      },
      onTap: (fingers) => void step(fingers >= 3 ? 'redo' : 'undo'),
    });
  }

  const riding = <T extends { id: string; x: number; y: number }>(c: T): T =>
    groupDrag && groupDrag.riders.includes(c.id) ? { ...c, x: c.x + groupDrag.dx, y: c.y + groupDrag.dy } : c;
  // A copy being carried leaves the original where it is; the copy is drawn on its own below.
  const cards = layout.cards.map((c) => (moving?.id === c.id && !moving.copy ? { ...c, x: moving.x, y: moving.y } : riding(c)));
  const missing = layout.missing.map((c) => (moving?.id === c.id ? { ...c, x: moving.x, y: moving.y } : riding(c)));
  const groups = layout.groups.map((g) =>
    groupDrag?.id === g.id ? { ...g, x: g.x + groupDrag.dx, y: g.y + groupDrag.dy, w: Math.max(276, g.w + groupDrag.dw), h: Math.max(286, g.h + groupDrag.dh) } : g,
  );
  const rects = new Map<string, Rect>([...cards, ...missing].map((c) => [c.id, c]));

  const openCard = useCallback(
    (card: PlacedCard) => {
      const before = viewRef.current;
      const z = clampZoom(Math.min((size.w * 0.72) / card.w, (size.h * 0.72) / card.h, 2.5));
      const to = { z, x: size.w / 2 - (card.x + card.w / 2) * z, y: size.h / 2 - (card.y + card.h / 2) * z };
      let url: string | null = null;
      const email = emailsById.get(card.id);
      const frame = framesById.get(card.id);
      const doc = docsById.get(card.id);
      if (email) url = `index.html?open=${encodeURIComponent(email.fileName)}&from=board`;
      if (frame) url = `freeform.html?frame=${encodeURIComponent(frame.key)}&from=board`;
      if (doc) url = doc.link.url;
      // A picture opens in the tool that made it, with its settings; otherwise in Riso, or Ink bleed for an SVG.
      const picture = picturesById.get(card.id);
      if (picture) url = toolAddress('../../', picture.path, recipeOf.get(picture.path));
      setSelected(card.id);
      const elsewhere = Boolean(doc);
      animateTo(to, 420, () => {
        if (!url) return;
        if (elsewhere) {
          openTool(url, true);
          // Back to where the board was, for when you come back to it.
          window.setTimeout(() => animateTo(before, 420), 700);
          return;
        }
        // The tool takes this tab. The board is remembered as it was before the zoom, so the way back, the tool's
        // arrow or the browser's, finds it whole rather than pressed against one card.
        try {
          localStorage.setItem(viewKey, JSON.stringify(before));
        } catch {
          // Nothing kept: the board fits itself on return.
        }
        openTool(url);
      });
    },
    [size, emailsById, framesById, picturesById, docsById, recipeOf, animateTo, viewKey],
  );

  /** A point on the screen, on the board. */
  const worldAt = (clientX: number, clientY: number) => {
    const r = stage.current?.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - (r?.left ?? 0) - v.x) / v.z, y: (clientY - (r?.top ?? 0) - v.y) / v.z };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as Element;
    if (target.closest('button, a, input')) return;
    const landing = gestures.current!.down(event);
    if (landing === 'palm' || landing === 'gesture') return;
    const primary = event.button === 0;
    stopMotion();
    // The hand, wherever it lands: the middle button, or Space held.
    if (event.button === 1 || (primary && spaceRef.current)) {
      drag.current = { kind: 'pan', x: event.clientX, y: event.clientY, view: viewRef.current, moved: false, tracker: new PanTracker() };
      setPanning(true);
      return;
    }
    if (primary && groupingRef.current) {
      // Drawing out a group: over cards or not, the region is what is being made.
      drag.current = { kind: 'marquee', from: worldAt(event.clientX, event.clientY), moved: false };
      return;
    }
    // A line: picked, and offered to be broken. Nothing else starts.
    const linkEl = primary ? (target.closest('[data-link]') as SVGElement | null) : null;
    if (linkEl) {
      setSelectedLink(linkEl.getAttribute('data-link'));
      setSelected(null);
      return;
    }
    const cardEl = primary ? (target.closest('[data-card]') as HTMLElement | null) : null;
    const resizeEl = primary ? (target.closest('[data-group-resize]') as HTMLElement | null) : null;
    const headEl = primary ? (target.closest('[data-group-head]') as HTMLElement | null) : null;
    const id = cardEl?.dataset['card'];
    const rect = id ? rects.get(id) : undefined;
    const group = layout.groups.find((g) => g.id === (resizeEl?.dataset['groupResize'] ?? headEl?.dataset['groupHead']));
    if (id && rect) drag.current = { kind: 'card', id, x: event.clientX, y: event.clientY, from: { x: rect.x, y: rect.y }, moved: false, copy: event.altKey };
    else if (group && resizeEl) drag.current = { kind: 'resize', id: group.id, x: event.clientX, y: event.clientY, moved: false };
    else if (group) {
      // The group's pictures, and anything else sitting wholly inside it, go where it goes.
      const inside = (c: Rect) => c.x >= group.x && c.y >= group.y && c.x + c.w <= group.x + group.w && c.y + c.h <= group.y + group.h;
      const riders = [...layout.cards, ...layout.missing].filter((c) => group.members.includes(c.id) || inside(c)).map((c) => c.id);
      drag.current = { kind: 'group', id: group.id, x: event.clientX, y: event.clientY, riders, moved: false };
    } else {
      drag.current = { kind: 'pan', x: event.clientX, y: event.clientY, view: viewRef.current, moved: false, tracker: new PanTracker() };
      setPanning(true);
    }
    // A press on a card or a group that stays still for a beat is the hand from then on: dragging moves the view, not
    // the thing. Moving before the beat is up drags the thing as before; letting go without moving is a click.
    const pressed = drag.current;
    if (pressed && pressed.kind !== 'pan') {
      const over = pressed.kind === 'card' ? pressed.id : null;
      window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        const d = drag.current;
        if (!d || d.kind === 'pan' || d.kind === 'marquee' || d.moved) return;
        drag.current = { kind: 'pan', x: d.x, y: d.y, view: viewRef.current, moved: false, tracker: new PanTracker(), over };
        setPanning(true);
      }, settingsRef.current.holdPanMs);
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (gestures.current!.move(event)) return;
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'marquee') {
      const p = worldAt(event.clientX, event.clientY);
      if (!d.moved && Math.hypot(p.x - d.from.x, p.y - d.from.y) * viewRef.current.z < 3) return;
      if (!d.moved) if (stage.current) capture(stage.current, event.pointerId);
      d.moved = true;
      setMarquee({ x: Math.min(d.from.x, p.x), y: Math.min(d.from.y, p.y), w: Math.abs(p.x - d.from.x), h: Math.abs(p.y - d.from.y) });
      return;
    }
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    // Captured only once it is a drag: a capture taken on press sends the click, and so the double-click that
    // opens a card, to the stage instead of the card.
    if (!d.moved) if (stage.current) capture(stage.current, event.pointerId);
    d.moved = true;
    window.clearTimeout(holdTimer.current);
    const z = viewRef.current.z;
    if (d.kind === 'pan') {
      d.tracker.push(event.clientX, event.clientY);
      setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
    } else if (d.kind === 'group') setGroupDrag({ id: d.id, dx: dx / z, dy: dy / z, dw: 0, dh: 0, riders: d.riders });
    else if (d.kind === 'resize') setGroupDrag({ id: d.id, dx: 0, dy: 0, dw: dx / z, dh: dy / z, riders: [] });
    else {
      // Option, held or let go at any point of the drag, decides whether a copy is being carried.
      d.copy = event.altKey;
      setMoving({ id: d.id, x: d.from.x + dx / z, y: d.from.y + dy / z, copy: d.copy });
      const card = layout.cards.find((c) => c.id === d.id);
      const p = worldAt(event.clientX, event.clientY);
      // A picture over a frame or an email, or a frame over an email, is put into it on letting go.
      const into = card ? cardUnder(layout.cards, p, card) : null;
      setDropCard(into?.id ?? null);
      // Otherwise a picture over a group other than its own is filed there; one out of every group, into assets/.
      if (card?.kind === 'picture' && !into && !d.copy) {
        const over = groupAt(layout.groups, p.x, p.y);
        const next = over ? over.folder : null;
        setDropTarget(next === cardFolder(card) ? null : over ? over.id : 'out');
      } else setDropTarget(null);
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    gestures.current!.up(event);
    window.clearTimeout(holdTimer.current);
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    if (!d) return;
    if (d.kind === 'marquee') {
      const region = marquee;
      setMarquee(null);
      setGrouping(false);
      // A drag makes the group that size; a click makes one the usual size, there.
      const drawn = d.moved && region && region.w > 24 && region.h > 24 ? region : { x: d.from.x - 280, y: d.from.y - 200, w: 560, h: 400 };
      void newGroup({ x: snap(drawn.x), y: snap(drawn.y), w: Math.max(24, snap(drawn.w)), h: Math.max(24, snap(drawn.h)) });
      return;
    }
    if (d.kind === 'pan') {
      if (!d.moved) {
        // A click: on a card it selects the card, even a long one; on the paper it clears the selection.
        if (d.over) setSelected(d.over);
        else {
          setSelected(null);
          setSelectedLink(null);
          setConfirming(null);
        }
        return;
      }
      // Let go while moving: the board keeps sliding and eases to a stop (inertia.ts).
      const v = d.tracker.velocity();
      if (v && !reduced && settingsRef.current.momentum) {
        glideStop.current = glide(
          v,
          (dx, dy) => {
            const cur = viewRef.current;
            setView({ ...cur, x: cur.x + dx, y: cur.y + dy });
          },
          { friction: settingsRef.current.friction },
        );
      }
      return;
    }
    if (d.kind === 'group' || d.kind === 'resize') {
      const group = layout.groups.find((g) => g.id === d.id);
      const change = groupDrag;
      setGroupDrag(null);
      if (!group || !d.moved || !change) return;
      const dx = snap(group.x + change.dx) - group.x;
      const dy = snap(group.y + change.dy) - group.y;
      const w = change.dw ? Math.max(24, snap(group.w + change.dw)) : group.w;
      const h = change.dh ? Math.max(24, snap(group.h + change.dh)) : group.h;
      const before = placesOf(boardRef.current, group, change.riders);
      saveBoard(moveGroupWith(boardRef.current, { ...group, w, h }, dx, dy, change.riders));
      const after = placesOf(boardRef.current, group, change.riders);
      history.push({
        label: d.kind === 'resize' ? `Resize ${group.name}` : `Move ${group.name}`,
        undo: () => saveBoard(restorePlaces(boardRef.current, before)),
        redo: () => saveBoard(restorePlaces(boardRef.current, after)),
      });
      return;
    }
    const target = dropTarget;
    setDropTarget(null);
    const into = dropCard ? layout.cards.find((c) => c.id === dropCard) : undefined;
    setDropCard(null);
    if (d.moved && moving) {
      const card = layout.cards.find((c) => c.id === d.id);
      if (card && into) {
        // Dropped into a frame or an email: the card goes back where it was, and the picture goes into the file.
        void putInto(card, into);
        setSelected(into.id);
        setMoving(null);
        return;
      }
      if (card && d.copy) {
        void duplicateCard(card, { x: snap(moving.x), y: snap(moving.y) });
        setMoving(null);
        return;
      }
      if (card && target) void fileIn(card, target === 'out' ? null : (layout.groups.find((g) => g.id === target) ?? null), moving);
      else {
        const id = d.id;
        const from = d.from;
        const to = { x: snap(moving.x), y: snap(moving.y) };
        saveBoard(moveCard(boardRef.current, id, to.x, to.y));
        history.push({
          label: `Move ${card?.name ?? missingName(id, kindOfCardOr(id))}`,
          undo: () => saveBoard(moveCard(boardRef.current, id, from.x, from.y)),
          redo: () => saveBoard(moveCard(boardRef.current, id, to.x, to.y)),
        });
        if (!projectRef.current.writable) notify(`${info.name} is open view-only, so the arrangement lasts until the page reloads. Allow editing to keep it.`);
      }
    }
    setSelected(d.id);
    setMoving(null);
  };

  // The handlers are made every render, so they see the latest selection, layout and lines; one subscription reads
  // them through a ref, so it is bound once and its dependency list is empty and true.
  /** The card a first Backspace named; the second press deletes it. Escape, another card, or five seconds let it go. */
  const armedDelete = useRef<{ id: string; until: number } | null>(null);
  const onKey = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === ' ') {
      // Space is the hand while it is down, wherever the pointer lands.
      event.preventDefault();
      if (!spaceRef.current) {
        spaceRef.current = true;
        setHand(true);
      }
    } else if (event.key === '?') {
      event.preventDefault();
      setShowKeys((v) => !v);
    } else if (event.key === 'Escape') {
      if (showKeys) setShowKeys(false);
      else if (armedDelete.current) {
        armedDelete.current = null;
        notify(`${layout.cards.find((c) => c.id === selected)?.name ?? 'The card'} stays.`);
      } else if (groupingRef.current) setGrouping(false);
      else if (selectedLinkRef.current) setSelectedLink(null);
      else setSelected(null);
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && selectedLinkRef.current) {
      event.preventDefault();
      const picked = links.find((l) => `${l.from}>${l.to}` === selectedLinkRef.current);
      if (picked) void breakLink(picked);
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && selected) {
      event.preventDefault();
      const card = layout.cards.find((c) => c.id === selected);
      if (!card) return;
      // Jared: "add a confirmation to delete from a board when using backspace." The first press names the file
      // and asks; the second, on the same card within a few seconds, removes it. Undo still puts it back.
      const armed = armedDelete.current;
      if (armed && armed.id === card.id && armed.until > Date.now()) {
        armedDelete.current = null;
        void deleteCard(card);
      } else {
        armedDelete.current = { id: card.id, until: Date.now() + 5000 };
        notify(`Delete ${card.name} from the project? Press ${event.key} again to remove its file (⌘Z puts it back), or Esc to keep it.`);
      }
    } else if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void step(event.shiftKey ? 'redo' : 'undo');
    } else if (event.key === 'Enter' && selected) {
      const card = layout.cards.find((c) => c.id === selected);
      if (card) openCard(card);
    } else if (event.shiftKey && event.code === 'Digit1') {
      event.preventDefault();
      fit();
    } else if (event.shiftKey && event.code === 'Digit2') {
      event.preventDefault();
      fitSelection();
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
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== ' ') return;
    spaceRef.current = false;
    setHand(false);
  };
  const onBlur = () => {
    spaceRef.current = false;
    setHand(false);
  };
  const keyHandlers = useRef({ onKey, onKeyUp, onBlur });
  keyHandlers.current = { onKey, onKeyUp, onBlur };
  useEffect(() => {
    const down = (event: KeyboardEvent) => keyHandlers.current.onKey(event);
    const up = (event: KeyboardEvent) => keyHandlers.current.onKeyUp(event);
    const blur = () => keyHandlers.current.onBlur();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  const selectedLinkRef = useRef<string | null>(null);
  selectedLinkRef.current = selectedLink;

  // --- into a frame or an email, copies, and breaking a line (model/board-edits.ts) ---

  /** The natural size of a picture, for fitting it into a frame. */
  const naturalSize = (url: string) =>
    new Promise<{ width: number; height: number }>((res, rej) => {
      const img = new Image();
      img.onload = () => res({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
      img.onerror = () => rej(new Error('The picture could not be read.'));
      img.src = url;
    });

  /**
   * Every place an email's file is, first the one the board shows: .scug/templates/, then where the old layout kept
   * it. A name can sit in two places (learnings 3.77), and a delete that took one copy only brought the other into view.
   */
  const emailPaths = async (fileName: string): Promise<string[]> => {
    const out: string[] = [];
    for (const sub of [META.templates, 'templates']) if (await readText(dir, `${sub}/${fileName}`)) out.push(`${sub}/${fileName}`);
    if (await readText(dir, fileName)) out.push(fileName);
    return out;
  };
  /** Where an email's file is: in .scug/templates/, or where the old layout kept it. */
  const emailPath = async (fileName: string): Promise<string> => (await emailPaths(fileName))[0] ?? fileName;

  /** Writes a file, looks at the folder again, tells the others, and records the step with the old text to put back. */
  const rewriteText = async (path: string, before: string, after: string, label: string) => {
    const write = async (text: string) => {
      await writeFile(dir, path, text);
      stale();
      await refresh();
    };
    await write(after);
    history.push({ label, undo: () => write(before), redo: () => write(after) });
  };

  const rewriteEmail = async (email: EmailItem, next: Template, label: string) => {
    const path = await emailPath(email.fileName);
    const before = (await readText(dir, path))?.text ?? (email.template ? serializeTemplate(email.template) : '');
    await rewriteText(path, before, serializeTemplate(next), label);
  };

  /** Writes a frame as a new save, so every browser that keeps the frame takes the change. Undo saves the old drawing again. */
  const rewriteFrame = async (frame: FrameItem, next: Template, label: string) => {
    const write = async (template: Template) => {
      await writeFrame(dir, { key: frame.key, name: frame.name, savedAt: Date.now(), template }, await readFolderFrames(dir));
      stale();
      await refresh();
    };
    await write(next);
    history.push({ label, undo: () => write(frame.template), redo: () => write(next) });
  };

  const notWritable = (what: string) => notify(`${info.name} is open view-only. Allow editing to ${what}.`);
  const failedTo = (cause: unknown, what: string) => notify(cause instanceof Error ? `Could not ${what}: ${cause.message}` : `Could not ${what}.`);

  /** A picture into a frame or an email, or a frame into an email: the file changes, and the line appears. */
  const putInto = async (card: PlacedCard, into: PlacedCard) => {
    if (!projectRef.current.writable) return notWritable(`put ${card.name} in ${into.name}`);
    try {
      if (card.kind === 'picture' && into.kind === 'frame') {
        const frame = framesById.get(into.id);
        const picture = picturesById.get(card.id);
        if (!frame || !picture) return;
        await rewriteFrame(frame, addPictureToFrame(frame.template, picture.path, await naturalSize(picture.url)), `Put ${card.name} in ${into.name}`);
      } else if (card.kind === 'picture' && into.kind === 'email') {
        const email = emailsById.get(into.id);
        const picture = picturesById.get(card.id);
        if (!email?.template || !picture) return;
        await rewriteEmail(email, addPictureToEmail(email.template, picture.path, `bd${Date.now().toString(36)}-`), `Put ${card.name} in ${into.name}`);
      } else if (card.kind === 'frame' && into.kind === 'email') {
        const frame = framesById.get(card.id);
        const email = emailsById.get(into.id);
        if (!frame?.frame || !email?.template) return;
        await rewriteEmail(email, addFrameToEmail(email.template, frame.frame, `ff${Date.now().toString(36)}-`), `${into.name} follows ${card.name}`);
      } else return;
      notify(`Put ${card.name} in ${into.name}.`);
    } catch (cause) {
      failedTo(cause, `put ${card.name} in ${into.name}`);
    }
  };

  /** A copy of a card's file beside it, placed where Option-drag let go. Undo removes the copy. */
  const duplicateCard = async (card: PlacedCard, at: { x: number; y: number }) => {
    if (!projectRef.current.writable) return notWritable(`copy ${card.name}`);
    try {
      let made: { id: string; write(): Promise<void>; remove(): Promise<void> } | null = null;
      if (card.kind === 'picture') {
        const picture = picturesById.get(card.id);
        if (!picture) return;
        const to = freeAssetPath(picture.path, files.pictures.map((p) => p.path));
        const blob = await (await fetch(picture.url)).blob();
        made = { id: pictureCardId(to), write: () => writeFile(dir, `assets/${to}`, blob).then(() => undefined), remove: () => removeFile(dir, `assets/${to}`) };
      } else if (card.kind === 'email') {
        const email = emailsById.get(card.id);
        if (!email?.template) throw new Error(`${card.name} could not be read.`);
        const copy = duplicateTemplate(email.template, `${email.template.name} copy`);
        const fileName = templateFileName(copy, files.emails.map((e) => e.fileName));
        const text = serializeTemplate(copy);
        made = { id: emailCardId(fileName), write: () => writeFile(dir, `${META.templates}/${fileName}`, text).then(() => undefined), remove: () => removeFile(dir, `${META.templates}/${fileName}`) };
      } else if (card.kind === 'frame') {
        const frame = framesById.get(card.id);
        if (!frame) return;
        const copy = duplicateFrameFile({ key: frame.key, name: frame.name, savedAt: frame.savedAt, template: frame.template }, FRAME_PREFIX + newFrameId());
        let written: string | null = null;
        made = {
          id: frameCardId(copy.key),
          write: async () => {
            written = (await writeFrame(dir, { ...copy, savedAt: Date.now() }, await readFolderFrames(dir))).path;
          },
          remove: async () => {
            if (written) await removeFile(dir, written);
          },
        };
      } else if (card.kind === 'doc') {
        const doc = docsById.get(card.id);
        if (!doc) return;
        let path: string | null = null;
        made = {
          id: '',
          write: async () => {
            path = await writeDocLink(dir, { url: doc.link.url, name: `${doc.link.name} copy` }, files.docs);
            made!.id = docCardId(path);
          },
          remove: async () => {
            if (path) await removeFile(dir, path);
          },
        };
      }
      if (!made) return;
      const place = async () => {
        await made!.write();
        stale();
        saveBoard(moveCard(boardRef.current, made!.id, at.x, at.y));
        await refresh();
      };
      await place();
      notify(`Copied ${card.name}.`);
      history.push({
        label: `Copy ${card.name}`,
        undo: async () => {
          await made!.remove();
          stale();
          saveBoard(forgetCard(boardRef.current, made!.id));
          await refresh();
          },
        redo: place,
      });
    } catch (cause) {
      failedTo(cause, `copy ${card.name}`);
    }
  };

  /** Takes a line out of the file it is in: the block or layer that shows the picture, the link to the frame, or the recipe's source. */
  const breakLink = async (link: CardLink) => {
    if (!projectRef.current.writable) return notWritable('break the link');
    try {
      if (link.kind === 'follows') {
        const frame = framesById.get(link.from);
        const email = emailsById.get(link.to);
        if (!frame || !email?.template) return;
        const { template, unlinked } = unfollowFrame(email.template, frame.key);
        if (unlinked) await rewriteEmail(email, template, `Unlink ${email.name} from ${frame.name}`);
      } else if (link.kind === 'uses') {
        const picture = picturesById.get(link.from);
        if (!picture) return;
        const name = picture.path.split('/').pop() ?? picture.path;
        const email = emailsById.get(link.to);
        const frame = framesById.get(link.to);
        if (email?.template) {
          const { template, removed } = removePictureFrom(email.template, picture.path);
          if (removed) await rewriteEmail(email, template, `Take ${name} out of ${email.name}`);
        } else if (frame) {
          const { template, removed } = removePictureFrom(frame.template, picture.path);
          if (removed) await rewriteFrame(frame, template, `Take ${name} out of ${frame.name}`);
        }
      } else {
        const made = picturesById.get(link.to);
        const source = picturesById.get(link.from);
        const recipe = made ? recipeOf.get(made.path) : undefined;
        if (!made || !source || !recipe) return;
        const raw = await readText(dir, recipe.path);
        if (!raw) return;
        const { value, changed } = dropSourceFromRecipe(JSON.parse(raw.text) as unknown, source.path);
        if (changed) await rewriteText(recipe.path, raw.text, `${JSON.stringify(value, null, 2)}\n`, `Forget what made ${made.path.split('/').pop()}`);
      }
      setSelectedLink(null);
    } catch (cause) {
      failedTo(cause, 'break the link');
    }
  };

  /**
   * Removes a card's file from the project. Jared: "allow deleting elements on the project board too." No question
   * asked, by the rule the canvas follows: it happens, and Undo puts back the same bytes under the same name, and
   * the card's place. What pointed at the file keeps pointing: an email that showed a deleted picture shows it as
   * missing, which Template Studio's checks report, and the notice says how many do. Drive's own files for a Google
   * Doc, Sheet or Slides are not deleted from here, since removing that file removes the document for everyone who
   * has it; only the board's own link files are.
   */
  const deleteCard = async (card: PlacedCard) => {
    if (!projectRef.current.writable) return notWritable(`delete ${card.name}`);
    try {
      /** `others`: further copies of the same file, removed with it; Undo writes back the one the board showed. */
      let file: { path: string; data: string | Blob; others?: string[] } | null = null;
      const textOf = async (path: string, what: string) => {
        const read = await readText(dir, path);
        if (!read) throw new Error(`${what} could not be read, so it was left alone.`);
        return read.text;
      };
      if (card.kind === 'email') {
        const email = emailsById.get(card.id);
        if (!email) return;
        const [path = email.fileName, ...others] = await emailPaths(email.fileName);
        file = { path, data: await textOf(path, email.fileName), others };
      } else if (card.kind === 'frame') {
        const frame = framesById.get(card.id);
        if (!frame) return;
        const found = (await readFolderFrames(dir)).find((f) => f.key === frame.key);
        if (!found) throw new Error(`${frame.fileName} is not in the folder any more.`);
        file = { path: found.path, data: await textOf(found.path, frame.fileName) };
      } else if (card.kind === 'picture') {
        const picture = picturesById.get(card.id);
        if (!picture) return;
        file = { path: `assets/${picture.path}`, data: await (await fetch(picture.url)).blob() };
      } else if (card.kind === 'doc') {
        const doc = docsById.get(card.id);
        if (!doc) return;
        if (!isLinkFile(doc.path)) {
          notify(`${doc.path} is Drive's own file for ${card.name}. Remove it in Drive, where the trash can give it back.`);
          return;
        }
        file = { path: doc.path, data: await textOf(doc.path, doc.path) };
      }
      if (!file) return;
      const { path, data, others = [] } = file;
      const at = boardRef.current.cards[card.id] ?? { x: card.x, y: card.y };
      const remove = async () => {
        await removeFile(dir, path);
        for (const other of others) await removeFile(dir, other).catch(() => undefined);
        stale();
        saveBoard(forgetCard(boardRef.current, card.id));
        await refresh();
      };
      const restore = async () => {
        await writeFile(dir, path, data);
        stale();
        saveBoard(moveCard(boardRef.current, card.id, at.x, at.y));
        await refresh();
      };
      const pointing = links.filter((l) => l.from === card.id && l.kind !== 'made').length;
      await remove();
      setSelected(null);
      notify(`Deleted ${card.name}.${pointing ? ` ${plural(pointing, 'document')} still point${pointing === 1 ? 's' : ''} at it.` : ''} ⌘Z puts it back.`);
      history.push({ label: `Delete ${card.name}`, undo: restore, redo: remove });
    } catch (cause) {
      failedTo(cause, `delete ${card.name}`);
    }
  };

  // --- groups ---

  /** A group as the board stores it, with its place as laid out and any change on top. */
  const storeGroup = (group: PlacedGroup, patch: Partial<BoardGroup> = {}): BoardDoc => {
    const { id, name, folder, x, y, w, h } = group;
    return addGroup(removeGroup(boardRef.current, id), { id, name, folder, x, y, w, h, ...patch });
  };
  /** The group with this id as it is laid out now, for a step recorded when it was somewhere else. */
  const latestGroup = (id: string, fallback: PlacedGroup): PlacedGroup => layoutRef.current.groups.find((g) => g.id === id) ?? fallback;

  /**
   * Moves pictures between folders and re-keys their cards, one at a time, for filing and for taking it back. Every
   * file that names a picture is renamed with it (folder.ts, movePicture). Returns how many documents were rewritten.
   */
  const relocate = async (moves: Array<{ from: string; to: string }>): Promise<number> => {
    let rewritten = 0;
    for (const m of moves) {
      rewritten += await movePicture(dir, m.from, m.to);
      stale();
      const b = boardRef.current;
      const oldId = pictureCardId(m.from);
      const place = b.cards[oldId];
      let next = forgetCard(b, oldId);
      if (place) next = moveCard(next, pictureCardId(m.to), place.x, place.y);
      saveBoard(next);
    }
    return rewritten;
  };

  /**
   * Files a picture where it was dropped: into a group's folder, or back into assets/ when `group` is null. The file
   * moves, and everything that names it is renamed with it (folder.ts, movePicture). Undo moves it back.
   */
  const fileIn = async (card: PlacedCard, group: PlacedGroup | null, at: { x: number; y: number }) => {
    saveBoard(moveCard(boardRef.current, card.id, snap(at.x), snap(at.y)));
    if (!projectRef.current.writable) {
      notify(`${info.name} is open view-only, so ${card.name} stays where its file is. Allow editing to file it.`);
      return;
    }
    const from = card.id.slice('picture:'.length);
    const to = freeAssetPath(movedPath(from, group ? group.folder : null), files.pictures.map((p) => p.path));
    try {
      const rewritten = await relocate([{ from, to }]);
      await refresh();
      const where = group ? `into ${group.name}` : 'out of its group';
      notify(`Moved ${card.name} ${where}${rewritten ? `, and renamed it in the ${rewritten === 1 ? 'file' : `${rewritten} files`} that show it` : ''}.`);
      history.push({
        label: group ? `File ${card.name} in ${group.name}` : `Take ${card.name} out`,
        undo: async () => {
          await relocate([{ from: to, to: from }]);
          await refresh();
        },
        redo: async () => {
          await relocate([{ from, to }]);
          await refresh();
        },
      });
    } catch (cause) {
      notify(cause instanceof Error ? `${card.name} could not be moved: ${cause.message}` : `${card.name} could not be moved.`);
    }
  };

  /** A new group: where it was dragged out, or the usual size in the middle of the view when no region is given. */
  const newGroup = async (region?: Rect) => {
    if (!projectRef.current.writable) {
      notify(`${info.name} is open view-only. Allow editing to add a group.`);
      return;
    }
    const taken = [...layout.groups.map((g) => g.folder), ...files.folders, ...files.pictures.flatMap((p) => folderOfPicture(p.path) ?? [])];
    const names = new Set(layout.groups.map((g) => g.name.toLowerCase()));
    let n = 1;
    while (names.has(`group ${n}`)) n += 1;
    const name = `Group ${n}`;
    const folder = groupFolderName(name, taken);
    try {
      await makeGroupFolder(dir, folder);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The group’s folder could not be made.');
      return;
    }
    const v = viewRef.current;
    const [w, h] = region ? [region.w, region.h] : [560, 400];
    let x = region ? region.x : (size.w / 2 - v.x) / v.z - w / 2;
    let y = region ? region.y : (size.h / 2 - v.y) / v.z - h / 2;
    // A group put down blind never lands on cards it does not hold, which would look filed and are not: it goes clear
    // of everything, and the view goes to it. One dragged out goes exactly where the hand put it.
    const clash = !region && [...layout.cards, ...layout.missing, ...layout.groups].some((r) => x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h);
    if (clash && bounds) {
      x = bounds.x + bounds.w + 120;
      y = bounds.y;
    }
    const id = `group:${folder}`;
    saveBoard(addGroup(boardRef.current, { id, name, folder, x, y, w, h }));
    setRenaming(id);
    if (clash && bounds) animateTo({ z: v.z, x: size.w / 2 - (x + w / 2) * v.z, y: size.h / 2 - (y + h / 2) * v.z }, 420);
    history.push({
      label: 'New group',
      undo: async () => {
        const g = layoutRef.current.groups.find((gr) => gr.folder === folder);
        stale();
        saveBoard(removeGroup(boardRef.current, g?.id ?? id));
        await removeFolderIfEmpty(dir, folder);
        void refresh();
      },
      redo: async () => {
        await makeGroupFolder(dir, folder);
        stale();
        saveBoard(addGroup(boardRef.current, { id, name, folder, x, y, w, h }));
        void refresh();
      },
    });
  };

  /** A new name. An empty group's folder is renamed to match; a group with pictures keeps its folder, and its links. */
  const renameGroup = async (group: PlacedGroup, value: string) => {
    setRenaming(null);
    const name = value.trim().slice(0, 60);
    if (!name || name === group.name) return;
    const was = { id: group.id, name: group.name, folder: group.folder };
    if (group.members.length === 0 && projectRef.current.writable) {
      const others = layout.groups.filter((g) => g.id !== group.id).map((g) => g.folder);
      const folder = groupFolderName(name, [...others, ...files.pictures.flatMap((p) => folderOfPicture(p.path) ?? [])]);
      if (folder !== group.folder) {
        try {
          const now = { id: `group:${folder}`, name, folder };
          const swap = async (from: typeof was, to: typeof now) => {
            await makeGroupFolder(dir, to.folder);
            await removeFolderIfEmpty(dir, from.folder);
            stale();
            saveBoard(storeGroup(latestGroup(from.id, group), to));
            void refresh();
          };
          await swap(was, now);
          history.push({ label: `Rename ${was.name}`, undo: () => swap(now, was), redo: () => swap(was, now) });
          return;
        } catch {
          // The folder keeps its name; the group still takes the new one.
        }
      }
    }
    saveBoard(storeGroup(group, { name }));
    history.push({
      label: `Rename ${was.name}`,
      undo: () => saveBoard(storeGroup(latestGroup(group.id, group), { name: was.name })),
      redo: () => saveBoard(storeGroup(latestGroup(group.id, group), { name })),
    });
  };

  /** Takes a group's pictures back out into assets/, then removes the group and its emptied folder. Asks first. */
  const ungroup = async (group: PlacedGroup) => {
    if (group.members.length && confirming !== group.id) {
      setConfirming(group.id);
      window.setTimeout(() => setConfirming((c) => (c === group.id ? null : c)), 4000);
      return;
    }
    setConfirming(null);
    if (group.members.length && !projectRef.current.writable) {
      notify(`${info.name} is open view-only. Allow editing to take pictures out of ${group.name}.`);
      return;
    }
    // Every move worked out first, so the step can be taken back and done again with the same names.
    let taken = files.pictures.map((p) => p.path);
    const moves: Array<{ from: string; to: string }> = [];
    for (const id of group.members) {
      const from = id.slice('picture:'.length);
      const to = freeAssetPath(movedPath(from, null), taken);
      taken = [...taken.filter((t) => t !== from), to];
      moves.push({ from, to });
    }
    const { id, name, folder, x, y, w, h } = group;
    const rect: BoardGroup = { id, name, folder, x, y, w, h };
    const takeOut = async () => {
      await relocate(moves);
      stale();
      saveBoard(removeGroup(boardRef.current, id));
      if (projectRef.current.writable) await removeFolderIfEmpty(dir, folder);
      await refresh();
    };
    const putBack = async () => {
      await makeGroupFolder(dir, folder);
      await relocate(moves.map((m) => ({ from: m.to, to: m.from })));
      stale();
      saveBoard(addGroup(boardRef.current, rect));
      await refresh();
    };
    try {
      await takeOut();
    } catch (cause) {
      notify(cause instanceof Error ? `Stopped: ${cause.message}` : 'Stopped moving pictures out.');
      await refresh();
      return;
    }
    notify(moves.length ? `Took ${plural(moves.length, 'picture')} out of ${name} and removed the group.` : `Removed ${name}.`);
    history.push({ label: `Remove ${name}`, undo: putBack, redo: takeOut });
  };

  /** The board laid out afresh, with the lines in mind: what is linked sits together. One step, undone as one. */
  const tidy = () => {
    const before = boardRef.current;
    const after = tidyBoard(sources, before, files.folders, links);
    saveBoard(after);
    history.push({ label: 'Tidy', undo: () => saveBoard(before), redo: () => saveBoard(after) });
    window.setTimeout(fit, 60);
  };

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

  // --- links to documents ---
  const [linking, setLinking] = useState(false);
  const addLink = async (url: string, name: string) => {
    const address = url.trim();
    if (!/^https?:\/\//i.test(address)) {
      notify('A link starts with https://. Paste the address from the browser’s address bar.');
      return false;
    }
    if (!projectRef.current.writable) {
      notify(`${info.name} is open view-only. Allow editing to add a link.`);
      return false;
    }
    const kind = docKindOfUrl(address);
    const label = name.trim() || (kind === 'link' ? new URL(address).hostname : DOC_KIND_NAMES[kind]);
    try {
      const path = await writeDocLink(dir, { url: address, name: label }, files.docs);
      stale();
      await refresh();
      notify(`Added ${label} as ${path}.`);
      return true;
    } catch (cause) {
      notify(cause instanceof Error ? `The link could not be written: ${cause.message}` : 'The link could not be written.');
      return false;
    }
  };

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

  // What lies under everything: drafting lines, dots or a cutting mat (ground.ts), sized to the zoom and moving
  // with the view. A mat shown strongly is dark, and the lines over it lighten to stay seen.
  const under = underStyle(settings, view);
  const darkGround = settings.ground === 'mat' && settings.groundOpacity.mat >= 0.6;

  const pictureCount = files.pictures.filter((p) => !p.rendered).length;
  const counts = [
    [files.emails.length, 'email'],
    [files.docs.length, 'document'],
    [files.frames.length, 'frame'],
    [pictureCount, 'picture'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, word]) => plural(n as number, word as string))
    .join(' · ');
  const writable = project.writable;

  return (
    <div class="pb-board">
      <div
        ref={stage}
        class={`pb-stage ${panning ? 'panning' : ''} ${hand ? 'hand' : ''} ${grouping ? 'grouping' : ''} ${selected ? 'has-selection' : ''} ${darkGround ? 'dark-ground' : ''}`}
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
        {under && <div class={`pb-under pb-under-${settings.ground}`} style={under} aria-hidden="true" />}
        <div class="pb-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          {groups.map((g) => {
            const count = g.members.length;
            const confirm = confirming === g.id;
            return (
              <div key={g.id} class={`pb-group ${dropTarget === g.id ? 'drop' : ''} ${groupDrag?.id === g.id ? 'lifted' : ''}`} style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
                <header class="pb-group-head" data-group-head={g.id} title={`Drag to move ${g.name} and everything in it. Its pictures are the files in assets/${g.folder}/.`}>
                  {renaming === g.id ? (
                    <input
                      class="pb-group-input"
                      defaultValue={g.name}
                      maxLength={60}
                      aria-label="Group name"
                      ref={(el) => {
                        if (el && document.activeElement !== el) {
                          el.focus();
                          el.select();
                        }
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        const input = e.currentTarget;
                        if (e.key === 'Escape') input.value = g.name;
                        if (e.key === 'Enter' || e.key === 'Escape') input.blur();
                      }}
                      onBlur={(e) => void renameGroup(g, e.currentTarget.value)}
                    />
                  ) : (
                    <b class="pb-group-name" title="Double-click to rename" onDblClick={() => setRenaming(g.id)}>
                      {g.name}
                    </b>
                  )}
                  <span class="pb-group-folder">
                    assets/{g.folder}/ · {count}
                  </span>
                  <button
                    class={`pb-group-x ${confirm ? 'confirm' : ''}`}
                    title={count ? `Take ${count === 1 ? 'its picture' : `its ${count} pictures`} back out into assets/, and remove ${g.name}` : `Remove ${g.name}`}
                    aria-label={`Remove ${g.name}`}
                    onClick={() => void ungroup(g)}
                  >
                    {confirm ? `Move ${count} out` : 'Remove'}
                  </button>
                </header>
                {count === 0 && <span class="pb-group-empty">Drop pictures here to file them in assets/{g.folder}/</span>}
                <span class="pb-group-resize" data-group-resize={g.id} title="Drag to resize" />
              </div>
            );
          })}
          {marquee && <div class="pb-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} aria-hidden="true" />}
          <svg class="pb-links" width="1" height="1">
            {links.map((link) => {
              const a = rects.get(link.from);
              const b = rects.get(link.to);
              if (!a || !b) return null;
              const key = `${link.from}>${link.to}`;
              const on = selected !== null && (link.from === selected || link.to === selected);
              const { d, end } = linkPath(a, b);
              return (
                <g key={key} class={`pb-link ${link.kind} ${on ? 'on' : ''} ${selectedLink === key ? 'picked' : ''}`} data-link={key}>
                  <path class="hit" d={d} />
                  <path d={d} />
                  <rect x={end.x - (on ? 4 : 3) / view.z} y={end.y - (on ? 4 : 3) / view.z} width={(on ? 8 : 6) / view.z} height={(on ? 8 : 6) / view.z} />
                </g>
              );
            })}
          </svg>
          {(() => {
            // The picked line's one verb, at its middle.
            const link = selectedLink ? links.find((l) => `${l.from}>${l.to}` === selectedLink) : undefined;
            const a = link && rects.get(link.from);
            const b = link && rects.get(link.to);
            if (!link || !a || !b) return null;
            const { mid } = linkPath(a, b);
            return (
              <button
                class="pb-link-break"
                style={{ left: mid.x, top: mid.y, transform: `translate(-50%, -50%) scale(${1 / view.z})` }}
                title={link.kind === 'follows' ? 'The email keeps the drawing and stops following the frame.' : link.kind === 'uses' ? 'Takes the picture out of what shows it.' : 'The recipe forgets this picture was part of it.'}
                onClick={() => void breakLink(link)}
              >
                Break link
              </button>
            );
          })()}

          {missing.map((m) => (
            <div key={m.id} class={`pb-card pb-missing ${selected === m.id ? 'on' : ''}`} data-card={m.id} style={{ left: m.x, top: m.y, width: m.w, height: m.h }}>
              <header class="pb-card-head">
                <b class="pb-card-name">{missingName(m.id, m.kind)}</b>
                <span class="pb-card-meta">missing</span>
              </header>
              <div class="pb-card-note">
                <p>This {KIND_LABEL[m.kind].toLowerCase()} is no longer in the folder. If it was moved or renamed, it shows up again as a new card.</p>
                <button
                  class="pb-link-btn"
                  onClick={() => {
                    const at = boardRef.current.cards[m.id];
                    saveBoard(forgetCard(boardRef.current, m.id));
                    if (at) history.push({ label: 'Forget a place', undo: () => saveBoard(moveCard(boardRef.current, m.id, at.x, at.y)), redo: () => saveBoard(forgetCard(boardRef.current, m.id)) });
                  }}
                >
                  Forget its place
                </button>
              </div>
            </div>
          ))}

          {cards.map((card) => {
            const email = emailsById.get(card.id);
            const frame = framesById.get(card.id);
            const picture = picturesById.get(card.id);
            const doc = docsById.get(card.id);
            const madeBy = picture ? recipeOf.get(picture.path) : undefined;
            const live = isLive(card);
            const facts = email
              ? `${email.fileName} · saved ${ago(email.modified)}`
              : frame
                ? `${frame.fileName}${frame.frame ? ` · ${frame.frame.page.width} × ${frame.frame.page.height}` : ''}`
                : picture
                  ? `${picture.path} · ${sizeOf(picture.size)}`
                  : doc
                    ? `${doc.path} · opens in ${DOC_OPENS_IN[doc.link.kind]}`
                    : '';
            const meta = email
              ? 'email'
              : frame
                ? `frame${frame.frame ? ` · ${frame.frame.page.width}×${frame.frame.page.height}` : ''}${frame.frame?.page.effects?.length ? ' · riso' : ''}`
                : picture
                  ? `${madeBy ? `${RECIPE_TOOLS[madeBy.tool].name.toLowerCase()} · ` : ''}${sizeOf(picture.size)}`
                  : doc
                    ? DOC_KIND_NAMES[doc.link.kind].toLowerCase()
                    : '';
            return (
              <div
                key={card.id}
                class={`pb-card pb-${card.kind} ${selected === card.id ? 'on' : ''} ${moving?.id === card.id && !moving.copy ? 'lifted' : ''} ${dropCard === card.id ? 'drop' : ''}`}
                data-card={card.id}
                title={facts}
                style={{ left: card.x, top: card.y, width: card.w, height: card.h }}
                onDblClick={() => openCard(card)}
              >
                <header class="pb-card-head">
                  <b class="pb-card-name">{card.name}</b>
                  <span class="pb-card-meta">{meta}</span>
                  <button class="pb-card-open" title={openTitle(card, madeBy, doc?.link.kind)} aria-label={`Open ${card.name}`} onClick={() => openCard(card)}>
                    ↗
                  </button>
                  {writable && (
                    <button class="pb-card-x" title={`Delete ${card.name} from the project. ⌘Z puts it back.`} aria-label={`Delete ${card.name}`} onClick={() => void deleteCard(card)}>
                      ×
                    </button>
                  )}
                </header>
                <div class="pb-card-body">
                  {email && <EmailBody item={email} assets={assets} prints={emailPrints.get(email.id)} live={live} width={card.w} height={card.h - HEAD} onHeight={(px) => measured(email.id, px)} />}
                  {frame && <FrameBody item={frame} assets={assets} print={printOf(frame)} width={card.w} height={card.h - HEAD} />}
                  {picture && (live ? <img class="pb-picture-img" src={picture.url} alt="" draggable={false} /> : null)}
                  {picture && <span class="pb-picture-name">{card.name}</span>}
                  {doc && <DocBody item={doc} />}
                </div>
              </div>
            );
          })}

          {moving?.copy &&
            (() => {
              // The copy being carried: the original stays put above; this is the one in the hand.
              const c = layout.cards.find((x) => x.id === moving.id);
              return c ? (
                <div class={`pb-card pb-${c.kind} pb-copying`} style={{ left: moving.x, top: moving.y, width: c.w, height: c.h }} aria-hidden="true">
                  <header class="pb-card-head">
                    <b class="pb-card-name">{c.name} copy</b>
                    <svg class="pb-copy-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" aria-hidden="true">
                      <rect x="5.5" y="5.5" width="9" height="9" rx="1" />
                      <path d="M10.5 5.5V2.5a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3" />
                    </svg>
                  </header>
                </div>
              ) : null;
            })()}

        </div>
      </div>

      <header class="pb-bar pb-bar-top">
        <a class="pb-ghost" href="../../index.html" title="Back to Scugnizzi tools">
          <ArrowLeft /> Tools
        </a>
        <span class="pb-sep" aria-hidden="true" />
        <ProjectMenu project={project} counts={counts || 'nothing in it yet'} onCreate={onCreateProject} />
        <span class="pb-sep" aria-hidden="true" />
        <button class="pb-ghost" disabled={!past.canUndo} title={past.undoLabel ? `Undo ${past.undoLabel.toLowerCase()}  ·  ⌘Z` : 'Nothing to undo'} onClick={() => void step('undo')}>
          Undo
        </button>
        <button class="pb-ghost" disabled={!past.canRedo} title={past.redoLabel ? `Redo ${past.redoLabel.toLowerCase()}  ·  ⇧⌘Z` : 'Nothing to redo'} onClick={() => void step('redo')}>
          Redo
        </button>
        <button class="pb-ghost" disabled={!writable || cards.length === 0} title="Lay the board out afresh: what is linked sits together, groups line up below. One step, undone as one." onClick={tidy}>
          Tidy
        </button>
        <span class="pb-grow" />
        <span class="pb-sep" aria-hidden="true" />
        <div class="pb-actions" role="group" aria-label="Add to the project">
          <button class="pb-ghost" title="Open Template Studio on this project, for a new email" onClick={() => openTool('index.html?from=board')}>
            <Plus /> Email
          </button>
          <button class="pb-ghost" title="A new Freeform frame, saved into this project" onClick={() => openTool('freeform.html?new=1&from=board')}>
            <Plus /> Frame
          </button>
          <button class="pb-ghost" disabled={!writable} title={writable ? 'Add pictures to assets/. Dropping them on the board works too.' : 'Allow editing to add pictures'} onClick={() => picker.current?.click()}>
            <Plus /> Pictures
          </button>
          <button
            class={`pb-ghost ${grouping ? 'on' : ''}`}
            disabled={!writable}
            aria-pressed={grouping}
            title={writable ? 'Drag out a region for a new group. A group is a folder in assets/: drop pictures on it to file them there.' : 'Allow editing to add a group'}
            onClick={() => setGrouping((v) => !v)}
          >
            <Plus /> Group
          </button>
          <div class="pb-menu">
            <button
              class={`pb-ghost ${linking ? 'on' : ''}`}
              disabled={!writable}
              aria-expanded={linking}
              title={writable ? 'A Google Doc, Sheet or Slides, or any address, as a card on the board' : 'Allow editing to add a link'}
              onClick={() => setLinking((v) => !v)}
            >
              <Plus /> Link
            </button>
            {linking && <LinkForm onClose={() => setLinking(false)} onAdd={addLink} />}
          </div>
        </div>
        <span class="pb-sep" aria-hidden="true" />
        <CanvasMenu />
        <div class="pb-zoom" role="group" aria-label="Zoom">
          <button title="Zoom out  ·  ⌘−" aria-label="Zoom out" onClick={() => zoomTo(view.z / 1.25, undefined, true)}>
            <Minus />
          </button>
          <button class="pct" title="Zoom to 100%  ·  ⌘0" onClick={() => zoomTo(1, undefined, true)}>
            {Math.round(view.z * 100)} %
          </button>
          <button title="Zoom in  ·  ⌘+" aria-label="Zoom in" onClick={() => zoomTo(view.z * 1.25, undefined, true)}>
            <Plus />
          </button>
          <button title="Fit everything  ·  ⇧1" aria-label="Fit everything" onClick={fit}>
            <FitAll />
          </button>
          <button title={selected ? 'Zoom to the selected card  ·  ⇧2' : 'Select a card to zoom to it  ·  ⇧2'} aria-label="Zoom to the selection" disabled={!selected} onClick={fitSelection}>
            <FitOne />
          </button>
        </div>
      </header>

      <footer class="pb-bar pb-bar-bottom">
        <span class="pb-status">
          <i class={`pb-dot ${project.status}`} aria-hidden="true" />
          {project.status === 'view-only' ? (
            <>
              View only
              <button class="pb-inline" title="Chrome opened the folder view-only. One click asks for edit access." onClick={() => void project.allow()}>
                Allow editing
              </button>
            </>
          ) : (
            <>Saves to {dir.name}</>
          )}
        </span>
        <span class="pb-grow" />
        <span class="pb-hint">
          {grouping
            ? 'Drag out the new group’s region · a click puts one down the usual size · Esc cancels'
            : selectedLink
              ? 'A line is picked · Break link, or Delete, takes it out of the file it is in · Esc lets go'
              : selected
                ? 'Enter opens · ⇧2 zooms to it · ⌥ drag copies · Delete removes the file, ⌘Z puts it back · Esc lets go'
                : 'Drag to arrange · drop a picture on a frame or email to put it in · Space, or holding still, pans · ? for the keys'}
        </span>
        <span class="pb-sep" aria-hidden="true" />
        <span class="pb-count">{counts || 'empty'}</span>
      </footer>

      {showKeys && (
        <div class="pb-keys-backdrop" onClick={() => setShowKeys(false)}>
          <div class="pb-keys" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
            <header>
              <b>Keys</b>
              <button class="pb-ghost" onClick={() => setShowKeys(false)}>
                Done
              </button>
            </header>
            <table>
              {BOARD_KEYS.map(([keys, what]) => (
                <tr key={what}>
                  <td>
                    {keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span class="pb-keys-or"> / </span>}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </td>
                  <td>{what}</td>
                </tr>
              ))}
            </table>
          </div>
        </div>
      )}
      {dropCard && <div class="pb-notice">Let go to put it in {layout.cards.find((c) => c.id === dropCard)?.name ?? 'it'}</div>}
      {!dropCard && moving?.copy && <div class="pb-notice">Let go to leave a copy here</div>}
      {dropTarget === 'out' && <div class="pb-notice">Let go to take it out of its group, into assets/</div>}
      {dropTarget && dropTarget !== 'out' && <div class="pb-notice">Let go to file it in {layout.groups.find((g) => g.id === dropTarget)?.name ?? 'the group'}</div>}
      {!files.read && <div class="pb-empty pb-reading">Reading {dir.name}…</div>}
      {files.read && cards.length === 0 && missing.length === 0 && groups.length === 0 && (
        <div class="pb-empty">
          <b>{info.name} is empty.</b>
          <span>Make a frame or an email, or drop pictures here. Everything in the folder shows up on this board.</span>
        </div>
      )}

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

