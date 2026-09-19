// Template Studio and the project (src/project): the folder the project board opened is the one Template Studio
// opens.
//
// Three things on top of reopening the remembered folder, which Template Studio always did: a template the board
// asked for with `?open=<file>`; the one click Chrome needs to open a remembered folder again after a restart,
// which used to leave Template Studio silently without its folder; and a project opened in another tab while this
// one has no folder to save into.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/** Set in this tab once the board has opened a file here. */
const FROM_BOARD_KEY = 'scuggnizzi.studio.from-board';

import { materialiseFolderSystem } from '../model/edit.ts';
import { PROJECT_CHANNEL } from '../model/project.ts';
import type { Template } from '../model/types.ts';
import { folderWorkspace, recallFolderHandle, restoreFolder, type TemplateFile, type Workspace } from '../workspace/workspace.ts';

interface Options {
  adopt(next: Workspace): Promise<void>;
  workspace: Workspace | null;
  load(template: Template, file: TemplateFile): void;
  notify(message: string): void;
}

export function useProjectFolder({ adopt, workspace, load, notify }: Options) {
  const [reopenable, setReopenable] = useState<FileSystemDirectoryHandle | null>(null);
  const wanted = useRef<string | null>(null);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const loadRef = useRef(load);
  loadRef.current = load;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  /** The template the address asked for, once its folder is open. */
  const openWanted = useCallback(async (ws: Workspace) => {
    const name = wanted.current;
    if (!name) return;
    wanted.current = null;
    try {
      const file = (await ws.list()).find((f) => f.fileName === name);
      if (!file) {
        notifyRef.current(`${name} is not in ${ws.label} any more.`);
        return;
      }
      const [loaded, systems] = await Promise.all([file.load(), ws.designSystems()]);
      const { template, warning } = materialiseFolderSystem(loaded.template, systems);
      loadRef.current(template, file);
      const warnings = [...loaded.warnings, ...(warning ? [warning] : [])];
      if (warnings.length) notifyRef.current(warnings.join(' '));
    } catch (cause) {
      notifyRef.current(cause instanceof Error ? cause.message : `Could not read ${name}.`);
    }
  }, []);

  const connect = useCallback(async () => {
    const found = await restoreFolder();
    if (found) {
      setReopenable(null);
      await adopt(found);
      await openWanted(found);
      return;
    }
    setReopenable(await recallFolderHandle());
  }, [adopt, openWanted]);

  /**
   * Whether the board sent this tab here (`?open=<file>` is the board's, and nobody else's), so the back arrow
   * goes back to the board rather than to the tools. Kept for the tab, so a reload does not forget.
   */
  const [fromBoard, setFromBoard] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(FROM_BOARD_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('open');
    // The board sends `?open=<file>` to open a file, or `?from=board` for a new email; either way the arrow goes back to it.
    if (name || params.get('from') === 'board') {
      setFromBoard(true);
      try {
        sessionStorage.setItem(FROM_BOARD_KEY, '1');
      } catch {
        // Storage blocked: the arrow knows for this page load only.
      }
      params.delete('from');
    }
    if (name) {
      wanted.current = name;
      params.delete('open');
      const rest = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    }
    void connect();
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(PROJECT_CHANNEL);
      // A folder this tab is already saving into stays; one opened elsewhere is taken only when there is none.
      channel.onmessage = (event: MessageEvent) => {
        if ((event.data as { type?: string } | null)?.type === 'opened' && !workspaceRef.current?.canWrite) void connect();
      };
    } catch {
      channel = null;
    }
    return () => channel?.close();
  }, [connect]);

  /** The click Chrome needs. Reopens the folder for editing, and opens the template that was asked for. */
  const reopen = useCallback(async () => {
    const dir = reopenable;
    if (!dir) return;
    let state = 'denied';
    try {
      state = await dir.requestPermission({ mode: 'readwrite' });
    } catch {
      state = 'denied';
    }
    if (state !== 'granted') {
      notifyRef.current(`Chrome did not reopen ${dir.name}. Open it from Files, and choose “Edit files” when it asks.`);
      return;
    }
    setReopenable(null);
    const ws = folderWorkspace(dir, true);
    await adopt(ws);
    await openWanted(ws);
  }, [reopenable, adopt, openWanted]);

  return { reopenable: workspace ? null : reopenable, reopen, dismiss: () => setReopenable(null), fromBoard };
}
