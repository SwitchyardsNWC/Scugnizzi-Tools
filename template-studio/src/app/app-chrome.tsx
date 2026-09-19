// Two pieces of Template Studio's frame: the inbox around the message, and the badge that says whether the
// email is saved. Moved out of App.tsx as they were (learnings 3.78).

import type { ComponentChildren } from 'preact';
import type { Workspace } from '../workspace/workspace.ts';
import { InboxChrome } from './Inbox.tsx';
import { useEditor } from './useEditor.ts';

export type Device = 'desktop' | 'phone';

/**
 * The message, with or without a client around it.
 *
 * A component rather than a ternary because the stage it wraps is forty lines of props, and
 * writing those twice is writing a bug twice.
 */
export function Framed({
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

export function SaveBadge({ editor, workspace }: { editor: ReturnType<typeof useEditor>; workspace: Workspace | null }) {
  const { save } = editor;
  if (workspace && workspace.kind === 'folder' && !workspace.canWrite) {
    return (
      <span class="save error" title={`Chrome opened ${workspace.label} view-only, so nothing saves back. Files has the button that asks for edit access.`}>
        view only
      </span>
    );
  }
  if (!workspace?.canWrite) {
    return (
      <span class="save" title="No folder open: this email is kept in this browser and comes back when you reopen Template Studio. Open a folder to save it as a file.">
        kept in this browser
      </span>
    );
  }
  // A document with no file is not "saved", whatever its state says: a new email before its first change, or
  // one whose file was just deleted from Files (the badge went on saying "saved" after the delete).
  if (!editor.file && (save === 'clean' || save === 'saved')) {
    return (
      <span class="save clean" title="This email has no file in the folder. Its next change autosaves into a new one.">
        not in a file
      </span>
    );
  }
  const text =
    save === 'saving' ? 'saving…' : save === 'saved' ? 'saved' : save === 'dirty' ? 'unsaved' : save === 'conflict' ? 'not saved' : save === 'error' ? 'could not save' : 'saved';
  return (
    <span class={`save ${save}`} title={editor.file ? `Autosaves to ${editor.file.fileName}` : 'Autosaves once the template has a file.'}>
      {text}
    </span>
  );
}
