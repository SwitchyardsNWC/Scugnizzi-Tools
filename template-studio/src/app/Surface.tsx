import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { canvasTypeSampleSvg, freeformLayersSvg } from '../compile/freeform.ts';
import { canvasTypeOf, colorOf, firstPreset, theme, type ColorRef } from '../model/design-system.ts';
import { designSystemOf, siteOf } from '../model/edit.ts';
import {
  addImageLayerAt,
  addMarkAt,
  addShapeAt,
  addStickyAt,
  addTextAt,
  drawPath,
  duplicateGroup,
  duplicateLayer,
  groupBox,
  groupKey,
  groupOfKey,
  layerBox,
  layerClipText,
  membersOf,
  newGroupId,
  paintGroup,
  paintLayer,
  parseLayerClip,
  pasteLayers,
  removeGroup,
  removeLayer,
  replaceLayers,
  scaleLayers,
  STICKY_COLORS,
  translateLayer,
  updateLayer,
  withLayerBox,
  type Box,
} from '../model/freeform.ts';
import { canvasCommands, filterCommands, slashAt, textStyleOf, type CanvasCommand } from '../model/canvas-text.ts';
import { addQuickShape, BRUSHES, erasePaths, groupRuns, moveItem, recipeHash, ungroupLayers } from '../model/freeform.ts';
import { QUICK_SHAPE_JITTER_PX, quickShape, type QuickShape } from '../model/quick-shape.ts';
import { useCanvasSettings } from './canvas-settings.ts';
import { TouchGestures } from './gestures.ts';
import { glide, PanTracker } from './inertia.ts';
import { HANDOFF_RISO, HANDOFF_RISO_RETURN, normalizeRiso, risoStep, setEffects } from '../model/effects.ts';
import { canvasBlob, freeformCanvas } from './picture.ts';
import { brushOutline, brushSampleSvg, HIGHLIGHTER } from '../compile/freeform.ts';
import { MARKS } from '../model/marks.ts';
import type { Brush, FreeformBlock, FreeformLayer, StyleRange, Template, TextMarks } from '../model/types.ts';
import { FigBar, FigFormat, FigLayers, FigSlash, type FormatState } from './FigPanel.tsx';
import { editableHtml, keepEnd, readEditable, selectionOffsets, setSelectionOffsets } from './rich-editing.ts';
import { applyMarks, clearMarks, markState, spliceText, toggleMark, type MarkKey } from '../model/rich-text.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { withLocalAssets, withoutMissingPictures } from './local-assets.ts';
import { capture, release } from './pointer.ts';
import type { Editor } from './useEditor.ts';
import {
  type Tool,
  type Handle,
  type Phase,
  type Point,
  type View,
  type Drag,
  TOOLS,
  DRAW_TOOLS,
  POP,
  POOF,
  selectionOf,
  HANDLE,
  ACCENT,
  PANEL_ROOM,
  ERASER,
  clampZoom,
  deg,
  easeOutBack,
  easeInOutCubic,
  easeOutCubic,
  rotatePoint,
  fields,
  pairs,
  ghostShape,
  snappedGhost,
} from './surface-tools.tsx';

// The surface editor: a freeform block opened as a canvas you fall into.
//
// Jared, twice. First: "make freeform less clunky and feel more like an endless canvas I can drop
// stuff on and zoom in and out" (learnings 3.67). Then: "give it a zoom in effect and make the
// freeform canvas feel more like a figjam style canvas. make it fun and playful" (learnings 3.68).
//
// So it is an overlay above the email rather than a replacement for it. It opens with the page
// exactly where the block's picture sits on the email, at exactly that size, and flies out to fit
// while a warm dotted field fades in; Done flies it back. The chrome floats — a dock of chunky
// tools at the bottom, pills at the top — and things pop in, poof out and wiggle.
//
// What does not change is the one rule that matters: it draws with `freeformLayersSvg`, the same
// function the email canvas and the render use, and lays its handles over that in the same
// coordinate space. Sticky notes and stamps are real layer kinds with real renderings, so every
// playful thing on this surface ships in the picture exactly as it looks here.

export interface SurfaceProps {
  editor: Editor;
  blockId: string;
  assets: AssetFile[];
  layer: string | null;
  onSelectLayer(layerId: string | null): void;
  /** Called once the surface has flown back into its block, or straight away without motion. */
  onDone(): void;
  /** Where the block's picture sits on the email canvas right now, in viewport pixels. */
  rectOf?(): DOMRect | null;
  /** Filled by the editor, so a picture dragged from the Assets panel can land on it. */
  api?: { current: SurfaceApi | null };
  /** The Freeform tool on its own: no email to fly back to, so its own pills replace Email and Done. */
  standalone?: { left: ComponentChildren; right: ComponentChildren };
}

export interface SurfaceApi {
  /** A picture from the folder, dropped at these screen coordinates — or at the page's centre when null. */
  dropAsset(asset: AssetFile, at: { x: number; y: number } | null): void;
}

export function Surface({ editor, blockId, assets, layer, onSelectLayer, onDone, rectOf, api, standalone }: SurfaceProps) {
  const site = siteOf(editor.template, blockId);
  const block = site?.column.blocks[site.index];
  const ds = designSystemOf(editor.template);

  // Refs for everything the pointer and key handlers read, so a handler bound in one render never
  // acts on a template, a tool or a colour from an earlier one.
  const editorRef = useRef(editor);
  editorRef.current = editor;
  // How this canvas moves and draws (canvas-settings.ts): read through a ref by handlers bound once.
  const settings = useCanvasSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const rectOfRef = useRef(rectOf);
  rectOfRef.current = rectOf;
  const work = useRef<HTMLDivElement | null>(null);
  const svgEl = useRef<SVGSVGElement | null>(null);

  const [view, setViewState] = useState<View>({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view);
  /** Somebody has panned or zoomed. Until then a change of size keeps the page fitted. */
  const viewTouched = useRef(false);
  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
  }, []);
  const [phase, setPhase] = useState<Phase>('start');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [tool, setToolState] = useState<Tool>('select');
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [paint, setPaint] = useState<ColorRef>(null);
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const [paintsOpen, setPaintsOpen] = useState(false);
  const [stamp, setStamp] = useState(MARKS[0]!.key);
  const stampRef = useRef(stamp);
  stampRef.current = stamp;
  const [brush, setBrush] = useState<Brush>('marker');
  const brushRef = useRef(brush);
  brushRef.current = brush;
  /** Where the eraser is over the page, for its ring. */
  const [eraserAt, setEraserAt] = useState<Point | null>(null);
  /** The canvas type style new text is set in; null is the plain heading role. */
  const [look, setLook] = useState<string | null>(() => Object.keys(canvasTypeOf(ds))[0] ?? null);
  const lookRef = useRef(look);
  lookRef.current = look;
  /** The group this marker session's strokes go into. A new session starts with each new pen tool. */
  const penGroup = useRef<string | null>(null);
  /** How many times the clipboard has been pasted since it was copied, so each paste steps further out. */
  const pasteCount = useRef(0);
  const [pageDrag, setPageDrag] = useState(false);
  const drag = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<{ kind: 'create'; tool: 'rect' | 'ellipse' | 'line'; from: Point; to: Point } | { kind: 'pen'; points: number[]; snapped: QuickShape | null } | null>(null);
  const [space, setSpace] = useState(false);
  const spaceRef = useRef(false);
  const [textHeights, setTextHeights] = useState<Record<string, number>>({});
  const [editingText, setEditingText] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const [hint, setHint] = useState(true);
  const [panelOpen, setPanelOpenState] = useState(true);
  const panelRef = useRef(true);
  const setPanelOpen = (open: boolean) => {
    panelRef.current = open;
    setPanelOpenState(open);
  };
  /** A layer is being moved, resized or turned: the mini menu steps out of the way. */
  const [dragging, setDragging] = useState(false);
  /** A `/` typed into the words, and which command the arrows are on. */
  const [slash, setSlash] = useState<{ at: number; query: string; index: number } | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  /** What the selected words, or all of them, are set in: the format bar's buttons, while typing. */
  const [fmt, setFmt] = useState<FormatState | null>(null);
  const editingRef = useRef<string | null>(null);
  editingRef.current = editingText;
  const blockRef = useRef<FreeformBlock | null>(null);
  if (block?.type === 'freeform') blockRef.current = block;
  const layerRef = useRef(layer);
  layerRef.current = layer;
  /**
   * The last press on a layer, for a double-click of our own: `preventDefault` on pointerdown,
   * which stops a drag selecting text, also stops the browser dispatching `dblclick` at all.
   */
  const lastPress = useRef<{ layerId: string; at: number } | null>(null);
  /** The layers just made, which pop in once they are on the page. */
  const fresh = useRef<string[]>([]);
  const anim = useRef<number | null>(null);
  const reduced = useRef(typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)).current;

  const tpl = useCallback(() => editorRef.current.template, []);
  const commit = useCallback((label: string, next: Template, coalesce?: string) => {
    const ed = editorRef.current;
    if (next !== ed.template) ed.commit(label, next, coalesce ? { coalesce } : {});
  }, []);

  const setTool = useCallback((next: Tool) => {
    setToolState(next);
    penGroup.current = null;
    hoverRef.current = null;
    setHover(null);
  }, []);

  // --- the view, and flying it ------------------------------------------------------------------

  /** A slide after a pan lets go (inertia.ts), stopped by the next touch. */
  const glideStop = useRef<(() => void) | null>(null);
  const stopAnim = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
    glideStop.current?.();
    glideStop.current = null;
  };

  /** Eases the view to another. Zoom moves in log space, so 30% to 200% does not rush its start. */
  const animateView = useCallback(
    (to: View, ms: number, ease: (t: number) => number, done?: () => void) => {
      stopAnim();
      const from = viewRef.current;
      const began = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - began) / ms);
        const k = ease(t);
        const z = Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * k);
        setView({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z });
        if (t < 1) anim.current = requestAnimationFrame(step);
        else {
          anim.current = null;
          done?.();
        }
      };
      anim.current = requestAnimationFrame(step);
    },
    [setView],
  );

  /** Screen to surface. */
  const toSurface = useCallback((clientX: number, clientY: number): Point => {
    const r = svgEl.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!r) return { x: 0, y: 0 };
    return { x: (clientX - r.left - v.x) / v.z, y: (clientY - r.top - v.y) / v.z };
  }, []);

  /** The page fitted between the top pills and the dock. */
  const fitView = useCallback((): View | null => {
    const b = blockRef.current;
    const w = work.current?.getBoundingClientRect();
    if (!b || !w || w.width === 0) return null;
    const room = w.width - (panelRef.current ? PANEL_ROOM : 0);
    const z = clampZoom(Math.min(2, (room - 120) / Math.max(1, b.width), (w.height - 210) / Math.max(1, b.height)));
    return { z, x: (room - b.width * z) / 2, y: (w.height - b.height * z) / 2 - 18 };
  }, []);

  /** The view that puts the page exactly on the block's picture in the email underneath. */
  const blockView = useCallback((): View | null => {
    const b = blockRef.current;
    const w = work.current?.getBoundingClientRect();
    const r = rectOfRef.current?.();
    if (!b || !w || !r || r.width <= 0) return null;
    return { z: r.width / Math.max(1, b.width), x: r.left - w.left, y: r.top - w.top };
  }, []);

  // In: one frame with the page on the block, then the flight out. Once, on the way in: the effect runs the
  // first render's flight, held in a ref, so the list below is honest about what it responds to, which is nothing.
  const enter = useRef<() => (() => void) | undefined>(() => undefined);
  enter.current = () => {
    // Focus leaves the email's frame, where a double-click put it, so every key and every copy and
    // paste from here on arrives in this document and nowhere near the block around the canvas.
    (document.activeElement as HTMLElement | null)?.blur?.();
    work.current?.focus({ preventScroll: true });
    const fit = fitView();
    const from = reduced ? null : blockView();
    if (!fit || !from) {
      if (fit) setView(fit);
      setPhase('idle');
      return undefined;
    }
    setView(from);
    setPhase('start');
    const id = requestAnimationFrame(() => {
      setPhase('enter');
      animateView(fit, 640, easeOutBack, () => setPhase('idle'));
    });
    return () => {
      cancelAnimationFrame(id);
      stopAnim();
    };
  };
  useLayoutEffect(() => enter.current(), []);

  /** Out: the flight home, and then the email. */
  const leave = useCallback(() => {
    if (phaseRef.current === 'exit') return;
    setEditingText(null);
    setPaintsOpen(false);
    hoverRef.current = null;
    setHover(null);
    onSelectLayer(null);
    const to = reduced ? null : blockView();
    if (!to) {
      onDone();
      return;
    }
    setPhase('exit');
    animateView(to, 460, easeInOutCubic, onDone);
  }, [onSelectLayer, onDone, blockView, animateView, reduced]);

  const zoomTo = useCallback(
    (z: number, about?: Point, smooth = false) => {
      viewTouched.current = true;
      const w = work.current?.getBoundingClientRect();
      const v = viewRef.current;
      const next = clampZoom(z);
      const px = about ? about.x : (w?.width ?? 0) / 2;
      const py = about ? about.y : (w?.height ?? 0) / 2;
      const to = { z: next, x: px - ((px - v.x) * next) / v.z, y: py - ((py - v.y) * next) / v.z };
      if (smooth && !reduced) animateView(to, 220, easeOutCubic);
      else {
        stopAnim();
        setView(to);
      }
    },
    [animateView, setView, reduced],
  );

  const fitSmooth = useCallback(() => {
    const f = fitView();
    if (!f) return;
    if (reduced) setView(f);
    else animateView(f, 420, easeOutBack);
  }, [fitView, animateView, setView, reduced]);

  // Wheel: ⌘ or a pinch zooms about the pointer, a plain wheel pans. Non-passive, or the page scrolls.
  useEffect(() => {
    const el = work.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (phaseRef.current !== 'idle') return;
      viewTouched.current = true;
      const r = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomTo(viewRef.current.z * Math.exp(-event.deltaY * 0.0025 * settingsRef.current.wheelGain), { x: event.clientX - r.left, y: event.clientY - r.top });
      } else {
        stopAnim();
        const v = viewRef.current;
        setView({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo, setView]);

  // The window, or the room beside the layers panel, changes size before anyone has moved the view —
  // a tab that opened in the background, a panel folded away: the page stays fitted.
  useEffect(() => {
    const el = work.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (viewTouched.current || phaseRef.current !== 'idle') return;
      const f = fitView();
      if (f) setView(f);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitView, setView]);

  // --- boxes, and the little motions ---------------------------------------------------------------

  // A text layer's height is however tall its words wrap to, measured in its own layout pixels. Held
  // while it is being typed into, since its words are hidden under the field then.
  useLayoutEffect(() => {
    const b = blockRef.current;
    const svg = svgEl.current;
    if (!b || !svg) return;
    setTextHeights((old) => {
      const next: Record<string, number> = {};
      for (const l of b.layers) {
        if (l.kind !== 'text') continue;
        if (l.id === editingText && old[l.id]) {
          next[l.id] = old[l.id]!;
          continue;
        }
        const el = svg.querySelector(`[data-sy-layer="${CSS.escape(l.id)}"]`) as SVGGraphicsElement | null;
        const div = el?.querySelector('div') as HTMLElement | null;
        if (div) next[l.id] = div.offsetHeight;
        else if (el && typeof el.getBBox === 'function') {
          // Arc text is SVG text on a path, with no box of its own to measure: its drawn extent instead.
          const bb = el.getBBox();
          next[l.id] = Math.max(8, bb.y + bb.height - l.y);
        }
      }
      return JSON.stringify(old) === JSON.stringify(next) ? old : next;
    });
  }, [block, editingText]);

  const boxOf = useCallback((l: FreeformLayer): Box => layerBox(l, textHeights[l.id]), [textHeights]);

  const layerEl = useCallback((id: string) => svgEl.current?.querySelector(`[data-sy-layer="${CSS.escape(id)}"]`) as SVGGraphicsElement | null, []);

  /**
   * Motion that composes with a layer's own rotation. The individual `scale` property, not
   * `transform`: CSS `transform` on an SVG element replaces its transform attribute, which would
   * snap a rotated layer straight for the length of the animation.
   */
  const springy = useCallback(
    (el: SVGGraphicsElement, frames: Keyframe[], ms: number, fill: FillMode = 'none') => {
      if (reduced || typeof el.animate !== 'function') return null;
      el.style.transformBox = 'fill-box';
      el.style.transformOrigin = 'center';
      return el.animate(frames, { duration: ms, easing: 'cubic-bezier(.2,.9,.3,1)', fill });
    },
    [reduced],
  );

  // Pop: the layers just made, once they are on the page.
  useLayoutEffect(() => {
    if (fresh.current.length === 0) return;
    const waiting: string[] = [];
    for (const id of fresh.current) {
      const el = layerEl(id);
      if (el) springy(el, POP, 440);
      else waiting.push(id);
    }
    fresh.current = waiting;
  }, [block, layerEl, springy]);

  /** Poof: a quick swell and shrink, and then what was picked is gone from the recipe. */
  const poof = useCallback(
    (key: string) => {
      const b = blockRef.current;
      const sel = b ? selectionOf(b, key) : null;
      if (!sel) return;
      onSelectLayer(null);
      const gone = () =>
        commit(sel.group ? 'Remove drawing' : 'Remove layer', sel.group ? removeGroup(tpl(), blockId, sel.group) : removeLayer(tpl(), blockId, sel.layers[0]!.id));
      const anims = sel.layers.map((l) => layerEl(l.id)).map((el) => (el ? springy(el, POOF, 220, 'forwards') : null));
      const first = anims.find(Boolean);
      if (first) first.onfinish = gone;
      else gone();
    },
    [blockId, commit, onSelectLayer, tpl, layerEl, springy],
  );

  /** New layers: committed, popped in, and picked unless the tool is one for doing it again. */
  const placeMany = useCallback(
    (label: string, next: Template, count: number, pick = true): string | null => {
      commit(label, next);
      const s = siteOf(next, blockId);
      const b = s?.column.blocks[s.index];
      if (!b || b.type !== 'freeform') return null;
      const added = b.layers.slice(-count);
      fresh.current = added.map((l) => l.id);
      const shared = added[0]?.group && added.every((l) => l.group === added[0]!.group) && added.length > 1 ? added[0]!.group! : null;
      const key = shared ? groupKey(shared) : (added[added.length - 1]?.id ?? null);
      if (pick) onSelectLayer(key);
      return key;
    },
    [commit, blockId, onSelectLayer],
  );
  const place = useCallback((label: string, next: Template, pick = true) => placeMany(label, next, 1, pick), [placeMany]);

  // --- effects: the page printed through them, and the round trip to the Riso tool ---------------------

  /** The page printed through its effects, laid over the drawing. The drawing stays underneath to be picked. */
  const [fx, setFx] = useState<{ key: string; url: string } | null>(null);
  const fxUrl = useRef<string | null>(null);
  const [fxNote, setFxNote] = useState<string | null>(null);
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const dsRef = useRef(ds);
  dsRef.current = ds;
  const fxKey = block?.type === 'freeform' && block.effects?.length ? recipeHash(block) : null;
  /** What the page sits on. A print needs an opaque ground: it reads a transparent pixel as black ink. */
  const groundOf = useCallback(
    (b: FreeformBlock) => {
      const s = siteOf(editorRef.current.template, blockId);
      return colorOf(dsRef.current, b.background) ?? s?.section.containerColor ?? s?.section.bandColor ?? '#ffffff';
    },
    [blockId],
  );

  // Printed again once a change settles — never mid-drag or mid-word, which would stutter.
  useEffect(() => {
    if (!fxKey || dragging || editingText) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const b = blockRef.current;
      if (!b) return;
      try {
        const blob = await canvasBlob(await freeformCanvas(b, dsRef.current, { assets: assetsRef.current, scale: 2, ground: groundOf(b) }));
        if (cancelled) return;
        if (fxUrl.current) URL.revokeObjectURL(fxUrl.current);
        fxUrl.current = URL.createObjectURL(blob);
        setFx({ key: fxKey, url: fxUrl.current });
      } catch {
        // The plain drawing stays on screen.
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fxKey, dragging, editingText, assets, groundOf]);
  useEffect(() => () => void (fxUrl.current && URL.revokeObjectURL(fxUrl.current)), []);

  /** The plain page and its settings, left for the Riso tool, which opens in a tab of its own. */
  const openInRiso = async () => {
    const b = blockRef.current;
    if (!b) return;
    try {
      const canvas = await freeformCanvas(b, dsRef.current, { assets: assetsRef.current, scale: 2, ground: groundOf(b), effects: false });
      let image = canvas.toDataURL('image/png');
      if (image.length > 3_500_000) image = canvas.toDataURL('image/jpeg', 0.92);
      const session = `${blockId}:${Date.now().toString(36)}`;
      const step = b.effects?.find((e) => e.effect === 'riso') ?? risoStep(0);
      // `returnUrl`: where Riso goes back to when it opened in this same tab rather than a new one.
      localStorage.setItem(HANDOFF_RISO, JSON.stringify({ session, blockId, title: b.alt || 'Freeform', image, unit: 2, step, returnUrl: window.location.href, zoom: viewRef.current.z }));
      const tab = window.open(new URL(`../../riso/riso.html?handoff=${encodeURIComponent(session)}`, window.location.href).href, '_blank');
      setFxNote(tab ? 'Riso is open in a new tab. Press Back to Freeform there and the settings land here.' : 'The browser blocked the new tab. Allow pop-ups for this page and try again.');
    } catch {
      setFxNote('This page is too big to hand to Riso from the browser. Make it smaller and try again.');
    }
  };

  // Back from Riso: its settings arrive through the browser's storage, from the other tab.
  useEffect(() => {
    const take = () => {
      let back: { session?: string; blockId?: string; step?: unknown } | null = null;
      let sent: { session?: string } | null = null;
      try {
        back = JSON.parse(localStorage.getItem(HANDOFF_RISO_RETURN) || 'null');
        sent = JSON.parse(localStorage.getItem(HANDOFF_RISO) || 'null');
      } catch {
        return;
      }
      if (!back || back.blockId !== blockId || !sent || sent.session !== back.session) return;
      const step = normalizeRiso(back.step);
      try {
        // The picture was only ever for the hand-off; it is the heaviest thing this site stores.
        localStorage.removeItem(HANDOFF_RISO_RETURN);
        localStorage.removeItem(HANDOFF_RISO);
      } catch {
        // Nothing to clean.
      }
      if (!step) return;
      const ed = editorRef.current;
      const next = setEffects(ed.template, blockId, [step]);
      if (next !== ed.template) ed.commit('Riso, from the tool', next);
      setFxNote('Back from Riso.');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === HANDOFF_RISO_RETURN) take();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', take);
    take();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', take);
    };
  }, [blockId]);

  // --- words being typed: a rich editor, so some of them can be bold -------------------------------------

  /** The layer being typed into, as it stands now. */
  const typingLayer = useCallback(() => {
    const l = blockRef.current?.layers.find((x) => x.id === editingRef.current);
    return l && (l.kind === 'text' || l.kind === 'sticky') ? l : null;
  }, []);

  const refreshFormat = useCallback(() => {
    const el = textRef.current;
    const l = typingLayer();
    if (!el || !l) return;
    const { text, styles } = readEditable(el);
    const o = selectionOffsets(el);
    const whole = !o || o.start === o.end;
    const from = whole ? 0 : Math.min(o.start, o.end);
    const to = whole ? text.length : Math.max(o.start, o.end);
    const st = textStyleOf(l, dsRef.current);
    setFmt({ ...markState(text, styles, from, to, { bold: st.weight === 'bold', italic: st.italic }), scope: whole ? 'all' : 'selection' });
  }, [typingLayer]);

  // Filled once, when typing starts. From then on the browser owns the caret, and the words and their
  // formatting are read back out of the editor on every keystroke.
  useLayoutEffect(() => {
    const el = textRef.current;
    const l = typingLayer();
    if (!editingText || !el || !l) return;
    el.innerHTML = editableHtml(l.text, l.styles, dsRef.current);
    el.focus();
    const doc = el.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(el);
    doc.getSelection()?.removeAllRanges();
    doc.getSelection()?.addRange(range);
    refreshFormat();
    const onSelection = () => refreshFormat();
    doc.addEventListener('selectionchange', onSelection);
    return () => doc.removeEventListener('selectionchange', onSelection);
  }, [editingText, typingLayer, refreshFormat]);

  const choosePaint = (color: ColorRef) => {
    setPaint(color);
    setPaintsOpen(false);
    const b = blockRef.current;
    const sel = b ? selectionOf(b, layerRef.current) : null;
    if (!sel) return;
    commit('Colour', sel.group ? paintGroup(tpl(), blockId, sel.group, color) : paintLayer(tpl(), blockId, sel.layers[0]!.id, color));
  };

  const chooseLook = (next: string | null) => {
    setLook(next);
    const b = blockRef.current;
    const sel = b ? selectionOf(b, layerRef.current) : null;
    const one = sel && !sel.group ? sel.layers[0] : undefined;
    if (one?.kind === 'text') commit('Text style', updateLayer(tpl(), blockId, one.id, next ? { look: next } : { look: undefined }));
  };

  /** Rubs out along the eraser's move from a to b. One drag is one undo step. */
  const eraseAlong = (a: Point, b: Point, session: string) => {
    const r = ERASER / viewRef.current.z;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (r * 0.5)));
    const at: number[] = [];
    for (let i = 0; i <= n; i += 1) at.push(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n);
    commit('Erase', erasePaths(tpl(), blockId, at, r), `surface:${blockId}:erase:${session}`);
  };

  // --- pointer ------------------------------------------------------------------------------------

  /** The pen's dwell timer: fires once the pen has sat still long enough to snap the stroke. */
  const holdTimer = useRef(0);
  /** A press held still on a layer becomes the hand after a beat (Canvas menu, Hold to pan). */
  const holdPan = useRef(0);
  const [held, setHeld] = useState(false);
  /** A pencil has touched this canvas, so from now on a finger pans while a drawing tool is in hand. */
  const penSeen = useRef(false);
  /** The view when the second finger landed, which a pinch is measured against. */
  const gestureView = useRef<View | null>(null);
  // Fingers: pinch to zoom, two-finger tap to undo, three to redo, palms ignored (gestures.ts).
  const gestures = useRef<TouchGestures | null>(null);
  if (!gestures.current) {
    gestures.current = new TouchGestures({
      onStart: () => {
        // A second finger: whatever the first was doing is abandoned, a half-drawn stroke included.
        window.clearTimeout(holdTimer.current);
        drag.current = null;
        setGhost(null);
        setPageDrag(false);
        setDragging(false);
        stopAnim();
        gestureView.current = viewRef.current;
      },
      onPinch: ({ start, mid, scale }) => {
        const from = gestureView.current;
        const r = svgEl.current?.getBoundingClientRect();
        if (!from || !r) return;
        viewTouched.current = true;
        // The gain makes the zoom more eager than the fingers' own spread: ×1 is one to one.
        const z = clampZoom(from.z * Math.pow(scale, settingsRef.current.pinchGain));
        const k = z / from.z;
        // The point of the page under the fingers' first midpoint stays under their midpoint now.
        setView({ z, x: mid.x - r.left - (start.x - r.left - from.x) * k, y: mid.y - r.top - (start.y - r.top - from.y) * k });
      },
      onEnd: () => {
        gestureView.current = null;
      },
      onTap: (fingers) => {
        const ed = editorRef.current;
        if (fingers >= 3) {
          if (ed.canRedo) ed.redo();
        } else if (ed.canUndo) ed.undo();
      },
    });
  }

  const onPointerDown = (event: PointerEvent) => {
    const b = blockRef.current;
    const svg = svgEl.current;
    if (!b || !svg || phaseRef.current !== 'idle' || editingText) return;
    const landing = gestures.current!.down(event);
    if (landing === 'palm' || landing === 'gesture') {
      event.preventDefault();
      return;
    }
    if (landing === 'pen') penSeen.current = true;
    stopAnim();
    setPaintsOpen(false);
    const p = toSurface(event.clientX, event.clientY);
    const target = event.target as Element;
    const current = toolRef.current;

    // Pencil-only drawing: a finger never draws, it moves the page. By default once a pencil has been seen; the
    // Canvas menu can make it always or never so.
    const pencilOnly = settingsRef.current.pencilOnly;
    const fingerPans = event.pointerType === 'touch' && (pencilOnly === 'on' || (pencilOnly === 'auto' && penSeen.current)) && DRAW_TOOLS.has(current);
    if (event.button === 1 || (event.button === 0 && (spaceRef.current || current === 'hand' || fingerPans))) {
      capture(svg as unknown as HTMLElement, event.pointerId);
      drag.current = { kind: 'pan', x: event.clientX, y: event.clientY, view: viewRef.current, tracker: new PanTracker() };
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    capture(svg as unknown as HTMLElement, event.pointerId);

    const handle = target.getAttribute('data-handle');
    if (handle === 'page' || handle === 'page-e' || handle === 'page-s') {
      // The page's own edges: the right one is the width, the bottom one the height, the corner both.
      drag.current = { kind: 'page', axis: handle === 'page-e' ? 'x' : handle === 'page-s' ? 'y' : 'both', width: b.width, height: b.height, x: p.x, y: p.y };
      setPageDrag(true);
      event.preventDefault();
      return;
    }
    const sel = selectionOf(b, layerRef.current);
    if (handle && sel) {
      const one = sel.group ? undefined : sel.layers[0]!;
      if (sel.group) {
        drag.current = { kind: 'resizeMany', layers: sel.layers, handle: handle as Handle, box: groupBox(sel.layers, textHeights), x: p.x, y: p.y };
      } else if (handle === 'rot' && one) {
        const box = boxOf(one);
        drag.current = { kind: 'rotate', layer: one, centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 } };
      } else if ((handle === 'p1' || handle === 'p2') && one) {
        drag.current = { kind: 'endpoint', layer: one, which: handle === 'p1' ? 1 : 2 };
      } else if (one) {
        drag.current = { kind: 'resize', layer: one, handle: handle as Handle, box: boxOf(one), x: p.x, y: p.y };
      }
      event.preventDefault();
      return;
    }

    if (current === 'pen') {
      drag.current = { kind: 'pen', points: [p.x, p.y], still: { x: event.clientX, y: event.clientY, since: performance.now() }, snapped: null };
      setGhost({ kind: 'pen', points: [p.x, p.y], snapped: null });
      event.preventDefault();
      return;
    }
    if (current === 'eraser') {
      const session = String(Date.now());
      drag.current = { kind: 'erase', last: p, session };
      eraseAlong(p, p, session);
      event.preventDefault();
      return;
    }
    if (current === 'rect' || current === 'ellipse' || current === 'line') {
      drag.current = { kind: 'create', tool: current, from: p, to: p };
      setGhost({ kind: 'create', tool: current, from: p, to: p });
      event.preventDefault();
      return;
    }
    if (current === 'text' || current === 'sticky') {
      const id =
        current === 'text'
          ? place('Add text', addTextAt(tpl(), blockId, p, paintRef.current, lookRef.current ?? undefined))
          : place('Add sticky note', addStickyAt(tpl(), blockId, p, paintRef.current));
      release(svg as unknown as HTMLElement, event.pointerId);
      setEditingText(id);
      setTool('select');
      event.preventDefault();
      return;
    }
    if (current === 'stamp') {
      // A real stamp never lands straight. The tilt is chosen here and stored, so the recipe stays exact.
      place('Stamp', addMarkAt(tpl(), blockId, stampRef.current, p, paintRef.current, Math.round(Math.random() * 16 - 8)), false);
      event.preventDefault();
      return;
    }

    const hit = target.closest('[data-sy-layer]')?.getAttribute('data-sy-layer') ?? null;
    if (hit) {
      const l = b.layers.find((x) => x.id === hit);
      if (!l) return;
      // A stroke that belongs to a drawing picks the drawing; Alt picks the stroke on its own.
      const gid = l.group && !event.altKey && membersOf(b, l.group).length > 1 ? l.group : null;
      const now = Date.now();
      const again = lastPress.current?.layerId === hit && now - lastPress.current.at < 450;
      lastPress.current = { layerId: hit, at: now };
      if (!gid && again && (l.kind === 'text' || l.kind === 'sticky')) {
        onSelectLayer(hit);
        setEditingText(hit);
        release(svg as unknown as HTMLElement, event.pointerId);
        event.preventDefault();
        return;
      }
      onSelectLayer(gid ? groupKey(gid) : hit);
      drag.current = { kind: 'move', layers: gid ? membersOf(b, gid) : [l], x: p.x, y: p.y, moved: false };
      // Held still on it for a beat: the hand from here, so dragging moves the page and not the layer.
      const { clientX, clientY } = event;
      window.clearTimeout(holdPan.current);
      holdPan.current = window.setTimeout(() => {
        const d = drag.current;
        if (!d || d.kind !== 'move' || d.moved) return;
        drag.current = { kind: 'pan', x: clientX, y: clientY, view: viewRef.current, tracker: new PanTracker() };
        setHeld(true);
      }, settingsRef.current.holdPanMs);
    } else {
      lastPress.current = null;
      onSelectLayer(null);
      drag.current = { kind: 'pan', x: event.clientX, y: event.clientY, view: viewRef.current, tracker: new PanTracker() };
    }
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (gestures.current!.move(event)) return;
    const state = drag.current;
    const b = blockRef.current;
    if (toolRef.current === 'eraser') setEraserAt(toSurface(event.clientX, event.clientY));
    if (!state) {
      // Hover: a soft outline on whatever the pointer is over, as long as nothing is being done.
      if (toolRef.current === 'select' && phaseRef.current === 'idle' && !spaceRef.current && b) {
        const hit = (event.target as Element).closest?.('[data-sy-layer]')?.getAttribute('data-sy-layer') ?? null;
        const l = hit ? b.layers.find((x) => x.id === hit) : undefined;
        const key = l?.group && !event.altKey && membersOf(b, l.group).length > 1 ? groupKey(l.group) : hit;
        if (key !== hoverRef.current) {
          hoverRef.current = key;
          setHover(key);
        }
      }
      return;
    }
    if (!b) return;
    if (state.kind !== 'pan' && state.kind !== 'pen' && state.kind !== 'create' && state.kind !== 'erase') setDragging(true);
    const p = toSurface(event.clientX, event.clientY);
    const key = `surface:${blockId}`;
    switch (state.kind) {
      case 'pan':
        viewTouched.current = true;
        state.tracker.push(event.clientX, event.clientY);
        setView({ ...state.view, x: state.view.x + (event.clientX - state.x), y: state.view.y + (event.clientY - state.y) });
        return;
      case 'move': {
        const dx = p.x - state.x;
        const dy = p.y - state.y;
        if (!state.moved && Math.hypot(dx, dy) * viewRef.current.z < 3) return;
        state.moved = true;
        window.clearTimeout(holdPan.current);
        commit('Move', replaceLayers(tpl(), blockId, state.layers.map((l) => translateLayer(l, dx, dy))), `${key}:move:${state.layers.map((l) => l.id).join(',')}`);
        return;
      }
      case 'resizeMany': {
        const box = boxFromHandle(state.box, state.handle, p.x - state.x, p.y - state.y, event.shiftKey);
        commit('Resize drawing', replaceLayers(tpl(), blockId, scaleLayers(state.layers, state.box, box)), `${key}:resize:${state.layers.map((l) => l.id).join(',')}`);
        return;
      }
      case 'resize':
        commit('Resize layer', updateLayer(tpl(), blockId, state.layer.id, fields(resized(state, p, event.shiftKey))), `${key}:resize:${state.layer.id}`);
        return;
      case 'endpoint': {
        if (state.layer.kind !== 'line') return;
        const patch = state.which === 1 ? { x1: Math.round(p.x), y1: Math.round(p.y) } : { x2: Math.round(p.x), y2: Math.round(p.y) };
        commit('Resize line', updateLayer(tpl(), blockId, state.layer.id, patch), `${key}:end:${state.layer.id}`);
        return;
      }
      case 'rotate': {
        let angle = deg(Math.atan2(p.y - state.centre.y, p.x - state.centre.x)) + 90;
        if (event.shiftKey) angle = Math.round(angle / 15) * 15;
        angle = (((Math.round(angle * 10) / 10) % 360) + 360) % 360;
        commit('Rotate layer', updateLayer(tpl(), blockId, state.layer.id, { rotation: angle }), `${key}:rotate:${state.layer.id}`);
        return;
      }
      case 'create': {
        let to = p;
        if (event.shiftKey && state.tool !== 'line') {
          const d = Math.max(Math.abs(p.x - state.from.x), Math.abs(p.y - state.from.y));
          to = { x: state.from.x + Math.sign(p.x - state.from.x || 1) * d, y: state.from.y + Math.sign(p.y - state.from.y || 1) * d };
        }
        state.to = to;
        setGhost({ kind: 'create', tool: state.tool, from: state.from, to });
        return;
      }
      case 'pen': {
        state.points.push(p.x, p.y);
        // Quick shape (model/quick-shape.ts): the pen has stopped moving when it stays within a little jitter. Once it has
        // for QUICK_SHAPE_HOLD_MS, the stroke is classified and the ghost shows what lifting now would leave. Moving on
        // unsnaps it and starts the clock again.
        const still = state.still;
        if (!still || Math.hypot(event.clientX - still.x, event.clientY - still.y) > QUICK_SHAPE_JITTER_PX) {
          state.still = { x: event.clientX, y: event.clientY, since: performance.now() };
          state.snapped = null;
          window.clearTimeout(holdTimer.current);
          if (settingsRef.current.quickShapes) {
            holdTimer.current = window.setTimeout(() => {
              const held = drag.current;
              if (!held || held.kind !== 'pen') return;
              held.snapped = quickShape(held.points);
              setGhost({ kind: 'pen', points: [...held.points], snapped: held.snapped });
            }, settingsRef.current.holdMs);
          }
        }
        setGhost({ kind: 'pen', points: [...state.points], snapped: state.snapped });
        return;
      }
      case 'erase':
        eraseAlong(state.last, p, state.session);
        state.last = p;
        return;
      case 'page': {
        const s = siteOf(tpl(), blockId);
        if (!s) return;
        const at = { kind: 'block' as const, sectionId: s.section.id, blockId };
        if (state.axis !== 'y') editorRef.current.setAt(at, 'block.width', Math.max(40, Math.min(700, Math.round(state.width + (p.x - state.x)))));
        if (state.axis !== 'x') editorRef.current.setAt(at, 'block.height', Math.max(20, Math.min(1200, Math.round(state.height + (p.y - state.y)))));
        return;
      }
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    gestures.current!.up(event);
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(holdPan.current);
    setHeld(false);
    const state = drag.current;
    const svg = svgEl.current;
    if (svg) release(svg as unknown as HTMLElement, event.pointerId);
    drag.current = null;
    setGhost(null);
    setPageDrag(false);
    setDragging(false);
    if (!state) return;
    if (state.kind === 'pan') {
      // Let go while moving: the page keeps sliding and eases to a stop (inertia.ts).
      const v = state.tracker.velocity();
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
    if (state.kind === 'create') {
      const dragged = Math.hypot(state.to.x - state.from.x, state.to.y - state.from.y) * viewRef.current.z > 4;
      const to = dragged ? state.to : { x: state.from.x + 120, y: state.from.y + (state.tool === 'line' ? 0 : 80) };
      place('Add shape', addShapeAt(tpl(), blockId, state.tool, state.from, to, paintRef.current));
      setTool('select');
    } else if (state.kind === 'pen') {
      // Every stroke of one marker session goes into one drawing, so a doodle is one thing to move.
      const b = blockRef.current;
      if (!penGroup.current && b) penGroup.current = newGroupId(b);
      const pen = BRUSHES.find((x) => x.brush === brushRef.current) ?? BRUSHES[1]!;
      // A highlighter left on the default colour stays null, which draws yellow rather than the ink.
      const ink = paintRef.current ?? (pen.brush === 'highlighter' ? null : (Object.keys(ds.colors)[0] ?? null));
      if (state.snapped) commit('Draw', addQuickShape(tpl(), blockId, state.snapped, ink, pen.width, penGroup.current ?? undefined, pen.brush));
      else commit('Draw', drawPath(tpl(), blockId, state.points, ink, pen.width, penGroup.current ?? undefined, pen.brush));
    }
  };

  /** A box pulled by one of its handles, the opposite side staying put. Shift keeps a corner's proportions. */
  const boxFromHandle = (start: Box, h: Handle, dx: number, dy: number, uniform: boolean): Box => {
    let { x, y, width, height } = start;
    if (h.includes('e')) width = Math.max(4, start.width + dx);
    if (h.includes('s')) height = Math.max(4, start.height + dy);
    if (h.includes('w')) {
      width = Math.max(4, start.width - dx);
      x = start.x + start.width - width;
    }
    if (h.includes('n')) {
      height = Math.max(4, start.height - dy);
      y = start.y + start.height - height;
    }
    if (uniform && h.length === 2) {
      const s = Math.max(width / start.width, height / start.height);
      width = start.width * s;
      height = start.height * s;
      if (h.includes('w')) x = start.x + start.width - width;
      if (h.includes('n')) y = start.y + start.height - height;
    }
    return { x, y, width, height };
  };

  /**
   * The resized layer. The pointer is taken into the layer's own, unrotated frame; the box is
   * rebuilt there with the opposite side anchored; and then shifted so that anchor stays where it
   * was on screen, which a rotated box otherwise walks away from.
   */
  const resized = (state: Extract<Drag, { kind: 'resize' }>, p: Point, uniform: boolean): FreeformLayer => {
    const angle = state.layer.rotation ?? 0;
    const start = state.box;
    const c = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    const local = angle ? rotatePoint(p, c, -angle) : p;
    const startLocal = angle ? rotatePoint({ x: state.x, y: state.y }, c, -angle) : { x: state.x, y: state.y };
    const dx = local.x - startLocal.x;
    const dy = local.y - startLocal.y;
    const h = state.handle;
    let { x, y, width, height } = start;
    if (h.includes('e')) width = Math.max(4, start.width + dx);
    if (h.includes('s')) height = Math.max(4, start.height + dy);
    if (h.includes('w')) {
      width = Math.max(4, start.width - dx);
      x = start.x + start.width - width;
    }
    if (h.includes('n')) {
      height = Math.max(4, start.height - dy);
      y = start.y + start.height - height;
    }
    // A stamp keeps its proportions from any corner; everything else only with Shift.
    if ((uniform || state.layer.kind === 'mark') && h.length === 2) {
      const s = Math.max(width / start.width, height / start.height);
      width = start.width * s;
      height = start.height * s;
      if (h.includes('w')) x = start.x + start.width - width;
      if (h.includes('n')) y = start.y + start.height - height;
    }
    let box: Box = { x, y, width, height };
    if (angle) {
      const anchor = {
        x: h.includes('w') ? start.x + start.width : h.includes('e') ? start.x : c.x,
        y: h.includes('n') ? start.y + start.height : h.includes('s') ? start.y : c.y,
      };
      const world = rotatePoint(anchor, c, angle);
      const c2 = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const anchorLocal = {
        x: h.includes('w') ? box.x + box.width : h.includes('e') ? box.x : box.x + box.width / 2,
        y: h.includes('n') ? box.y + box.height : h.includes('s') ? box.y : box.y + box.height / 2,
      };
      const worldNow = rotatePoint(anchorLocal, c2, angle);
      box = { ...box, x: box.x + (world.x - worldNow.x), y: box.y + (world.y - worldNow.y) };
    }
    return withLayerBox(state.layer, box);
  };

  // --- keys, while the canvas is open ----------------------------------------------------------------
  //
  // The handlers are made every render, so they see the latest of everything; one subscription reads them through a
  // ref, so it is bound once and its dependency list is empty and true.

  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    if (phaseRef.current !== 'idle') return;
    const meta = event.metaKey || event.ctrlKey;
    const b = blockRef.current;
    if (!b) return;
    if (event.key === ' ') {
      spaceRef.current = true;
      setSpace(true);
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (editingText) setEditingText(null);
      else if (toolRef.current !== 'select') setTool('select');
      else if (layerRef.current) onSelectLayer(null);
      else leave();
      return;
    }
    if (meta && (event.key === '0' || event.key === '1')) {
      event.preventDefault();
      if (event.key === '0') fitSmooth();
      else zoomTo(1, undefined, true);
      return;
    }
    if (meta && (event.key === '=' || event.key === '+' || event.key === '-')) {
      event.preventDefault();
      zoomTo(viewRef.current.z * (event.key === '-' ? 1 / 1.25 : 1.25), undefined, true);
      return;
    }
    if (!meta && !event.altKey && event.key.length === 1) {
      const found = TOOLS.find((t) => t.key.toLowerCase() === event.key.toLowerCase());
      if (found) {
        setTool(found.tool);
        return;
      }
    }
    const picked = layerRef.current;
    const sel = selectionOf(b, picked);
    if (!picked || !sel) return;
    if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      if (sel.group) placeMany('Duplicate drawing', duplicateGroup(tpl(), blockId, sel.group), sel.layers.length);
      else place('Duplicate layer', duplicateLayer(tpl(), blockId, picked));
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      poof(picked);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    const move = arrows[event.key];
    if (move) {
      event.preventDefault();
      commit('Nudge', replaceLayers(tpl(), blockId, sel.layers.map((l) => translateLayer(l, move[0], move[1]))), `surface:${blockId}:nudge:${picked}`);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === ' ') {
      spaceRef.current = false;
      setSpace(false);
    }
  };
  const keyHandlers = useRef({ onKey, onKeyUp });
  keyHandlers.current = { onKey, onKeyUp };
  useEffect(() => {
    const down = (event: KeyboardEvent) => keyHandlers.current.onKey(event);
    const up = (event: KeyboardEvent) => keyHandlers.current.onKeyUp(event);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // --- the canvas's own clipboard -------------------------------------------------------------------
  //
  // In the capture phase on the document, stopped there, so the email's own copy and paste never
  // hear a key pressed in here. A copy is of layers; a paste steps further out each time, the way a
  // design tool pastes.

  useEffect(() => {
    const busy = (event: ClipboardEvent) => {
      const t = event.target as HTMLElement | null;
      return phaseRef.current !== 'idle' || Boolean(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable));
    };
    const onCopy = (event: ClipboardEvent, cut: boolean) => {
      if (busy(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const b = blockRef.current;
      const key = layerRef.current;
      const sel = b ? selectionOf(b, key) : null;
      if (!sel || !event.clipboardData) return;
      event.clipboardData.setData('text/plain', layerClipText(sel.layers));
      pasteCount.current = 0;
      if (cut && key) poof(key);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (busy(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const layers = parseLayerClip(event.clipboardData?.getData('text/plain') ?? '');
      if (!layers) return;
      pasteCount.current += 1;
      placeMany('Paste', pasteLayers(tpl(), blockId, layers, 24 * pasteCount.current), layers.length);
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    document.addEventListener('copy', copy, true);
    document.addEventListener('cut', cut, true);
    document.addEventListener('paste', onPaste, true);
    return () => {
      document.removeEventListener('copy', copy, true);
      document.removeEventListener('cut', cut, true);
      document.removeEventListener('paste', onPaste, true);
    };
  }, [blockId, placeMany, poof, tpl]);

  // --- pictures from the folder ------------------------------------------------------------------

  const dropAsset = useCallback(
    (asset: AssetFile, at: { x: number; y: number } | null) => {
      const img = new Image();
      img.onload = () => {
        const point = at ? toSurface(at.x, at.y) : null;
        place('Add picture', addImageLayerAt(tpl(), blockId, asset.name, { width: img.naturalWidth || 200, height: img.naturalHeight || 150 }, point));
      };
      img.src = asset.url;
    },
    [blockId, place, toSurface, tpl],
  );
  if (api) api.current = { dropAsset };

  if (!block || block.type !== 'freeform' || !site) return null;

  // --- what is drawn -------------------------------------------------------------------------------

  const idle = phase === 'idle';
  const sel = idle ? selectionOf(block, layer) : null;
  const picked = sel && !sel.group ? sel.layers[0] : undefined;
  const pickedBox = sel ? (sel.group ? groupBox(sel.layers, textHeights) : boxOf(sel.layers[0]!)) : null;
  const hoverSel = hover && hover !== layer && idle && tool === 'select' ? selectionOf(block, hover) : null;
  const hovered = hoverSel && !hoverSel.group ? hoverSel.layers[0] : undefined;
  const hoveredBox = hoverSel ? (hoverSel.group ? groupBox(hoverSel.layers, textHeights) : boxOf(hoverSel.layers[0]!)) : null;
  const hs = HANDLE / view.z;
  const allHandles: Array<{ h: Handle; x: number; y: number; cursor: string }> = pickedBox
    ? [
        { h: 'nw', x: pickedBox.x, y: pickedBox.y, cursor: 'nwse-resize' },
        { h: 'n', x: pickedBox.x + pickedBox.width / 2, y: pickedBox.y, cursor: 'ns-resize' },
        { h: 'ne', x: pickedBox.x + pickedBox.width, y: pickedBox.y, cursor: 'nesw-resize' },
        { h: 'e', x: pickedBox.x + pickedBox.width, y: pickedBox.y + pickedBox.height / 2, cursor: 'ew-resize' },
        { h: 'se', x: pickedBox.x + pickedBox.width, y: pickedBox.y + pickedBox.height, cursor: 'nwse-resize' },
        { h: 's', x: pickedBox.x + pickedBox.width / 2, y: pickedBox.y + pickedBox.height, cursor: 'ns-resize' },
        { h: 'sw', x: pickedBox.x, y: pickedBox.y + pickedBox.height, cursor: 'nesw-resize' },
        { h: 'w', x: pickedBox.x, y: pickedBox.y + pickedBox.height / 2, cursor: 'ew-resize' },
      ]
    : [];
  // Text has a width and finds its own height, so only its sides pull; a stamp only its corners.
  const handles = allHandles.filter((hd) => (picked?.kind === 'text' ? hd.h === 'e' || hd.h === 'w' : picked?.kind === 'mark' ? hd.h.length === 2 : true));
  const pickedText = picked?.kind === 'text' ? picked : undefined;
  const currentLook = pickedText ? (pickedText.look ?? null) : look;
  const rotation = picked?.rotation ?? 0;
  const centre = pickedBox ? { x: pickedBox.x + pickedBox.width / 2, y: pickedBox.y + pickedBox.height / 2 } : null;
  const rotateAbout = (l: FreeformLayer, box: Box) => (l.rotation ? `rotate(${l.rotation} ${box.x + box.width / 2} ${box.y + box.height / 2})` : undefined);

  const editing = editingText ? block.layers.find((l) => l.id === editingText) : undefined;
  const typing = editing && (editing.kind === 'text' || editing.kind === 'sticky') ? editing : undefined;
  // The words being typed are hidden in the drawing, or they would show twice under the field.
  const drawn: FreeformBlock = typing ? { ...block, layers: block.layers.map((l) => (l.id === typing.id && (l.kind === 'text' || l.kind === 'sticky') ? { ...l, text: '' } : l)) } : block;
  const ink = theme(ds, firstPreset(ds)).text;
  // The ground the picture sits on in the email, so the page matches it at both ends of the flight.
  const pageFill = colorOf(ds, block.background) ?? site.section.containerColor ?? site.section.bandColor ?? '#ffffff';
  const palette = Object.keys(ds.colors).slice(0, 8);
  const count = block.layers.length;
  const swatch = colorOf(ds, paint);
  const penDef = BRUSHES.find((b) => b.brush === brush) ?? BRUSHES[1]!;
  // The print shows whenever there is one to show; mid-gesture the live drawing does, so it can be seen moving.
  const showFx = Boolean(fxKey && fx && !dragging && !typing && !ghost && !pageDrag);

  const field = typing
    ? (() => {
        const pad = typing.kind === 'sticky' ? 14 : 0;
        const box = boxOf(typing);
        // The same resolved type the drawing uses, tweaks and all, so the words do not jump as you type.
        const st = textStyleOf(typing, ds);
        const size = st.size;
        return {
          left: view.x + (box.x + pad) * view.z,
          top: view.y + (box.y + pad) * view.z,
          width: Math.max(10, box.width - pad * 2) * view.z,
          height: typing.kind === 'sticky' ? Math.max(10, box.height - pad * 2) * view.z : Math.max(size * 1.3, textHeights[typing.id] ?? 0) * view.z,
          size: size * view.z,
          style: { lineHeight: st.lineHeight, weight: st.weight, uppercase: st.uppercase, letterSpacing: st.letterSpacing },
          italic: st.italic,
          font: st.font,
          color: colorOf(ds, typing.color) ?? colorOf(ds, st.color) ?? (typing.kind === 'sticky' ? '#2b2620' : ink),
          align: typing.kind === 'text' ? typing.align : 'left',
        };
      })()
    : null;

  // --- the canvas's own controls: layers panel, mini menu, slash menu ----------------------------------

  /** Changes every picked layer at once, as the mini menu asks. */
  const changePicked = (label: string, fn: (l: FreeformLayer) => FreeformLayer, coalesce?: string) => {
    const b = blockRef.current;
    const s = b ? selectionOf(b, layerRef.current) : null;
    if (!s) return;
    commit(label, replaceLayers(tpl(), blockId, s.layers.map(fn)), coalesce ? `surface:${blockId}:${coalesce}` : undefined);
  };
  const duplicateKey = (key: string) => {
    const b = blockRef.current;
    const s = b ? selectionOf(b, key) : null;
    if (!s) return;
    if (s.group) placeMany('Duplicate drawing', duplicateGroup(tpl(), blockId, s.group), s.layers.length);
    else place('Duplicate layer', duplicateLayer(tpl(), blockId, key));
  };
  const orderKey = (key: string, delta: number) => {
    const b = blockRef.current;
    if (!b) return;
    const gid = groupOfKey(key);
    const at = groupRuns(b.layers).findIndex((it) => (gid ? it.kind === 'group' && it.id === gid : it.kind === 'layer' && it.layer.id === key));
    if (at !== -1) commit('Reorder', moveItem(tpl(), blockId, key, at + delta));
  };
  const ungroup = (gid: string) => {
    commit('Ungroup drawing', ungroupLayers(tpl(), blockId, gid));
    onSelectLayer(null);
  };
  const setPage = (patch: { width?: number; height?: number; background?: ColorRef }) => {
    const s = siteOf(tpl(), blockId);
    if (!s) return;
    const at = { kind: 'block' as const, sectionId: s.section.id, blockId };
    for (const [k, v] of Object.entries(patch)) editorRef.current.setAt(at, `block.${k}`, v);
  };

  const slashItems: CanvasCommand[] = typing && slash ? filterCommands(canvasCommands(typing, ds), slash.query) : [];
  /** Words and formatting into the layer and the editor together, with the selection put back where it belongs. */
  const rewrite = (label: string, next: { text: string; styles: StyleRange[] }, extra: Record<string, unknown>, start: number, end: number, coalesce?: string) => {
    const el = textRef.current;
    if (!el || !typing) return;
    commit(label, updateLayer(tpl(), blockId, typing.id, { ...extra, text: next.text, styles: next.styles.length ? next.styles : undefined }), coalesce);
    el.innerHTML = editableHtml(next.text, next.styles, ds);
    setSelectionOffsets(el, start, end);
    refreshFormat();
  };

  const pickSlash = (item: CanvasCommand) => {
    const el = textRef.current;
    if (!el || !typing || !slash) return;
    const cur = readEditable(el);
    const caret = selectionOffsets(el)?.end ?? cur.text.length;
    const at = slash.at;
    rewrite(`Text · ${item.label}`, spliceText(cur.text, cur.styles, at, caret, ''), item.patch, at, at);
    setSlash(null);
  };

  /** A newline or pasted words, as plain text in the formatting of the letter before them. */
  const insertPlain = (words: string) => {
    const el = textRef.current;
    if (!el || !typing || !words) return;
    const cur = readEditable(el);
    const o = selectionOffsets(el) ?? { start: cur.text.length, end: cur.text.length };
    const from = Math.min(o.start, o.end);
    const clean = words.replace(/\r\n?/g, '\n');
    const at = from + clean.length;
    rewrite('Edit text', spliceText(cur.text, cur.styles, from, Math.max(o.start, o.end), clean), {}, at, at, `surface:${blockId}:text:${typing.id}`);
  };

  /** The words formatting goes on: the selection, or every word when nothing is selected. */
  const formatSpan = () => {
    const el = textRef.current;
    if (!el || !typing) return null;
    const cur = readEditable(el);
    const o = selectionOffsets(el);
    const whole = !o || o.start === o.end;
    const from = whole ? 0 : Math.min(o.start, o.end);
    const to = whole ? cur.text.length : Math.max(o.start, o.end);
    return from === to ? null : { cur, from, to, keep: o ?? { start: from, end: to } };
  };
  const FORMAT_LABELS: Record<MarkKey, string> = { bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough' };
  const toggleFormat = (key: MarkKey) => {
    const s = formatSpan();
    if (!s || !typing) return;
    const st = textStyleOf(typing, ds);
    const base = key === 'bold' ? st.weight === 'bold' : key === 'italic' ? st.italic : false;
    rewrite(FORMAT_LABELS[key], { text: s.cur.text, styles: toggleMark(s.cur.text, s.cur.styles, s.from, s.to, key, base) }, {}, s.keep.start, s.keep.end);
  };
  const markFormat = (label: string, patch: Partial<TextMarks>) => {
    const s = formatSpan();
    if (!s) return;
    rewrite(label, { text: s.cur.text, styles: applyMarks(s.cur.text, s.cur.styles, s.from, s.to, patch) }, {}, s.keep.start, s.keep.end);
  };
  const clearFormat = () => {
    const s = formatSpan();
    if (!s) return;
    rewrite('Clear formatting', { text: s.cur.text, styles: clearMarks(s.cur.text, s.cur.styles, s.from, s.to) }, {}, s.keep.start, s.keep.end);
  };

  // Where the mini menu floats: over the picked thing's top edge, or under its bottom when there is no room above.
  const barAt = (() => {
    if (!sel || !pickedBox || !centre) return null;
    const pts = [
      { x: pickedBox.x, y: pickedBox.y },
      { x: pickedBox.x + pickedBox.width, y: pickedBox.y },
      { x: pickedBox.x, y: pickedBox.y + pickedBox.height },
      { x: pickedBox.x + pickedBox.width, y: pickedBox.y + pickedBox.height },
    ].map((p) => (rotation ? rotatePoint(p, centre, rotation) : p));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const lift = sel.group || picked?.kind === 'line' ? 14 : 42;
    const above = view.y + minY * view.z - lift;
    const below = above < 130;
    const width = work.current?.clientWidth ?? 1200;
    const left = Math.max(180, Math.min(width - (panelOpen ? PANEL_ROOM : 0) - 180, view.x + centre.x * view.z));
    return { left, top: below ? view.y + maxY * view.z + 18 : above, below };
  })();

  // The format bar sits over the words being typed, or under them when there is no room above.
  const formatAt =
    field && typing
      ? (() => {
          const pad = typing.kind === 'sticky' ? 14 * view.z : 0;
          const above = field.top - pad - 12;
          const below = above < 120;
          return { left: Math.max(8, field.left - pad), top: below ? field.top + field.height + pad + 14 : above, below };
        })()
      : null;

  const slashAtScreen = field
    ? (() => {
        const height = work.current?.clientHeight ?? 900;
        const under = field.top + field.height + 14;
        return { left: Math.max(8, field.left), top: under + 300 > height ? Math.max(8, field.top - 314) : under };
      })()
    : null;

  return (
    <div class={`surface fig phase-${phase} tool-${tool} ${space || held || tool === 'hand' ? 'panning' : ''} ${panelOpen ? 'with-panel' : ''}`}>
      <div class="surface-work" ref={work} tabIndex={-1}>
        <div class="surface-backdrop" aria-hidden="true" />
        <svg
          class="surface-svg"
          ref={svgEl}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            setEraserAt(null);
            if (drag.current) return;
            hoverRef.current = null;
            setHover(null);
          }}
        >
          <defs>
            <pattern id="fig-dots" width={22 * view.z} height={22 * view.z} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
              <circle cx={1.3} cy={1.3} r={1.3} fill="rgba(70,58,38,0.17)" />
            </pattern>
            <filter id="fig-shadow" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#3a2f1d" flood-opacity="0.2" />
            </filter>
          </defs>
          <rect class="surface-dots" width="100%" height="100%" fill="url(#fig-dots)" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
            <rect class="surface-page-shadow" x={0} y={0} width={block.width} height={block.height} fill={pageFill} filter="url(#fig-shadow)" />
            <rect x={0} y={0} width={block.width} height={block.height} fill={pageFill} />
            {/* Under a print the drawing is invisible but still there, so a click still finds its layer. */}
            <g style={showFx ? { opacity: 0 } : undefined} dangerouslySetInnerHTML={{ __html: withoutMissingPictures(withLocalAssets(freeformLayersSvg(drawn, ds), assets)) }} />
            {showFx && fx && <image href={fx.url} x={0} y={0} width={block.width} height={block.height} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />}
            {idle && (
              <>
                <rect data-handle="page-e" x={block.width - 3.5 / view.z} y={block.height / 2 - 20 / view.z} width={7 / view.z} height={40 / view.z} rx={3.5 / view.z} class="surface-page-grip" style={{ cursor: 'ew-resize' }} />
                <rect data-handle="page-s" x={block.width / 2 - 20 / view.z} y={block.height - 3.5 / view.z} width={40 / view.z} height={7 / view.z} rx={3.5 / view.z} class="surface-page-grip" style={{ cursor: 'ns-resize' }} />
                <circle data-handle="page" cx={block.width} cy={block.height} r={6 / view.z} class="surface-page-grip" style={{ cursor: 'nwse-resize' }} />
              </>
            )}
            <g class="surface-selection">
              {hoveredBox && hoverSel && (
                <rect
                  x={hoveredBox.x}
                  y={hoveredBox.y}
                  width={hoveredBox.width}
                  height={hoveredBox.height}
                  fill="none"
                  stroke={ACCENT}
                  stroke-width={1.5 / view.z}
                  stroke-dasharray={hoverSel.group ? `${5 / view.z} ${4 / view.z}` : undefined}
                  opacity={0.6}
                  transform={hovered ? rotateAbout(hovered, hoveredBox) : undefined}
                />
              )}
              {ghost?.kind === 'create' && ghostShape(ghost)}
              {ghost?.kind === 'pen' && ghost.snapped && snappedGhost(ghost.snapped)}
              {ghost?.kind === 'pen' && !ghost.snapped &&
                (brush === 'brush' ? (
                  <path d={brushOutline(ghost.points, penDef.width)} fill={swatch ?? ACCENT} />
                ) : (
                  <polyline
                    points={pairs(ghost.points)}
                    fill="none"
                    stroke={swatch ?? (brush === 'highlighter' ? HIGHLIGHTER : ACCENT)}
                    stroke-opacity={brush === 'highlighter' ? 0.45 : undefined}
                    stroke-width={penDef.width}
                    stroke-linecap={brush === 'highlighter' ? 'butt' : 'round'}
                    stroke-linejoin="round"
                  />
                ))}
              {tool === 'eraser' && eraserAt && idle && (
                <circle cx={eraserAt.x} cy={eraserAt.y} r={ERASER / view.z} fill="rgba(255,255,255,0.65)" stroke="#1e1c19" stroke-width={1.5 / view.z} />
              )}
              {pickedBox && centre && sel && (
                <g transform={rotation ? `rotate(${rotation} ${centre.x} ${centre.y})` : undefined}>
                  <rect
                    x={pickedBox.x}
                    y={pickedBox.y}
                    width={pickedBox.width}
                    height={pickedBox.height}
                    fill="none"
                    stroke={ACCENT}
                    stroke-width={1.5 / view.z}
                    stroke-dasharray={sel.group ? `${5 / view.z} ${4 / view.z}` : undefined}
                  />
                  {picked?.kind === 'line' ? (
                    <>
                      <circle data-handle="p1" cx={picked.x1} cy={picked.y1} r={hs * 0.6} class="surface-handle" />
                      <circle data-handle="p2" cx={picked.x2} cy={picked.y2} r={hs * 0.6} class="surface-handle" />
                    </>
                  ) : (
                    <>
                      {handles.map((hd) => (
                        <circle key={hd.h} data-handle={hd.h} cx={hd.x} cy={hd.y} r={hs / 2} class="surface-handle" style={{ cursor: hd.cursor }} />
                      ))}
                      {/* A drawing scales but does not turn: its strokes have no one centre to turn about. */}
                      {!sel.group && (
                        <>
                          <line x1={centre.x} y1={pickedBox.y} x2={centre.x} y2={pickedBox.y - 24 / view.z} stroke={ACCENT} stroke-width={1.5 / view.z} />
                          <circle data-handle="rot" cx={centre.x} cy={pickedBox.y - 24 / view.z} r={hs * 0.62} class="surface-handle rot" />
                        </>
                      )}
                    </>
                  )}
                </g>
              )}
            </g>
          </g>
        </svg>

        {idle && (
          <div class={`fig-size ${pageDrag ? 'on' : ''}`} style={{ left: `${view.x + block.width * view.z}px`, top: `${view.y + block.height * view.z + 12}px` }}>
            {block.width} × {block.height}
          </div>
        )}

        {field && typing && (
          <div
            class={`surface-text ${typing.kind === 'sticky' ? 'on-sticky' : ''}`}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label={typing.kind === 'sticky' ? 'Note' : 'Text'}
            data-placeholder={typing.kind === 'sticky' ? 'Type something… or / for styles' : ''}
            style={{
              left: `${field.left}px`,
              top: `${field.top}px`,
              width: `${field.width}px`,
              ...(typing.kind === 'sticky' ? { height: `${field.height}px` } : { minHeight: `${field.height}px` }),
              fontFamily: field.font,
              fontSize: `${field.size}px`,
              lineHeight: `${field.style.lineHeight}%`,
              fontWeight: field.style.weight,
              fontStyle: field.italic ? 'italic' : 'normal',
              color: field.color,
              textAlign: field.align,
              textTransform: field.style.uppercase ? 'uppercase' : 'none',
              letterSpacing: field.style.letterSpacing ? `${field.style.letterSpacing * view.z}px` : undefined,
              transform: typing.rotation ? `rotate(${typing.rotation}deg)` : undefined,
            }}
            ref={(el) => {
              textRef.current = el;
            }}
            onInput={() => {
              const el = textRef.current;
              if (!el) return;
              const { text, styles } = readEditable(el);
              keepEnd(el, text);
              commit('Edit text', updateLayer(tpl(), blockId, typing.id, { text, styles: styles.length ? styles : undefined }), `surface:${blockId}:text:${typing.id}`);
              const found = slashAt(text, selectionOffsets(el)?.end ?? text.length);
              setSlash(found ? { ...found, index: slash && slash.at === found.at && slash.query === found.query ? slash.index : 0 } : null);
              refreshFormat();
            }}
            onPaste={(e) => {
              // Plain words only: formatting pasted from somewhere else is not something the picture can promise to draw.
              e.preventDefault();
              insertPlain(e.clipboardData?.getData('text/plain') ?? '');
            }}
            onBlur={() => {
              setSlash(null);
              setEditingText(null);
            }}
            onKeyDown={(e) => {
              const meta = e.metaKey || e.ctrlKey;
              const letter = e.key.toLowerCase();
              if (meta && !e.altKey && !e.shiftKey && (letter === 'b' || letter === 'i' || letter === 'u')) {
                e.preventDefault();
                e.stopPropagation();
                toggleFormat(letter === 'b' ? 'bold' : letter === 'i' ? 'italic' : 'underline');
                return;
              }
              if (meta && e.shiftKey && letter === 'x') {
                e.preventDefault();
                e.stopPropagation();
                toggleFormat('strike');
                return;
              }
              if (e.key === 'Enter' && !slash) {
                // A newline through the model, not the browser, which would wrap lines in <div>s of its own.
                e.preventDefault();
                e.stopPropagation();
                insertPlain('\n');
                return;
              }
              if (slash) {
                const n = slashItems.length;
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
                  e.preventDefault();
                  e.stopPropagation();
                  setSlash({ ...slash, index: (slash.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n });
                  return;
                }
                if ((e.key === 'Enter' || e.key === 'Tab') && n) {
                  e.preventDefault();
                  e.stopPropagation();
                  pickSlash(slashItems[Math.min(slash.index, n - 1)]!);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setSlash(null);
                  return;
                }
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditingText(null);
              }
              e.stopPropagation();
            }}
          />
        )}

        {typing && fmt && formatAt && !slash && (
          <FigFormat ds={ds} state={fmt} left={formatAt.left} top={formatAt.top} below={formatAt.below} onToggle={toggleFormat} onMarks={markFormat} onClear={clearFormat} />
        )}

        {typing && slash && slashAtScreen && (
          <FigSlash
            ds={ds}
            items={slashItems}
            index={Math.min(slash.index, Math.max(0, slashItems.length - 1))}
            query={slash.query}
            left={slashAtScreen.left}
            top={slashAtScreen.top}
            onPick={pickSlash}
            onHover={(i) => setSlash({ ...slash, index: i })}
          />
        )}
      </div>

      {idle && sel && barAt && !typing && !dragging && tool === 'select' && (
        <FigBar
          key={layer ?? ''}
          ds={ds}
          layers={sel.layers}
          group={sel.group}
          left={barAt.left}
          top={barAt.top}
          below={barAt.below}
          onChange={changePicked}
          onDuplicate={() => layer && duplicateKey(layer)}
          onRemove={() => layer && poof(layer)}
          onUngroup={() => sel.group && ungroup(sel.group)}
          onOrder={(d) => layer && orderKey(layer, d)}
        />
      )}

      {panelOpen ? (
        <FigLayers
          block={block}
          ds={ds}
          picked={layer}
          hover={hover}
          onPick={(key) => {
            setTool('select');
            onSelectLayer(key);
          }}
          onHover={(key) => {
            hoverRef.current = key;
            setHover(key);
          }}
          onEdit={(id) => {
            onSelectLayer(id);
            setEditingText(id);
          }}
          onDuplicate={duplicateKey}
          onRemove={poof}
          onUngroup={ungroup}
          onMove={(key, to) => commit('Reorder', moveItem(tpl(), blockId, key, to))}
          onPage={setPage}
          onEffects={(next, label, coalesce) => commit(label, setEffects(tpl(), blockId, next), coalesce ? `surface:${blockId}:${coalesce}` : undefined)}
          onOpenRiso={() => void openInRiso()}
          effectNote={fxNote}
          effectBusy={Boolean(fxKey && fx?.key !== fxKey)}
          onClose={() => setPanelOpen(false)}
        />
      ) : (
        <button class="fig-chrome fig-pill fig-panel-open" title="Show the layers" onClick={() => setPanelOpen(true)}>
          Layers <span class="fig-count">{count}</span>
        </button>
      )}

      <div class="fig-chrome fig-top fig-top-left">
        {standalone ? (
          standalone.left
        ) : (
          <button class="fig-pill fig-back" title="Back to the email. Esc does the same once nothing is picked." onClick={leave}>
            <span aria-hidden="true">←</span> Email
          </button>
        )}
        <span class="fig-pill fig-title">
          <b>Freeform</b>
          <span>
            {count} {count === 1 ? 'layer' : 'layers'}
          </span>
        </span>
      </div>
      <div class="fig-chrome fig-top fig-top-right">
        <div class="fig-pill fig-zoom">
          <button title="Zoom out  ·  ⌘−" aria-label="Zoom out" onClick={() => zoomTo(view.z / 1.25, undefined, true)}>
            −
          </button>
          <button class="pct" title="Fit the surface  ·  ⌘0" onClick={fitSmooth}>
            {Math.round(view.z * 100)}%
          </button>
          <button title="Zoom in  ·  ⌘+" aria-label="Zoom in" onClick={() => zoomTo(view.z * 1.25, undefined, true)}>
            +
          </button>
        </div>
        {standalone ? (
          standalone.right
        ) : (
          <button class="fig-pill fig-done" title="Fly back into the email." onClick={leave}>
            Done
          </button>
        )}
      </div>

      {(tool === 'stamp' || tool === 'text' || tool === 'pen' || paintsOpen) && (
        <div class="fig-chrome fig-trays">
          {paintsOpen && (
            <div class="fig-tray fig-paints" role="group" aria-label="Colour">
              <button class={`fig-dot none ${paint === null ? 'on' : ''}`} title="Each kind's own default colour" aria-label="Default colours" onClick={() => choosePaint(null)} />
              {palette.map((name) => (
                <button key={name} class={`fig-dot ${paint === name ? 'on' : ''}`} style={{ background: colorOf(ds, name) ?? undefined }} title={`${name}, from the design system`} aria-label={name} onClick={() => choosePaint(name)} />
              ))}
              <span class="fig-sep" aria-hidden="true" />
              {STICKY_COLORS.map((hex) => (
                <button key={hex} class={`fig-dot ${paint === hex ? 'on' : ''}`} style={{ background: hex }} title="A note colour" aria-label={`Note colour ${hex}`} onClick={() => choosePaint(hex)} />
              ))}
            </div>
          )}
          {tool === 'text' && (
            <div class="fig-tray fig-looks" role="group" aria-label="Text style">
              {[null, ...Object.keys(canvasTypeOf(ds))].map((k) => (
                <button
                  key={k ?? 'plain'}
                  class={`fig-look ${currentLook === k ? 'on' : ''}`}
                  aria-pressed={currentLook === k}
                  title={k ? `${canvasTypeOf(ds)[k]!.label}. Tune it in Design › Canvas type.` : 'Plain: the heading role from Design › Type.'}
                  onClick={() => chooseLook(k)}
                >
                  <span dangerouslySetInnerHTML={{ __html: canvasTypeSampleSvg(ds, k, 'Aa') }} />
                </button>
              ))}
            </div>
          )}
          {tool === 'pen' && (
            <div class="fig-tray fig-brushes" role="group" aria-label="Pens">
              {BRUSHES.map((b) => (
                <button
                  key={b.brush}
                  class={`fig-brush ${brush === b.brush ? 'on' : ''}`}
                  aria-pressed={brush === b.brush}
                  title={`${b.label}. ${b.help}`}
                  onClick={() => {
                    setBrush(b.brush);
                    // A new pen starts a new drawing, so a highlight is not grouped with the doodle under it.
                    penGroup.current = null;
                  }}
                >
                  <span dangerouslySetInnerHTML={{ __html: brushSampleSvg(ds, b.brush, paint) }} />
                  <b>{b.label}</b>
                </button>
              ))}
            </div>
          )}
          {tool === 'stamp' && (
            <div class="fig-tray fig-stamps" role="group" aria-label="Stamps">
              {MARKS.map((m) => (
                <button key={m.key} class={`fig-stamp ${stamp === m.key ? 'on' : ''}`} title={m.name} aria-pressed={stamp === m.key} onClick={() => setStamp(m.key)}>
                  <svg viewBox={m.viewBox} fill={swatch ?? ink} aria-hidden="true" dangerouslySetInnerHTML={{ __html: m.body }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div class="fig-chrome fig-dock">
        <div class="fig-tools" role="toolbar" aria-label="Tools">
          {TOOLS.map((t) => (
            <button key={t.tool} class={`fig-tool ${tool === t.tool ? 'on' : ''}`} aria-pressed={tool === t.tool} aria-label={t.label} title={`${t.label}  ·  ${t.key}\n${t.help}`} onClick={() => setTool(t.tool)}>
              {t.icon()}
            </button>
          ))}
        </div>
        <span class="fig-sep" aria-hidden="true" />
        <button
          class={`fig-swatch ${paintsOpen ? 'on' : ''} ${swatch ? '' : 'none'}`}
          style={swatch ? { background: swatch } : undefined}
          aria-expanded={paintsOpen}
          aria-label="Colour"
          title="Colour. Paints what is picked, and whatever you make next."
          onClick={() => setPaintsOpen((v) => !v)}
        />
      </div>

      {hint && idle && (
        <div class="fig-chrome fig-hint" aria-hidden="true" onAnimationEnd={() => setHint(false)}>
          Double-click text to type · / for styles · hold Space to pan · hold still to snap a shape · ⌘C ⌘V copy layers
        </div>
      )}
    </div>
  );
}
