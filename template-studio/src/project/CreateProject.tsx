// Create a project: pick a type, name it, choose where it goes, and it opens on the board.
//
// The type decides the folders and the starters (model/project-types.ts). The preview on the right is the plan
// itself, so what it shows is exactly what gets written.

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { newFrameId } from '../model/frame-store.ts';
import { folderNote, planProject, PROJECT_TYPES } from '../model/project-types.ts';
import { createProjectFolder, pickDestination } from './folder.ts';
import { launcherUrl } from './launch.ts';

type Dir = FileSystemDirectoryHandle;

export interface CreateProjectProps {
  /** The type chosen when the sheet opens, by id. The first type when absent or unknown. */
  initialType?: string;
  onClose(): void;
  /** `where` is the folder it went into, or empty when the chosen folder became the project. */
  onCreated(dir: Dir, name: string, where: string): Promise<void>;
}

const ICONS: Record<string, JSX.Element> = {
  campaign: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  ),
  social: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2.5" y="6" width="11" height="11" rx="2" />
      <rect x="16" y="3" width="5.5" height="18" rx="1.5" />
    </svg>
  ),
  print: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="2.5" width="14" height="19" rx="1.5" />
      <path d="M8.5 7h7M8.5 11h7M8.5 15h4" />
    </svg>
  ),
  blank: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3">
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </svg>
  ),
};

function explain(cause: unknown, where: string): string {
  if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
    return `Chrome is not allowing changes in ${where}. Choose it again, and pick “Edit files” when Chrome asks.`;
  }
  if (cause instanceof DOMException && cause.name === 'SecurityError') return 'Chrome would not open the folder picker from here. Try the button again.';
  return cause instanceof Error ? cause.message : 'The project could not be created.';
}

export function CreateProject({ initialType, onClose, onCreated }: CreateProjectProps) {
  const [typeId, setTypeId] = useState((PROJECT_TYPES.find((t) => t.id === initialType) ?? PROJECT_TYPES[0]!).id);
  const [name, setName] = useState('');
  const [parent, setParent] = useState<Dir | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const type = PROJECT_TYPES.find((t) => t.id === typeId) ?? PROJECT_TYPES[0]!;
  const title = name.trim() || 'New project';

  const plan = useMemo(() => {
    let n = 0;
    return planProject(type, title, { id: 'preview', newId: () => `preview${(n += 1)}`, now: 0, launcherUrl: 'preview' });
  }, [type, title]);

  useEffect(() => {
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  /** From the click: the picker has to open inside the click, so it is the first thing awaited. */
  const create = async (where: Dir | null) => {
    if (busy) return;
    setError(null);
    let dir = where;
    if (!dir) {
      try {
        dir = await pickDestination();
      } catch (cause) {
        setError(explain(cause, 'that folder'));
        return;
      }
      if (!dir) return;
      setParent(dir);
    }
    setBusy(true);
    try {
      const real = planProject(type, title, { id: `project:${crypto.randomUUID()}`, newId: () => newFrameId(), launcherUrl: launcherUrl() });
      const made = await createProjectFolder(dir, real);
      await onCreated(made, real.info.name, made.name === dir.name ? '' : dir.name);
    } catch (cause) {
      setError(explain(cause, dir.name));
    } finally {
      setBusy(false);
    }
  };

  const inFolder = (folder: string) => plan.files.filter((f) => f.path.startsWith(`${folder}/`)).map((f) => f.path.slice(folder.length + 1));
  const atRoot = plan.files.filter((f) => !f.path.includes('/')).map((f) => f.path);
  const rootNote = (file: string) => (file.endsWith('.scug') ? 'opens it from Finder' : '');

  return (
    <div class="cp-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div class="cp-sheet" role="dialog" aria-modal="true" aria-labelledby="cp-title">
        <header class="cp-head">
          <div>
            <p class="pb-kicker">New project</p>
            <h2 id="cp-title">What are you making?</h2>
          </div>
          <button class="cp-close" aria-label="Close" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </header>

        <div class="cp-types" role="radiogroup" aria-label="Project type">
          {PROJECT_TYPES.map((t) => (
            <button key={t.id} class={`cp-type ${t.id === type.id ? 'on' : ''}`} role="radio" aria-checked={t.id === type.id} onClick={() => setTypeId(t.id)}>
              <span class={`cp-type-icon ${t.id}`} aria-hidden="true">
                {ICONS[t.id] ?? ICONS['blank']}
              </span>
              <b>{t.name}</b>
              <span class="cp-type-blurb">{t.blurb}</span>
            </button>
          ))}
        </div>

        <div class="cp-detail">
          <label class="cp-label">
            Name
            <input
              ref={input}
              class="cp-name"
              value={name}
              placeholder="Spring launch"
              maxLength={80}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create(parent);
              }}
            />
          </label>

          <div class="cp-block">
            <span class="cp-label">It starts with</span>
            <div class="cp-sizes">
              {type.emails.map((e) => (
                <div key={`email:${e}`} class="cp-size email">
                  <i style={{ width: 40, height: 64 }}>
                    <s />
                    <s />
                    <s />
                  </i>
                  <b>{e.split('{project}').join(title)}</b>
                  <small>email</small>
                </div>
              ))}
              {type.frames.map((f, i) => (
                <div key={f.name} class="cp-size" style={{ animationDelay: `${(i + type.emails.length) * 40}ms` }}>
                  <i style={{ width: Math.round((64 * f.width) / f.height), height: 64 }} />
                  <b>{f.name}</b>
                  <small>
                    {f.width} × {f.height}
                  </small>
                </div>
              ))}
              {type.emails.length === 0 && type.frames.length === 0 && <p class="cp-nothing">Nothing yet. Every folder is there for when there is.</p>}
            </div>
          </div>

          <div class="cp-block">
            <span class="cp-label">The folder</span>
            <div class="cp-tree">
              <div class="cp-root">
                <code>{plan.folder}/</code>
              </div>
              <ul>
                {plan.folders.map((folder) => (
                  <li key={folder}>
                    <code class="cp-dir">{folder}/</code>
                    <span class="cp-note">{folderNote(folder)}</span>
                    {inFolder(folder).length > 0 && (
                      <ul>
                        {inFolder(folder).map((file) => (
                          <li key={file}>
                            <code class="cp-file">{file}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
                {atRoot.map((file) => (
                  <li key={file}>
                    <code class="cp-file">{file}</code>
                    {rootNote(file) && <span class="cp-note">{rootNote(file)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <footer class="cp-foot">
          {error ? (
            <p class="cp-error" role="alert">
              {error}
            </p>
          ) : (
            <p class="cp-hint">
              {parent ? (
                <>
                  It goes in <b>{parent.name}</b>.{' '}
                  <button class="pb-link-btn" disabled={busy} onClick={() => void create(null)}>
                    Somewhere else…
                  </button>
                </>
              ) : (
                'Next, choose the folder to put it in, like a Projects folder in Google Drive. Chrome won’t allow Desktop or Documents themselves; a folder inside them is fine.'
              )}
            </p>
          )}
          <button class="pb-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button class="pb-primary" disabled={busy} onClick={() => void create(parent)}>
            {busy ? 'Creating…' : parent ? `Create in ${parent.name}` : 'Choose where…'}
          </button>
        </footer>
      </div>
    </div>
  );
}
