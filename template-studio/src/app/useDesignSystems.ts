// The folder's design systems: following one, saving the template's own as one, and letting go.

import { useCallback, type Dispatch, type StateUpdater } from 'preact/hooks';

import type { DesignSystem } from '../model/design-system.ts';
import { designSystemOf, detachFromFolderSystem, followFolderSystem } from '../model/edit.ts';
import { fileSlug, serializeDesignSystem } from '../model/serialize.ts';
import type { Workspace } from '../workspace/workspace.ts';
import type { Failed, Notify } from './callbacks.ts';
import type { Editor } from './useEditor.ts';

export function useDesignSystems({
  editor,
  workspace,
  systems,
  setSystems,
  notify,
  failed,
}: {
  editor: Editor;
  workspace: Workspace | null;
  systems: Record<string, DesignSystem>;
  setSystems: Dispatch<StateUpdater<Record<string, DesignSystem>>>;
  notify: Notify;
  failed: Failed;
}) {
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
    [editor, workspace, notify, failed, setSystems],
  );

  const detachSystem = useCallback(() => {
    editor.commit('Detach design system', detachFromFolderSystem(editor.template));
    notify('This template keeps its own copy of the system now. The folder’s file is untouched.');
  }, [editor, notify]);

  return { followSystem, saveSystemAs, detachSystem };
}
