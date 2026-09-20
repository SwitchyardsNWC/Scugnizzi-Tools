// Create a project: pick a type, name it, choose where it goes, and it opens on the board.
//
// The type decides the folders and the starters (model/project-types.ts). The preview on the right is the plan
// itself, so what it shows is exactly what gets written.

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { newFrameId } from '../model/frame-store.ts';
import { folderNote, planProject, PROJECT_TYPES, type ProjectType } from '../model/project-types.ts';
import { createProjectFolder, pickDestination } from './folder.ts';
import { launcherUrl } from './launch.ts';

type Dir = FileSystemDirectoryHandle;

export interface CreateProjectProps {
  /** The type chosen when the sheet opens, by id. The first type when absent or unknown. */
  initialType?: string;
  /** The types to offer: the app's, with the open folder's over them (model/library.ts). The app's alone by default. */
  types?: ProjectType[];
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

export function CreateProject({ initialType, types = PROJECT_TYPES, onClose, onCreated }: CreateProjectProps) {
  const [typeId, setTypeId] = useState((types.find((t) => t.id === initialType) ?? types[0]!).id);
  const [name, setName] = useState('');
  const [parent, setParent] = useState<Dir | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const type = types.find((t) => t.id === typeId) ?? types[0]!;
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

  const rootNote = (file: string) => (file.endsWith('.scug') ? 'opens it from Finder' : '');
  // The plan as a tree, folders before files at each level, so what is written is seen the way Finder shows it.
  const tree = useMemo(() => buildTree(plan.folders, plan.files.map((f) => f.path)), [plan]);

  return (
    <div class="cp-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div class="cp-sheet" role="dialog" aria-modal="true" aria-labelledby="cp-title">
        <header class="cp-head">
          <div>
            <p class="pb-eyebrow">New project</p>
            <h2 id="cp-title">What are you making?</h2>
          </div>
          <button class="cp-close" aria-label="Close" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </header>

        <div class="cp-types" role="radiogroup" aria-label="Project type">
          {types.map((t) => (
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
              {type.frames.map((f) => (
                <div key={f.name} class="cp-size">
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
              <Tree nodes={tree} path="" rootNote={rootNote} />
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

interface TreeNode {
  name: string;
  folder: boolean;
  children: TreeNode[];
}

/** Folders and files as one tree, folders first at each level. */
function buildTree(folders: string[], files: string[]): TreeNode[] {
  const root: TreeNode = { name: '', folder: true, children: [] };
  const at = (parts: string[], folder: boolean) => {
    let node = root;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      let next = node.children.find((c) => c.name === part);
      if (!next) {
        next = { name: part, folder: last ? folder : true, children: [] };
        node.children.push(next);
      }
      node = next;
    });
  };
  for (const f of folders) at(f.split('/'), true);
  for (const f of files) at(f.split('/'), false);
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name));
    for (const n of nodes) sort(n.children);
  };
  sort(root.children);
  return root.children;
}

function Tree({ nodes, path, rootNote }: { nodes: TreeNode[]; path: string; rootNote(file: string): string }) {
  return (
    <ul>
      {nodes.map((node) => {
        const full = path ? `${path}/${node.name}` : node.name;
        const note = node.folder ? folderNote(full) : path ? '' : rootNote(node.name);
        return (
          <li key={full}>
            <code class={node.folder ? 'cp-dir' : 'cp-file'}>{node.folder ? `${node.name}/` : node.name}</code>
            {note && <span class="cp-note">{note}</span>}
            {node.children.length > 0 && <Tree nodes={node.children} path={full} rootNote={rootNote} />}
          </li>
        );
      })}
    </ul>
  );
}
