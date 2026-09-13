// The open project, for any page on this site: which folder, what Chrome allows on it, and its project.json.
//
// Opening a folder in one page opens it in all of them. The handle is stored where Template Studio has always
// kept its folder (workspace/workspace.ts), and pages tell each other through a BroadcastChannel, so a
// Freeform tab picks up a project the board just opened without a reload.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { PROJECT_CHANNEL, type ProjectInfo } from '../model/project.ts';
import { forgetFolderHandle, permissionOf, pickFolderHandle, recallFolderHandle, rememberFolderHandle, supportsFolders } from '../workspace/workspace.ts';
import { readProject } from './folder.ts';

type Dir = FileSystemDirectoryHandle;

/**
 * - `none`: no project is open.
 * - `asking`: a project is remembered, and Chrome wants a click before it opens it again.
 * - `view-only`: it can be read and not written.
 * - `ready`: open for reading and writing.
 */
export type ProjectStatus = 'loading' | 'unsupported' | 'none' | 'asking' | 'view-only' | 'ready';

export interface Project {
  status: ProjectStatus;
  dir: Dir | null;
  info: ProjectInfo | null;
  writable: boolean;
  /** Goes up every time the project is looked at again, for effects that should read the folder anew. */
  generation: number;
  /** Shows the folder picker. */
  open(): Promise<boolean>;
  /** Opens a folder already in hand, one Create a project just made, as the project. */
  use(dir: Dir): Promise<void>;
  /** The click Chrome needs to open a remembered folder again, or to allow editing one opened view-only. */
  allow(): Promise<boolean>;
  close(): Promise<void>;
}

type State = Pick<Project, 'status' | 'dir' | 'info' | 'generation'>;

export function useProject(): Project {
  const [state, setState] = useState<State>({ status: 'loading', dir: null, info: null, generation: 0 });
  const channel = useRef<BroadcastChannel | null>(null);
  const dirRef = useRef<Dir | null>(null);

  const settle = useCallback(async (dir: Dir | null) => {
    dirRef.current = dir;
    if (!dir) {
      setState((s) => ({ status: supportsFolders() ? 'none' : 'unsupported', dir: null, info: null, generation: s.generation + 1 }));
      return;
    }
    const status: ProjectStatus =
      (await permissionOf(dir, 'readwrite')) === 'granted' ? 'ready' : (await permissionOf(dir, 'read')) === 'granted' ? 'view-only' : 'asking';
    let info: ProjectInfo | null = null;
    if (status !== 'asking') {
      try {
        info = await readProject(dir, status === 'ready');
      } catch {
        info = null;
      }
    }
    setState((s) => ({ status: info || status === 'asking' ? status : 'asking', dir, info, generation: s.generation + 1 }));
  }, []);

  useEffect(() => {
    void recallFolderHandle().then(settle);
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(PROJECT_CHANNEL);
      ch.onmessage = (event: MessageEvent) => {
        const type = (event.data as { type?: string } | null)?.type;
        if (type === 'opened' || type === 'closed') void recallFolderHandle().then(settle);
      };
    } catch {
      ch = null; // No channel: other pages see the project the next time they load.
    }
    channel.current = ch;
    return () => ch?.close();
  }, [settle]);

  const tell = (type: 'opened' | 'closed') => {
    try {
      channel.current?.postMessage({ type });
    } catch {
      // A closed channel: nothing to tell.
    }
  };

  const open = useCallback(async () => {
    const dir = await pickFolderHandle();
    if (!dir) return false;
    await settle(dir);
    tell('opened');
    return true;
  }, [settle]);

  const use = useCallback(
    async (dir: Dir) => {
      await rememberFolderHandle(dir);
      await settle(dir);
      tell('opened');
    },
    [settle],
  );

  const allow = useCallback(async () => {
    const dir = dirRef.current;
    if (!dir) return false;
    let granted = false;
    try {
      granted = (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
    } catch {
      granted = false;
    }
    await settle(dir);
    tell('opened');
    return granted;
  }, [settle]);

  const close = useCallback(async () => {
    await forgetFolderHandle();
    await settle(null);
    tell('closed');
  }, [settle]);

  return { ...state, writable: state.status === 'ready', open, use, allow, close };
}
