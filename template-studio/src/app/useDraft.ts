// With no folder, the email is kept in this browser (model/draft.ts).

import { useEffect, useRef, useState } from 'preact/hooks';

import { DRAFT_KEY, draftJson } from '../model/draft.ts';
import type { Template } from '../model/types.ts';
import type { Workspace } from '../workspace/workspace.ts';
import type { Notify } from './callbacks.ts';
import type { Editor } from './useEditor.ts';

export function useDraft({
  editor,
  workspace,
  restored,
  notify,
}: {
  editor: Editor;
  workspace: Workspace | null;
  /** The email left open last time, when there was one to bring back. */
  restored: Template | null;
  notify: Notify;
}) {
  const [draftFailed, setDraftFailed] = useState(false);
  const templateRef = useRef(editor.template);
  templateRef.current = editor.template;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const keepDraft = () => {
    if (workspaceRef.current?.canWrite) return;
    try {
      localStorage.setItem(DRAFT_KEY, draftJson(templateRef.current));
      setDraftFailed(false);
    } catch {
      setDraftFailed(true);
    }
  };
  // Written as it changes. With a writable folder open the email lives in its file and the draft goes, so a
  // later visit never brings back something older than the file.
  useEffect(() => {
    if (workspace?.canWrite) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing kept to clear.
      }
      return;
    }
    const timer = window.setTimeout(keepDraft, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.template, workspace]);
  useEffect(() => {
    // Once more on the way out, for the last few keystrokes.
    const flush = () => keepDraft();
    window.addEventListener('pagehide', flush);
    if (restored) notify(`Welcome back: ${restored.name}, as you left it. It is kept in this browser until you open a folder.`);
    return () => window.removeEventListener('pagehide', flush);
    // Once, on the way in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only when the browser would not keep the email: then leaving the page would lose it, so the browser asks first.
  useEffect(() => {
    if (workspace?.canWrite || !draftFailed || !editor.canUndo) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [workspace, draftFailed, editor.canUndo]);
}
