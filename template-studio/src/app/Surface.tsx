import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { freeformLayersSvg } from '../compile/freeform.ts';
import { designSystemOf, siteOf } from '../model/edit.ts';
import { typeOf, fontOf } from '../model/design-system.ts';
import {
  addImageLayerAt,
  addShapeAt,
  addTextAt,
  drawPath,
  duplicateLayer,
  layerBox,
  removeLayer,
  translateLayer,
  updateLayer,
  withLayerBox,
  type Box,
} from '../model/freeform.ts';
import type { FreeformBlock, FreeformLayer } from '../model/types.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { withLocalAssets } from './local-assets.ts';
import { capture, release } from './pointer.ts';
import type { Editor } from './useEditor.ts';

// The surface editor: a freeform block opened as a workspace of its own.
//
// Jared: "make freeform less clunky and feel more like an endless canvas I can drop stuff on and
// zoom in and out. allow me to drop assets from the assets panel into it, resize, rotate, and play
// with on the canvas." The first version edited the surface in place on the email, at the email's
// size, through a panel of numbers. This is the other thing: the page on a grey field with no
// edges, pan and zoom, handles on what is picked, shapes drawn out by dragging, pictures dropped
// in from the folder, words typed where they sit (learnings 3.67).
//
// It draws exactly what the compiler draws — `freeformLayersSvg` is the same function the canvas
// and the render use — and then lays its own handles over that, in the same coordinate space. So
// what is edited here is what ships, not a second drawing of it.

export interface SurfaceProps {
  editor: Editor;
  blockId: string;
  assets: AssetFile[];
  layer: string | null;
  onSelectLayer(layerId: string | null): void;
  onDone(): void;
  /** Filled by the editor, so a picture dragged from the Assets panel can land on it. */
  api?: { current: SurfaceApi | null };
}

export interface SurfaceApi {
  /** A picture from the folder, dropped at these screen coordinates — or at the page's centre when null. */
  dropAsset(asset: AssetFile, at: { x: number; y: number } | null): void;
}

type Tool = 'select' | 'text' | 'rect' | 'ellipse' | 'line' | 'pen';
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface View {
  x: number;
  y: number;
  z: number;
}

type Drag =
  | { kind: 'pan'; x: number; y: number; view: View }
  | { kind: 'move'; layer: FreeformLayer; x: number; y: number; moved: boolean }
  | { kind: 'resize'; layer: FreeformLayer; handle: Handle; box: Box; x: number; y: number }
  | { kind: 'endpoint'; layer: FreeformLayer; which: 1 | 2 }
  | { kind: 'rotate'; layer: FreeformLayer; centre: { x: number; y: number } }
  | { kind: 'create'; tool: 'rect' | 'ellipse' | 'line'; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: 'pen'; points: number[] }
  | { kind: 'page'; width: number; height: number; x: number; y: number };

const TOOLS: Array<{ tool: Tool; label: string; key: string; help: string }> = [
  { tool: 'select', label: 'Select', key: 'V', help: 'Pick, move, resize and rotate what is on the surface. Space-drag or the middle button pans; ⌘ and the wheel zooms.' },
  { tool: 'text', label: 'Text', key: 'T', help: 'Click to place words, in the heading role. Double-click any text to edit it where it sits.' },
  { tool: 'rect', label: 'Box', key: 'R', help: 'Drag out a rectangle. Hold Shift for a square.' },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', help: 'Drag out an ellipse. Hold Shift for a circle.' },
  { tool: 'line', label: 'Line', key: 'L', help: 'Drag from one end to the other.' },
  { tool: 'pen', label: 'Pen', key: 'P', help: 'Draw freehand. Each stroke is a layer.' },
];

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const HANDLE = 8;

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/** A point rotated about a centre. */
function rotatePoint(p: { x: number; y: number }, c: { x: number; y: number }, angle: number): { x: number; y: number } {
  const a = rad(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

export function Surface({ editor, blockId, assets, layer, onSelectLayer, onDone, api }: SurfaceProps) {
  const site = siteOf(editor.template, blockId);
  const block = site?.column.blocks[site.index];
  const ds = designSystemOf(editor.template);

  const work = useRef<HTMLDivElement | null>(null);
  const svgEl = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>({ x: 80, y: 80, z: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [tool, setTool] = useState<Tool>('select');
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const drag = useRef<Drag | null>(null);
  /** Live geometry during a drag, drawn without waiting for the commit to come back. */
  const [ghost, setGhost] = useState<{ kind: 'create'; tool: 'rect' | 'ellipse' | 'line'; from: { x: number; y: number }; to: { x: number; y: number } } | { kind: 'pen'; points: number[] } | null>(null);
  const [space, setSpace] = useState(false);
  const spaceRef = useRef(false);
  /** Measured heights of text layers, in surface units, for their boxes. */
  const [textHeights, setTextHeights] = useState<Record<string, number>>({});
  const [editingText, setEditingText] = useState<string | null>(null);
  const [fitted, setFitted] = useState(false);
  const blockRef = useRef<FreeformBlock | null>(null);
  if (block?.type === 'freeform') blockRef.current = block;
  const layerRef = useRef(layer);
  layerRef.current = layer;
  /**
   * The last press on a layer, for a double-click of our own. `preventDefault` on pointerdown —
   * needed so a drag does not select text — also stops the browser's `dblclick` from ever
   * arriving, so two presses on the same text within a beat are read here instead.
   */
  const lastPress = useRef<{ layerId: string; at: number } | null>(null);

  const commit = useCallback(
    (label: string, next: typeof editor.template, coalesce?: string) => {
      if (next !== editor.template) editor.commit(label, next, coalesce ? { coalesce } : {});
    },
    [editor],
  );

  // --- coordinates ------------------------------------------------------------------------------

  /** Screen to surface. */
  const toSurface = useCallback((clientX: number, clientY: number) => {
    const r = svgEl.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!r) return { x: 0, y: 0 };
    return { x: (clientX - r.left - v.x) / v.z, y: (clientY - r.top - v.y) / v.z };
  }, []);

  const fit = useCallback(() => {
    const b = blockRef.current;
    const w = work.current?.getBoundingClientRect();
    if (!b || !w) return;
    const z = Math.min(2, (w.width - 120) / Math.max(1, b.width), (w.height - 120) / Math.max(1, b.height));
    setView({ z, x: (w.width - b.width * z) / 2, y: (w.height - b.height * z) / 2 });
  }, []);

  // Fit once the workspace has a size.
  useLayoutEffect(() => {
    if (fitted) return;
    fit();
    setFitted(true);
  }, [fit, fitted]);

  const zoomTo = useCallback((z: number, about?: { x: number; y: number }) => {
    const w = work.current?.getBoundingClientRect();
    const v = viewRef.current;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    const px = about ? about.x : (w?.width ?? 0) / 2;
    const py = about ? about.y : (w?.height ?? 0) / 2;
    setView({ z: next, x: px - ((px - v.x) * next) / v.z, y: py - ((py - v.y) * next) / v.z });
  }, []);

  // Wheel: ⌘/ctrl zooms about the pointer (that is what a pinch arrives as), plain wheel pans.
  // Bound by hand so it can be non-passive; a passive listener cannot stop the page scrolling.
  useEffect(() => {
    const el = work.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomTo(viewRef.current.z * Math.exp(-event.deltaY * 0.0025), { x: event.clientX - r.left, y: event.clientY - r.top });
      } else {
        setView((v) => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  // --- the picked layer's box, with a text layer's measured height ---------------------------------

  useLayoutEffect(() => {
    const b = blockRef.current;
    const svg = svgEl.current;
    if (!b || !svg) return;
    const next: Record<string, number> = {};
    for (const l of b.layers) {
      if (l.kind !== 'text') continue;
      const div = svg.querySelector(`[data-sy-layer="${CSS.escape(l.id)}"] div`) as HTMLElement | null;
      if (div) next[l.id] = div.getBoundingClientRect().height / viewRef.current.z;
    }
    setTextHeights((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
  }, [block, view.z]);

  const boxOf = useCallback((l: FreeformLayer): Box => layerBox(l, textHeights[l.id]), [textHeights]);

  // --- pointer ------------------------------------------------------------------------------------

  const onPointerDown = (event: PointerEvent) => {
    const b = blockRef.current;
    const svg = svgEl.current;
    if (!b || !svg) return;
    if (editingText) return;
    const p = toSurface(event.clientX, event.clientY);
    const target = event.target as Element;

    if (event.button === 1 || (event.button === 0 && spaceRef.current)) {
      capture(svg as unknown as HTMLElement, event.pointerId);
      drag.current = { kind: 'pan', x: event.clientX, y: event.clientY, view: viewRef.current };
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    capture(svg as unknown as HTMLElement, event.pointerId);

    const handle = target.getAttribute('data-handle');
    const picked = layerRef.current ? b.layers.find((l) => l.id === layerRef.current) : undefined;
    if (handle && picked) {
      if (handle === 'rot') {
        const box = boxOf(picked);
        drag.current = { kind: 'rotate', layer: picked, centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 } };
      } else if (handle === 'p1' || handle === 'p2') {
        drag.current = { kind: 'endpoint', layer: picked, which: handle === 'p1' ? 1 : 2 };
      } else {
        drag.current = { kind: 'resize', layer: picked, handle: handle as Handle, box: boxOf(picked), x: p.x, y: p.y };
      }
      event.preventDefault();
      return;
    }
    if (handle === 'page') {
      drag.current = { kind: 'page', width: b.width, height: b.height, x: p.x, y: p.y };
      event.preventDefault();
      return;
    }

    const current = toolRef.current;
    if (current === 'pen') {
      drag.current = { kind: 'pen', points: [p.x, p.y] };
      setGhost({ kind: 'pen', points: [p.x, p.y] });
      event.preventDefault();
      return;
    }
    if (current === 'rect' || current === 'ellipse' || current === 'line') {
      drag.current = { kind: 'create', tool: current, from: p, to: p };
      setGhost({ kind: 'create', tool: current, from: p, to: p });
      event.preventDefault();
      return;
    }
    if (current === 'text') {
      const next = addTextAt(editor.template, blockId, p);
      commit('Add text', next);
      const added = lastLayerId(next, blockId);
      onSelectLayer(added);
      setEditingText(added);
      setTool('select');
      event.preventDefault();
      return;
    }

    const hit = target.closest('[data-sy-layer]')?.getAttribute('data-sy-layer') ?? null;
    if (hit) {
      const l = b.layers.find((x) => x.id === hit);
      const now = Date.now();
      const again = lastPress.current?.layerId === hit && now - lastPress.current.at < 450;
      lastPress.current = { layerId: hit, at: now };
      if (l && again && l.kind === 'text') {
        // The second press on a text layer opens it for typing where it sits.
        onSelectLayer(hit);
        setEditingText(hit);
        release(svg as unknown as HTMLElement, event.pointerId);
        event.preventDefault();
        return;
      }
      if (l) {
        onSelectLayer(hit);
        drag.current = { kind: 'move', layer: l, x: p.x, y: p.y, moved: false };
      }
    } else {
      lastPress.current = null;
      onSelectLayer(null);
      drag.current = { kind: 'pan', x: event.clientX, y: event.clientY, view: viewRef.current };
    }
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current;
    const b = blockRef.current;
    if (!state || !b) return;
    const p = toSurface(event.clientX, event.clientY);
    const key = `surface:${blockId}`;
    switch (state.kind) {
      case 'pan':
        setView({ ...state.view, x: state.view.x + (event.clientX - state.x), y: state.view.y + (event.clientY - state.y) });
        return;
      case 'move': {
        const dx = p.x - state.x;
        const dy = p.y - state.y;
        if (!state.moved && Math.hypot(dx, dy) * viewRef.current.z < 3) return;
        state.moved = true;
        const moved = translateLayer(state.layer, dx, dy);
        commit('Move layer', updateLayer(editor.template, blockId, state.layer.id, fields(moved)), `${key}:move:${state.layer.id}`);
        return;
      }
      case 'resize': {
        commit('Resize layer', updateLayer(editor.template, blockId, state.layer.id, fields(resized(state, p, event.shiftKey))), `${key}:resize:${state.layer.id}`);
        return;
      }
      case 'endpoint': {
        if (state.layer.kind !== 'line') return;
        const patch = state.which === 1 ? { x1: Math.round(p.x), y1: Math.round(p.y) } : { x2: Math.round(p.x), y2: Math.round(p.y) };
        commit('Resize line', updateLayer(editor.template, blockId, state.layer.id, patch), `${key}:end:${state.layer.id}`);
        return;
      }
      case 'rotate': {
        let angle = deg(Math.atan2(p.y - state.centre.y, p.x - state.centre.x)) + 90;
        if (event.shiftKey) angle = Math.round(angle / 15) * 15;
        angle = ((Math.round(angle * 10) / 10) % 360 + 360) % 360;
        commit('Rotate layer', updateLayer(editor.template, blockId, state.layer.id, { rotation: angle === 0 ? 0 : angle }), `${key}:rotate:${state.layer.id}`);
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
      case 'pen':
        state.points.push(p.x, p.y);
        setGhost({ kind: 'pen', points: [...state.points] });
        return;
      case 'page': {
        const w = Math.max(40, Math.round(state.width + (p.x - state.x)));
        const h = Math.max(20, Math.round(state.height + (p.y - state.y)));
        if (site) {
          editor.setAt({ kind: 'block', sectionId: site.section.id, blockId }, 'block.width', w);
          editor.setAt({ kind: 'block', sectionId: site.section.id, blockId }, 'block.height', h);
        }
        return;
      }
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    const state = drag.current;
    const svg = svgEl.current;
    if (svg) release(svg as unknown as HTMLElement, event.pointerId);
    drag.current = null;
    setGhost(null);
    if (!state) return;
    if (state.kind === 'create') {
      const dragged = Math.hypot(state.to.x - state.from.x, state.to.y - state.from.y) * viewRef.current.z > 4;
      const to = dragged ? state.to : { x: state.from.x + 120, y: state.from.y + (state.tool === 'line' ? 0 : 80) };
      const next = addShapeAt(editor.template, blockId, state.tool, state.from, to);
      commit('Add shape', next);
      onSelectLayer(lastLayerId(next, blockId));
      setTool('select');
    } else if (state.kind === 'pen') {
      const ink = Object.keys(ds.colors)[0] ?? null;
      const next = drawPath(editor.template, blockId, state.points, ink, 3);
      commit('Draw', next);
      if (next !== editor.template) onSelectLayer(lastLayerId(next, blockId));
    }
  };

  /** A layer's own fields, for a patch: everything but the id and the kind. */
  const fields = (l: FreeformLayer): Record<string, unknown> => {
    const { id: _id, kind: _kind, ...rest } = l as unknown as Record<string, unknown> & { id: string; kind: string };
    void _id;
    void _kind;
    return rest;
  };

  /**
   * The resized layer. The pointer is taken into the layer's own, unrotated frame; the new box is
   * built there with the opposite side or corner anchored; and then the whole thing is shifted so
   * that anchor stays where it was on screen, which a rotated box otherwise drifts away from.
   */
  const resized = (state: Extract<Drag, { kind: 'resize' }>, p: { x: number; y: number }, uniform: boolean): FreeformLayer => {
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
    if (uniform && h.length === 2) {
      const s = Math.max(width / start.width, height / start.height);
      width = start.width * s;
      height = start.height * s;
      if (h.includes('w')) x = start.x + start.width - width;
      if (h.includes('n')) y = start.y + start.height - height;
    }
    let box: Box = { x, y, width, height };
    if (angle) {
      // The anchor is the corner or side opposite the handle. Its world position must not move.
      const anchor = {
        x: h.includes('w') ? start.x + start.width : h.includes('e') ? start.x : c.x,
        y: h.includes('n') ? start.y + start.height : h.includes('s') ? start.y : c.y,
      };
      const world = rotatePoint(anchor, c, angle);
      const c2 = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      // The same corner or side of the new box, rotated about the new centre, has moved; shift it back.
      const anchorLocal = {
        x: h.includes('w') ? box.x + box.width : h.includes('e') ? box.x : box.x + box.width / 2,
        y: h.includes('n') ? box.y + box.height : h.includes('s') ? box.y : box.y + box.height / 2,
      };
      const worldNow = rotatePoint(anchorLocal, c2, angle);
      box = { ...box, x: box.x + (world.x - worldNow.x), y: box.y + (world.y - worldNow.y) };
    }
    return withLayerBox(state.layer, box);
  };

  // --- keys, while the editor is open --------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
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
        else onDone();
        return;
      }
      if (meta && (event.key === '0' || event.key === '1')) {
        event.preventDefault();
        if (event.key === '0') fit();
        else zoomTo(1);
        return;
      }
      if (meta && (event.key === '=' || event.key === '+' || event.key === '-')) {
        event.preventDefault();
        zoomTo(viewRef.current.z * (event.key === '-' ? 1 / 1.25 : 1.25));
        return;
      }
      if (!meta) {
        const found = TOOLS.find((t) => t.key.toLowerCase() === event.key.toLowerCase());
        if (found && event.key.length === 1) {
          setTool(found.tool);
          return;
        }
      }
      const picked = layerRef.current;
      if (!picked) return;
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        const next = duplicateLayer(editor.template, blockId, picked);
        commit('Duplicate layer', next);
        onSelectLayer(lastLayerId(next, blockId));
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        commit('Remove layer', removeLayer(editor.template, blockId, picked));
        onSelectLayer(null);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
      const move = arrows[event.key];
      if (move) {
        event.preventDefault();
        const l = b.layers.find((x) => x.id === picked);
        if (l) commit('Nudge layer', updateLayer(editor.template, blockId, picked, fields(translateLayer(l, move[0], move[1]))), `surface:${blockId}:nudge:${picked}`);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        spaceRef.current = false;
        setSpace(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [editor, blockId, commit, onSelectLayer, onDone, fit, zoomTo, editingText]);

  // --- pictures from the folder ------------------------------------------------------------------

  const dropAsset = useCallback(
    (asset: AssetFile, at: { x: number; y: number } | null) => {
      const img = new Image();
      img.onload = () => {
        const point = at ? toSurface(at.x, at.y) : null;
        const next = addImageLayerAt(editor.template, blockId, asset.name, { width: img.naturalWidth || 200, height: img.naturalHeight || 150 }, point);
        commit('Add picture', next);
        onSelectLayer(lastLayerId(next, blockId));
      };
      img.src = asset.url;
    },
    [editor, blockId, commit, onSelectLayer, toSurface],
  );
  if (api) api.current = { dropAsset };

  if (!block || block.type !== 'freeform' || !site) return null;

  // --- what is drawn -------------------------------------------------------------------------------

  const picked = layer ? block.layers.find((l) => l.id === layer) : undefined;
  const pickedBox = picked ? boxOf(picked) : null;
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
  // Text has a width and finds its own height, so only its sides can be pulled.
  const handles = allHandles.filter((hd) => (picked?.kind === 'text' ? hd.h === 'e' || hd.h === 'w' : true));
  const rotation = picked?.rotation ?? 0;
  const centre = pickedBox ? { x: pickedBox.x + pickedBox.width / 2, y: pickedBox.y + pickedBox.height / 2 } : null;
  const editing = editingText ? block.layers.find((l) => l.id === editingText) : undefined;
  const editRole = editing && editing.kind === 'text' ? typeOf(ds, editing.role) : null;

  return (
    <div class={`surface ${space ? 'panning' : ''} tool-${tool}`}>
      <div class="surface-tools">
        <div class="seg" role="group" aria-label="Tools">
          {TOOLS.map((t) => (
            <button key={t.tool} class={`seg-btn ${tool === t.tool ? 'on' : ''}`} aria-pressed={tool === t.tool} title={`${t.help}  ·  ${t.key}`} onClick={() => setTool(t.tool)}>
              {t.label}
            </button>
          ))}
        </div>
        <span class="surface-hint" title="Drag a picture from the Assets panel onto the surface, or click one there to drop it in the middle.">
          Assets drop in from the panel.
        </span>
        <span class="grow" />
        <div class="seg" role="group" aria-label="Zoom">
          <button class="seg-btn" title="Zoom out  ·  ⌘−" onClick={() => zoomTo(view.z / 1.25)}>
            −
          </button>
          <button class="seg-btn" title="Fit the surface in the window  ·  ⌘0" onClick={fit}>
            {Math.round(view.z * 100)}%
          </button>
          <button class="seg-btn" title="Zoom in  ·  ⌘+" onClick={() => zoomTo(view.z * 1.25)}>
            +
          </button>
        </div>
        <button class="btn" title="Back to the email. Esc does the same once nothing is picked." onClick={onDone}>
          Done
        </button>
      </div>

      <div class="surface-work" ref={work}>
        <svg
          class="surface-svg"
          ref={svgEl}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <pattern id="surface-dots" width={24 * view.z} height={24 * view.z} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
              <circle cx={1} cy={1} r={1} fill="rgba(0,0,0,0.13)" />
            </pattern>
            <filter id="surface-shadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy={6} stdDeviation={10} flood-color="#000" flood-opacity="0.22" />
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="url(#surface-dots)" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
            <rect class="surface-page" x={0} y={0} width={block.width} height={block.height} fill="#ffffff" filter="url(#surface-shadow)" />
            <g dangerouslySetInnerHTML={{ __html: withLocalAssets(freeformLayersSvg(block, ds), assets) }} />
            {/* The page's own corner: drag it and the surface grows. */}
            <rect data-handle="page" x={block.width - hs} y={block.height - hs} width={hs * 2} height={hs * 2} class="surface-page-handle" />
            {ghost?.kind === 'create' && ghostShape(ghost)}
            {ghost?.kind === 'pen' && <polyline points={pairs(ghost.points)} fill="none" stroke="#2b45d8" stroke-width={3} stroke-linecap="round" stroke-linejoin="round" />}
            {pickedBox && centre && picked && (
              <g transform={rotation ? `rotate(${rotation} ${centre.x} ${centre.y})` : undefined} class="surface-selection">
                <rect x={pickedBox.x} y={pickedBox.y} width={pickedBox.width} height={pickedBox.height} fill="none" stroke="#2b45d8" stroke-width={1 / view.z} stroke-dasharray={`${4 / view.z} ${3 / view.z}`} />
                {picked.kind === 'line' ? (
                  <>
                    <circle data-handle="p1" cx={picked.x1} cy={picked.y1} r={hs * 0.8} class="surface-handle" />
                    <circle data-handle="p2" cx={picked.x2} cy={picked.y2} r={hs * 0.8} class="surface-handle" />
                  </>
                ) : (
                  <>
                    {handles.map((hd) => (
                      <rect key={hd.h} data-handle={hd.h} x={hd.x - hs / 2} y={hd.y - hs / 2} width={hs} height={hs} class="surface-handle" style={{ cursor: hd.cursor }} />
                    ))}
                    <line x1={centre.x} y1={pickedBox.y} x2={centre.x} y2={pickedBox.y - 22 / view.z} stroke="#2b45d8" stroke-width={1 / view.z} />
                    <circle data-handle="rot" cx={centre.x} cy={pickedBox.y - 22 / view.z} r={hs * 0.7} class="surface-handle rot" />
                  </>
                )}
              </g>
            )}
          </g>
        </svg>
        {editing && editing.kind === 'text' && editRole && (
          <textarea
            class="surface-text"
            style={{
              left: `${view.x + editing.x * view.z}px`,
              top: `${view.y + editing.y * view.z}px`,
              width: `${editing.width * view.z}px`,
              fontFamily: fontOf(ds, editing.role),
              fontSize: `${editRole.size * view.z}px`,
              lineHeight: `${editRole.lineHeight}%`,
              fontWeight: editRole.weight,
              textAlign: editing.align,
              textTransform: editRole.uppercase ? 'uppercase' : 'none',
              letterSpacing: editRole.letterSpacing ? `${editRole.letterSpacing * view.z}px` : undefined,
            }}
            value={editing.text}
            ref={(el) => {
              if (el && document.activeElement !== el) {
                el.focus();
                el.select();
              }
            }}
            onInput={(e) => commit('Edit text', updateLayer(editor.template, blockId, editing.id, { text: (e.target as HTMLTextAreaElement).value }), `surface:${blockId}:text:${editing.id}`)}
            onBlur={() => setEditingText(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditingText(null);
              }
              e.stopPropagation();
            }}
          />
        )}
      </div>
    </div>
  );
}

const pairs = (points: number[]) => {
  const out: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push(`${points[i]},${points[i + 1]}`);
  return out.join(' ');
};

function ghostShape(g: { tool: 'rect' | 'ellipse' | 'line'; from: { x: number; y: number }; to: { x: number; y: number } }) {
  const x = Math.min(g.from.x, g.to.x);
  const y = Math.min(g.from.y, g.to.y);
  const w = Math.abs(g.to.x - g.from.x);
  const h = Math.abs(g.to.y - g.from.y);
  const paint = { fill: 'rgba(43,69,216,0.08)', stroke: '#2b45d8', 'stroke-width': 1.5 };
  if (g.tool === 'line') return <line x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y} stroke="#2b45d8" stroke-width={2} />;
  if (g.tool === 'ellipse') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...paint} />;
  return <rect x={x} y={y} width={w} height={h} {...paint} />;
}

/** The id of the last layer of a freeform block in a template — the one just added. */
function lastLayerId(template: Editor['template'], blockId: string): string | null {
  const site = siteOf(template, blockId);
  const b = site?.column.blocks[site.index];
  if (!b || b.type !== 'freeform') return null;
  return b.layers[b.layers.length - 1]?.id ?? null;
}
