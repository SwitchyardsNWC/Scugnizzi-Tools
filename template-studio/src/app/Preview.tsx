import { useEffect, useRef, useState } from 'preact/hooks';

import { fromContentEditable, sanitise } from '../model/sanitise.ts';
import type { BlockType } from '../model/types.ts';
import { BLOCK_ICONS, ColumnsIcon, GroupIcon } from './icons.tsx';
import { capture, release } from './pointer.ts';
import { SlashMenu } from './SlashMenu.tsx';
import { blockItem, filterItems, FORMAT_COMMANDS, markdownShortcut, slashQuery, type Exec, type SlashItem } from './slash.ts';
import { CHROME, PLAUSIBLE, splitDocument } from './preview/chrome.ts';
import { LinkField } from './preview/LinkField.tsx';
import { RowMenu } from './preview/RowMenu.tsx';
import type { DropSpot, Hint, PreviewApi, RowCard, RowInfo, RowMenuSpec, SlashState, SpaceBox } from './preview/types.ts';

export type { DropSpot, PreviewApi, RowInfo, RowMenuSpec } from './preview/types.ts';

// The canvas.
//
// Three separate bugs lived here in v1 (learnings 3.4), and all three are about the reader losing
// their place. Each fix is one line here and was a day there:
//
//   1. Measure `documentElement.getBoundingClientRect().height`, never `scrollHeight` — scrollHeight
//      never shrinks, so the frame stayed tall forever once the content got shorter.
//   2. Keep the last good height. Mid-update the document is briefly empty; setting the height from
//      that measurement collapses the frame to ~10px and throws the outer scroll to the top.
//   3. `scrolling="no"` and size the frame to its content, so there is no scrollbar inside the
//      preview competing with the page's own.
//
// Selection is applied to the live document rather than baked into the markup, deliberately. A
// change to `html` is patched into the document's body when only the body changed, and reloads
// the frame only when the head moved (learnings 3.61); baking an outline into the markup would
// make every click a document change, for a cosmetic reason.

export interface PreviewProps {
  html: string;
  /** No chrome at all: no styles injected, no listeners, no bars or overlays. The email as it is. */
  plain?: boolean;
  /** Frame width in CSS pixels: the email is full-bleed, so this is the simulated device. */
  width: number;
  /** Block id to outline. Applied without reloading the frame. */
  selected?: string | null;
  /** Blocks selected alongside it — a shift-click run — outlined the same way, without the bar. */
  alsoSelected?: string[];
  /** `extend` is a shift-click: add to the selection rather than replace it. */
  onSelect?(blockId: string, sectionId: string, extend: boolean): void;
  /**
   * The row of columns or the group selected as itself, outlined on the canvas. Selecting one used
   * to need the layer tree: nothing on the canvas was the row rather than a block in it.
   */
  selectedSection?: string | null;
  /** Selecting a row as itself: its bar, its empty slot, the gap between its columns. */
  onSelectSection?(sectionId: string): void;
  /** What each section is, keyed by id, for the bar on its row. */
  sections?: Record<string, RowInfo>;
  /** The row's menu, built on demand. Null when the section has nothing to offer. */
  rowMenu?(sectionId: string): RowMenuSpec | null;
  /** The verbs on a row's bar: move it, copy it, remove it. */
  onMoveSection?(sectionId: string, delta: number): void;
  onDuplicateSection?(sectionId: string): void;
  onDeleteSection?(sectionId: string): void;
  /** The kind the selected block is, and what it may become — the type menu under its name. */
  selectedKind?: BlockType | null;
  convertible?: Array<{ kind: BlockType; name: string; summary: string }>;
  onConvert?(blockId: string, kind: BlockType): void;
  /** A divider between two columns was dragged: the row's new shares, in percent. */
  onResizeColumns?(sectionId: string, spans: number[]): void;
  /**
   * The freeform surface, shared with the inspector: which layer is picked, whether the pen is
   * down, and what a drag or a stroke on the surface means.
   */
  layer?: string | null;
  drawing?: boolean;
  onSelectLayer?(blockId: string, layerId: string | null): void;
  onMoveLayer?(blockId: string, layerId: string, dx: number, dy: number): void;
  onDrawPath?(blockId: string, points: number[]): void;
  /** A freeform block was double-clicked: open it as a workspace of its own. */
  onEnterSurface?(blockId: string): void;
  /**
   * Copy and paste, when nothing is being edited. The events are the frame's; what to put on the
   * clipboard and what to make of it is the app's, and it needs the event to read or write it.
   */
  onClipboard?(event: ClipboardEvent, kind: 'copy' | 'paste'): void;
  /** Block ids to fade back, so what the team can edit is what stands out. */
  dim?: string[];
  /** blockId -> where its text lives, where an edit is written back, and whether it is markup. */
  textTargets?: Record<string, { selector: string; path: string; rich?: boolean }>;
  onEditText?(blockId: string, path: string, value: string): void;
  /** Dropped a block that was already on the canvas. The caller turns the spot into an index. */
  onDropBlock?(blockId: string, spot: DropSpot): void;
  /**
   * Where the pointer is during a drag that started outside the canvas — a block being dragged in
   * from the palette. The canvas resolves it to a drop target and draws the indicator; the caller
   * is told what it resolved to, so the drop itself stays the caller's decision.
   */
  probe?: { x: number; y: number } | null;
  onProbe?(spot: DropSpot | null): void;
  /** Handed the iframe once it exists, so the scroller outside can find a block inside it. */
  frameRef?(frame: HTMLIFrameElement | null): void;
  /**
   * A block whose spacing to keep drawn — the selected one, while its Spacing panel is being
   * worked. Hovering draws the same for whatever is under the pointer; this pins it, so dragging a
   * dial in the side panel shows the number moving on the canvas.
   */
  spacing?: string | null;

  /**
   * The selected block's name, which turns on the on-canvas action bar.
   *
   * Actions live on the thing rather than in a side panel. That is the fix for the complaint that
   * started this: a block inside a column had no delete anywhere in the interface, because the
   * outline offered actions on sections and the inspector offers none at all. A bar attached to
   * what you just clicked is findable without being told where to look.
   */
  selectedLabel?: string;
  onDuplicate?(): void;
  onDelete?(): void;
  onNudge?(delta: number): void;
  canNudgeUp?: boolean;
  canNudgeDown?: boolean;

  /**
   * What the slash menu can add below the current block, and what to do when one is picked.
   *
   * The list comes from the app because the palette is the app's; the preview only knows how to
   * open a menu at a caret. `onAdd` is told which block the new one goes after — the one being
   * edited, or the one selected — or null when nothing is, which means the end.
   */
  quickAdd?: {
    kinds: Array<{ kind: string; name: string; summary: string }>;
    /** The last few kinds added, most recent first, shown at the top while nothing is typed. */
    recent?: string[];
    onAdd(kind: string, afterBlockId: string | null): void;
  };
  /**
   * Filled by the preview, so the app can drive it from its own keyboard: Enter on a selected
   * block starts editing it here, and `/` with focus in a side panel opens the menu here.
   */
  api?: { current: PreviewApi | null };
  /**
   * A block to start editing the moment it is on the canvas — the one the slash menu just added.
   * Adding a heading from the menu and then having to double-click it is a menu that stops one
   * step short. Cleared through `onAutoEdited` once it has been done, or once it cannot be.
   */
  autoEdit?: string | null;
  onAutoEdited?(): void;
}

export function Preview({
  html,
  plain = false,
  width,
  selected,
  onSelect,
  dim,
  textTargets,
  onEditText,
  onDropBlock,
  probe,
  onProbe,
  frameRef,
  selectedLabel,
  onDuplicate,
  onDelete,
  onNudge,
  canNudgeUp,
  canNudgeDown,
  quickAdd,
  api,
  autoEdit,
  onAutoEdited,
  alsoSelected,
  onClipboard,
  spacing,
  selectedSection,
  onSelectSection,
  sections,
  rowMenu,
  onMoveSection,
  onDuplicateSection,
  onDeleteSection,
  selectedKind,
  convertible,
  onConvert,
  onResizeColumns,
  layer,
  drawing = false,
  onSelectLayer,
  onMoveLayer,
  onDrawPath,
  onEnterSurface,
}: PreviewProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const lastGood = useRef(600);
  const [height, setHeight] = useState(600);
  const [ready, setReady] = useState(0);
  const editing = useRef<{ el: HTMLElement; blockId: string; path: string; original: string; rich: boolean } | null>(null);
  const drag = useRef<{
    blockId: string;
    y: number;
    active: boolean;
    spot: DropSpot | null;
    grabX: number;
    grabY: number;
    width: number;
  } | null>(null);
  /** Where to draw the drop indicator, in frame coordinates. */
  const [hint, setHint] = useState<Hint | null>(null);
  /** The spacing overlay's strips, in frame coordinates. Empty when nothing is being shown. */
  const [spaces, setSpaces] = useState<SpaceBox[]>([]);
  const spacingRef = useRef<string | null>(spacing ?? null);
  spacingRef.current = spacing ?? null;
  /** The block under the pointer, for the hover form of the overlay. */
  const hovered = useRef<string | null>(null);
  // The freeform surface. Refs, because the frame's listeners are bound once per load.
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const surfaceRef = useRef({ onSelectLayer, onMoveLayer, onDrawPath, onEnterSurface });
  surfaceRef.current = { onSelectLayer, onMoveLayer, onDrawPath, onEnterSurface };
  /** A layer being dragged across its surface, in surface pixels per screen pixel. */
  const layerDrag = useRef<{ blockId: string; layerId: string; x: number; y: number; scale: number; moved: boolean } | null>(null);
  /** A stroke being drawn: the points so far, and the live line the frame shows while it is drawn. */
  const pen = useRef<{ blockId: string; svg: SVGSVGElement; left: number; top: number; scale: number; points: number[]; line: SVGPolylineElement } | null>(null);

  // --- rows: a bar per band, so structure has a handle of its own -------------------------------
  /** Every band on the canvas with what it is and where it sits, in frame coordinates. */
  const [rows, setRows] = useState<RowCard[]>([]);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const [menu, setMenu] = useState<{ sectionId: string; top: number; left: number } | null>(null);
  /**
   * The type menu — what a block, or a row, could be instead — in the slash menu's clothes. A list
   * with a picked row, driven by the keys while open.
   */
  const [typeMenu, setTypeMenu] = useState<{ items: SlashItem[]; index: number; top: number; left: number; title: string; pick(item: SlashItem): void } | null>(null);
  const typeMenuRef = useRef(typeMenu);
  typeMenuRef.current = typeMenu;
  /** The dividers between the selected row's columns, in frame coordinates. Drag one to reshare. */
  const [dividers, setDividers] = useState<Array<{ sectionId: string; index: number; top: number; left: number; height: number }>>([]);
  const colDrag = useRef<{ sectionId: string; index: number; rowLeft: number; rowWidth: number; shares: number[] } | null>(null);
  const onSelectSectionRef = useRef(onSelectSection);
  onSelectSectionRef.current = onSelectSection;

  /** The section a band belongs to: the band's own mark for a lone block, the first inside it otherwise. */
  const idOfBand = (band: Element): string | null => {
    const holder = band.matches('[data-sy-section]') ? band : band.querySelector('[data-sy-section]');
    return (holder as HTMLElement | null)?.dataset['sySection'] ?? null;
  };

  /** The section under a pointer target: a block's, a column cell's, or the band's around it. */
  const sectionAt = (target: EventTarget | null): string | null => {
    const el = target as Element | null;
    const marked = el?.closest?.('[data-sy-section]') as HTMLElement | null;
    if (marked?.dataset['sySection']) return marked.dataset['sySection'];
    const band = el?.closest?.('.hse-section');
    return band ? idOfBand(band) : null;
  };

  const measureRows = (): RowCard[] => {
    const inner = frame.current?.contentDocument;
    if (!inner) return [];
    const info = sectionsRef.current ?? {};
    const out: RowCard[] = [];
    for (const band of inner.querySelectorAll('.hse-section')) {
      const sectionId = idOfBand(band);
      const known = sectionId ? info[sectionId] : undefined;
      if (!sectionId || !known) continue;
      const r = band.getBoundingClientRect();
      out.push({ ...known, sectionId, top: r.top, left: r.left, width: r.width, height: r.height });
    }
    return out;
  };

  /** The cells of the selected row of columns, or nothing when the selection is not one. */
  const cellsOf = (sectionId: string): HTMLElement[] => {
    const inner = frame.current?.contentDocument;
    if (!inner) return [];
    for (const band of inner.querySelectorAll('.hse-section')) {
      if (idOfBand(band) !== sectionId) continue;
      return [...band.querySelectorAll('td.sy-col')] as HTMLElement[];
    }
    return [];
  };

  const measureDividers = (sectionId: string | null) => {
    if (!sectionId) return [];
    const cells = cellsOf(sectionId);
    if (cells.length < 2) return [];
    return cells.slice(0, -1).map((cell, index) => {
      const r = cell.getBoundingClientRect();
      return { sectionId, index, top: r.top, left: r.right - 4, height: r.height };
    });
  };

  /**
   * Dragging the divider between two columns. The two beside it trade share; the rest keep
   * theirs; nothing goes below a tenth of the row. Shares are taken at the grab and the drag is
   * measured against them, so the frame re-rendering underneath does not move the goalposts.
   */
  const grabDivider = (event: PointerEvent, sectionId: string, index: number) => {
    if (event.button !== 0 || !onResizeColumns) return;
    event.preventDefault();
    event.stopPropagation();
    const cells = cellsOf(sectionId);
    if (cells.length < 2) return;
    capture(event.currentTarget as HTMLElement, event.pointerId);
    const widths = cells.map((c) => c.getBoundingClientRect().width);
    const rowWidth = widths.reduce((a, b) => a + b, 0) || 1;
    colDrag.current = { sectionId, index, rowLeft: cells[0]!.getBoundingClientRect().left, rowWidth, shares: widths.map((w) => w / rowWidth) };
  };
  const moveDivider = (event: PointerEvent) => {
    const state = colDrag.current;
    const box = frame.current?.getBoundingClientRect();
    if (!state || !box) return;
    const x = (event.clientX - box.left - state.rowLeft) / state.rowWidth;
    const before = state.shares.slice(0, state.index).reduce((a, b) => a + b, 0);
    const pair = state.shares[state.index]! + state.shares[state.index + 1]!;
    const at = Math.max(before + 0.1, Math.min(before + pair - 0.1, x));
    const shares = [...state.shares];
    shares[state.index] = at - before;
    shares[state.index + 1] = before + pair - at;
    onResizeColumns?.(state.sectionId, shares.map((v) => Math.round(v * 100)));
  };
  const dropDivider = (event: PointerEvent) => {
    release(event.currentTarget as HTMLElement, event.pointerId);
    colDrag.current = null;
  };

  /** The type menu on a block's name: every kind it could become, the current one left out. */
  const openBlockTypes = (blockId: string, top: number, left: number) => {
    if (!onConvert || !convertible?.length) return;
    const items = convertible.filter((k) => k.kind !== selectedKind).map((k) => blockItem(k.kind, k.name, k.summary));
    setTypeMenu({ items, index: 0, top, left: Math.max(1, Math.min(left, width - 276)), title: 'Turn into', pick: (item) => item.kind && onConvert(blockId, item.kind as BlockType) });
  };

  /** The type menu on a row's name: how many columns, and for a group, back to sections. */
  const openRowTypes = (sectionId: string, top: number, left: number) => {
    const spec = rowMenu?.(sectionId);
    if (!spec?.columns) return;
    const count = spec.columns.count;
    const items: SlashItem[] = [1, 2, 3, 4]
      .filter((n) => n !== count)
      .map((n) => ({ id: `cols-${n}`, label: n === 1 ? '1 column' : `${n} columns`, group: 'block', keywords: [], hint: n === 1 ? 'One full-width column.' : `${n} side by side, stacking on phones unless you say otherwise.`, kind: `columns:${n}` }));
    const ungroup = spec.actions.find((a) => a.label === 'Ungroup');
    if (ungroup) items.push({ id: 'ungroup', label: 'Ungroup', group: 'block', keywords: [], hint: 'One section per block again, keeping the look.', kind: 'ungroup' });
    setTypeMenu({
      items,
      index: 0,
      top,
      left: Math.max(1, Math.min(left, width - 276)),
      title: 'Make it',
      pick: (item) => {
        if (item.kind === 'ungroup') ungroup?.onClick();
        else if (item.kind?.startsWith('columns:')) spec.columns!.onPick(Number(item.kind.slice(8)));
      },
    });
  };

  const openMenu = (sectionId: string, top: number, left: number) => {
    setMenu((open) => (open?.sectionId === sectionId ? null : { sectionId, top, left: Math.max(1, Math.min(left, width - 232)) }));
  };
  /**
   * The slash menu. Kept in a ref as well as in state, because the keys that drive it arrive in
   * the preview document's listeners — bound once per load — and a closure over state would see
   * the menu as it was when the listener was attached.
   */
  const slashRef = useRef<SlashState | null>(null);
  const [slash, setSlashState] = useState<SlashState | null>(null);
  const setSlash = (next: SlashState | null) => {
    slashRef.current = next;
    setSlashState(next);
  };
  /** Where a `/` was dismissed with Escape, so typing on does not reopen the menu on it. */
  const dismissed = useRef<number | null>(null);
  /** The selection saved while the link field has focus, restored before the link is made. */
  const linkRange = useRef<Range | null>(null);
  /** True while the link field holds focus, so the editable's focusout does not commit. */
  const linking = useRef(false);
  /** The last block opened by `autoEdit`, so a second load does not open it twice. */
  const autoEdited = useRef<string | null>(null);
  /** A small reminder over the block being edited: how to format, how to finish. */
  const [editHint, setEditHint] = useState<{ top: number; left: number; rich: boolean } | null>(null);
  // Mirrors of props the frame's listeners need, for the same reason as `slashRef`.
  const selectedRef = useRef<string | null>(selected ?? null);
  selectedRef.current = selected ?? null;
  const quickAddRef = useRef(quickAdd);
  quickAddRef.current = quickAdd;
  /** Handlers the render side needs to reach into the listeners' closure for. */
  const actions = useRef<{
    pick(item: SlashItem): void;
    applyLink(url: string): void;
    cancelLink(): void;
    beginEditing(blockId: string): boolean;
    openQuickAdd(): void;
  } | null>(null);

  /**
   * The cell a block's content sits in: its own row's cell inside a group, or the padded cell of a
   * block that is alone. Null for a block that draws its own band and has no cell at all.
   */
  const cellOf = (block: HTMLElement): HTMLElement | null =>
    (block.matches('table') ? block.querySelector(':scope > tbody > tr > td') : block.querySelector('td.hs_padded')) as HTMLElement | null;

  /** A cell's content box — its rectangle less its padding. The element's own box when it has none. */
  const contentBox = (el: HTMLElement): DOMRect => {
    const r = el.getBoundingClientRect();
    const view = el.ownerDocument.defaultView;
    if (!view) return r;
    const cs = view.getComputedStyle(el);
    const [pt, pr, pb, pl] = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v) || 0);
    return new DOMRect(r.left + pl!, r.top + pt!, Math.max(0, r.width - pl! - pr!), Math.max(0, r.height - pt! - pb!));
  };

  const rectOf = (r: DOMRect) => ({ top: r.top, left: r.left, width: r.width, height: r.height });

  /**
   * What a pointer at these frame coordinates means. One resolver for both drags — the palette's
   * and the canvas's own — so the two cannot disagree about what a given pixel means.
   *
   * Three zones on a block (learnings 3.59). The top and bottom edges of a column's first and last
   * block mean a new section before or after — the line runs the full width, at the band's edge.
   * The middle means *alongside*, in the same cell: the line is inset to the block's content, and
   * the cell it would join is framed. A block that draws its own band has no inside, so on it the
   * halves are the two section edges and nothing else.
   */
  const probeAt = (x: number, y: number, ignore: string | null): { spot: DropSpot; hint: Hint } | null => {
    const inner = frame.current?.contentDocument;
    const el = frame.current;
    if (!inner || !el) return null;
    const frameHeight = el.getBoundingClientRect().height;
    const frameWidth = el.getBoundingClientRect().width;
    if (x < 0 || y < 0 || x > frameWidth || y > frameHeight) return null;

    const under = inner.elementFromPoint(x, y) as HTMLElement | null;
    const end = { spot: { at: 'end' } as DropSpot, hint: { top: frameHeight - 3, left: 0, width: frameWidth, height: 3, box: false } };
    if (!under) return end;
    const line = (top: number, left: number, width: number, frameRect?: DOMRect): Hint => ({
      top: top - 1.5,
      left,
      width,
      height: 3,
      box: false,
      ...(frameRect ? { frame: rectOf(frameRect) } : {}),
    });

    let block = under.closest('[data-sy-block]') as HTMLElement | null;
    // A block cannot be dropped onto itself. Walking up rather than giving up means dropping onto
    // your own block still resolves to the column around it, instead of the indicator vanishing.
    while (block && ignore && block.dataset['syBlock'] === ignore) {
      block = block.parentElement?.closest('[data-sy-block]') as HTMLElement | null;
    }
    if (block?.dataset['syBlock']) {
      const box = block.getBoundingClientRect();
      const sectionId = block.dataset['sySection'] ?? '';
      const band = (block.closest('.hse-section') ?? block) as HTMLElement;
      const bandBox = band.getBoundingClientRect();
      const midway = y < box.top + box.height / 2;
      if (block.hasAttribute('data-sy-band')) {
        return { spot: { at: 'section', sectionId, before: midway }, hint: line(midway ? bandBox.top : bandBox.bottom, 0, frameWidth) };
      }
      const column = block.closest('[data-sy-column]') as HTMLElement | null;
      const siblings = column ? [...column.querySelectorAll('[data-sy-block]')] : [block];
      const first = siblings[0] === block;
      const last = siblings[siblings.length - 1] === block;
      const edge = Math.min(18, Math.max(8, box.height * 0.28));
      if (first && y < box.top + edge) return { spot: { at: 'section', sectionId, before: true }, hint: line(bandBox.top, 0, frameWidth) };
      if (last && y > box.bottom - edge) return { spot: { at: 'section', sectionId, before: false }, hint: line(bandBox.bottom, 0, frameWidth) };
      const cell = cellOf(block);
      const content = cell ? contentBox(cell) : box;
      const host = column ?? cell ?? block;
      return {
        spot: { at: 'block', blockId: block.dataset['syBlock'], before: midway },
        hint: line(midway ? content.top : content.bottom, content.left, content.width, host.getBoundingClientRect()),
      };
    }

    const column = under.closest('[data-sy-column]') as HTMLElement | null;
    if (column?.dataset['syColumn']) {
      const box = column.getBoundingClientRect();
      // An empty column is one big target. One with blocks in it, met in its own padding, takes
      // the block at whichever end is nearer.
      if (!column.querySelector('[data-sy-block]')) {
        return { spot: { at: 'column', columnId: column.dataset['syColumn'], tail: false }, hint: { ...rectOf(box), box: true } };
      }
      const tail = y > box.top + box.height / 2;
      const cell = (column.matches('table') ? cellOf(column) : column.querySelector('td.hs_padded')) as HTMLElement | null;
      const content = cell ? contentBox(cell) : box;
      return {
        spot: { at: 'column', columnId: column.dataset['syColumn'], tail },
        hint: line(tail ? content.bottom : content.top, content.left, content.width, box),
      };
    }
    return end;
  };

  /**
   * The strips that show where a block's space is: its cell's padding, the gap under it inside a
   * group, the group's own padding around all of them, the inset of a box, and the section's space
   * above and below. Measured from the live document, so what is drawn is what the client gets —
   * at a phone width the gutter is the phone rule's, not the desktop number.
   */
  const measureSpacing = (blockId: string): SpaceBox[] => {
    const inner = frame.current?.contentDocument;
    const view = inner?.defaultView;
    // Nothing while a block is open for typing or the menu is up: the overlay is for looking at
    // structure, and a block with the caret in it is being written, not looked at.
    if (!inner || !view || editing.current || slashRef.current) return [];
    const root = inner.querySelector(`[data-sy-block="${CSS.escape(blockId)}"]`) as HTMLElement | null;
    if (!root) return [];
    const out: SpaceBox[] = [];
    const strips = (el: HTMLElement, kind: SpaceBox['kind'], sides: boolean) => {
      const cs = view.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const [pt, pr, pb, pl] = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v) || 0) as [number, number, number, number];
      const inner_h = Math.max(0, r.height - pt - pb);
      if (pt > 0) out.push({ key: `${kind}-top`, kind, top: r.top, left: r.left, width: r.width, height: pt, value: pt });
      if (pb > 0) out.push({ key: `${kind}-bottom`, kind, top: r.bottom - pb, left: r.left, width: r.width, height: pb, value: pb });
      if (!sides) return;
      if (pl > 0) out.push({ key: `${kind}-left`, kind, top: r.top + pt, left: r.left, width: pl, height: inner_h, value: pl });
      if (pr > 0) out.push({ key: `${kind}-right`, kind, top: r.top + pt, left: r.right - pr, width: pr, height: inner_h, value: pr });
    };

    const own = cellOf(root);
    // A row inside a group carries only the gap under it; the group's cell around it carries the
    // padding. A block alone carries both in the one cell.
    const inGroup = Boolean(own && !own.classList.contains('hs_padded'));
    const outer = inGroup ? (own!.closest('td.hs_padded') as HTMLElement | null) : null;
    if (own) strips(own, inGroup ? 'gap' : 'pad', !inGroup);
    if (outer) strips(outer, 'pad', true);
    const host = outer ?? own;
    const boxTable = host?.firstElementChild as HTMLElement | null;
    if (boxTable && boxTable.tagName === 'TABLE' && /border:/.test(boxTable.getAttribute('style') ?? '')) {
      const inset = boxTable.querySelector(':scope > tbody > tr > td') as HTMLElement | null;
      if (inset) strips(inset, 'box', true);
    }
    const container = ((host ?? root).closest('.hse-column-container') ?? root.querySelector('.hse-column-container')) as HTMLElement | null;
    if (container) strips(container, 'section', false);
    return out;
  };

  /** Where the action bar sits, in frame coordinates. Null when nothing is selected. */
  const [bar, setBar] = useState<{ top: number; left: number; sectionId?: string } | null>(null);
  const barRef = useRef(bar);
  barRef.current = bar;

  // The app drives two things from its own keyboard: Enter on a selected block edits it here, and
  // `/` with focus in a side panel opens the menu here. Both go through the listeners' closure.
  if (api) {
    api.current = {
      startEditing: (blockId) => actions.current?.beginEditing(blockId) ?? false,
      openQuickAdd: () => actions.current?.openQuickAdd(),
    };
  }

  const doc = onSelect && !plain ? html.replace('</head>', `${CHROME}</head>`) : html;

  /**
   * The document the frame was last actually *loaded* with. Everything since that shares its head
   * has been written straight into the body instead.
   *
   * A `srcdoc` reload is the slow thing on this canvas (learnings 3.61): the frame goes blank, the
   * document re-parses, every image is fetched and decoded again, and `load` waits for all of it —
   * three-quarters of a second after a duplicate, twice. Most edits change the body and nothing
   * else, and for those the new body goes into the document that is already there: same head,
   * same stylesheet, same listeners, images still decoded, nothing blank.
   */
  const [loaded, setLoaded] = useState(doc);
  /**
   * What the frame shows right now — loaded or patched — which is not the same as `loaded` once a
   * body has been written in. The first version compared against `loaded` alone, and an undo that
   * restored the very document last loaded looked like no change at all: the canvas kept the
   * duplicate the document no longer had.
   */
  const showing = useRef(doc);
  /** A reload is in flight. A body written into the old document now would be thrown away with it. */
  const pendingLoad = useRef(false);

  // The rows the menu shows, computed here the same way the key handler computes them: the
  // handler decides what Enter picks, and the list on screen has to be that list.
  const itemsShown: SlashItem[] = slash
    ? filterItems(
        [
          ...(slash.query
            ? []
            : (quickAdd?.recent ?? [])
                .map((kind) => (quickAdd?.kinds ?? []).find((k) => k.kind === kind))
                .filter((k): k is NonNullable<typeof k> => Boolean(k))
                .map((k) => blockItem(k.kind, k.name, k.summary, 'recent'))),
          ...(slash.mode === 'format' && editing.current?.rich ? FORMAT_COMMANDS : []),
          ...(quickAdd?.kinds ?? []).map((k) => blockItem(k.kind, k.name, k.summary)),
        ],
        slash.query,
      )
    : [];

  // --- getting a new document onto the canvas ----------------------------------------------------
  //
  // First of the effects, on purpose: everything below that reads the frame — the outline, the
  // dimming, the overlay, the block to open for typing — keys on `doc`, and has to find the new
  // body already there.
  useEffect(() => {
    if (doc === showing.current) return;
    const inner = frame.current?.contentDocument;
    const next = splitDocument(doc);
    const prev = splitDocument(showing.current);
    showing.current = doc;
    if (!pendingLoad.current && inner?.body && inner.readyState === 'complete' && next && prev && next.shell === prev.shell) {
      inner.body.innerHTML = next.body;
      return;
    }
    // The head moved — a design token, a rule a new block needs — or the frame is not there yet:
    // the whole document, the slow way, which is still the only correct way for those.
    pendingLoad.current = true;
    setLoaded(doc);
  }, [doc]);

  // --- height, and holding the reader's place ---------------------------------------------------
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let observer: ResizeObserver | null = null;

    const measure = () => {
      const inner = el.contentDocument;
      if (!inner?.documentElement) return;
      const measured = inner.documentElement.getBoundingClientRect().height;
      if (measured < PLAUSIBLE) return; // mid-update; keep what we had
      lastGood.current = measured;
      setHeight(measured);
    };

    const onLoad = () => {
      measure();
      observer?.disconnect();
      const root = el.contentDocument?.documentElement;
      if (root) {
        observer = new ResizeObserver(measure);
        observer.observe(root);
      }
      setReady((n) => n + 1);
    };

    // A real load — the frame has the document `loaded` names now. The immediate call below is for
    // a document that is already there: on mount, and after a body was patched into it.
    const onRealLoad = () => {
      pendingLoad.current = false;
      onLoad();
    };
    el.addEventListener('load', onRealLoad);
    if (el.contentDocument?.readyState === 'complete') onLoad();
    return () => {
      el.removeEventListener('load', onRealLoad);
      observer?.disconnect();
    };
  }, [doc]);

  // --- clicking selects, dragging reorders, double-clicking edits --------------------------------
  useEffect(() => {
    const inner = frame.current?.contentDocument;
    if (!inner || !onSelect || plain) return;

    const blockAt = (target: EventTarget | null) =>
      (target as Element | null)?.closest?.('[data-sy-block]') as HTMLElement | null;

    // --- the spacing overlay, on hover ---
    const onMouseOver = (event: MouseEvent) => {
      if (spacingRef.current || editing.current || slashRef.current || drag.current?.active) return;
      const id = blockAt(event.target)?.dataset['syBlock'] ?? null;
      if (id === hovered.current) return;
      hovered.current = id;
      setSpaces(id ? measureSpacing(id) : []);
    };
    // `mouseout` with no `relatedTarget` is the pointer leaving the document. Not `mouseleave` on
    // `documentElement`: the frame's first document, before its `srcdoc` has parsed, has no root
    // element at all, and a listener effect that throws on it takes every effect queued behind it
    // down with it — the canvas simply stopped updating (learnings 3.61).
    const onMouseOut = (event: MouseEvent) => {
      if (event.relatedTarget) return;
      hovered.current = null;
      if (!spacingRef.current) setSpaces([]);
    };

    const onClick = (event: MouseEvent) => {
      // Links inside the preview are content, not navigation — clicking one means "select this".
      event.preventDefault();
      if (slashRef.current?.mode === 'insert') setSlash(null);
      setMenu(null);
      setTypeMenu(null);
      if (editing.current) return;
      const found = blockAt(event.target);
      if (found?.dataset['syBlock'] && found.dataset['sySection']) {
        onSelect(found.dataset['syBlock'], found.dataset['sySection'], event.shiftKey);
        return;
      }
      // Not on a block: the gap between columns, an empty slot, a group's padding. That is the
      // row itself, and clicking it selects the row — which used to take a trip to Layers.
      const sectionId = sectionAt(event.target);
      if (sectionId) onSelectSectionRef.current?.(sectionId);
    };

    // Copy and paste with nothing open for editing: the app's, through the frame's events. While
    // editing, the browser's own copy and the sanitised paste below are what happen.
    const onCopy = (event: ClipboardEvent) => {
      if (editing.current) return;
      onClipboard?.(event, 'copy');
    };
    const onPasteBlocks = (event: ClipboardEvent) => {
      if (editing.current) return;
      onClipboard?.(event, 'paste');
    };

    // --- inline text editing ---
    const stopEditing = (commit: boolean) => {
      const session = editing.current;
      if (!session) return;
      editing.current = null;
      setEditHint(null);
      setSlash(null);
      linking.current = false;
      session.el.removeAttribute('contenteditable');
      session.el.removeAttribute('data-sy-text-editing');
      // Rich text reads back as markup, through the same reduction paste goes through — so what
      // the browser left behind (a `<div>` for a line break, a `<font>` from an old shortcut) never
      // reaches the document either.
      const next = session.rich
        ? fromContentEditable(session.el.innerHTML)
        : (session.el.textContent ?? '').trim();
      if (commit && next !== session.original) onEditText?.(session.blockId, session.path, next);
      else if (!commit) {
        if (session.rich) session.el.innerHTML = session.original;
        else session.el.textContent = session.original;
      }
    };

    /** Opens a block's text for editing. The double-click, Enter and the slash menu all land here. */
    const beginEditing = (blockId: string): boolean => {
      const target = textTargets?.[blockId];
      if (!target) return false; // images and the rest: the inspector is the way in
      const found = inner.querySelector(`[data-sy-block="${CSS.escape(blockId)}"]`) as HTMLElement | null;
      const el = found?.querySelector(target.selector) as HTMLElement | null;
      if (!el) return false;

      stopEditing(true);
      const rich = Boolean(target.rich);
      // The overlay goes the moment the caret arrives. It draws the structure around a block, and
      // a block being written is not being looked at that way; it would also sit over the words.
      hovered.current = null;
      setSpaces([]);
      editing.current = {
        el,
        blockId,
        path: target.path,
        original: rich ? fromContentEditable(el.innerHTML) : (el.textContent ?? ''),
        rich,
      };
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('data-sy-text-editing', '');
      el.focus();
      if (rich) {
        // Tags, not inline styles: `styleWithCSS` off makes the browser emit `<b>` rather than a
        // styled span. The sanitiser copes with either on the way out, but markup the designer
        // might read is worth more than markup only a parser will.
        try {
          inner.execCommand('styleWithCSS', false, 'false');
        } catch {
          // Firefox throws when the document is not editable yet; the default is what we want.
        }
      }
      const box = el.getBoundingClientRect();
      setEditHint({ top: Math.max(1, box.top - 24), left: Math.max(1, box.left), rich });
      const range = inner.createRange();
      range.selectNodeContents(el);
      inner.getSelection()?.removeAllRanges();
      inner.getSelection()?.addRange(range);
      return true;
    };

    const onDoubleClick = (event: MouseEvent) => {
      const found = blockAt(event.target);
      const blockId = found?.dataset['syBlock'];
      if (!blockId) return;
      // A freeform block opens as a workspace; everything with words opens for typing.
      if (found?.querySelector('svg[data-sy-freeform]')) {
        surfaceRef.current.onEnterSurface?.(blockId);
        return;
      }
      beginEditing(blockId);
    };

    // --- the slash menu ---
    //
    // Everything below reads the live selection rather than remembering where the slash was
    // typed: the caret's own text node, sliced at the caret, is the only place the query can be,
    // and re-deriving it on every keystroke is what keeps the menu honest when the browser
    // splits or merges text nodes underneath it.

    const exec = (command: string, value?: string) => {
      try {
        inner.execCommand(command, false, value);
      } catch {
        // A command the browser does not know is a no-op, not a broken editor.
      }
    };

    /** The text in the caret's own node up to the caret; '' in an empty element; null with no caret. */
    const textBeforeCaret = (): string | null => {
      const sel = inner.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return node.childNodes.length === 0 ? '' : null;
      return (node.textContent ?? '').slice(0, range.startOffset);
    };

    /** The paragraph, heading, item or quote the caret is in — inside the editable, or null. */
    const blockOfCaret = (): HTMLElement | null => {
      const sel = inner.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const node = sel.getRangeAt(0).startContainer;
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const block = el?.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, div, td') as HTMLElement | null;
      return block && editing.current?.el.contains(block) ? block : null;
    };

    const inList = (): boolean => {
      const sel = inner.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      const node = sel.getRangeAt(0).startContainer;
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      return Boolean(el?.closest('li') && editing.current?.el.contains(el));
    };

    /** Removes `count` characters before the caret, in the caret's own text node. */
    const deleteBeforeCaret = (count: number) => {
      const sel = inner.getSelection();
      if (!sel || sel.rangeCount === 0 || count <= 0) return;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return;
      const del = inner.createRange();
      del.setStart(node, Math.max(0, range.startOffset - count));
      del.setEnd(node, range.startOffset);
      del.deleteContents();
    };

    /** Takes the `/query` out of the text before a command runs, so the words never ship. */
    const removeSlashText = () => {
      const before = textBeforeCaret();
      const found = before === null ? null : slashQuery(before);
      if (found) deleteBeforeCaret(before!.length - found.at);
    };

    /** Where the caret is, for placing the menu. Falls back to the element around an empty caret. */
    const caretBox = (): DOMRect | null => {
      const sel = inner.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        const node = range.startContainer;
        const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
        if (el) rect = el.getBoundingClientRect();
      }
      return rect;
    };

    /** A menu position below a rect, kept inside the frame's width. */
    const place = (rect: DOMRect): { top: number; left: number } => {
      const width = frame.current?.getBoundingClientRect().width ?? 600;
      return { top: rect.bottom + 6, left: Math.max(4, Math.min(rect.left, width - 276)) };
    };

    const itemsFor = (state: SlashState): SlashItem[] => {
      const kinds = quickAddRef.current?.kinds ?? [];
      const blocks = kinds.map((k) => blockItem(k.kind, k.name, k.summary));
      // The last few added, first — only while nothing has been typed, because once there is a
      // query the same block twice in one list is noise rather than help.
      const recent = state.query
        ? []
        : (quickAddRef.current?.recent ?? [])
            .map((kind) => kinds.find((k) => k.kind === kind))
            .filter((k): k is NonNullable<typeof k> => Boolean(k))
            .map((k) => blockItem(k.kind, k.name, k.summary, 'recent'));
      // Formatting only where there is markup to format: a heading or a button label is one line
      // of plain text, so the menu on those offers the add-a-block half alone.
      const formats = state.mode === 'format' && editing.current?.rich ? FORMAT_COMMANDS : [];
      return filterItems([...recent, ...formats, ...blocks], state.query);
    };

    /** The selection, or the whole block when nothing is selected, wrapped in an inline tag. */
    const wrapInline = (tag: string) => {
      const sel = inner.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      let range = sel.getRangeAt(0);
      if (range.collapsed) {
        const block = blockOfCaret();
        if (!block) return;
        range = inner.createRange();
        range.selectNodeContents(block);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      const holder = inner.createElement('div');
      holder.appendChild(range.cloneContents());
      exec('insertHTML', `<${tag}>${holder.innerHTML}</${tag}>`);
    };

    const openLink = () => {
      const session = editing.current;
      if (!session || !session.rich) return;
      const sel = inner.getSelection();
      linkRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      linking.current = true;
      const rect = caretBox() ?? session.el.getBoundingClientRect();
      setSlash({ mode: 'link', query: '', index: 0, ...place(rect) });
    };

    const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    const applyLink = (url: string) => {
      const session = editing.current;
      linking.current = false;
      setSlash(null);
      if (!session) return;
      session.el.focus();
      const sel = inner.getSelection();
      const range = linkRange.current;
      if (sel && range) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      const typed = url.trim();
      if (!typed) return;
      // A bare domain is what people type; the scheme is what a mail client needs.
      const href = /^(https?:|mailto:|tel:|#)/i.test(typed) ? typed : `https://${typed}`;
      // With nothing selected there is nothing to link, so the address becomes the words.
      if (!range || range.collapsed) exec('insertHTML', `<a href="${escapeAttr(href)}">${escapeAttr(href)}</a>`);
      else exec('createLink', href);
    };

    const cancelLink = () => {
      const session = editing.current;
      linking.current = false;
      setSlash(null);
      if (!session) return;
      session.el.focus();
      const sel = inner.getSelection();
      if (sel && linkRange.current) {
        sel.removeAllRanges();
        sel.addRange(linkRange.current);
      }
    };

    const runExec = (command: Exec) => {
      const session = editing.current;
      if (!session) return;
      session.el.focus();
      switch (command.command) {
        case 'formatBlock':
          exec('formatBlock', command.value);
          break;
        case 'link':
          openLink();
          break;
        case 'wrap':
          wrapInline(command.tag);
          break;
        default:
          exec(command.command);
      }
    };

    const pick = (item: SlashItem) => {
      const state = slashRef.current;
      const session = editing.current;
      // The query comes out of the text *before* anything commits, or "/head" ships in the copy.
      if (state?.mode === 'format' && session) removeSlashText();
      setSlash(null);
      if (item.group === 'format' && item.exec) {
        runExec(item.exec);
        return;
      }
      if ((item.group === 'block' || item.group === 'recent') && item.kind) {
        const after = session?.blockId ?? selectedRef.current;
        const kind = item.kind;
        if (session) stopEditing(true);
        // A tick later, not now. Finishing the edit commits it through a functional update, but
        // the app's `onAdd` computes the new document from the template *its* render captured —
        // one commit behind — and would write over the words just typed. By the next task the
        // app has re-rendered and the ref holds a handler that knows about the edit.
        setTimeout(() => quickAddRef.current?.onAdd(kind, after), 0);
      }
    };

    /** The add-a-block menu on the selected block, with no editable involved. */
    const openQuickAdd = () => {
      if (editing.current) return;
      const at = barRef.current;
      // The keys that filter the menu arrive in this document's listener, so when the menu was
      // opened from a side panel — `/` with focus on a layer row — focus comes here with it.
      frame.current?.contentWindow?.focus();
      hovered.current = null;
      setSpaces([]);
      setSlash({ mode: 'insert', query: '', index: 0, top: at ? at.top + 28 : 12, left: at ? at.left : 12 });
    };

    actions.current = { pick, applyLink, cancelLink, beginEditing, openQuickAdd };

    /**
     * The Markdown habits — "- ", "1. ", "# ", "> " — read once the space is in, and only when the
     * marker is all the line holds. On `input` rather than on the space's keydown, so it works
     * however the space arrives: a keyboard, an IME, dictation. True when it did something.
     */
    const markdownAfterInput = (): boolean => {
      const session = editing.current;
      if (!session?.rich) return false;
      const before = textBeforeCaret();
      if (before === null || !/[ \u00a0]$/.test(before)) return false;
      const block = blockOfCaret();
      const plain = (t: string) => t.replace(/\u00a0/g, ' ').trim();
      if (!block || plain(block.textContent ?? '') !== plain(before)) return false;
      const shortcut = markdownShortcut(before.slice(0, -1));
      if (!shortcut) return false;
      const list = shortcut.command === 'insertUnorderedList' || shortcut.command === 'insertOrderedList';
      if (list && inList()) return false;
      deleteBeforeCaret(before.length);
      runExec(shortcut);
      return true;
    };

    /** After every keystroke in an editable: a marker just finished, or a `/query` before the caret? */
    const onInput = () => {
      if (!editing.current) return;
      const state = slashRef.current;
      if (state?.mode === 'link') return;
      if (markdownAfterInput()) return;
      const before = textBeforeCaret();
      const found = before === null ? null : slashQuery(before);
      if (found && dismissed.current !== found.at) {
        if (state?.mode === 'format') setSlash({ ...state, query: found.query, index: 0 });
        else {
          const rect = caretBox();
          if (rect) setSlash({ mode: 'format', query: found.query, index: 0, ...place(rect) });
        }
        return;
      }
      if (!found) dismissed.current = null;
      if (state?.mode === 'format') setSlash(null);
    };

    /** The keys the app's own keyboard policy answers to, forwarded from inside the frame. */
    const forwards = (event: KeyboardEvent): boolean => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta) return ['z', 'd', 's', 'e', 'g'].includes(event.key.toLowerCase());
      return ['Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', '?'].includes(event.key);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const state = slashRef.current;
      const session = editing.current;

      // --- the menu has the keys while it is open ---
      if (state && state.mode !== 'link') {
        const items = itemsFor(state);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const n = Math.max(1, items.length);
          const step = event.key === 'ArrowDown' ? 1 : n - 1;
          setSlash({ ...state, index: (state.index + step) % n });
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          const item = items[state.index];
          if (item) pick(item);
          else setSlash(null);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          if (state.mode === 'format') {
            const before = textBeforeCaret();
            dismissed.current = before === null ? null : (slashQuery(before)?.at ?? null);
          }
          setSlash(null);
          return;
        }
        if (state.mode === 'insert') {
          // No editable to type into, so the query is kept by hand.
          if (event.key === 'Backspace') {
            event.preventDefault();
            if (!state.query) setSlash(null);
            else setSlash({ ...state, query: state.query.slice(0, -1), index: 0 });
            return;
          }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            setSlash({ ...state, query: state.query + event.key, index: 0 });
            return;
          }
        }
      }

      if (!session) {
        // Not editing. `/` and ⌘K open the add-a-block menu here, where the position is known.
        const meta = event.metaKey || event.ctrlKey;
        if ((event.key === '/' && !meta && !event.shiftKey) || (meta && event.key.toLowerCase() === 'k')) {
          event.preventDefault();
          openQuickAdd();
          return;
        }
        // Everything else the canvas answers to is forwarded to the app, so there is still one
        // keyboard policy and it lives there. The canvas is a separate document with its own event
        // path; without this a shortcut pressed after clicking a block would stop at the frame.
        if (forwards(event)) {
          event.preventDefault();
          window.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: event.key,
              metaKey: event.metaKey,
              ctrlKey: event.ctrlKey,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
            }),
          );
        }
        return;
      }

      // --- editing ---
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'k' && session.rich) {
        event.preventDefault();
        openLink();
        return;
      }
      if (event.key === 'Tab') {
        // In a list, Tab indents. Anywhere else it does nothing — deliberately, because the
        // browser's default moves focus out of the editable, and that commits the edit mid-word.
        event.preventDefault();
        if (session.rich && inList()) exec(event.shiftKey ? 'outdent' : 'indent');
        return;
      }
      // Enter commits, because these are single-line fields and a line break typed into one would
      // be stripped on the way to HubL anyway. In rich text it does the opposite — Return is how
      // you write a second paragraph — so there it falls through to the browser and Escape or
      // clicking away is what finishes.
      if (event.key === 'Enter' && !session.rich) {
        event.preventDefault();
        stopEditing(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        stopEditing(false);
      }
    };

    // Clicking a menu row must not take focus — the menu suppresses its own mousedown — and the
    // link field takes it on purpose, which `linking` marks. So the only focusout that reaches
    // here is a genuine click elsewhere, which finishes the edit.
    const onFocusOut = () => {
      if (linking.current) return;
      stopEditing(true);
    };

    /**
     * Paste, reduced to what a template may carry.
     *
     * This is the whole reason rich text could not be edited here until now. Content from Word,
     * Docs or a web page arrives with `font-family: Calibri; font-size: 11pt` on every paragraph,
     * and an inline style beats the block's own size, colour and line height (learnings 3.5). The
     * default behaviour is intercepted rather than cleaned up afterwards, because "afterwards" is
     * a render the designer sees.
     */
    const onPaste = (event: ClipboardEvent) => {
      const session = editing.current;
      if (!session) return;
      event.preventDefault();
      const data = event.clipboardData;
      const html = data?.getData('text/html') ?? '';
      const plain = data?.getData('text/plain') ?? '';
      if (!session.rich) {
        // A single-line field takes the words and nothing else, newlines included.
        inner.execCommand('insertText', false, plain.replace(/\s+/g, ' ').trim());
        return;
      }
      const clean = html ? sanitise(html) : sanitise(plain.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>'));
      if (clean) inner.execCommand('insertHTML', false, clean);
    };

    // --- dragging a block to a new position ---
    //
    // The target is resolved the same way whether the block came from the palette or was already
    // on the canvas: find what is under the pointer, and say where a block dropped there would
    // land. `resolveSpot` is the one place that knows how, so the two drags cannot disagree about
    // what a given pixel means.

    /** The translucent copy that follows the pointer. Removed by `clearDrag`, always. */
    const carry = () => inner.querySelector('[data-sy-carry]') as HTMLElement | null;

    const clearDrag = () => {
      inner.documentElement.removeAttribute('data-sy-dragging');
      carry()?.remove();
      for (const el of inner.querySelectorAll('[data-sy-lifted]')) el.removeAttribute('data-sy-lifted');
      drag.current = null;
      setHint(null);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || editing.current || !onDropBlock) return;
      const found = blockAt(event.target);
      const blockId = found?.dataset['syBlock'];
      if (!blockId || !found) return;

      // On the selected freeform surface the pointer belongs to the surface: a layer under it
      // moves, and with the pen down anything under it is drawn on. Neither starts a block drag.
      const svg = blockId === selectedRef.current && (drawingRef.current || surfaceRef.current.onMoveLayer) ? (found.querySelector('svg[data-sy-freeform]') as SVGSVGElement | null) : null;
      if (svg && svg.contains(event.target as Node)) {
        const rect = svg.getBoundingClientRect();
        const scale = (Number(svg.getAttribute('width')) || rect.width) / (rect.width || 1);
        if (drawingRef.current) {
          const line = inner.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          line.setAttribute('fill', 'none');
          line.setAttribute('stroke', '#2b45d8');
          line.setAttribute('stroke-width', '3');
          line.setAttribute('stroke-linecap', 'round');
          line.setAttribute('stroke-linejoin', 'round');
          svg.appendChild(line);
          const x = (event.clientX - rect.left) * scale;
          const y = (event.clientY - rect.top) * scale;
          pen.current = { blockId, svg, left: rect.left, top: rect.top, scale, points: [x, y], line };
          line.setAttribute('points', `${x},${y}`);
          event.preventDefault();
          return;
        }
        const target = (event.target as Element | null)?.closest?.('[data-sy-layer]') as Element | null;
        const layerId = target?.getAttribute('data-sy-layer');
        if (layerId) {
          layerDrag.current = { blockId, layerId, x: event.clientX, y: event.clientY, scale, moved: false };
          // Picked as it is grabbed, so the panel shows the numbers that are about to move.
          surfaceRef.current.onSelectLayer?.(blockId, layerId);
          event.preventDefault();
          return;
        }
      }
      const box = found.getBoundingClientRect();
      drag.current = {
        blockId,
        y: event.clientY,
        active: false,
        spot: null,
        // Where inside the block it was grabbed, so the copy stays under the same point of the
        // pointer rather than snapping its corner to the cursor.
        grabX: event.clientX - box.left,
        grabY: event.clientY - box.top,
        width: box.width,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const stroke = pen.current;
      if (stroke) {
        const x = (event.clientX - stroke.left) * stroke.scale;
        const y = (event.clientY - stroke.top) * stroke.scale;
        stroke.points.push(x, y);
        const pts: string[] = [];
        for (let i = 0; i + 1 < stroke.points.length; i += 2) pts.push(`${stroke.points[i]},${stroke.points[i + 1]}`);
        stroke.line.setAttribute('points', pts.join(' '));
        return;
      }
      const moving = layerDrag.current;
      if (moving) {
        const dx = (event.clientX - moving.x) * moving.scale;
        const dy = (event.clientY - moving.y) * moving.scale;
        if (!moving.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        moving.moved = true;
        moving.x = event.clientX;
        moving.y = event.clientY;
        surfaceRef.current.onMoveLayer?.(moving.blockId, moving.layerId, dx, dy);
        return;
      }
      const state = drag.current;
      if (!state) return;
      if (!state.active) {
        if (Math.abs(event.clientY - state.y) < 5) return;
        state.active = true;
        inner.documentElement.setAttribute('data-sy-dragging', '');
        // The overlay would sit under the copy in your hand and over the target; neither helps.
        hovered.current = null;
        setSpaces([]);

        const source = inner.querySelector(`[data-sy-block="${CSS.escape(state.blockId)}"]`) as HTMLElement | null;
        if (source) {
          source.setAttribute('data-sy-lifted', '');
          const clone = source.cloneNode(true) as HTMLElement;
          clone.removeAttribute('data-sy-lifted');
          clone.removeAttribute('data-sy-selected');
          clone.removeAttribute('data-sy-block');
          clone.setAttribute('data-sy-carry', '');
          clone.style.width = `${state.width}px`;
          inner.body.appendChild(clone);
        }
      }

      const held = carry();
      if (held) {
        held.style.left = `${event.clientX - state.grabX}px`;
        held.style.top = `${event.clientY - state.grabY}px`;
      }
      // A block cannot be dropped onto itself, and offering it as a target makes the indicator
      // flicker under the pointer the whole way down.
      const found = probeAt(event.clientX, event.clientY, state.blockId);
      state.spot = found?.spot ?? null;
      setHint(found?.hint ?? null);
    };

    const onPointerUp = () => {
      const stroke = pen.current;
      if (stroke) {
        pen.current = null;
        stroke.line.remove();
        surfaceRef.current.onDrawPath?.(stroke.blockId, stroke.points);
        return;
      }
      if (layerDrag.current) {
        layerDrag.current = null;
        return;
      }
      const state = drag.current;
      if (state?.active && state.spot) onDropBlock?.(state.blockId, state.spot);
      clearDrag();
    };

    inner.addEventListener('mouseover', onMouseOver);
    inner.addEventListener('mouseout', onMouseOut);
    inner.addEventListener('click', onClick);
    inner.addEventListener('dblclick', onDoubleClick);
    inner.addEventListener('keydown', onKeyDown);
    inner.addEventListener('input', onInput);
    inner.addEventListener('focusout', onFocusOut);
    inner.addEventListener('paste', onPaste);
    inner.addEventListener('paste', onPasteBlocks);
    inner.addEventListener('copy', onCopy);
    inner.addEventListener('pointerdown', onPointerDown);
    inner.addEventListener('pointermove', onPointerMove);
    inner.addEventListener('pointerup', onPointerUp);
    inner.addEventListener('pointercancel', clearDrag);

    return () => {
      inner.removeEventListener('mouseover', onMouseOver);
      inner.removeEventListener('mouseout', onMouseOut);
      inner.removeEventListener('click', onClick);
      inner.removeEventListener('dblclick', onDoubleClick);
      inner.removeEventListener('keydown', onKeyDown);
      inner.removeEventListener('input', onInput);
      inner.removeEventListener('focusout', onFocusOut);
      inner.removeEventListener('paste', onPaste);
      inner.removeEventListener('paste', onPasteBlocks);
      inner.removeEventListener('copy', onCopy);
      inner.removeEventListener('pointerdown', onPointerDown);
      inner.removeEventListener('pointermove', onPointerMove);
      inner.removeEventListener('pointerup', onPointerUp);
      inner.removeEventListener('pointercancel', clearDrag);
    };
  }, [ready, onSelect, onEditText, onDropBlock, textTargets, onClipboard, plain]);

  // --- a drag that started in the palette --------------------------------------------------------
  //
  // The chip in the sidebar captures the pointer, so its `pointermove` keeps firing in this
  // document even while the pointer is over the frame — which is why no invisible overlay is needed
  // to catch events the iframe would otherwise swallow.
  useEffect(() => {
    if (!probe) {
      setHint(null);
      return;
    }
    hovered.current = null;
    setSpaces([]);
    const box = frame.current?.getBoundingClientRect();
    const found = box ? probeAt(probe.x - box.left, probe.y - box.top, null) : null;
    setHint(found?.hint ?? null);
    onProbe?.(found?.spot ?? null);
    // `onProbe` is deliberately not a dependency: it is rebuilt every render by the caller, and
    // depending on it would re-resolve on every keystroke elsewhere in the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe?.x, probe?.y, ready]);

  // --- the rows, measured whenever the document or its height moves ------------------------------
  useEffect(() => {
    setRows(measureRows());
    // `measureRows` reads refs and the live document; it is not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, doc, height, sections]);

  // The dividers follow the selected row of columns, re-measured with the rows.
  useEffect(() => {
    setDividers(measureDividers(selectedSection ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, doc, height, selectedSection]);

  // A menu is about a row as it was; a changed document closes it. Escape and a click anywhere
  // outside it do too. The type menu takes the arrow keys and Enter while it is up.
  useEffect(() => {
    setMenu(null);
    setTypeMenu(null);
  }, [doc]);
  useEffect(() => {
    if (!menu && !typeMenu) return;
    const onDown = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.('.sy-rowmenu, .sy-bar, .sy-slash')) {
        setMenu(null);
        setTypeMenu(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      const open = typeMenuRef.current;
      if (event.key === 'Escape') {
        setMenu(null);
        setTypeMenu(null);
        return;
      }
      if (!open) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const n = Math.max(1, open.items.length);
        setTypeMenu({ ...open, index: (open.index + (event.key === 'ArrowDown' ? 1 : n - 1)) % n });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const item = open.items[open.index];
        setTypeMenu(null);
        if (item) open.pick(item);
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menu, typeMenu]);

  // --- the spacing overlay, pinned to a block or following the pointer ---------------------------
  //
  // Re-measured on every load and every resize of the document: a dial tick reloads the frame,
  // and an image arriving moves everything under it. `height` is the resize signal — the same
  // measurement that keeps the frame the size of its content.
  useEffect(() => {
    const id = spacing ?? hovered.current;
    setSpaces(id ? measureSpacing(id) : []);
    // `measureSpacing` reads refs and the live document; it is not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, spacing, height, doc]);

  // --- dimming, for the editability view --------------------------------------------------------
  useEffect(() => {
    const inner = frame.current?.contentDocument;
    if (!inner) return;
    for (const el of inner.querySelectorAll('[data-sy-dim]')) el.removeAttribute('data-sy-dim');
    for (const id of dim ?? []) {
      inner.querySelector(`[data-sy-block="${CSS.escape(id)}"]`)?.setAttribute('data-sy-dim', '');
    }
  }, [ready, dim, doc]);

  // --- a block the slash menu just added, opened for editing as soon as it is on the canvas -----
  useEffect(() => {
    if (!autoEdit || autoEdited.current === autoEdit) return;
    const inner = frame.current?.contentDocument;
    // Not on the canvas yet — the preview lags the document by a beat, and an add reloads the
    // frame twice (once for the selection, once for the document) — so wait for the load that
    // has it. Once, though: the second load arrives before the app has cleared the request.
    if (!inner?.querySelector(`[data-sy-block="${CSS.escape(autoEdit)}"]`)) return;
    autoEdited.current = autoEdit;
    actions.current?.beginEditing(autoEdit);
    onAutoEdited?.();
    // `onAutoEdited` is rebuilt every render by the caller and deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, autoEdit, doc]);

  // --- selection outline, applied to the live document ------------------------------------------
  useEffect(() => {
    const inner = frame.current?.contentDocument;
    if (!inner) return;
    for (const el of inner.querySelectorAll('[data-sy-selected]')) el.removeAttribute('data-sy-selected');
    // A row selected as itself is outlined as a band, dashed, so it reads as structure.
    for (const el of inner.querySelectorAll('[data-sy-selected-section]')) el.removeAttribute('data-sy-selected-section');
    if (selectedSection) {
      for (const band of inner.querySelectorAll('.hse-section')) {
        if (idOfBand(band) === selectedSection) band.setAttribute('data-sy-selected-section', '');
      }
    }
    // The run first, then the primary: the primary carries the bar, the rest carry the outline.
    for (const id of alsoSelected ?? []) {
      inner.querySelector(`[data-sy-block="${CSS.escape(id)}"]`)?.setAttribute('data-sy-selected', '');
    }
    if (!selected) {
      setBar(null);
      return;
    }
    const found = inner.querySelector(`[data-sy-block="${CSS.escape(selected)}"]`) as HTMLElement | null;
    found?.setAttribute('data-sy-selected', '');
    // The picked layer on a freeform surface, and the pen's cursor while it is down.
    for (const el of inner.querySelectorAll('[data-sy-layer-on]')) el.removeAttribute('data-sy-layer-on');
    if (layer) found?.querySelector(`[data-sy-layer="${CSS.escape(layer)}"]`)?.setAttribute('data-sy-layer-on', '');
    if (drawing) inner.documentElement.setAttribute('data-sy-drawing', '');
    else inner.documentElement.removeAttribute('data-sy-drawing');
    if (!found) {
      setBar(null);
      return;
    }
    // The frame has no scroll of its own — it is sized to its content — so a rect measured inside
    // it is already in the coordinates the overlay is positioned in.
    const box = found.getBoundingClientRect();
    setBar({ top: Math.max(1, box.top - 25), left: Math.max(1, box.left), ...(found.dataset['sySection'] ? { sectionId: found.dataset['sySection'] } : {}) });
    // `selectedSection` is in the deps below; `idOfBand` reads nothing that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected, alsoSelected, selectedSection, layer, drawing, doc]);

  return (
    <div class="preview-frame" style={{ width: `${width}px` }}>
      {!plain && (<>
      {spaces.map((s) => (
        <div
          key={s.key}
          class={`sy-space sy-space-${s.kind}`}
          style={{ top: `${s.top}px`, left: `${s.left}px`, width: `${s.width}px`, height: `${s.height}px` }}
          aria-hidden="true"
        >
          {/* Centred on the strip's own axis however thin the strip is, so a 16px gutter reads as
              16 *on* the gutter rather than beside it. A label, not a handle: dragging the number
              was built and pulled the same day (learnings 3.60) — it comes back once the rest of
              the spacing story is settled. */}
          <span class="sy-space-label">{Math.round(s.value)}</span>
        </div>
      ))}
      {hint?.frame && (
        <div
          class="sy-hint sy-hint-frame"
          style={{ top: `${hint.frame.top}px`, left: `${hint.frame.left}px`, width: `${hint.frame.width}px`, height: `${hint.frame.height}px` }}
        />
      )}
      {hint && (
        <div
          class={`sy-hint ${hint.box ? 'box' : ''}`}
          style={{ top: `${hint.top}px`, left: `${hint.left}px`, width: `${hint.width}px`, height: `${hint.height}px` }}
        />
      )}
      {editHint && !slash && (
        // Not a toolbar: a reminder of the two keys that matter, gone the moment the menu opens.
        <div class="sy-edit-hint" style={{ top: `${editHint.top}px`, left: `${editHint.left}px` }} aria-hidden="true">
          {editHint.rich ? (
            <>
              <kbd>/</kbd> format · <kbd>⌘K</kbd> link · <kbd>esc</kbd> done
            </>
          ) : (
            <>
              <kbd>/</kbd> add below · <kbd>↵</kbd> done · <kbd>esc</kbd> cancel
            </>
          )}
        </div>
      )}
      {slash && slash.mode !== 'link' && (
        <SlashMenu
          items={itemsShown}
          index={slash.index}
          top={slash.top}
          left={slash.left}
          query={slash.query}
          onPick={(item) => actions.current?.pick(item)}
          onHover={(index) => setSlash({ ...slash, index })}
        />
      )}
      {slash && slash.mode === 'link' && (
        <LinkField top={slash.top} left={slash.left} onSubmit={(url) => actions.current?.applyLink(url)} onCancel={() => actions.current?.cancelLink()} />
      )}
      {rows.map((row, i) => {
        // Only the row selected as itself. A lone block has the block bar below instead; a row
        // with a block selected inside it is reached through that block's ⋯.
        if (selectedSection !== row.sectionId || row.kind === 'block') return null;
        const top = Math.max(1, row.top - 25);
        const left = row.left + 1;
        const Glyph = row.glyph === 'columns' ? ColumnsIcon : row.glyph === 'group' ? GroupIcon : BLOCK_ICONS[row.glyph];
        return (
          <div key={row.sectionId} class="sy-bar" style={{ top: `${top}px`, left: `${left}px` }}>
            <button class="sy-bar-name" title="Change what this row is: how many columns, or back to sections." onClick={() => openRowTypes(row.sectionId, top + 27, left)}>
              <Glyph />
              {row.label}
            </button>
            {rowMenu && (
              <button title="Phones, background, and the rest." aria-label="Row menu" onClick={() => openMenu(row.sectionId, top + 27, left)}>
                ⋯
              </button>
            )}
            <button disabled={i === 0} title="Move up" aria-label="Move up" onClick={() => onMoveSection?.(row.sectionId, -1)}>
              ↑
            </button>
            <button disabled={i === rows.length - 1} title="Move down" aria-label="Move down" onClick={() => onMoveSection?.(row.sectionId, 1)}>
              ↓
            </button>
            <button title="Duplicate" aria-label="Duplicate" onClick={() => onDuplicateSection?.(row.sectionId)}>
              ⧉
            </button>
            <button class="danger" title="Delete the row and everything in it. Undo is offered." aria-label="Delete" onClick={() => onDeleteSection?.(row.sectionId)}>
              ✕
            </button>
          </div>
        );
      })}
      {dividers.map((d) => (
        // The divider between two columns of the selected row. Drag it and the two trade share.
        <div
          key={`${d.sectionId}-${d.index}`}
          class="sy-col-divider"
          style={{ top: `${d.top}px`, left: `${d.left}px`, height: `${d.height}px` }}
          title="Drag to change how the row is shared between these columns."
          onPointerDown={(e) => grabDivider(e, d.sectionId, d.index)}
          onPointerMove={moveDivider}
          onPointerUp={dropDivider}
          onPointerCancel={dropDivider}
        />
      ))}
      {typeMenu && (
        <SlashMenu
          items={typeMenu.items}
          index={typeMenu.index}
          top={typeMenu.top}
          left={typeMenu.left}
          query=""
          title={typeMenu.title}
          onPick={(item) => {
            setTypeMenu(null);
            typeMenu.pick(item);
          }}
          onHover={(index) => setTypeMenu({ ...typeMenu, index })}
        />
      )}
      {menu && rowMenu && (
        <RowMenu spec={rowMenu(menu.sectionId)} top={menu.top} left={menu.left} onClose={() => setMenu(null)} />
      )}
      {bar && selectedLabel && (
        // Rendered in the editor's own document rather than injected into the email, so nothing
        // here can reach the exported template — the same discipline as `annotate`.
        <div class="sy-bar" style={{ top: `${bar.top}px`, left: `${bar.left}px` }}>
          {onConvert && selected && convertible?.length ? (
            <button class="sy-bar-name" title="Change what this block is — a heading, text, a button…" onClick={() => openBlockTypes(selected, bar.top + 27, bar.left)}>
              {selectedKind && BLOCK_ICONS[selectedKind] ? (() => { const G = BLOCK_ICONS[selectedKind]; return <G />; })() : null}
              {selectedLabel}
            </button>
          ) : (
            <span class="sy-bar-name">{selectedLabel}</span>
          )}
          {rowMenu && bar.sectionId && (
            <button title="Columns, background, and the rest — for the row this block is in." aria-label="Row menu" onClick={() => openMenu(bar.sectionId!, bar.top + 27, bar.left)}>
              ⋯
            </button>
          )}
          <button disabled={!canNudgeUp} title="Move up" aria-label="Move up" onClick={() => onNudge?.(-1)}>
            ↑
          </button>
          <button disabled={!canNudgeDown} title="Move down" aria-label="Move down" onClick={() => onNudge?.(1)}>
            ↓
          </button>
          <button title="Duplicate" aria-label="Duplicate" onClick={() => onDuplicate?.()}>
            ⧉
          </button>
          <button
            class="danger"
            title="Delete. It happens straight away and offers Undo."
            aria-label="Delete"
            onClick={() => onDelete?.()}
          >
            ✕
          </button>
        </div>
      )}
      </>)}
      <iframe
        ref={(el) => {
          frame.current = el;
          frameRef?.(el);
        }}
        title="Email preview"
        srcdoc={loaded}
        scrolling="no"
        // The compiled email is our own output, but it is still rendered as a document: sandboxing
        // it keeps a pasted <script> in someone's rich text from running inside the editor.
        sandbox="allow-same-origin"
        style={{ width: '100%', height: `${Math.max(height, lastGood.current)}px` }}
      />
    </div>
  );
}
