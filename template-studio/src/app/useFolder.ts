// The open folder: the workspace and everything read from it.
//
// One place owns the workspace, its template files, its assets, its design systems and its
// patterns, because they arrive together — opening a folder reads all five — and go together.

import { useCallback, useRef, useState } from 'preact/hooks';

import type { DesignSystem } from '../model/design-system.ts';
import type { Pattern } from '../model/patterns.ts';
import { openFolder, type AssetFile, type TemplateFile, type Workspace } from '../workspace/workspace.ts';
import type { Notify } from './callbacks.ts';

export function useFolder({
  notify,
  setError,
  setRefused,
}: {
  notify: Notify;
  setError(message: string | null): void;
  setRefused(message: string | null): void;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [files, setFiles] = useState<TemplateFile[]>([]);
  const [assets, setAssets] = useState<AssetFile[]>([]);
  /** The folder's design systems, by name. */
  const [systems, setSystems] = useState<Record<string, DesignSystem>>({});
  /** The folder's patterns. With no folder open they still live here for the session. */
  const [patterns, setPatterns] = useState<Pattern[]>([]);

  // A new document's first save picks a name that collides with nothing here, and once the file
  // exists the folder is re-read so the panel lists it and the editor is bound to the real entry.
  // `adoptRef` is filled by the app once the editor exists, since the editor needs `onCreated` first.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, adopt, notify]);

  return {
    workspace,
    files,
    assets,
    setAssets,
    systems,
    setSystems,
    patterns,
    setPatterns,
    workspaceRef,
    adoptRef,
    onCreated,
    adopt,
    refreshAssets,
    pickFolder,
    allowEditing,
  };
}
