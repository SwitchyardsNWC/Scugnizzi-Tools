import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import {
  addBlockToColumn,
  addSection,
  duplicateSection,
  moveBlockToColumn,
  moveSection,
  moveSectionTo,
  addColumnsAt,
  addSectionAt,
  allBlocks,
  convertBlock,
  duplicateBlock,
  groupIntoStack,
  splitStack,
  moveBlockToSection,
  moveBlockInto,
  moveBlockWithin,
  removeBlock,
  removeBlocks,
  removeSection,
  setRowColumns,
  siteOf,
  setValue,
  type Selection,
} from '../model/edit.ts';
import { serializeDesignSystem, serializeTemplate, templateFileName } from '../model/serialize.ts';
import type { DesignSystem } from '../model/design-system.ts';
import type { BlockType, Template } from '../model/types.ts';
import type { TemplateFile, Workspace } from '../workspace/workspace.ts';

// Document state, undo, and saving.
//
// Undo stores whole documents rather than inverse operations. A template is a few kilobytes, fifty
// of them is a quarter of a megabyte, and in exchange the undo stack cannot desynchronise from the
// document — which is the failure mode of inverse-command undo and the one that loses work.
// acceptance.md §2 asks for fifty steps covering every action including drags; this covers every
// action by construction, because there is only one way to change the document.
//
// Typing coalesces. Without it, "Heading" is seven undo steps and Cmd+Z becomes useless.

export interface UndoEntry {
  label: string;
  template: Template;
  selection: Selection;
}

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error' | 'local';

const DEPTH = 80;
const COALESCE_MS = 900;
const AUTOSAVE_MS = 700;

export interface Editor {
  template: Template;
  selection: Selection;
  select(selection: Selection): void;

  set(path: string, value: unknown): void;
  /**
   * Writes to a named node rather than the current selection.
   *
   * Needed wherever the edit and the selection arrive together — the fields view and inline editing
   * on the canvas both act on a block the user has not necessarily selected yet. Calling `select`
   * and then `set` looks equivalent and is not: `set` closes over the selection from its own
   * render, so the write would land on whatever was selected a moment ago.
   */
  setAt(selection: Selection, path: string, value: unknown): void;
  commit(label: string, next: Template, options?: { coalesce?: string; select?: Selection }): void;

  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;

  /** Sets a row's column count and ratio in one step, moving orphaned blocks rather than losing them. */
  setColumns(rowId: string, spans: number[]): void;
  /** Changes the widths of a row's columns as a divider is dragged: one undo step for the drag. */
  resizeColumns(rowId: string, spans: number[]): void;
  /** Turns a block into another kind of block, in place, keeping what both kinds have. */
  convert(blockId: string, type: BlockType): void;
  /** Moves a block to another column of the row it is in. */
  moveToColumn(blockId: string, index: number): void;
  /** Adds a block to one column, at `index` or at the end, and selects it. */
  addToColumn(sectionId: string, columnId: string, type: BlockType, index?: number): void;
  /**
   * Merges the sections holding these blocks into one column — a group. False when the run cannot
   * be grouped: not contiguous, a row of columns in it, or a block that draws its own band.
   */
  group(blockIds: string[]): boolean;
  /** One section per block again, keeping the look. */
  ungroup(sectionId: string): void;

  /** Deletes one block wherever it is, emptying its section if it was the last one. Offers Undo. */
  removeOne(blockId: string): void;
  /** Deletes a run of blocks in one step, one undo. Offers Undo. */
  removeMany(blockIds: string[]): void;
  /** Copies one block directly below itself, with fresh field names. */
  duplicateOne(blockId: string): void;
  /** Nudges a block one place inside its own column. */
  nudge(blockId: string, delta: number): void;
  /** Drops a block into a column at a position — what a drag on the canvas resolves to. */
  dropInto(blockId: string, columnId: string, index: number): void;
  /** Drops a block out into a full-width section of its own, at an absolute position. */
  dropAsSection(blockId: string, index: number): void;
  /** Adds a new block in a full-width section of its own, at an absolute position. */
  addAt(type: BlockType, index: number): void;
  /** Drops an empty row of columns at an absolute position, and selects it. */
  addColumns(index: number, count?: number): void;

  move(sectionId: string, delta: number): void;
  moveTo(sectionId: string, index: number): void;
  duplicate(sectionId: string): void;
  remove(sectionId: string): void;
  add(type: BlockType, afterSectionId: string | null): void;

  /** Replaces the document wholesale — opening a file. Clears the history with it. */
  load(template: Template, file: TemplateFile | null): void;
  /**
   * Starts a fresh document with no file.
   *
   * `save` writes it straight away — a copy of something should exist the moment you ask for it.
   * Without it the document saves on the first edit, so clicking New three times while deciding
   * does not litter the folder with three untitled files.
   */
  create(template: Template, options?: { save?: boolean }): void;
  /**
   * Binds the document to the file it was just saved as, without reloading it.
   *
   * The first autosave of a new document creates its file; from then on every save has to go to
   * *that* file — not to whatever the name currently slugs to, or renaming the template would leave
   * a trail of files, one per name it has had.
   */
  adoptFile(file: TemplateFile): void;

  save: SaveState;
  /** Why the last save failed, when it did. Cleared by the next save that succeeds. */
  saveError: string | null;
  saveNow(): void;
  file: TemplateFile | null;
  /** Set when a save was refused because the file changed underneath us. */
  conflictAt: number | null;
  dismissConflict(): void;
}

export interface EditorOptions {
  initial: Template;
  workspace: Workspace | null;
  /** Undo-able messages. Destructive things happen and offer Undo rather than asking first (3.2). */
  notify(message: string, undo?: () => void): void;
  /**
   * Every file already in the folder, so a new document's first save cannot land on one of them.
   * A new template called "Standard email" used to save straight over `standard-email.template.json`
   * — on a synced folder, everybody's copy, before anybody noticed.
   */
  fileNames?: string[];
  /** Called once, after the save that created a new document's file, with the name it got. */
  onCreated?(fileName: string): void;
  /**
   * Called after the folder's design system file is written — which happens on the first save
   * after an edit to a system the template follows — so the app's copy of the folder's systems
   * stays current without re-reading the folder.
   */
  onSystemWritten?(name: string, system: DesignSystem): void;
}

export function useEditor({ initial, workspace, notify, fileNames = [], onCreated, onSystemWritten }: EditorOptions): Editor {
  const [template, setTemplate] = useState(initial);
  const [selection, setSelection] = useState<Selection>({ kind: 'template' });
  const [past, setPast] = useState<UndoEntry[]>([]);
  const [future, setFuture] = useState<UndoEntry[]>([]);
  const [save, setSave] = useState<SaveState>('clean');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [file, setFile] = useState<TemplateFile | null>(null);
  const [conflictAt, setConflictAt] = useState<number | null>(null);

  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);
  const modified = useRef(0);
  const saveTimer = useRef<number | undefined>(undefined);
  /** The file name a new document's first save chose, until the app hands back the real entry. */
  const pinned = useRef<string | null>(null);
  // Refs rather than closure captures: `write` is memoised on the things a save reads, and the
  // list of files and the callback are not among them — a stale copy of either is a wrong name.
  const taken = useRef(fileNames);
  taken.current = fileNames;
  const created = useRef(onCreated);
  created.current = onCreated;
  const systemWritten = useRef(onSystemWritten);
  systemWritten.current = onSystemWritten;
  /** The folder system as last written (or as loaded), so an unchanged one is not rewritten on every save. */
  const lastSystem = useRef<string | null>(null);

  const commit = useCallback(
    (label: string, next: Template, options?: { coalesce?: string; select?: Selection }) => {
      setTemplate((current) => {
        if (next === current) return current;
        const now = Date.now();
        const key = options?.coalesce;
        const continuing =
          key !== undefined && lastCoalesce.current?.key === key && now - lastCoalesce.current.at < COALESCE_MS;

        setPast((stack) => {
          // A continuing run of keystrokes replaces nothing — the entry already on the stack holds
          // the state from *before* the run began, which is where Cmd+Z should land.
          if (continuing) return stack;
          return [...stack, { label, template: current, selection }].slice(-DEPTH);
        });
        setFuture([]);
        lastCoalesce.current = key === undefined ? null : { key, at: now };
        return next;
      });
      if (options?.select) setSelection(options.select);
      setSave('dirty');
    },
    [selection],
  );

  const setAt = useCallback((at: Selection, path: string, value: unknown) => {
    setTemplate((current) => {
      const next = setValue(current, at, path, value);
      if (next === current) return current;
      const now = Date.now();
      const key = `${JSON.stringify(at)}:${path}`;
      const continuing = lastCoalesce.current?.key === key && now - lastCoalesce.current.at < COALESCE_MS;
      if (!continuing) {
        setPast((stack) => [...stack, { label: 'Edit', template: current, selection: at }].slice(-DEPTH));
      }
      lastCoalesce.current = { key, at: now };
      setFuture([]);
      return next;
    });
    setSave('dirty');
  }, []);

  const set = useCallback((path: string, value: unknown) => setAt(selection, path, value), [setAt, selection]);

  const undo = useCallback(() => {
    setPast((stack) => {
      const entry = stack.at(-1);
      if (!entry) return stack;
      setFuture((f) => [{ label: entry.label, template, selection }, ...f].slice(0, DEPTH));
      setTemplate(entry.template);
      setSelection(entry.selection);
      lastCoalesce.current = null;
      setSave('dirty');
      return stack.slice(0, -1);
    });
  }, [template, selection]);

  const redo = useCallback(() => {
    setFuture((stack) => {
      const [entry, ...rest] = stack;
      if (!entry) return stack;
      setPast((p) => [...p, { label: entry.label, template, selection }].slice(-DEPTH));
      setTemplate(entry.template);
      setSelection(entry.selection);
      lastCoalesce.current = null;
      setSave('dirty');
      return rest;
    });
  }, [template, selection]);

  // Cmd+Z / Cmd+Shift+Z, and never while someone is typing into a field — the browser's own
  // text undo should win inside an input.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // --- structural operations, each offering Undo rather than asking first -----------------------

  const structural = useCallback(
    (label: string, next: Template, select?: Selection) => {
      const before = template;
      const beforeSelection = selection;
      commit(label, next, select ? { select } : {});
      return () => {
        setTemplate(before);
        setSelection(beforeSelection);
        setPast((stack) => stack.slice(0, -1));
        setSave('dirty');
      };
    },
    [template, selection, commit],
  );

  const setColumns = useCallback(
    (rowId: string, spans: number[]) => {
      commit(spans.length === 1 ? 'One column' : `${spans.length} columns`, setRowColumns(template, rowId, spans));
    },
    [template, commit],
  );

  const resizeColumns = useCallback(
    (rowId: string, spans: number[]) => {
      commit('Column widths', setRowColumns(template, rowId, spans), { coalesce: `columns:${rowId}` });
    },
    [template, commit],
  );

  const convert = useCallback(
    (blockId: string, type: BlockType) => {
      commit('Change type', convertBlock(template, blockId, type));
    },
    [template, commit],
  );

  const moveToColumn = useCallback(
    (blockId: string, index: number) => {
      commit('Move to column', moveBlockToColumn(template, blockId, index));
    },
    [template, commit],
  );

  const addToColumn = useCallback(
    (sectionId: string, columnId: string, type: BlockType, index?: number) => {
      const next = addBlockToColumn(template, columnId, type, index);
      const before = new Set(allBlocks(template).map((b) => b.id));
      const created = allBlocks(next).find((b) => !before.has(b.id));
      commit('Add', next, created ? { select: { kind: 'block', sectionId, blockId: created.id } } : {});
    },
    [template, commit],
  );

  const group = useCallback(
    (blockIds: string[]) => {
      const next = groupIntoStack(template, blockIds);
      if (!next) return false;
      const primary = selection.kind === 'block' ? selection.blockId : blockIds[0]!;
      const site = siteOf(next, primary);
      commit('Group', next, site ? { select: { kind: 'block', sectionId: site.section.id, blockId: primary } } : {});
      return true;
    },
    [template, selection, commit],
  );

  const ungroup = useCallback(
    (sectionId: string) => {
      const next = splitStack(template, sectionId);
      if (!next) return;
      const primary = selection.kind === 'block' ? selection.blockId : null;
      const site = primary ? siteOf(next, primary) : null;
      commit('Ungroup', next, site && primary ? { select: { kind: 'block', sectionId: site.section.id, blockId: primary } } : {});
    },
    [template, selection, commit],
  );

  const removeMany = useCallback(
    (blockIds: string[]) => {
      const undoIt = structural('Delete', removeBlocks(template, blockIds), { kind: 'template' });
      notify(`Deleted ${blockIds.length} blocks.`, undoIt);
    },
    [template, structural, notify],
  );

  const removeOne = useCallback(
    (blockId: string) => {
      // Deleting just happens and offers Undo. Jared liked that considerably more than being asked,
      // and native confirm() silently does nothing in this environment anyway (learnings 3.2).
      const undoIt = structural('Delete', removeBlock(template, blockId), { kind: 'template' });
      notify('Deleted.', undoIt);
    },
    [template, structural, notify],
  );

  const duplicateOne = useCallback(
    (blockId: string) => {
      const next = duplicateBlock(template, blockId);
      const before = new Set(allBlocks(template).map((b) => b.id));
      const created = allBlocks(next).find((b) => !before.has(b.id));
      const site = created ? siteOf(next, created.id) : null;
      const undoIt = structural(
        'Duplicate',
        next,
        site && created ? { kind: 'block', sectionId: site.section.id, blockId: created.id } : undefined,
      );
      notify('Duplicated.', undoIt);
    },
    [template, structural, notify],
  );

  const nudge = useCallback(
    (blockId: string, delta: number) => {
      commit(delta < 0 ? 'Move up' : 'Move down', moveBlockWithin(template, blockId, delta));
    },
    [template, commit],
  );

  const dropInto = useCallback(
    (blockId: string, columnId: string, index: number) => {
      commit('Move', moveBlockInto(template, blockId, columnId, index));
    },
    [template, commit],
  );

  const dropAsSection = useCallback(
    (blockId: string, index: number) => {
      commit('Move', moveBlockToSection(template, blockId, index));
    },
    [template, commit],
  );

  const addAt = useCallback(
    (type: BlockType, index: number) => {
      const next = addSectionAt(template, type, index);
      const created = next.sections.find((s) => !template.sections.some((old) => old.id === s.id));
      const block = created?.rows[0]?.columns[0]?.blocks[0];
      commit('Add', next, created && block ? { select: { kind: 'block', sectionId: created.id, blockId: block.id } } : {});
    },
    [template, commit],
  );

  const addColumns = useCallback(
    (index: number, count = 2) => {
      const next = addColumnsAt(template, index, count);
      const created = next.sections.find((s) => !template.sections.some((old) => old.id === s.id));
      // Selected as a *section*, because what was just dropped is the row, not anything inside it.
      commit('Add columns', next, created ? { select: { kind: 'section', sectionId: created.id } } : {});
    },
    [template, commit],
  );

  const move = useCallback(
    (sectionId: string, delta: number) => {
      commit(delta < 0 ? 'Move up' : 'Move down', moveSection(template, sectionId, delta));
    },
    [template, commit],
  );

  const moveTo = useCallback(
    (sectionId: string, index: number) => {
      commit('Move', moveSectionTo(template, sectionId, index));
    },
    [template, commit],
  );

  const duplicate = useCallback(
    (sectionId: string) => {
      const next = duplicateSection(template, sectionId);
      const added = next.sections[template.sections.findIndex((s) => s.id === sectionId) + 1];
      const undoIt = structural('Duplicate', next, added ? { kind: 'section', sectionId: added.id } : undefined);
      notify('Duplicated.', undoIt);
    },
    [template, structural, notify],
  );

  const remove = useCallback(
    (sectionId: string) => {
      // Deleting just happens and offers Undo. Jared liked that considerably more than being asked,
      // and native confirm() silently does nothing in this environment anyway (learnings 3.2).
      const undoIt = structural('Delete', removeSection(template, sectionId), { kind: 'template' });
      notify('Deleted.', undoIt);
    },
    [template, structural, notify],
  );

  const add = useCallback(
    (type: BlockType, afterSectionId: string | null) => {
      const next = addSection(template, type, afterSectionId);
      const created = next.sections.find((s) => !template.sections.some((old) => old.id === s.id));
      // The *block*, not its section. Selecting the section showed the block's panel — the
      // inspector falls through to the first block — with every control reading undefined and
      // writing nowhere, until you clicked the block on the canvas. A dial wired to nothing is
      // the failure the brief names, and clicking a palette card is how most blocks arrive.
      const block = created?.rows[0]?.columns[0]?.blocks[0];
      commit('Add', next, created && block ? { select: { kind: 'block', sectionId: created.id, blockId: block.id } } : {});
    },
    [template, commit],
  );

  const load = useCallback((next: Template, opened: TemplateFile | null) => {
    setTemplate(next);
    setFile(opened);
    setSelection({ kind: 'template' });
    setPast([]);
    setFuture([]);
    modified.current = opened?.modified ?? 0;
    pinned.current = null;
    lastSystem.current = next.designSystem && next.ds ? serializeDesignSystem(next.ds) : null;
    lastCoalesce.current = null;
    setSave('clean');
    setConflictAt(null);
  }, []);

  const create = useCallback(
    (next: Template, options?: { save?: boolean }) => {
      load(next, null);
      if (options?.save) setSave('dirty');
    },
    [load],
  );

  const adoptFile = useCallback((opened: TemplateFile) => {
    setFile(opened);
    pinned.current = null;
    // The entry the folder listed is the file the last save wrote, so its time is ours. Taking
    // the later of the two guards against a listing that raced an even later save.
    modified.current = Math.max(modified.current, opened.modified);
  }, []);

  // --- saving ------------------------------------------------------------------------------------

  const write = useCallback(async () => {
    if (!workspace || !workspace.canWrite) {
      setSave('local');
      return;
    }
    // The file's own name; else the one the first save chose; else a fresh one that collides with
    // nothing in the folder.
    const fresh = !file && !pinned.current;
    const name = file?.fileName ?? pinned.current ?? templateFileName(template, taken.current);
    setSave('saving');
    try {
      const result = await workspace.writeTemplate(name, serializeTemplate(template), modified.current);
      if (!result.ok) {
        setConflictAt(result.modified);
        setSave('conflict');
        return;
      }
      modified.current = result.modified;
      setSaveError(null);
      // The folder's system, when this template follows one and the values moved. The template
      // file above carries no copy of it (serialize.ts), so this write is the only place the
      // panel's edits reach disk — and every template that names the system reads it from here.
      if (template.designSystem && template.ds) {
        const json = serializeDesignSystem(template.ds);
        if (json !== lastSystem.current) {
          await workspace.writeDesignSystem(template.designSystem, json);
          lastSystem.current = json;
          systemWritten.current?.(template.designSystem, template.ds);
        }
      }
      setSave('saved');
      if (fresh) {
        pinned.current = name;
        created.current?.(name);
      }
    } catch (cause) {
      setSave('error');
      setSaveError(cause instanceof Error ? cause.message : 'Could not save.');
    }
  }, [workspace, file, template]);

  useEffect(() => {
    if (save !== 'dirty') return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void write(), AUTOSAVE_MS) as unknown as number;
    return () => clearTimeout(saveTimer.current);
  }, [save, write]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  return useMemo(
    () => ({
      template,
      selection,
      select: setSelection,
      set,
      setAt,
      commit,
      undo,
      redo,
      canUndo,
      canRedo,
      undoLabel: past.at(-1)?.label ?? null,
      setColumns,
      resizeColumns,
      convert,
      moveToColumn,
      addToColumn,
      group,
      ungroup,
      removeOne,
      removeMany,
      duplicateOne,
      nudge,
      dropInto,
      dropAsSection,
      addAt,
      addColumns,
      move,
      moveTo,
      duplicate,
      remove,
      add,
      load,
      create,
      adoptFile,
      save,
      saveError,
      saveNow: () => void write(),
      file,
      conflictAt,
      dismissConflict: () => setConflictAt(null),
    }),
    [template, selection, set, setAt, commit, undo, redo, canUndo, canRedo, past, setColumns, resizeColumns, convert, moveToColumn, addToColumn, group, ungroup, removeOne, removeMany, duplicateOne, nudge, dropInto, dropAsSection, addAt, addColumns, move, moveTo, duplicate, remove, add, load, create, adoptFile, save, saveError, write, file, conflictAt],
  );
}
