// The keyboard.
//
// One policy, here. The canvas forwards the keys it does not own (Preview.tsx), the layer tree
// and the palette are ordinary buttons, and a field keeps its own keys — so a shortcut means the
// same thing whichever pane last had the click. Undo and redo live in useEditor and are not
// repeated here.

import { useEffect, type Dispatch, type StateUpdater } from 'preact/hooks';

import { moveSections, stackOf } from '../model/edit.ts';
import type { Workspace } from '../workspace/workspace.ts';
import type { Notify } from './callbacks.ts';
import type { PreviewApi } from './Preview.tsx';
import type { Editor } from './useEditor.ts';

export function useKeyboard({
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
}: {
  editor: Editor;
  workspace: Workspace | null;
  notify: Notify;
  exportTemplate(): Promise<void>;
  showKeys: boolean;
  setShowKeys: Dispatch<StateUpdater<boolean>>;
  showBranches: boolean;
  setShowBranches: Dispatch<StateUpdater<boolean>>;
  presenting: boolean;
  setPresenting: Dispatch<StateUpdater<boolean>>;
  drawing: boolean;
  setDrawing: Dispatch<StateUpdater<boolean>>;
  selectedLayer: string | null;
  setSelectedLayer: Dispatch<StateUpdater<string | null>>;
  /** The freeform block open as a workspace, which has keys of its own while it is. */
  surfaceOf: string | null;
  /** Every selected block, primary first, in document order. */
  selectedIds: string[];
  setAlso: Dispatch<StateUpdater<string[]>>;
  /** Set while a selection change is an extension of the run, so the run survives it. */
  extending: { current: boolean };
  moveSelected(blockId: string, delta: number): void;
  selectNeighbour(blockId: string, delta: number, extend?: boolean): void;
  previewApi: { current: PreviewApi | null };
}) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, workspace, notify, exportTemplate, showKeys, showBranches, presenting, drawing, selectedLayer, surfaceOf, moveSelected, selectNeighbour, selectedIds]);
}
