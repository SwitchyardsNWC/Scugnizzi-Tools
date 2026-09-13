import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { compile } from '../compile/compile.ts';
import { simulateDark } from '../compile/dark.ts';
import { withLocalAssets } from './local-assets.ts';
import { revealInCanvas } from './reveal.ts';
import { fileNameFor, foreignImages, rasterise, textOf, xhtmlOf } from './rasterise.ts';
import { branchVariables, defaultsOf } from '../compile/branches.ts';
import { lint, type Finding } from '../compile/lint.ts';
import type { Branch } from '../compile/serialize.ts';
import { isPatternKind, patternIdOf, type PaletteKind, type PatternCard } from './Palette.tsx';
import { importV1 } from '../model/import-v1.ts';
import {
  download,
  downloadBlob,
  isWriteRefused,
  openFolder,
  restoreFolder,
  supportsFolders,
  workspaceFromFiles,
  type AssetFile,
  type TemplateFile,
  type Workspace,
} from '../workspace/workspace.ts';
import { Preview, type DropSpot, type PreviewApi, type RowInfo, type RowMenuSpec } from './Preview.tsx';
import { SHORTCUTS } from './slash.ts';
import { COLUMN_BLOCKS } from '../compile/blocks/index.ts';
import { InboxChrome } from './Inbox.tsx';
import { Sidebar, type Tab } from './Sidebar.tsx';
import { Inspector } from './Inspector.tsx';
import { Surface, type SurfaceApi } from './Surface.tsx';
import { Editability } from './Editability.tsx';
import {
  allBlocks,
  designSystemOf,
  detachFromFolderSystem,
  duplicateTemplate,
  followFolderSystem,
  groupIntoStack,
  isStack,
  insertBlocksAt,
  insertBlocksInColumn,
  lockedBlockIds,
  materialiseFolderSystem,
  moveSections,
  pasteSection,
  renderAsImage,
  RATIOS,
  siteOf,
  stackOf,
} from '../model/edit.ts';
import { canStack, STACKABLE } from '../model/catalog.ts';
import { drawPath, nudgeLayer } from '../model/freeform.ts';
import { clipText, parseClip } from '../model/clipboard.ts';
import {
  applyPattern,
  detachPattern,
  instanceOf,
  patternFromSection,
  placePattern,
  pushPattern,
  type Pattern,
} from '../model/patterns.ts';
import { fileSlug, serializeDesignSystem, serializePattern } from '../model/serialize.ts';
import { tidyTemplate } from '../model/tidy.ts';
import type { DesignSystem } from '../model/design-system.ts';
import { blankTemplate, cardTemplate } from '../model/starters.ts';
import { ADDABLE, CATALOG } from '../model/catalog.ts';
import type { Block, BlockType } from '../model/types.ts';
import type { Starter } from './Templates.tsx';
import type { PatternInfo } from './Inspector.tsx';
import { BranchIcon, CopyIcon, DesktopIcon, EyeIcon, glyphFor, InboxIcon, MoonIcon, PhoneIcon, TickIcon } from './icons.tsx';
import { TEXT_TARGETS } from './inline-text.ts';
import { useEditor } from './useEditor.ts';
import starterDesign from '../../reference/v1-standard-email.design.json';

type Device = 'desktop' | 'phone';

/** Wide enough to show the page background either side of the 600px column, which is a setting. */
const WIDTHS: Record<Device, number> = { desktop: 680, phone: 375 };

/**
 * How long after the last keystroke the canvas catches up.
 *
 * Compiling is sub-millisecond, so this is not about speed. Replacing the iframe's srcdoc reloads
 * the document, and doing that on every keystroke makes the canvas flicker and fight the typist.
 * A short pause is the difference between a preview and a strobe.
 */
const CANVAS_LAG = 180;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template';
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}KB`;

/**
 * Where a new template can start.
 *
 * Three, in the order a designer is likely to want them: nothing, the thing that ships, and the
 * other look this project has produced. The standard email is the v1 import and lives here rather
 * than with the other two, because the fixture it reads is a JSON file the model does not load.
 */
const STARTERS: Starter[] = [
  {
    id: 'blank',
    name: 'Blank',
    summary: 'Just the legal footer — the one block HubSpot will not publish without. Everything else is a drag away.',
    make: blankTemplate,
  },
  {
    id: 'standard',
    name: 'Standard email',
    summary: 'The Switchyards email as it ships: top bar, stripes, hero, copy, buttons and footer, on the brand palette.',
    make: () => importV1(starterDesign as never).template,
  },
  {
    id: 'card',
    name: 'Card email',
    summary: 'A white page, a monospace face, and copy in black-bordered cards — the look of the Phase 0 probe. Its own design system comes with it.',
    make: cardTemplate,
  },
];

/** The last few block kinds added, kept across sessions. A convenience, so it lives in the browser. */
const RECENT_KEY = 'sy-recent-blocks';
const readRecent = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string').slice(0, 4) : [];
  } catch {
    return [];
  }
};
const writeRecent = (kinds: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(kinds));
  } catch {
    // Storage blocked; the list simply does not survive the tab.
  }
};

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<TemplateFile[]>([]);
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [device, setDevice] = useState<Device>('desktop');
  const [dark, setDark] = useState(false);
  /**
   * Preview: the email with every control out of the way. No bars, no outlines, no slots, no
   * panes — the canvas as the compiled email and nothing else, which is the only honest way to
   * judge it. Escape, or the eye again, brings the tools back.
   */
  const [presenting, setPresenting] = useState(false);
  /** The freeform surface: the picked layer, and whether the pen is down. Both belong to the selected block. */
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  /** A freeform block opened as a workspace of its own, in place of the email (learnings 3.67). */
  const [surfaceOf, setSurfaceOf] = useState<string | null>(null);
  const surfaceApi = useRef<SurfaceApi | null>(null);
  const [overrides, setOverrides] = useState<Branch>({});
  const [showBranches, setShowBranches] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [showCode, setShowCode] = useState(false);
  // The email in the thing that reads it, rather than on the thing that reads it.
  const [inbox, setInbox] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rasterising, setRasterising] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [tab, setTab] = useState<Tab>('layers');
  /** The folder's design systems, by name. */
  const [systems, setSystems] = useState<Record<string, DesignSystem>>({});
  /** The folder's patterns. With no folder open they still live here for the session. */
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  /** Blocks selected alongside the primary selection — a shift-click run. */
  const [also, setAlso] = useState<string[]>([]);
  /** Set while a selection change is an extension, so the run is not cleared by it. */
  const extending = useRef(false);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const noteRecent = useCallback((kind: string) => {
    if (isPatternKind(kind as PaletteKind) || kind === 'columns') return;
    setRecent((old) => {
      const next = [kind, ...old.filter((k) => k !== kind)].slice(0, 4);
      writeRecent(next);
      return next;
    });
  }, []);
  /** A block to open for editing as soon as the canvas shows it — one the slash menu just added. */
  const [autoEdit, setAutoEdit] = useState<string | null>(null);
  /** Set by an add from the slash menu, read by the effect that turns the resulting selection into `autoEdit`. */
  const wantEdit = useRef(false);
  const previewApi = useRef<PreviewApi | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * A write Chrome refused. Its own banner rather than `error`, because it has a fix: Chrome's
   * folder picker asks "Edit files" or "View files", and "View files" gives a folder that opens,
   * lists and previews and throws on every write. One click asks for the rest.
   */
  const [refused, setRefused] = useState<string | null>(null);

  // Design is a tab like the others, and also a mode you toggle from the top bar — so leaving it
  // has to land somewhere. `back` is where you were, which beats always returning to Layers: you
  // opened Design from Blocks mid-build and that is where the next block is coming from.
  const back = useRef<Tab>('layers');
  const goTab = useCallback(
    (next: Tab) => {
      setTab((current) => {
        if (current === next && next === 'design') return back.current;
        return next;
      });
      if (tab !== 'design') back.current = tab;
    },
    [tab],
  );

  // The canvas's scrollbar belongs to the pane, not the frame, so both are needed to scroll a block
  // into view — see reveal.ts.
  const scroller = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);

  const toastTimer = useRef<number | undefined>(undefined);
  const notify = useCallback((message: string, undo?: () => void) => {
    setToast({ message, ...(undo ? { undo } : {}) });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000) as unknown as number;
  }, []);

  /** A refused write from any path lands in the one banner that can fix it. */
  const failed = useCallback((cause: unknown, fallback: string) => {
    if (isWriteRefused(cause)) setRefused(cause.message);
    else setError(cause instanceof Error ? cause.message : fallback);
  }, []);

  const initial = useMemo(() => importV1(starterDesign as never).template, []);
  // A new document's first save picks a name that collides with nothing here, and once the file
  // exists the folder is re-read so the panel lists it and the editor is bound to the real entry.
  const fileNames = useMemo(() => files.map((f) => f.fileName), [files]);
  const adoptRef = useRef<(file: TemplateFile) => void>(() => {});
  const workspaceRef = useRef<Workspace | null>(null);
  workspaceRef.current = workspace;
  const onCreated = useCallback(async (fileName: string) => {
    const where = workspaceRef.current;
    if (!where) return;
    try {
      const list = await where.list();
      setFiles(list);
      const mine = list.find((f) => f.fileName === fileName);
      if (mine) adoptRef.current(mine);
    } catch {
      // The save succeeded; only the listing failed. The next save still goes to the same file.
    }
  }, []);
  const editor = useEditor({
    initial,
    workspace,
    notify,
    fileNames,
    onCreated: (name) => void onCreated(name),
    onSystemWritten: (name, system) => setSystems((old) => ({ ...old, [name]: system })),
  });
  adoptRef.current = editor.adoptFile;

  // Autosave has no click to show a dialog from, so a refusal there surfaces here, with the button.
  useEffect(() => {
    if (editor.saveError && /not allowing changes/.test(editor.saveError)) setRefused(editor.saveError);
    else if (editor.saveError) setError(editor.saveError);
  }, [editor.saveError]);

  // A layer is picked on one block; a different selection means no layer, and no pen.
  const selectedBlockId = editor.selection.kind === 'block' ? editor.selection.blockId : null;
  useEffect(() => {
    setSelectedLayer(null);
    setDrawing(false);
  }, [selectedBlockId]);
  // The workspace is about one block; it closes with the block, however the block went.
  useEffect(() => {
    if (surfaceOf && !allBlocks(editor.template).some((b) => b.id === surfaceOf && b.type === 'freeform')) setSurfaceOf(null);
  }, [surfaceOf, editor.template]);
  /** Opens a freeform block as a workspace, selecting it on the way in. */
  const enterSurface = useCallback(
    (blockId: string) => {
      const site = siteOf(editor.template, blockId);
      if (!site || site.column.blocks[site.index]?.type !== 'freeform') return;
      editor.select({ kind: 'block', sectionId: site.section.id, blockId });
      setSurfaceOf(blockId);
    },
    [editor],
  );

  // A run of selected blocks survives only an extension of itself. Any other change of selection
  // — a click, an add, a delete — is a new selection, and the run goes with the old one.
  useEffect(() => {
    if (extending.current) {
      extending.current = false;
      return;
    }
    setAlso([]);
  }, [editor.selection]);

  /** A fresh document from a starter. Offers the way back, because the one on screen may be unsaved. */
  const startNew = useCallback(
    (starter: Starter) => {
      const before = { template: editor.template, file: editor.file };
      editor.create(starter.make());
      notify(
        workspace?.canWrite ? `New template from ${starter.name}. It saves to the folder on your first edit.` : `New template from ${starter.name}.`,
        () => editor.load(before.template, before.file),
      );
    },
    [editor, notify, workspace],
  );

  /** A copy of the open template as its own file. Saved now, because a copy should exist the moment you ask. */
  const duplicateCurrent = useCallback(() => {
    const copy = duplicateTemplate(editor.template, `${editor.template.name} copy`);
    editor.create(copy, { save: true });
    notify(
      workspace?.canWrite
        ? 'Working on a copy now, saved as its own file. Rename it in Files; the original is untouched.'
        : 'Working on a copy now. Open a folder to save it.',
    );
  }, [editor, notify, workspace]);

  // --- the canvas lags the document by a beat --------------------------------------------------
  const [shownTemplate, setShownTemplate] = useState(editor.template);
  useEffect(() => {
    const id = setTimeout(() => setShownTemplate(editor.template), CANVAS_LAG);
    return () => clearTimeout(id);
  }, [editor.template]);

  const hubl = useMemo(() => compile(shownTemplate, { mode: 'hubl' }), [shownTemplate]);
  const variables = useMemo(() => branchVariables(hubl.tree), [hubl]);
  const findings = useMemo<Finding[]>(
    () => lint({ tree: hubl.tree, registry: hubl.registry, html: hubl.html, bytes: hubl.bytes, mode: 'hubl', template: editor.template }),
    [hubl],
  );
  /**
   * The branch the canvas shows, with the selected block's own switches forced on.
   *
   * Without this, adding an Image and then looking for it is a dead end: an optional block is
   * absent from the send until somebody picks a picture (learnings 2.11), so a new one renders as
   * nothing at all — no outline, no action bar, nothing to click. Selecting a block is a statement
   * that you want to work on it, and a canvas that hides it is answering a different question.
   * Explicit overrides in the preview-state popover still win, because those are deliberate.
   */
  const branch = useMemo(() => {
    const base = { ...defaultsOf(variables) };
    if (editor.selection.kind === 'block') {
      const site = siteOf(editor.template, editor.selection.blockId);
      const block = site?.column.blocks[site.index];
      if (block) {
        const fields = [
          ...('lock' in block ? [block.lock.field] : []),
          ...(block.type === 'button' ? [block.link.field] : []),
          ...(block.type === 'legal' ? [block.noteLock.field] : []),
        ].filter(Boolean);
        for (const v of variables) {
          if (fields.some((f) => v.key === f || v.key.startsWith(`${f}__`))) base[v.key] = true;
        }
      }
    }
    return { ...base, ...overrides };
  }, [variables, overrides, editor.selection, editor.template]);
  const preview = useMemo(() => compile(shownTemplate, { mode: 'preview', branch, annotate: !presenting }), [shownTemplate, branch, presenting]);
  const shown = useMemo(() => {
    // Local assets become blob URLs on the way to the canvas and nowhere else — the export is
    // compiled separately and never passes through here, and `local-image` refuses to let one
    // through Checks. See local-assets.ts.
    const withAssets = withLocalAssets(preview.html, assets);
    return dark ? simulateDark(withAssets) : withAssets;
  }, [preview, dark, assets]);

  const errors = findings.filter((f) => f.severity === 'error');

  /**
   * Selecting anywhere brings the block into view on the canvas.
   *
   * After the canvas has caught up, not before: the preview lags the document by a beat so it does
   * not reload under a typist (CANVAS_LAG), and scrolling to a block in the *previous* render finds
   * it at the wrong offset or not at all. `shownTemplate` is the signal that the frame now holds
   * what the selection is talking about.
   */
  useEffect(() => {
    if (editor.selection.kind !== 'block') return;
    revealInCanvas(scroller.current, frame.current, editor.selection.blockId);
  }, [editor.selection, shownTemplate]);

  /** Which blocks can be edited straight on the canvas, and where their text lives. */
  const textTargets = useMemo(() => {
    const out: Record<string, { selector: string; path: string; rich?: boolean }> = {};
    for (const block of allBlocks(shownTemplate)) {
      const target = TEXT_TARGETS[block.type];
      if (target) out[block.id] = { selector: target.selector, path: target.path, ...(target.rich ? { rich: true } : {}) };
    }
    return out;
  }, [shownTemplate]);

  const editText = useCallback(
    (blockId: string, path: string, value: string) => {
      const section = editor.template.sections.find((s) =>
        s.rows.some((r) => r.columns.some((c) => c.blocks.some((b) => b.id === blockId))),
      );
      if (!section) return;
      editor.setAt({ kind: 'block', sectionId: section.id, blockId }, path, value);
    },
    [editor],
  );

  /**
   * What each section is, for the bar on its row on the canvas. From the template the canvas is
   * showing, so a bar never describes a row the frame does not have yet.
   */
  const rowInfo = useMemo(() => {
    const out: Record<string, RowInfo> = {};
    for (const section of shownTemplate.sections) {
      const row = section.rows[0];
      if (!row) continue;
      const blocks = row.columns.flatMap((c) => c.blocks);
      if (row.columns.length > 1) out[section.id] = { kind: 'columns', label: `${row.columns.length} columns`, glyph: 'columns' };
      else if (blocks.length > 1) out[section.id] = { kind: 'group', label: `Group · ${blocks.length}`, glyph: 'group' };
      else if (blocks[0]) out[section.id] = { kind: 'block', label: CATALOG[blocks[0].type].name, glyph: blocks[0].type, blockId: blocks[0].id };
    }
    return out;
  }, [shownTemplate]);

  /** The ⋯ on a row: the structure decisions, on the row, with the verbs under them. */
  const rowMenu = useCallback(
    (sectionId: string): RowMenuSpec | null => {
      const section = editor.template.sections.find((s) => s.id === sectionId);
      const row = section?.rows[0];
      if (!section || !row) return null;
      const at = { kind: 'section' as const, sectionId };
      const ds = designSystemOf(editor.template);
      const name = (key: string) => (key === 'offwhite' ? 'Off-white' : key[0]!.toUpperCase() + key.slice(1));
      const lone = row.columns.length === 1 && row.columns[0]!.blocks.length === 1;
      const block = lone ? row.columns[0]!.blocks[0]! : null;
      return {
        columns: { count: row.columns.length, onPick: (n) => editor.setColumns(row.id, RATIOS[n]![0]!) },
        ...(row.columns.length > 1 ? { mobile: { value: row.mobile, onPick: (v: 'stack' | 'side-by-side') => editor.setAt(at, 'row.mobile', v) } } : {}),
        background: {
          value: section.theme ?? '',
          options: Object.keys(ds.themes).map((key) => [key, name(key)] as [string, string]),
          onPick: (key) => editor.setAt(at, 'section.theme', key),
        },
        actions: [
          ...(isStack(section) ? [{ label: 'Ungroup', title: 'One section per block again, keeping the look. ⇧⌘G.', onClick: () => editor.ungroup(sectionId) }] : []),
          { label: 'Duplicate', title: 'A copy directly below, with HubSpot fields of its own.', onClick: () => (block ? editor.duplicateOne(block.id) : editor.duplicate(sectionId)) },
          { label: 'Delete', danger: true, title: 'Removes the row and everything in it. Undo is offered.', onClick: () => (block ? editor.removeOne(block.id) : editor.remove(sectionId)) },
        ],
      };
    },
    [editor],
  );

  /** What the on-canvas action bar needs to know about the selected block. */
  const picked = useMemo(() => {
    if (editor.selection.kind !== 'block') return null;
    const site = siteOf(editor.template, editor.selection.blockId);
    if (!site) return null;
    const block = site.column.blocks[site.index]!;
    return {
      id: block.id,
      type: block.type,
      label: CATALOG[block.type].name,
      canUp: site.index > 0,
      canDown: site.index < site.column.blocks.length - 1,
    };
  }, [editor.template, editor.selection]);

  /** What a block on the canvas may be turned into: the kinds that share a cell, by name. */
  const convertible = useMemo(() => STACKABLE.map((kind) => ({ kind, name: CATALOG[kind].name, summary: CATALOG[kind].summary })), []);

  // --- the slash menu's add-a-block half -----------------------------------------------------------
  //
  // The menu on the canvas offers the same blocks as the palette, in the same order, and lands
  // the new one below the block it was opened on: in the same column when that block sits in one,
  // as a full-width section of its own otherwise — the same rule a drop follows.

  /** What the palette offers, as the menu wants it: a kind, a name and the one-line summary. */
  const quickAddKinds = useMemo(
    () => [
      ...ADDABLE.slice(0, 4).map((type) => ({ kind: type, name: CATALOG[type].name, summary: CATALOG[type].summary })),
      { kind: 'columns', name: 'Columns', summary: 'Two columns side by side, empty. Drop blocks into them, and set the ratio afterwards.' },
      ...ADDABLE.slice(4).map((type) => ({ kind: type, name: CATALOG[type].name, summary: CATALOG[type].summary })),
    ],
    [],
  );

  const insertBlock = useCallback(
    (kind: string, after: string | null) => {
      const sections = editor.template.sections;
      const site = after ? siteOf(editor.template, after) : null;
      const sectionIndex = site ? sections.findIndex((s) => s.id === site.section.id) : sections.length - 1;
      if (kind === 'columns') {
        editor.addColumns(sectionIndex + 1);
        return;
      }
      const type = kind as BlockType;
      noteRecent(type);
      // A heading, a paragraph or a button added from the menu opens for typing straight away —
      // a menu that adds a heading and then waits for a double-click stops one step short.
      wantEdit.current = Boolean(TEXT_TARGETS[type]);
      // Into the column when the block already shares one — a row of columns, or a group — and
      // otherwise a section of its own. A lone block stays a lone block until somebody groups it.
      if (site && shared(site) && COLUMN_BLOCKS.includes(type)) {
        editor.addToColumn(site.section.id, site.column.id, type, site.index + 1);
      } else {
        editor.addAt(type, sectionIndex + 1);
      }
    },
    [editor, noteRecent],
  );

  const quickAdd = useMemo(() => ({ kinds: quickAddKinds, recent, onAdd: insertBlock }), [quickAddKinds, recent, insertBlock]);

  // An add selects what it added; when the add came from the menu, that selection is what to edit.
  useEffect(() => {
    if (!wantEdit.current || editor.selection.kind !== 'block') return;
    wantEdit.current = false;
    setAutoEdit(editor.selection.blockId);
  }, [editor.selection]);

  /** The block before or after the selected one, in reading order — across sections and columns. */
  const selectNeighbour = useCallback(
    (blockId: string, delta: number, extend = false) => {
      const blocks = allBlocks(editor.template);
      const next = blocks[blocks.findIndex((b) => b.id === blockId) + delta];
      const site = next ? siteOf(editor.template, next.id) : null;
      if (!next || !site) return;
      if (extend) {
        extending.current = true;
        setAlso((old) => (old.includes(blockId) ? old : [...old, blockId]).filter((id) => id !== next.id));
      }
      editor.select({ kind: 'block', sectionId: site.section.id, blockId: next.id });
    },
    [editor],
  );

  /**
   * Whether the block's column is shared — a row of columns, or a group — so an add or a paste
   * beside it lands in the column rather than in a section of its own.
   */
  const shared = (site: { row: { columns: unknown[] }; column: { blocks: unknown[] } }) =>
    site.row.columns.length > 1 || site.column.blocks.length > 1;

  /**
   * The spacing overlay is pinned to the selection while its Spacing panel is being worked, so a
   * dial in the side panel shows its number moving on the canvas. On a group it pins to the first
   * block, whose cell is the group's.
   */
  const [spacingHot, setSpacingHot] = useState(false);
  const spacingFor = useMemo(() => {
    if (!spacingHot) return null;
    if (editor.selection.kind === 'block') return editor.selection.blockId;
    if (editor.selection.kind === 'section') {
      const wanted = editor.selection.sectionId;
      const section = editor.template.sections.find((s) => s.id === wanted);
      return section?.rows[0]?.columns[0]?.blocks[0]?.id ?? null;
    }
    return null;
  }, [spacingHot, editor.selection, editor.template]);

  /** Every selected block, primary first, in the order the document holds them. */
  const selectedIds = useMemo(() => {
    const primary = editor.selection.kind === 'block' ? editor.selection.blockId : null;
    const wanted = new Set([...(primary ? [primary] : []), ...also]);
    return allBlocks(editor.template)
      .map((b) => b.id)
      .filter((id) => wanted.has(id));
  }, [editor.selection, editor.template, also]);

  /** Moves the selected block: within its column when it has neighbours there, as a section otherwise. */
  const moveSelected = useCallback(
    (blockId: string, delta: number) => {
      const site = siteOf(editor.template, blockId);
      if (!site) return;
      if (site.column.blocks.length > 1) editor.nudge(blockId, delta);
      else editor.move(site.section.id, delta);
    },
    [editor],
  );

  // --- the folder's design systems ---------------------------------------------------------------

  const followSystem = useCallback(
    (name: string) => {
      const system = systems[name];
      if (!system) return;
      editor.commit('Follow design system', followFolderSystem(editor.template, name, system));
      notify(`Following ${name}. Edits in Design go to the folder's file now, and every template that names it follows.`);
    },
    [editor, systems, notify],
  );

  const saveSystemAs = useCallback(
    async (label: string) => {
      const name = fileSlug(label);
      const system = structuredClone(designSystemOf(editor.template));
      try {
        if (workspace) await workspace.writeDesignSystem(name, serializeDesignSystem(system));
      } catch (cause) {
        failed(cause, `Could not write design-systems/${name}.system.json. Check the folder is still there and writable.`);
        return;
      }
      setSystems((old) => ({ ...old, [name]: system }));
      editor.commit('Save design system', followFolderSystem(editor.template, name, system));
      notify(
        workspace?.canWrite
          ? `Saved to design-systems/${name}.system.json. This template follows it now; others can from Design.`
          : `Downloaded ${name}.system.json. Put it in the folder's design-systems directory.`,
      );
    },
    [editor, workspace, notify, failed],
  );

  const detachSystem = useCallback(() => {
    editor.commit('Detach design system', detachFromFolderSystem(editor.template));
    notify('This template keeps its own copy of the system now. The folder’s file is untouched.');
  }, [editor, notify]);

  // --- patterns --------------------------------------------------------------------------------------
  //
  // A section saved to the folder, placed elsewhere as a copy that remembers where it came from.
  // The files are the workspace's; with no folder open they still exist for the session, so the
  // feature can be tried before there is anywhere to keep it.

  const writePatternFile = useCallback(
    async (pattern: Pattern) => {
      if (workspace) await workspace.writePattern(pattern, serializePattern(pattern));
      setPatterns((old) => [...old.filter((p) => p.id !== pattern.id), pattern].sort((a, b) => a.name.localeCompare(b.name)));
    },
    [workspace],
  );

  const patternCards = useMemo<PatternCard[]>(
    () =>
      patterns.map((p) => {
        const blocks = p.section.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks));
        const kinds = [...new Set(blocks.map((b) => CATALOG[b.type].name))].join(', ');
        return { id: p.id, name: p.name, summary: `A saved section: ${blocks.length === 1 ? kinds : `${blocks.length} blocks — ${kinds}`}. Version ${p.version}.` };
      }),
    [patterns],
  );

  const placePatternAt = useCallback(
    (id: string, index: number | null) => {
      const pattern = patterns.find((p) => p.id === id);
      if (!pattern) return;
      const next = placePattern(editor.template, pattern, index ?? editor.template.sections.length);
      const created = next.sections.find((s) => !editor.template.sections.some((old) => old.id === s.id));
      // The block when there is one to select, the section when the pattern is a row of columns.
      // A single-column section selected *as* a section shows the block's panel with every value
      // undefined — the dead-panel shape from learnings 3.50, and the third place it has appeared.
      const row = created?.rows[0];
      const first = row && row.columns.length === 1 ? row.columns[0]!.blocks[0] : undefined;
      editor.commit(
        'Place pattern',
        next,
        created
          ? { select: first ? { kind: 'block', sectionId: created.id, blockId: first.id } : { kind: 'section', sectionId: created.id } }
          : {},
      );
    },
    [editor, patterns],
  );

  /** The selected section's standing with the folder's patterns, and the verbs. */
  const patternInfo = useMemo<PatternInfo | undefined>(() => {
    const sel = editor.selection;
    if (sel.kind === 'template') return undefined;
    const section = editor.template.sections.find((s) => s.id === sel.sectionId);
    if (!section) return undefined;
    const state = instanceOf(section, patterns);
    const run = async (label: string, work: () => Promise<void>) => {
      try {
        await work();
      } catch (cause) {
        failed(cause, `Could not write the pattern file for ${label}. Check the folder is still there and writable.`);
      }
    };
    return {
      name: state?.pattern?.name ?? null,
      instance: Boolean(state),
      stale: Boolean(state?.stale),
      missing: Boolean(state?.missing),
      onApply: () => {
        if (!state?.pattern) return;
        const next = applyPattern(editor.template, section.id, state.pattern);
        // The update gives the section's blocks new ids, so the selection has to be re-pointed or
        // the next key acts on a block that no longer exists — which is how shift-arrow once
        // landed on the top bar.
        const row = next.sections.find((s) => s.id === section.id)?.rows[0];
        const first = row && row.columns.length === 1 ? row.columns[0]!.blocks[0] : undefined;
        editor.commit('Apply pattern update', next, {
          select: first ? { kind: 'block', sectionId: section.id, blockId: first.id } : { kind: 'section', sectionId: section.id },
        });
      },
      onDetach: () => editor.commit('Detach from pattern', detachPattern(editor.template, section.id)),
      onPush: () => {
        if (!state?.pattern) return;
        const pushed = pushPattern(editor.template, section.id, state.pattern);
        if (!pushed) return;
        void run(state.pattern.name, async () => {
          await writePatternFile(pushed.pattern);
          editor.commit('Push pattern', pushed.template);
          notify(`${pushed.pattern.name} is now version ${pushed.pattern.version}. Other placements will offer the update.`);
        });
      },
      onSave: (name: string) => {
        const made = patternFromSection(editor.template, section.id, name);
        if (!made) return;
        void run(name, async () => {
          await writePatternFile(made.pattern);
          editor.commit('Save as pattern', made.template);
          notify(
            workspace?.canWrite
              ? `Saved as patterns/${fileSlug(name)}.pattern.json. It is in Blocks now, for any template in the folder.`
              : `${name} is in Blocks for this session. Open a folder to keep patterns with the templates.`,
          );
        });
      },
    };
  }, [editor, patterns, writePatternFile, notify, workspace, failed]);

  const patternOf = useCallback(
    (sectionId: string): 'current' | 'stale' | 'missing' | null => {
      const section = editor.template.sections.find((s) => s.id === sectionId);
      const state = section ? instanceOf(section, patterns) : null;
      if (!state) return null;
      return state.missing ? 'missing' : state.stale ? 'stale' : 'current';
    },
    [editor.template, patterns],
  );

  // --- copy and paste ---------------------------------------------------------------------------------
  //
  // Through the clipboard events rather than the keys: the events carry the data, they fire for
  // the real shortcut in every browser, and text on the system clipboard travels between tabs —
  // which is how a block gets from one template to another when only one is open at a time.

  const onClipboard = useCallback(
    (event: ClipboardEvent, kind: 'copy' | 'paste') => {
      const data = event.clipboardData;
      if (!data) return;
      const sel = editor.selection;
      if (kind === 'copy') {
        if (sel.kind === 'template') return;
        const section = editor.template.sections.find((s) => s.id === sel.sectionId);
        if (!section) return;
        if (sel.kind === 'section') {
          data.setData('text/plain', clipText({ kind: 'section', section }));
        } else {
          const blocks = allBlocks(editor.template).filter((b) => selectedIds.includes(b.id));
          if (blocks.length === 0) return;
          data.setData('text/plain', clipText({ kind: 'blocks', blocks }));
        }
        event.preventDefault();
        notify(sel.kind === 'section' ? 'Copied the columns.' : `Copied ${selectedIds.length === 1 ? 'the block' : `${selectedIds.length} blocks`}.`);
        return;
      }
      const clip = parseClip(data.getData('text/plain'));
      if (!clip) return; // ordinary text: whatever has focus can have it
      event.preventDefault();
      const sections = editor.template.sections;
      const site = sel.kind === 'block' ? siteOf(editor.template, sel.blockId) : null;
      const sectionIndex = sel.kind === 'template' ? sections.length - 1 : sections.findIndex((s) => s.id === sel.sectionId);
      if (clip.kind === 'section') {
        editor.commit('Paste', pasteSection(editor.template, clip.section, sectionIndex + 1));
        notify('Pasted the columns.');
        return;
      }
      const blocks: Block[] = clip.blocks;
      if (site && shared(site)) {
        editor.commit('Paste', insertBlocksInColumn(editor.template, site.column.id, blocks, site.index + 1));
      } else {
        editor.commit('Paste', insertBlocksAt(editor.template, blocks, sectionIndex + 1));
      }
      notify(`Pasted ${blocks.length === 1 ? 'the block' : `${blocks.length} blocks`}.`);
    },
    [editor, selectedIds, notify],
  );

  // The same handlers for the editor's own document, when focus is on a layer row or the canvas
  // pane rather than inside the frame. Not from a field: a field's copy and paste are its own.
  useEffect(() => {
    const guard = (event: ClipboardEvent, kind: 'copy' | 'paste') => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      onClipboard(event, kind);
    };
    const onCopy = (e: ClipboardEvent) => guard(e, 'copy');
    const onPaste = (e: ClipboardEvent) => guard(e, 'paste');
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [onClipboard]);

  // --- dropping, from the canvas or from the palette ---------------------------------------------
  //
  // The canvas resolves a pointer position to a `DropSpot` — "before that block", "into that
  // column", "at the end" — and stops there, because it knows about markup and rectangles and not
  // about the document. Turning one into a column and an index is this side's job.

  type Place =
    /** Into a column, at an index among its blocks — beside what is already there. */
    | { kind: 'column'; columnId: string; index: number }
    /** A full-width section of its own, at an index among the template's sections. */
    | { kind: 'section'; index: number };

  /** The section a column is in, as an index — the place a section dropped *on* it goes after. */
  const sectionAfter = useCallback(
    (columnId: string) => editor.template.sections.findIndex((s) => s.rows.some((r) => r.columns.some((c) => c.id === columnId))) + 1,
    [editor.template],
  );

  const placeOf = useCallback(
    (spot: DropSpot): Place | null => {
      const sections = editor.template.sections;
      if (spot.at === 'end') return { kind: 'section', index: sections.length };
      if (spot.at === 'section') {
        const at = sections.findIndex((s) => s.id === spot.sectionId);
        return at === -1 ? null : { kind: 'section', index: at + (spot.before ? 0 : 1) };
      }
      if (spot.at === 'column') {
        const column = editor.template.sections.flatMap((s) => s.rows.flatMap((r) => r.columns)).find((c) => c.id === spot.columnId);
        return { kind: 'column', columnId: spot.columnId, index: spot.tail ? (column?.blocks.length ?? 0) : 0 };
      }
      const site = siteOf(editor.template, spot.blockId);
      if (!site) return null;
      // Beside a block means in its column — a group, if it was alone (learnings 3.59). The canvas
      // offers the section edges separately, so this is what the middle of a block means.
      return { kind: 'column', columnId: site.column.id, index: site.index + (spot.before ? 0 : 1) };
    },
    [editor.template],
  );

  const dropExisting = useCallback(
    (blockId: string, spot: DropSpot) => {
      const place = placeOf(spot);
      if (!place) return;
      const site = siteOf(editor.template, blockId);
      const block = site?.column.blocks[site.index];
      // A block that draws its own band cannot join a cell; it goes below the column's section.
      if (place.kind === 'column' && block && !canStack(block)) {
        editor.dropAsSection(blockId, sectionAfter(place.columnId));
        return;
      }
      if (place.kind === 'column') editor.dropInto(blockId, place.columnId, place.index);
      else editor.dropAsSection(blockId, place.index);
    },
    [editor, placeOf, sectionAfter],
  );

  // --- the palette ---------------------------------------------------------------------------------
  const [dragType, setDragType] = useState<PaletteKind | null>(null);
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);
  const spot = useRef<DropSpot | null>(null);

  const dropNew = useCallback(() => {
    const type = dragType;
    const where = spot.current;
    setDragType(null);
    setProbe(null);
    spot.current = null;
    if (!type) return;
    // Released over nothing: the drag is abandoned rather than guessed at. Dropping a block
    // somewhere the pointer never was is the kind of surprise undo exists to fix and should not
    // have to.
    if (!where) return;
    const place = placeOf(where);
    if (!place) return;

    // A pattern is a section, so like columns it lands as a section: after the one it was aimed
    // at when that was inside a column.
    const sectionIndex = place.kind === 'section' ? place.index : sectionAfter(place.columnId);
    if (isPatternKind(type)) {
      placePatternAt(patternIdOf(type), sectionIndex);
      return;
    }
    if (type === 'columns') {
      // Columns cannot nest — `Column.blocks` holds blocks, and a row is not one. Dropped onto a
      // column, the new row lands after the one it was aimed at rather than inside it, which is
      // the only reading that produces something.
      editor.addColumns(sectionIndex);
      return;
    }
    noteRecent(type);

    // The top bar, the stripes and the footer draw their own band, so they take a section wherever
    // they were aimed — the same reading as columns and patterns.
    if (place.kind === 'section' || !canStack({ type })) {
      editor.addAt(type, sectionIndex);
      return;
    }
    const section = editor.template.sections.find((s) =>
      s.rows.some((r) => r.columns.some((c) => c.id === place.columnId)),
    );
    if (section) editor.addToColumn(section.id, place.columnId, type, place.index);
  }, [dragType, placeOf, editor, placePatternAt, noteRecent, sectionAfter]);

  // --- workspace -------------------------------------------------------------------------------

  const adopt = useCallback(async (next: Workspace) => {
    setWorkspace(next);
    setError(null);
    // Blob URLs from the previous folder are revoked here rather than on unmount: the panel can be
    // pointed at a different folder any number of times in a session, and each one would otherwise
    // leave its images held open for as long as the tab lives.
    setAssets((old) => {
      for (const asset of old) URL.revokeObjectURL(asset.url);
      return [];
    });
    try {
      setFiles(await next.list());
    } catch {
      setError(`Could not read ${next.label}. If the folder moved or was renamed, open it again.`);
      setFiles([]);
    }
    try {
      setAssets(await next.assets());
    } catch {
      // No `assets/` folder, or no permission to read it. Not an error — most folders have neither.
      setAssets([]);
    }
    try {
      setSystems(await next.designSystems());
    } catch {
      setSystems({});
    }
    try {
      setPatterns(await next.patterns());
    } catch {
      setPatterns([]);
    }
  }, []);

  /** Re-reads `assets/` after something is written into it, so the panel shows the new file. */
  const refreshAssets = useCallback(async (where: Workspace | null) => {
    if (!where) return;
    try {
      const found = await where.assets();
      setAssets((old) => {
        for (const asset of old) URL.revokeObjectURL(asset.url);
        return found;
      });
    } catch {
      // Same as on open: no folder, or no permission. Not an error.
    }
  }, []);

  const pickFolder = useCallback(() => void openFolder().then((f) => f && adopt(f)), [adopt]);

  /** The click that asks Chrome for edit access, and picks up saving where it stopped. */
  const allowEditing = useCallback(async () => {
    const next = await workspace?.requestWrite?.();
    if (!next) {
      notify('Chrome did not grant edit access. Open the folder again and choose “Edit files” when it asks.');
      return;
    }
    await adopt(next);
    setRefused(null);
    notify(`Editing allowed on ${next.label}. Saving again.`);
  }, [workspace, adopt, notify]);


  useEffect(() => {
    void restoreFolder().then((found) => found && adopt(found));
  }, [adopt]);

  const open = useCallback(
    async (file: TemplateFile) => {
      try {
        const loaded = await file.load();
        const { template, warning } = materialiseFolderSystem(loaded.template, systems);
        editor.load(template, file);
        const warnings = [...loaded.warnings, ...(warning ? [warning] : [])];
        if (warnings.length) notify(warnings.join(' '));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : `Could not read ${file.fileName}.`);
      }
    },
    [editor, notify, systems],
  );

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
  }, [editor.template]);

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
      const cell = marked?.querySelector('td.hs_padded') as HTMLElement | null;
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

        const shot = await rasterise({
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
    [editor, workspace, notify, refreshAssets, failed],
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

  // --- the keyboard --------------------------------------------------------------------------------
  //
  // One policy, here. The canvas forwards the keys it does not own (Preview.tsx), the layer tree
  // and the palette are ordinary buttons, and a field keeps its own keys — so a shortcut means the
  // same thing whichever pane last had the click. Undo and redo live in useEditor and are not
  // repeated here.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key;
      const picked = editor.selection.kind === 'block' ? editor.selection.blockId : null;

      // The surface editor has its own keys while it is open; saving and exporting stay the app's.
      if (surfaceOf && !(meta && (key.toLowerCase() === 's' || (event.shiftKey && key.toLowerCase() === 'e')))) return;

      if (meta && key.toLowerCase() === 's') {
        event.preventDefault();
        if (workspace?.canWrite) {
          editor.saveNow();
          notify('Saved.');
        } else {
          notify('No folder open, so there is nowhere to save to. Open one in Files.');
        }
        return;
      }
      if (meta && event.shiftKey && key.toLowerCase() === 'e') {
        event.preventDefault();
        void exportTemplate();
        return;
      }
      if (key === '?' && !meta) {
        event.preventDefault();
        setShowKeys((v) => !v);
        return;
      }
      if (key === 'Escape') {
        if (showKeys) setShowKeys(false);
        else if (showBranches) setShowBranches(false);
        else if (presenting) setPresenting(false);
        else if (drawing) setDrawing(false);
        else if (selectedLayer) setSelectedLayer(null);
        else if (picked) editor.select({ kind: 'template' });
        return;
      }
      if ((key === '/' && !meta && !event.shiftKey) || (meta && key.toLowerCase() === 'k')) {
        event.preventDefault();
        previewApi.current?.openQuickAdd();
        return;
      }
      if (!picked) return;
      if (meta && key.toLowerCase() === 'd') {
        event.preventDefault();
        editor.duplicateOne(picked);
        return;
      }
      if (meta && key.toLowerCase() === 'g') {
        event.preventDefault();
        if (event.shiftKey) {
          const stack = stackOf(editor.template, picked);
          if (stack) editor.ungroup(stack.id);
          else notify('Nothing to ungroup: this block is not in a group.');
        } else if (selectedIds.length < 2) {
          notify('Select the blocks to group first — shift-click, or ⇧↑ ⇧↓.');
        } else if (editor.group(selectedIds)) {
          setAlso([]);
          notify('Grouped: one column, one box. ⇧⌘G puts them back.');
        } else {
          notify('These cannot be grouped: they have to be next to each other, and a row of columns, a top bar, stripes or the footer cannot join one.');
        }
        return;
      }
      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        if (selectedIds.length > 1) editor.removeMany(selectedIds);
        else editor.removeOne(picked);
        return;
      }
      if (key === 'Enter') {
        event.preventDefault();
        previewApi.current?.startEditing(picked);
        return;
      }
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        event.preventDefault();
        const delta = key === 'ArrowUp' ? -1 : 1;
        if (event.altKey) {
          if (selectedIds.length > 1) {
            extending.current = true;
            editor.commit('Move', moveSections(editor.template, selectedIds, delta));
          } else moveSelected(picked, delta);
        } else selectNeighbour(picked, delta, event.shiftKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, workspace, notify, exportTemplate, showKeys, showBranches, presenting, drawing, selectedLayer, surfaceOf, moveSelected, selectNeighbour, selectedIds]);

  return (
    <div class={`app ${presenting ? 'presenting' : ''}`}>
      <header class="bar">
        <div class="brand">Template&nbsp;Studio</div>

        <div class="bar-file">
          <span class="filename" title={editor.file ? editor.file.fileName : 'Not saved to a file yet.'}>
            {editor.template.name}
          </span>
          <SaveBadge editor={editor} workspace={workspace} />
        </div>

        <div class="group">
          <button class="btn" disabled={!editor.canUndo} onClick={editor.undo} title={editor.canUndo ? `Undo ${editor.undoLabel ?? ''}` : 'Nothing to undo'}>
            Undo
          </button>
          <button class="btn" disabled={!editor.canRedo} onClick={editor.redo} title="Redo">
            Redo
          </button>
        </div>

        <span class="grow" />

        {/* Opening a folder and opening the design system both moved into the rail, where the
            panels they belong to already live. A control in two places is a control whose state
            has to agree in two places, and the top bar is for what is true of the *export* — how
            big it is, whether it passes, and writing it. */}

        <button
          class={`btn ${showFields ? 'on' : ''}`}
          onClick={() => {
            setShowFields((v) => !v);
            setShowChecks(false);
            setShowCode(false);
          }}
          title="Everything the team will see in HubSpot, in the order they will see it. Locked content fades back."
        >
          Fields
        </button>

        <button
          class={`btn ${showCode ? 'on' : ''}`}
          onClick={() => {
            setShowCode((v) => !v);
            setShowFields(false);
            setShowChecks(false);
          }}
          title="The coded template itself, to copy straight into Design Manager. The same bytes Export writes to a file."
        >
          Code
        </button>

        <button
          class={`btn chip ${errors.length ? 'bad' : 'good'}`}
          onClick={() => {
            setShowChecks((v) => !v);
            setShowFields(false);
          }}
          title="Everything a real send has taught us, checked against this template."
        >
          {errors.length ? `${errors.length} to fix` : 'Checks pass'}
        </button>

        <span class="size" title="Gmail clips an email at about 102KB, taking the footer with it.">
          <b class={hubl.bytes > 92160 ? 'hot' : ''}>{kb(hubl.bytes)}</b>
        </span>

        <button class="btn primary" title="Write the HubSpot coded template file." onClick={() => void exportTemplate()}>
          Export
        </button>
      </header>

      {refused && (
        <div class="banner" role="alert">
          {refused}
          {workspace?.requestWrite && (
            <button class="btn" title="Chrome asks once; choose “Edit files”." onClick={() => void allowEditing()}>
              Allow editing
            </button>
          )}
          <button class="link" onClick={() => setRefused(null)}>Dismiss</button>
        </div>
      )}

      {error && (
        <div class="banner" role="alert">
          {error}
          <button class="link" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {editor.conflictAt !== null && (
        <div class="banner" role="alert">
          Someone else saved this template while you were editing, so yours was not written. Save a copy, or
          reload theirs and redo your change.
          <button class="link" onClick={editor.dismissConflict}>Dismiss</button>
        </div>
      )}

      <div class="body">
        <Sidebar
          editor={editor}
          tab={tab}
          onTab={goTab}
          onCloseDesign={() => goTab('design')}
          dragging={dragType}
          onPaletteDrag={(type, x, y) => {
            setDragType(type);
            setProbe({ x, y });
          }}
          onPaletteDrop={dropNew}
          files={files}
          assets={assets}
          {...(surfaceOf ? { onDropAsset: (asset: AssetFile, at: { x: number; y: number } | null) => surfaceApi.current?.dropAsset(asset, at) } : {})}
          starters={STARTERS}
          onNew={startNew}
          onDuplicate={duplicateCurrent}
          patterns={patternCards}
          onPlacePattern={(id) => placePatternAt(id, null)}
          patternOf={patternOf}
          onUsed={(kind) => noteRecent(kind)}
          also={also}
          systems={systems}
          folderOpen={Boolean(workspace?.canWrite)}
          onFollowSystem={followSystem}
          onSaveSystemAs={(name) => void saveSystemAs(name)}
          onDetachSystem={detachSystem}
          writable={Boolean(workspace?.canWrite)}
          viewOnly={Boolean(workspace && workspace.kind === 'folder' && !workspace.canWrite)}
          onAllowEditing={() => void allowEditing()}
          folders={supportsFolders()}
          onChooseFiles={(picked) => void adopt(workspaceFromFiles(picked))}
          device={device === 'phone' ? 'phone' : 'desktop'}
          onDevice={setDevice}
          {...(workspace?.label ? { workspaceLabel: workspace.label } : {})}
          onOpenFile={(file) => void open(file)}
          onOpenFolder={pickFolder}
        />

        <main class="canvas">
          <div class="tools">
            {/* Two glyphs rather than two words. This is the control the eye comes back to most,
                it sits at the head of a row of named buttons, and a screen and a handset are the
                two most recognisable shapes in the set — the words were doing nothing the shapes
                do not. The names live on the hover and in the label, where a screen reader gets
                them either way. */}
            <div class="group seg-icons" role="group" aria-label="Preview width">
              {(['desktop', 'phone'] as const).map((d) => (
                <button
                  key={d}
                  class={`btn icon-btn ${device === d ? 'on' : ''}`}
                  aria-pressed={device === d}
                  aria-label={d === 'desktop' ? 'Desktop' : 'Phone'}
                  title={
                    d === 'desktop'
                      ? 'Desktop — the full column, with the page background either side.'
                      : 'Phone — 375px, where the email runs edge to edge.'
                  }
                  onClick={() => setDevice(d)}
                >
                  {d === 'desktop' ? <DesktopIcon /> : <PhoneIcon />}
                </button>
              ))}
              <button
                class={`btn icon-btn ${inbox ? 'on' : ''}`}
                aria-pressed={inbox}
                aria-label="Inbox"
                title="Inbox — the email inside a message, with a sender, a subject line and the gutter a mail app draws around every message. That gutter is the one thing no email can remove (learnings 2.4), and it is where the page background shows."
                onClick={() => setInbox((v) => !v)}
              >
                <InboxIcon />
              </button>
            </div>

            {/* The same treatment as the three beside it: a glyph, with the explanation on hover —
                and the explanation changes with the state, which is where the two-line note that
                used to sit under this row went. A row of tools should read as tools. */}
            <button
              class={`btn icon-btn ${dark ? 'on' : ''}`}
              aria-pressed={dark}
              aria-label="Dark override"
              title={
                !dark
                  ? 'Dark override — applies your prefers-color-scheme layer unconditionally. Your own dark rules, not what Gmail’s apps will do; nothing can show that.'
                  : editor.template.forceLight
                    ? 'Dark override on. The email is holding its own colours — that is what Force light is for. If nothing changed, it is working.'
                    : 'Dark override on. No force-light layer, so a dark client will restyle this freely. Turn Force light on in Design › Page to hold the colours.'
              }
              onClick={() => setDark((v) => !v)}
            >
              <MoonIcon />
            </button>
            <button
              class={`btn icon-btn ${presenting ? 'on' : ''}`}
              aria-pressed={presenting}
              aria-label="Preview"
              title={presenting ? 'Preview on: the email as it is, nothing else. Esc or click to bring the tools back.' : 'Preview — hide every control and see the email as it is. Esc brings them back.'}
              onClick={() => setPresenting((v) => !v)}
            >
              <EyeIcon />
            </button>

            <span class="grow" />

            {variables.length > 0 && (
              <div class="popover-host">
                <button
                  class={`btn icon-text count ${showBranches ? 'on' : ''}`}
                  aria-expanded={showBranches}
                  aria-label="Preview state"
                  onClick={() => setShowBranches((v) => !v)}
                  title={`Preview state — ${Object.values(branch).filter(Boolean).length} of ${variables.length} optional fields filled in. In HubSpot this template is a program, not a document: each switch is a field the team may leave empty, and the canvas can only show one combination at a time.`}
                >
                  <BranchIcon />
                  {Object.values(branch).filter(Boolean).length}/{variables.length}
                </button>
                {showBranches && (
                  <div class="popover right">
                    <p class="hint" title="The canvas can only show one of them, so this is where you walk the rest.">
                      {2 ** variables.length} possible emails.
                    </p>
                    {variables.map((v) => (
                      <label class="switch" key={v.key}>
                        <input
                          type="checkbox"
                          checked={branch[v.key] ?? false}
                          onChange={(e) => setOverrides((o) => ({ ...o, [v.key]: (e.target as HTMLInputElement).checked }))}
                        />
                        <span>{v.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              class={`btn icon-btn help ${showKeys ? 'on' : ''}`}
              aria-label="Keyboard shortcuts"
              title="How the canvas works: click to select, double-click to edit, / to format or add a block, drag to reorder. Opens the full list of shortcuts."
              onClick={() => setShowKeys((v) => !v)}
            >
              ?
            </button>
          </div>

          {surfaceOf && (
            <Surface
              editor={editor}
              blockId={surfaceOf}
              assets={assets}
              layer={selectedLayer}
              onSelectLayer={setSelectedLayer}
              onDone={() => setSurfaceOf(null)}
              api={surfaceApi}
            />
          )}
          <div class={`scroller ${dark ? 'dark' : ''}`} ref={scroller} hidden={Boolean(surfaceOf)}>
            {/* A device around the canvas. It is chrome, and it earns its place: an email at 600px
                floating on a grey field gives no sense of scale, and the one question a designer
                asks of a preview is "how big is this really". The desktop frame is a mail client
                rather than a browser — that is where an email is actually read, and it is the only
                honest way to show the inset a phone mail app draws around every message. */}
            <div class={`device ${device} ${inbox ? 'inbox' : ''}`}>
              <div class="device-bar" aria-hidden="true">
                {device === 'desktop' ? (
                  <>
                    <span class="dot" />
                    <span class="dot" />
                    <span class="dot" />
                    <span class="device-title">{editor.template.name}</span>
                  </>
                ) : (
                  <span class="notch" />
                )}
              </div>

            {/* A message, not a page. See Inbox.tsx for which parts of it are true — and note
                that the chrome *contains* the stage rather than sitting above it, because on a
                desktop the message has to sit beside the folder list. */}
            <Framed inbox={inbox} subject={editor.template.name} device={device}>
            {/* The gutter a mail app draws around every message lives on this, not on the frame:
                the email fills its own body, and what shows either side of it is the client. */}
            <div class="stage">
            <Preview
              html={shown}
              plain={presenting}
              width={WIDTHS[device]}
              selected={editor.selection.kind === 'block' ? editor.selection.blockId : null}
              alsoSelected={also}
              onSelect={(blockId, sectionId, extend) => {
                if (extend && editor.selection.kind === 'block' && editor.selection.blockId !== blockId) {
                  const current = editor.selection.blockId;
                  extending.current = true;
                  setAlso((old) => (old.includes(current) ? old : [...old, current]).filter((id) => id !== blockId));
                }
                editor.select({ kind: 'block', sectionId, blockId });
              }}
              selectedSection={editor.selection.kind === 'section' ? editor.selection.sectionId : null}
              onSelectSection={(sectionId) => editor.select({ kind: 'section', sectionId })}
              sections={rowInfo}
              rowMenu={rowMenu}
              onMoveSection={(sectionId, delta) => editor.move(sectionId, delta)}
              onDuplicateSection={(sectionId) => editor.duplicate(sectionId)}
              onDeleteSection={(sectionId) => editor.remove(sectionId)}
              selectedKind={picked?.type ?? null}
              convertible={convertible}
              onConvert={(blockId, kind) => editor.convert(blockId, kind)}
              onResizeColumns={(sectionId, spans) => {
                const row = editor.template.sections.find((s) => s.id === sectionId)?.rows[0];
                if (row) editor.resizeColumns(row.id, spans);
              }}
              layer={selectedLayer}
              drawing={drawing}
              onEnterSurface={enterSurface}
              onSelectLayer={(_blockId, layerId) => setSelectedLayer(layerId)}
              onMoveLayer={(blockId, layerId, dx, dy) => editor.commit('Move layer', nudgeLayer(editor.template, blockId, layerId, dx, dy), { coalesce: `layer:${blockId}:${layerId}` })}
              onDrawPath={(blockId, points) => {
                // In the ink of the first palette colour, three wide. The layer's own panel changes both.
                const ink = Object.keys(designSystemOf(editor.template).colors)[0] ?? null;
                const next = drawPath(editor.template, blockId, points, ink, 3);
                if (next !== editor.template) editor.commit('Draw', next);
              }}
              onClipboard={onClipboard}
              dim={showFields ? lockedBlockIds(shownTemplate) : []}
              textTargets={textTargets}
              onEditText={editText}
              onDropBlock={dropExisting}
              frameRef={(el) => {
                frame.current = el;
              }}
              probe={probe}
              onProbe={(found) => {
                spot.current = found;
              }}
              quickAdd={quickAdd}
              api={previewApi}
              autoEdit={autoEdit}
              onAutoEdited={() => setAutoEdit(null)}
              spacing={spacingFor}
              {...(picked
                ? {
                    selectedLabel: picked.label,
                    canNudgeUp: picked.canUp,
                    canNudgeDown: picked.canDown,
                    onNudge: (delta: number) => editor.nudge(picked.id, delta),
                    onDuplicate: () => editor.duplicateOne(picked.id),
                    onDelete: () => editor.removeOne(picked.id),
                  }
                : {})}
            />
            </div>
            </Framed>
            </div>
          </div>

          {showFields && (
            <div class="drawer">
              <div class="drawer-head">
                <b>What the team sees in HubSpot</b>
                <button class="link" onClick={() => setShowFields(false)}>Close</button>
              </div>
              <Editability editor={editor} />
            </div>
          )}

          {showCode && (
            <div class="drawer">
              <div class="drawer-head">
                <b>The coded template</b>
                <span class="muted">
                  {kb(hubl.bytes)} · paste into Design Manager › new coded email template
                </span>
                <button
                  class={`btn icon-text ${copied ? 'done' : ''}`}
                  title="Copy the whole file. Paste it over everything in a new coded email template, save, then open it once so HubSpot validates the fields."
                  onClick={() => void copyCode()}
                >
                  {copied ? <TickIcon /> : <CopyIcon />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button class="link" onClick={() => setShowCode(false)}>Close</button>
              </div>
              {/* Read-only rather than disabled: a disabled textarea cannot be selected, and
                  select-all-then-copy is the fallback for a browser that refuses the clipboard. */}
              <textarea class="code" readOnly spellcheck={false} value={hubl.html} />
            </div>
          )}

          {showChecks && (
            <div class="drawer">
              <div class="drawer-head">
                <b>Checks</b>
                <span class="muted">
                  {findings.length === 0 ? 'Nothing to fix.' : `${errors.length} to fix, ${findings.length - errors.length} to look at.`}
                </span>
                {findings.some((f) => f.rule === 'untidy-markup') && (
                  // The one finding Checks can fix itself: markup the sanitiser would drop, taken
                  // out of every block at once, as one undo step.
                  <button
                    class="btn"
                    title="Remove the tags and attributes the template does not use from every block — empty paragraphs, pasted inline styles, stray wrappers. One undo step."
                    onClick={() => {
                      const before = editor.template;
                      const count = findings.filter((f) => f.rule === 'untidy-markup').length;
                      editor.commit('Clean up', tidyTemplate(before));
                      notify(`Cleaned ${count === 1 ? 'one block' : `${count} blocks`}.`, () => editor.undo());
                    }}
                  >
                    Clean up
                  </button>
                )}
                <button class="link" onClick={() => setShowChecks(false)}>Close</button>
              </div>
              {findings.length === 0 ? (
                <p class="empty">
                  Every rule a real send has taught us, and this template satisfies all of them.
                </p>
              ) : (
                <ul class="findings">
                  {findings.map((f, i) => (
                    <li key={`${f.rule}-${i}`} class={f.severity}>
                      <code>{f.rule}</code>
                      {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </main>

        {/* The right pane is the selection and nothing else now. It used to be shared with the
            design system, which meant opening Design hid the block whose type you were changing. */}
        <aside class="pane right">
          <Inspector
            editor={editor}
            onRasterise={rasteriseBlock}
            rasterising={rasterising}
            onSpacingHot={setSpacingHot}
            freeform={{ layer: selectedLayer, onSelectLayer: setSelectedLayer, drawing, onDrawing: setDrawing, open: Boolean(surfaceOf), onEnter: enterSurface }}
            {...(patternInfo ? { patternInfo } : {})}
            multi={{
              count: selectedIds.length,
              onDelete: () => editor.removeMany(selectedIds),
              ...(selectedIds.length > 1 && groupIntoStack(editor.template, selectedIds)
                ? {
                    onGroup: () => {
                      if (editor.group(selectedIds)) setAlso([]);
                    },
                  }
                : {}),
            }}
          />
        </aside>
      </div>

      {dragType && probe && (
        // The ghost. It is what turns "the pointer moved" into "I am carrying something", and it
        // is the piece that was missing: a drop indicator alone tells you where it would land but
        // not that anything is in your hand.
        <div class="sy-ghost" style={{ left: `${probe.x}px`, top: `${probe.y}px` }} aria-hidden="true">
          {(() => {
            const Glyph = glyphFor(dragType);
            return <Glyph />;
          })()}
          {dragType === 'columns'
            ? 'Columns'
            : isPatternKind(dragType)
              ? (patternCards.find((p) => p.id === patternIdOf(dragType))?.name ?? 'Pattern')
              : CATALOG[dragType].name}
        </div>
      )}

      {showKeys && (
        // The sheet `?` opens. Data from slash.ts, so what it says and what the keys do come from
        // one list.
        <div class="keys-backdrop" onClick={() => setShowKeys(false)}>
          <div class="keys" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
            <div class="drawer-head">
              <b>Keyboard</b>
              <span class="muted">Esc closes this</span>
              <button class="link" onClick={() => setShowKeys(false)}>
                Close
              </button>
            </div>
            <table class="keys-table">
              <tbody>
                {SHORTCUTS.map((s) => (
                  <tr key={`${s.keys}-${s.does}`}>
                    <td>
                      <kbd>{s.keys}</kbd>
                    </td>
                    <td>
                      {s.does}
                      {s.when && <i class="keys-when"> · {s.when}</i>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && (
        <div class="toast">
          {toast.message}
          {toast.undo && (
            <button
              class="toast-undo"
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
    </div>
  );
}

/**
 * The message, with or without a client around it.
 *
 * A component rather than a ternary because the stage it wraps is forty lines of props, and
 * writing those twice is writing a bug twice.
 */
function Framed({
  inbox,
  subject,
  device,
  children,
}: {
  inbox: boolean;
  subject: string;
  device: Device;
  children: ComponentChildren;
}) {
  if (!inbox) return <>{children}</>;
  return (
    <InboxChrome subject={subject} device={device}>
      {children}
    </InboxChrome>
  );
}

function SaveBadge({ editor, workspace }: { editor: ReturnType<typeof useEditor>; workspace: Workspace | null }) {
  const { save } = editor;
  if (workspace && workspace.kind === 'folder' && !workspace.canWrite) {
    return (
      <span class="save error" title={`Chrome opened ${workspace.label} view-only, so nothing saves back. Files has the button that asks for edit access.`}>
        view only
      </span>
    );
  }
  if (!workspace?.canWrite) {
    return (
      <span class="save" title="No folder open, so changes live in this tab only. Open a folder to save them.">
        not saved to a folder
      </span>
    );
  }
  const text =
    save === 'saving' ? 'saving…' : save === 'saved' ? 'saved' : save === 'dirty' ? 'unsaved' : save === 'conflict' ? 'not saved' : save === 'error' ? 'could not save' : 'saved';
  return (
    <span class={`save ${save}`} title={editor.file ? `Autosaves to ${editor.file.fileName}` : 'Autosaves once the template has a file.'}>
      {text}
    </span>
  );
}
