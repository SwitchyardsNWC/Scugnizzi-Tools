import { useState } from 'preact/hooks';

import type { Template } from '../model/types.ts';
import type { TemplateFile } from '../workspace/workspace.ts';
import type { Editor } from './useEditor.ts';
import { TemplateIcon } from './icons.tsx';

/** Somewhere to start from. The app supplies the list; the panel only offers it. */
export interface Starter {
  id: string;
  name: string;
  /** One line, on hover: what you get. */
  summary: string;
  make(): Template;
}

// The files in the workspace folder.
//
// Its own place in the rail rather than a list wedged above the layer tree, which is where it used
// to live: two unrelated things in one scrolling column, the top one shifting the bottom one down
// whenever a folder was opened. A file list and a structure view answer different questions and
// neither one is a heading for the other.
//
// Opening the folder lives here too, and only here. It used to be a button in the top bar as well,
// from before this panel existed — two controls for one thing, whose labels then had to agree
// about which folder was open.

export interface TemplatesProps {
  editor: Editor;
  files: TemplateFile[];
  label: string | null;
  writable: boolean;
  /** Chrome opened the folder, but with "View files": nothing writes until it is asked again. */
  viewOnly: boolean;
  onAllowEditing(): void;
  /** Whether this browser can open a whole folder at once. */
  folders: boolean;
  starters: Starter[];
  onNew(starter: Starter): void;
  onDuplicate(): void;
  onOpen(file: TemplateFile): void;
  /**
   * Removes a file from the folder. Absent when the workspace cannot write, which is what hides
   * the control rather than showing one that explains itself only after it fails.
   */
  onDelete?(file: TemplateFile): void;
  onOpenFolder(): void;
  onChooseFiles(files: File[]): void;
}

const when = (at: number) => {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days === 0) return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export function Templates({ editor, files, label, writable, viewOnly, onAllowEditing, folders, starters, onNew, onDuplicate, onOpen, onDelete, onOpenFolder, onChooseFiles }: TemplatesProps) {
  const [menu, setMenu] = useState(false);

  // New and Duplicate, first. The app used to open on the standard email and stop there, so the
  // only way to a template of your own was to delete every block of somebody else's — and a copy
  // meant exporting a file and renaming it by hand. These are the two things a folder of templates
  // is *for*, so they lead the panel that lists it.
  const actions = (
    <div class="template-actions">
      <div class="popover-host">
        <button
          class={`btn ${menu ? 'on' : ''}`}
          aria-expanded={menu}
          aria-haspopup="menu"
          title="Start a new template. It saves to the folder on your first edit."
          onClick={() => setMenu((v) => !v)}
        >
          + New
        </button>
        {menu && (
          <div class="popover starters" role="menu">
            {starters.map((starter) => (
              <button
                key={starter.id}
                class="starter"
                role="menuitem"
                title={starter.summary}
                onClick={() => {
                  setMenu(false);
                  onNew(starter);
                }}
              >
                <TemplateIcon />
                <span>{starter.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        class="btn"
        title="A copy of this template as its own file, design system included. The original is untouched, and so are the fields its emails are bound to."
        onClick={onDuplicate}
      >
        Duplicate
      </button>
    </div>
  );

  // Two ways in, because one of them does not exist in every browser: Chrome can hand over a whole
  // folder and keep write access to it, and Safari can only hand over files, which is why a
  // workspace opened that way is read-only and exports download instead.
  const opener = (wide: boolean, text: string) =>
    folders ? (
      <button
        class={`btn ${wide ? 'wide' : ''}`}
        title="Open a folder of templates. Everyone on the same synced folder sees the same files."
        onClick={onOpenFolder}
      >
        {text}
      </button>
    ) : (
      <label class={`btn ${wide ? 'wide' : ''}`} title="This browser cannot open a folder, so files picked here are read-only. Chrome can.">
        Choose files…
        <input
          type="file"
          multiple
          accept=".json"
          hidden
          onChange={(e) => {
            const picked = [...((e.target as HTMLInputElement).files ?? [])];
            if (picked.length) onChooseFiles(picked);
          }}
        />
      </label>
    );

  // What this template is called, here and in HubSpot.
  //
  // It sits above the list because that is what the list is *of*, and because the right pane is
  // the selection now — asking a question about the whole template from a pane that otherwise
  // describes one block meant deselecting to answer it. Rendered whether or not a folder is open:
  // a template has a name before it has a file.
  const identity = (
    <section class="this-template">
      <div class="field wide" title="What this template is called here, and the name its file gets.">
        <label>Name</label>
        <input
          type="text"
          value={editor.template.name}
          onInput={(e) => editor.set('template.name', (e.target as HTMLInputElement).value)}
        />
      </div>
      <div class="field wide" title="What the team picks from when they create an email in HubSpot. Renaming it is safe; renaming a *field* is not (learnings 1.10).">
        <label>Name in HubSpot</label>
        <input
          type="text"
          value={editor.template.hubspotLabel}
          onInput={(e) => editor.set('template.hubspotLabel', (e.target as HTMLInputElement).value)}
        />
      </div>
    </section>
  );

  if (!label) {
    return (
      <div class="templates-pane">
        {actions}
        {identity}
        <p class="empty">
          Everyone on the same synced folder sees the same templates. Nothing is uploaded anywhere.
        </p>
        {opener(true, 'Open folder…')}
      </div>
    );
  }

  return (
    <div class="templates-pane">
      {actions}
      {identity}

      <div class="folder-head">
        <span class="folder-name" title={writable ? `${label} — templates save back here` : `${label} — read only, exports download`}>
          {label}
        </span>
        <span class="muted">{files.length}</span>
      </div>

      {files.length === 0 ? (
        <p class="empty">
          Nothing in this folder yet. A template is saved as <code>.template.json</code>.
        </p>
      ) : (
        <ul class="list">
          {files.map((file) => (
            <li key={file.fileName} class="file-row">
              <button
                class={`row ${editor.file?.fileName === file.fileName ? 'on' : ''}`}
                title={`${file.fileName} · modified ${new Date(file.modified).toLocaleString()}`}
                onClick={() => onOpen(file)}
              >
                <TemplateIcon />
                <span class="row-name">{file.name}</span>
                {file.kind === 'v1' && <span class="chip-mini">v1</span>}
                <span class="row-meta">{when(file.modified)}</span>
              </button>
              {onDelete && (
                // No confirmation, by the same rule the canvas follows: it happens and offers Undo
                // (learnings 3.2). The title says both halves, because a file in a folder three
                // people sync is a heavier thing to remove than a block, and the undo is worth
                // promising up front rather than discovering after.
                <button
                  class="row-delete"
                  aria-label={`Delete ${file.name}`}
                  title={`Delete ${file.fileName} from the folder. Undo is offered for a few seconds.`}
                  onClick={() => onDelete(file)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {viewOnly ? (
        // The one state worth a button here: the folder is open, the files list, the canvas works,
        // and every save is refused. Chrome's picker asked "Edit files" or "View files", and the
        // second is an easy answer to give. This asks again, from a click, which is the only place
        // Chrome will show the prompt.
        <div class="view-only">
          <p class="hint" title="Chrome opened this folder with view access only. Until it grants edit access, saves, exports and rendered images download instead of landing in the folder.">
            View only — nothing saves back yet.
          </p>
          <button class="btn wide" title="Ask Chrome for edit access to this folder. Choose “Edit files” when it asks." onClick={onAllowEditing}>
            Allow editing
          </button>
        </div>
      ) : (
        !writable && (
          <p class="hint" title="Files picked by hand cannot be written back — this browser does not support opening a folder, or you chose files instead. Saving downloads a copy.">
            Read only.
          </p>
        )
      )}

      <div class="pane-foot">{opener(true, 'Open another folder…')}</div>
    </div>
  );
}
