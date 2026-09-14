// The top bar: what is true of the export. How big it is, whether it passes, and writing it.
//
// Opening a folder and opening the design system both moved into the rail, where the panels they
// belong to already live. A control in two places is a control whose state has to agree in two
// places.

import type { Workspace } from '../workspace/workspace.ts';
import { kb } from './starters.ts';
import type { Editor } from './useEditor.ts';

export function TopBar({
  editor,
  workspace,
  bytes,
  errors,
  showFields,
  showCode,
  showChecks,
  onFields,
  onCode,
  onChecks,
  onExport,
}: {
  editor: Editor;
  workspace: Workspace | null;
  /** The export's size, which Gmail clips at about 102KB. */
  bytes: number;
  /** How many findings are errors — the ones Export refuses over. */
  errors: number;
  showFields: boolean;
  showCode: boolean;
  showChecks: boolean;
  onFields(): void;
  onCode(): void;
  onChecks(): void;
  onExport(): void;
}) {
  return (
    <header class="bar">
      <a class="brand-back" href="../../index.html" title="Back to Scugnizzi tools" aria-label="Back to Scugnizzi tools">
        ←
      </a>
      <div class="brand">Template&nbsp;Studio</div>

      <div class="bar-file">
        <span class="filename" title={editor.file ? editor.file.fileName : 'Not saved to a file yet.'}>
          {editor.template.name}
        </span>
        <SaveBadge editor={editor} workspace={workspace} />
      </div>

      <div class="group">
        <button class="btn" disabled={!editor.canUndo} onClick={editor.undo} title={editor.canUndo ? `Undo ${editor.undoLabel ?? ''}` : 'Nothing to undo'}>
          Undo
        </button>
        <button class="btn" disabled={!editor.canRedo} onClick={editor.redo} title="Redo">
          Redo
        </button>
      </div>

      <span class="grow" />

      <button
        class={`btn ${showFields ? 'on' : ''}`}
        onClick={onFields}
        title="Everything the team will see in HubSpot, in the order they will see it. Locked content fades back."
      >
        Fields
      </button>

      <button
        class={`btn ${showCode ? 'on' : ''}`}
        onClick={onCode}
        title="The coded template itself, to copy straight into Design Manager. The same bytes Export writes to a file."
      >
        Code
      </button>

      <button class={`btn chip ${errors ? 'bad' : 'good'}`} onClick={onChecks} title="Everything a real send has taught us, checked against this template.">
        {errors ? `${errors} to fix` : 'Checks pass'}
      </button>

      <span class="size" title="Gmail clips an email at about 102KB, taking the footer with it.">
        <b class={bytes > 92160 ? 'hot' : ''}>{kb(bytes)}</b>
      </span>

      <button class="btn primary" title="Write the HubSpot coded template file." onClick={onExport}>
        Export
      </button>
    </header>
  );
}

function SaveBadge({ editor, workspace }: { editor: Editor; workspace: Workspace | null }) {
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
  const text =
    save === 'saving' ? 'saving…' : save === 'saved' ? 'saved' : save === 'dirty' ? 'unsaved' : save === 'conflict' ? 'not saved' : save === 'error' ? 'could not save' : 'saved';
  return (
    <span class={`save ${save}`} title={editor.file ? `Autosaves to ${editor.file.fileName}` : 'Autosaves once the template has a file.'}>
      {text}
    </span>
  );
}
