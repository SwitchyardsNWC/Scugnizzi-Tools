// With no folder, the email is kept in this browser (model/draft.ts), and brought back next time.
//
// Moved out of App.tsx as it was (learnings 3.78). Written as the email changes; cleared once a writable folder
// holds the file; flushed on the way out; and when the browser will not keep it, leaving asks first.

import { useCallback, useEffect, useRef, useState, type MutableRef } from 'preact/hooks';

import { DRAFT_KEY, draftJson } from '../model/draft.ts';
import type { Template } from '../model/types.ts';
import type { Workspace } from '../workspace/workspace.ts';
import type { Editor } from './useEditor.ts';

export function useDraftKeeping({
  editor,
  workspace,
  workspaceRef,
  choosingRef,
  restored,
  notify,
}: {
  editor: Editor;
  workspace: Workspace | null;
  workspaceRef: MutableRef<Workspace | null>;
  /** True while the Welcome screen is up and nothing has been chosen: the blank under it is nobody's work. */
  choosingRef: MutableRef<boolean>;
  /** The draft this page opened on, when it did. */
  restored: Template | null;
  notify(message: string): void;
}): void {
  const [draftFailed, setDraftFailed] = useState(false);
  const templateRef = useRef(editor.template);
  templateRef.current = editor.template;
  const keepDraft = useCallback(() => {
    // Nothing chosen yet: the blank under the Welcome screen is nobody's work, and kept it would skip the screen next time.
    if (workspaceRef.current?.canWrite || choosingRef.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, draftJson(templateRef.current));
      setDraftFailed(false);
    } catch {
      setDraftFailed(true);
    }
  }, []);
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
  }, [editor.template, workspace, keepDraft]);
  // Once, on the way in: everything this reads is stable for the life of the page.
  useEffect(() => {
    // Once more on the way out, for the last few keystrokes.
    const flush = () => keepDraft();
    window.addEventListener('pagehide', flush);
    if (restored) notify(`Welcome back: ${restored.name}, as you left it. It is kept in this browser until you open a folder.`);
    return () => window.removeEventListener('pagehide', flush);
  }, [keepDraft, restored, notify]);

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
