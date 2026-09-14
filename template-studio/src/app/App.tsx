import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { branchVariables, defaultsOf } from '../compile/branches.ts';
import { COLUMN_BLOCKS } from '../compile/blocks/index.ts';
import { compile } from '../compile/compile.ts';
import { simulateDark } from '../compile/dark.ts';
import { lint, type Finding } from '../compile/lint.ts';
import type { Branch } from '../compile/serialize.ts';
import { ADDABLE, CATALOG, STACKABLE } from '../model/catalog.ts';
import { DRAFT_KEY, readDraft } from '../model/draft.ts';
import {
  allBlocks,
  designSystemOf,
  duplicateTemplate,
  groupIntoStack,
  isStack,
  lockedBlockIds,
  materialiseFolderSystem,
  RATIOS,
  siteOf,
} from '../model/edit.ts';
import type { BlockType } from '../model/types.ts';
import { isWriteRefused, supportsFolders, workspaceFromFiles, type AssetFile, type TemplateFile } from '../workspace/workspace.ts';
import { Banners } from './Banners.tsx';
import { CanvasTools, WIDTHS, type Device } from './CanvasTools.tsx';
import { ChecksDrawer, CodeDrawer, FieldsDrawer } from './Drawers.tsx';
import { InboxChrome } from './Inbox.tsx';
import { TEXT_TARGETS } from './inline-text.ts';
import { Inspector } from './Inspector.tsx';
import { withLocalAssets } from './local-assets.ts';
import { DragGhost, KeysSheet, Toast } from './Overlays.tsx';
import { isPatternKind, type PaletteKind } from './Palette.tsx';
import { shared } from './placing.ts';
import { Preview, type PreviewApi, type RowInfo, type RowMenuSpec } from './Preview.tsx';
import { withPrints } from './printed-preview.ts';
import { revealInCanvas } from './reveal.ts';
import { Sidebar, type Tab } from './Sidebar.tsx';
import { readRecent, standardTemplate, STARTERS, writeRecent } from './starters.ts';
import { Surface, type SurfaceApi } from './Surface.tsx';
import type { Starter } from './Templates.tsx';
import { TopBar } from './TopBar.tsx';
import { useClipboard } from './useClipboard.ts';
import { useDesignSystems } from './useDesignSystems.ts';
import { useDraft } from './useDraft.ts';
import { useDrops } from './useDrops.ts';
import { useEditor } from './useEditor.ts';
import { useFolder } from './useFolder.ts';
import { useFreeformLink } from './useFreeformLink.ts';
import { useKeyboard } from './useKeyboard.ts';
import { useOutput } from './useOutput.ts';
import { usePatterns } from './usePatterns.ts';
import { useProjectFolder } from './useProjectFolder.ts';

// The editor, assembled.
//
// The document is the editor's (useEditor.ts); the folder is useFolder's; the rest of the app is
// hooks that each own one concern — patterns, drops, the clipboard, the Freeform link, the draft,
// what leaves the editor, the keyboard — and the components that draw the chrome around the
// canvas. What is left here is the state those share, and the wiring between them.

/**
 * How long after the last keystroke the canvas catches up.
 *
 * Compiling is sub-millisecond, so this is not about speed. Replacing the iframe's srcdoc reloads
 * the document, and doing that on every keystroke makes the canvas flicker and fight the typist.
 * A short pause is the difference between a preview and a strobe.
 */
const CANVAS_LAG = 180;

export function App() {
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
  /** Read by the clipboard handlers, which are bound once: the canvas has a clipboard of its own. */
  const surfaceOpen = useRef(false);
  surfaceOpen.current = Boolean(surfaceOf);
  const [overrides, setOverrides] = useState<Branch>({});
  const [showBranches, setShowBranches] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [showCode, setShowCode] = useState(false);
  // The email in the thing that reads it, rather than on the thing that reads it.
  const [inbox, setInbox] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [tab, setTab] = useState<Tab>('layers');
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
  /** A write Chrome refused: its own banner, because it has a fix (Banners.tsx). */
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

  // --- the folder, and the document ------------------------------------------------------------------

  const folder = useFolder({ notify, setError, setRefused });
  const { workspace, files, assets, setAssets, systems, setSystems, patterns, setPatterns } = folder;

  // The email left open last time with no folder to save it in (model/draft.ts); else the standard email.
  const restored = useMemo(() => {
    try {
      return readDraft(localStorage.getItem(DRAFT_KEY));
    } catch {
      return null;
    }
  }, []);
  const initial = useMemo(() => restored ?? standardTemplate(), [restored]);
  const fileNames = useMemo(() => files.map((f) => f.fileName), [files]);
  const editor = useEditor({
    initial,
    workspace,
    notify,
    fileNames,
    onCreated: (name) => void folder.onCreated(name),
    onSystemWritten: (name, system) => setSystems((old) => ({ ...old, [name]: system })),
  });
  folder.adoptRef.current = editor.adoptFile;

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

  /** Where a freeform block's picture sits on the email canvas, in viewport pixels: where the canvas flies from and back to. */
  const freeformRect = useCallback((blockId: string): DOMRect | null => {
    const f = frame.current;
    const el = f?.contentDocument?.querySelector(`[data-sy-block="${CSS.escape(blockId)}"] [data-sy-freeform]`);
    if (!f || !el) return null;
    const outer = f.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return new DOMRect(outer.left + r.left, outer.top + r.top, r.width, r.height);
  }, []);

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

  // --- the Freeform app: its frames, its pictures, and the prints of pages with effects ------------------
  const { allAssets, prints, openFreeformApp, freeformApp } = useFreeformLink({ editor, workspace, shownTemplate, assets, notify });

  /** Opens a freeform block as a workspace, selecting it on the way in. */
  const enterSurface = useCallback(
    (blockId: string) => {
      const site = siteOf(editor.template, blockId);
      const block = site?.column.blocks[site.index];
      if (!site || block?.type !== 'freeform') return;
      editor.select({ kind: 'block', sectionId: site.section.id, blockId });
      // A block that follows a Freeform app frame is drawn there; its own canvas would only be overwritten.
      if (block.source?.app === 'freeform') return openFreeformApp(block.source.key);
      setSurfaceOf(blockId);
    },
    [editor, openFreeformApp],
  );

  // --- the compiled email, as the canvas shows it -----------------------------------------------------
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
    // A freeform page with effects shows its print in its drawing's place (printed-preview.ts).
    const withAssets = withLocalAssets(withPrints(preview.html, shownTemplate, prints), allAssets);
    return dark ? simulateDark(withAssets) : withAssets;
  }, [preview, dark, allAssets, prints, shownTemplate]);

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

  // --- the folder's design systems and patterns, the clipboard, and drops -----------------------------------
  const { followSystem, saveSystemAs, detachSystem } = useDesignSystems({ editor, workspace, systems, setSystems, notify, failed });
  const { patternCards, placePatternAt, patternInfo, patternOf } = usePatterns({ editor, workspace, patterns, setPatterns, notify, failed });
  const onClipboard = useClipboard({ editor, selectedIds, notify, surfaceOpen });
  const drops = useDrops({ editor, placePatternAt, noteRecent });

  // The remembered folder, which is the open project's (src/project): reopened as before, plus a template the
  // project board asked for, the one click Chrome may need after a restart, and a project opened in another tab.
  const projectFolder = useProjectFolder({ adopt: folder.adopt, workspace, load: editor.load, notify });

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

  // With no folder, the email is kept in this browser (model/draft.ts).
  useDraft({ editor, workspace, restored, notify });

  // What leaves the editor: the file, the code, a block drawn as a picture.
  const { rasteriseBlock, rasterising, exportTemplate, copyCode, copied } = useOutput({
    editor,
    workspace,
    frame,
    allAssets,
    notify,
    failed,
    refreshAssets: folder.refreshAssets,
    setAssets,
    setError,
  });

  useKeyboard({
    editor,
    workspace,
    notify,
    exportTemplate,
    showKeys,
    setShowKeys,
    showBranches,
    setShowBranches,
    presenting,
    setPresenting,
    drawing,
    setDrawing,
    selectedLayer,
    setSelectedLayer,
    surfaceOf,
    selectedIds,
    setAlso,
    extending,
    moveSelected,
    selectNeighbour,
    previewApi,
  });

  return (
    <div class={`app ${presenting ? 'presenting' : ''}`}>
      <TopBar
        editor={editor}
        workspace={workspace}
        bytes={hubl.bytes}
        errors={errors.length}
        showFields={showFields}
        showCode={showCode}
        showChecks={showChecks}
        onFields={() => {
          setShowFields((v) => !v);
          setShowChecks(false);
          setShowCode(false);
        }}
        onCode={() => {
          setShowCode((v) => !v);
          setShowFields(false);
          setShowChecks(false);
        }}
        onChecks={() => {
          setShowChecks((v) => !v);
          setShowFields(false);
        }}
        onExport={() => void exportTemplate()}
      />

      <Banners
        editor={editor}
        refused={refused}
        canAllow={Boolean(workspace?.requestWrite)}
        onAllowEditing={() => void folder.allowEditing()}
        onDismissRefused={() => setRefused(null)}
        projectFolder={projectFolder}
        error={error}
        onDismissError={() => setError(null)}
      />

      <div class="body">
        <Sidebar
          editor={editor}
          tab={tab}
          onTab={goTab}
          onCloseDesign={() => goTab('design')}
          dragging={drops.dragType}
          onPaletteDrag={drops.onPaletteDrag}
          onPaletteDrop={drops.dropNew}
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
          onAllowEditing={() => void folder.allowEditing()}
          folders={supportsFolders()}
          onChooseFiles={(picked) => void folder.adopt(workspaceFromFiles(picked))}
          device={device === 'phone' ? 'phone' : 'desktop'}
          onDevice={setDevice}
          {...(workspace?.label ? { workspaceLabel: workspace.label } : {})}
          onOpenFile={(file) => void open(file)}
          onOpenFolder={folder.pickFolder}
        />

        <main class="canvas">
          <CanvasTools
            device={device}
            onDevice={setDevice}
            inbox={inbox}
            onInbox={() => setInbox((v) => !v)}
            dark={dark}
            onDark={() => setDark((v) => !v)}
            forceLight={Boolean(editor.template.forceLight)}
            presenting={presenting}
            onPresenting={() => setPresenting((v) => !v)}
            variables={variables}
            branch={branch}
            showBranches={showBranches}
            onShowBranches={() => setShowBranches((v) => !v)}
            onOverride={(key, on) => setOverrides((o) => ({ ...o, [key]: on }))}
            showKeys={showKeys}
            onShowKeys={() => setShowKeys((v) => !v)}
          />

          {surfaceOf && (
            <Surface
              editor={editor}
              blockId={surfaceOf}
              assets={allAssets}
              layer={selectedLayer}
              onSelectLayer={setSelectedLayer}
              onDone={() => setSurfaceOf(null)}
              rectOf={() => (surfaceOf ? freeformRect(surfaceOf) : null)}
              api={surfaceApi}
            />
          )}
          <div class={`scroller ${dark ? 'dark' : ''}`} ref={scroller}>
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
                    onEnterSurface={enterSurface}
                    onClipboard={onClipboard}
                    dim={showFields ? lockedBlockIds(shownTemplate) : []}
                    textTargets={textTargets}
                    onEditText={editText}
                    onDropBlock={drops.dropExisting}
                    frameRef={(el) => {
                      frame.current = el;
                    }}
                    probe={drops.probe}
                    onProbe={drops.onProbe}
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

          {showFields && <FieldsDrawer editor={editor} onClose={() => setShowFields(false)} />}
          {showCode && <CodeDrawer html={hubl.html} bytes={hubl.bytes} copied={copied} onCopy={() => void copyCode()} onClose={() => setShowCode(false)} />}
          {showChecks && <ChecksDrawer editor={editor} findings={findings} notify={notify} onClose={() => setShowChecks(false)} />}
        </main>

        {/* The right pane is the selection and nothing else now. It used to be shared with the
            design system, which meant opening Design hid the block whose type you were changing. */}
        <aside class="pane right">
          <Inspector
            editor={editor}
            onRasterise={rasteriseBlock}
            rasterising={rasterising}
            onSpacingHot={setSpacingHot}
            freeform={{ layer: selectedLayer, onSelectLayer: setSelectedLayer, drawing, onDrawing: setDrawing, open: Boolean(surfaceOf), onEnter: enterSurface, app: freeformApp }}
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

      {drops.dragType && drops.probe && <DragGhost dragType={drops.dragType} at={drops.probe} patterns={patternCards} />}
      {showKeys && <KeysSheet onClose={() => setShowKeys(false)} />}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
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
