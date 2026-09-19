// The board's two small popovers: the form under + Link, and the project menu in the title. Moved out of
// Board.tsx as they were (learnings 3.78).

import { useEffect, useRef, useState } from 'preact/hooks';
import { DOC_KIND_NAMES, docKindOfUrl } from '../model/docs.ts';
import { projectType } from '../model/project-types.ts';
import { useInstall } from './launch.ts';
import type { Project } from './useProject.ts';

/** The small form under + Link: an address and a name, and a card the moment it is written. */
export function LinkForm({ onClose, onAdd }: { onClose(): void; onAdd(url: string, name: string): Promise<boolean> }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // Without `preventScroll`, focusing a field that sits partly off-screen scrolls the whole board sideways.
    first.current?.focus({ preventScroll: true });
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.('.pb-menu')) return;
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);
  const kind = docKindOfUrl(url.trim());
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onAdd(url, name);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <form
      class="pb-pop pb-linkform"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
        // Handled here as well as by the form: implicit submission rides on a keypress that a synthetic Enter does not
        // always carry (learnings 3.52).
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <label class="pb-field">
        <span>Address</span>
        <input ref={first} type="url" value={url} placeholder="https://docs.google.com/document/d/…" spellcheck={false} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
      </label>
      <label class="pb-field">
        <span>Name</span>
        <input type="text" value={name} maxLength={80} placeholder={kind === 'link' ? 'What it is' : `The ${DOC_KIND_NAMES[kind]}’s name`} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <div class="pb-linkform-foot">
        <span class="pb-linkform-kind">{url.trim() ? DOC_KIND_NAMES[kind] : 'A Google Doc, Sheet or Slides, or any address'}</span>
        <button type="button" class="pb-ghost" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" class="pb-filled small" disabled={busy || !url.trim()}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      <p class="pb-linkform-note">
        A Google Doc, Sheet or Slides file placed in the project folder through Drive for desktop shows up on its own. This is for one that lives elsewhere.
      </p>
    </form>
  );
}

// --- the project menu ------------------------------------------------------------------------------------------

export function ProjectMenu({ project, counts, onCreate }: { project: Project; counts: string; onCreate(): void }) {
  const [open, setOpen] = useState(false);
  const install = useInstall();
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.('.pb-menu')) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);
  const info = project.info!;
  const type = projectType(info.type);
  const status = project.status === 'ready' ? 'Saving into the folder' : 'View only';
  return (
    <div class="pb-menu">
      <button class={`pb-title ${open ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <b>{info.name}</b>
        {type && <span class="pb-title-type">{type.name}</span>}
        <span class="pb-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div class="pb-pop pb-menu-pop" role="menu">
          <div class="pb-menu-head">
            <b>{info.name}</b>
            <span>
              {project.dir?.name} · {status}
            </span>
            <span>{counts}</span>
          </div>
          <p class="pb-menu-note">Template Studio and Freeform open this folder too, on their own.</p>
          {install.state === 'installable' && (
            <button
              onClick={() => {
                setOpen(false);
                void install.install();
              }}
            >
              Install as an app…
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
          >
            Create a project…
          </button>
          <button
            onClick={() => {
              setOpen(false);
              void project.open();
            }}
          >
            Open another folder…
          </button>
          <button
            class="danger"
            onClick={() => {
              setOpen(false);
              void project.close();
            }}
          >
            Close project
          </button>
        </div>
      )}
    </div>
  );
}
