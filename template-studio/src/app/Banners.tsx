// The banners between the top bar and the body: a refused write, a folder to reopen, an error, a
// save conflict. Each has the one button that deals with it.

import type { Editor } from './useEditor.ts';
import type { useProjectFolder } from './useProjectFolder.ts';

export function Banners({
  editor,
  refused,
  canAllow,
  onAllowEditing,
  onDismissRefused,
  projectFolder,
  error,
  onDismissError,
}: {
  editor: Editor;
  /**
   * A write Chrome refused. Its own banner rather than `error`, because it has a fix: Chrome's
   * folder picker asks "Edit files" or "View files", and "View files" gives a folder that opens,
   * lists and previews and throws on every write. One click asks for the rest.
   */
  refused: string | null;
  /** The workspace can ask Chrome for edit access. */
  canAllow: boolean;
  onAllowEditing(): void;
  onDismissRefused(): void;
  projectFolder: ReturnType<typeof useProjectFolder>;
  error: string | null;
  onDismissError(): void;
}) {
  return (
    <>
      {refused && (
        <div class="banner" role="alert">
          {refused}
          {canAllow && (
            <button class="btn" title="Chrome asks once; choose “Edit files”." onClick={onAllowEditing}>
              Allow editing
            </button>
          )}
          <button class="link" onClick={onDismissRefused}>Dismiss</button>
        </div>
      )}

      {projectFolder.reopenable && (
        <div class="banner" role="status">
          {projectFolder.reopenable.name} is the project folder, and Chrome needs one click to open it again.
          <button class="btn" onClick={() => void projectFolder.reopen()}>
            Reopen {projectFolder.reopenable.name}
          </button>
          <button class="link" onClick={projectFolder.dismiss}>Dismiss</button>
        </div>
      )}

      {error && (
        <div class="banner" role="alert">
          {error}
          <button class="link" onClick={onDismissError}>Dismiss</button>
        </div>
      )}

      {editor.conflictAt !== null && (
        <div class="banner" role="alert">
          Someone else saved this template while you were editing, so yours was not written. Save a copy, or
          reload theirs and redo your change.
          <button class="link" onClick={editor.dismissConflict}>Dismiss</button>
        </div>
      )}
    </>
  );
}
