// What Template Studio opens on: a folder to open, or an email to start.
//
// Jared, 2026-09-18: "only use the templates when you create a new email like the blank and card emails. When you
// first open the template studio you can either open a folder or create new." The app used to open on the
// standard email, which made every first visit a choice between editing somebody else's email and deleting it.
// Now it opens on this, over an untouched blank, and nothing is kept until a choice is made. Once a folder is
// open with no file chosen, the same screen lists the folder's emails to open, and the starters to begin one.

import type { TemplateFile } from '../workspace/workspace.ts';
import type { Starter } from './Templates.tsx';

export interface WelcomeProps {
  starters: Starter[];
  /** The open folder's emails, when a folder is open. */
  files: TemplateFile[];
  /** The open folder's name, or null when none is. */
  folder: string | null;
  /** Whether this browser can open a whole folder. */
  folders: boolean;
  /** A folder this browser remembers, which Chrome needs one click to open again. */
  reopenable: string | null;
  onOpenFolder(): void;
  onChooseFiles(files: File[]): void;
  onReopen(): void;
  onOpenFile(file: TemplateFile): void;
  onNew(starter: Starter): void;
  /** Carry on with the untouched blank. */
  onSkip(): void;
}

export function Welcome({ starters, files, folder, folders, reopenable, onOpenFolder, onChooseFiles, onReopen, onOpenFile, onNew, onSkip }: WelcomeProps) {
  const opener = folders ? (
    <button class="btn wide" title="Open the folder your team’s emails live in. Everyone on the same synced folder sees the same files." onClick={onOpenFolder}>
      {folder ? 'Open another folder…' : 'Open a folder…'}
    </button>
  ) : (
    <label class="btn wide" title="This browser cannot open a whole folder, so pick the template files by hand. They open read-only.">
      Choose files…
      <input
        type="file"
        multiple
        accept=".json"
        hidden
        onChange={(e) => {
          const list = [...((e.target as HTMLInputElement).files ?? [])];
          if (list.length) onChooseFiles(list);
        }}
      />
    </label>
  );
  return (
    <div class="wl" role="dialog" aria-label="Start">
      <div class="wl-card">
        <h1>Template Studio</h1>
        <p class="wl-lead">
          {folder ? `${folder} is open. Pick an email to work on, or start a new one; it saves into the folder on your first edit.` : 'Open the folder your team’s emails live in, or start a new one. Nothing is uploaded anywhere.'}
        </p>
        <div class="wl-cols">
          <section>
            <h2>{folder ? `In ${folder}` : 'Open'}</h2>
            {folder ? (
              files.length ? (
                <ul class="wl-list">
                  {files.map((file) => (
                    <li key={file.fileName}>
                      <button class="wl-file" title={`${file.fileName} · modified ${new Date(file.modified).toLocaleString()}`} onClick={() => onOpenFile(file)}>
                        <span>{file.name}</span>
                        <small>{file.fileName}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="wl-hint">Nothing in this folder yet. Start an email on the right and it saves here.</p>
              )
            ) : (
              <>
                {opener}
                {reopenable && (
                  <button class="btn wide" title="Chrome needs one click to open a remembered folder again." onClick={onReopen}>
                    Reopen {reopenable}
                  </button>
                )}
                <p class="wl-hint">Everyone on the same synced folder sees the same emails, and the project board sees them too.</p>
              </>
            )}
            {folder && <div class="wl-more">{opener}</div>}
          </section>
          <section>
            <h2>New email</h2>
            {starters.map((starter) => (
              <button key={starter.id} class="wl-starter" title={starter.summary} onClick={() => onNew(starter)}>
                <b>{starter.name}</b>
                <span>{starter.summary}</span>
              </button>
            ))}
          </section>
        </div>
        <div class="wl-foot">
          <button class="link" title="Carry on with an untitled blank email: just the legal footer." onClick={onSkip}>
            Skip, start blank
          </button>
        </div>
      </div>
    </div>
  );
}
