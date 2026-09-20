// The studio library, as a page of its own.
//
// The fourth page over the same source tree, so the starters it edits are edited by the real email editor and the
// project types it writes are the ones Create a project already reads.

import { render } from 'preact';
import { useCallback, useState } from 'preact/hooks';

import { Admin } from './Admin.tsx';
import { useProject } from '../project/useProject.ts';
import '../app/app.css';
import '../project/project.css';
import './admin.css';

function AdminTool() {
  const project = useProject();
  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 5000);
  }, []);

  const label = project.info?.name ?? project.dir?.name ?? null;
  return (
    <div class="pb-app ad-app">
      <header class="pb-bar pb-bar-top">
        <a class="pb-ghost" href="../../index.html" title="Back to Scugnizzi tools">
          ← Tools
        </a>
        <span class="pb-sep" aria-hidden="true" />
        <b class="ad-title">Studio library</b>
        <span class="pb-grow" />
        {label && (
          <button
            class="pb-ghost"
            title={project.status === 'ready' ? `Saving into ${label}` : `${label} is open view-only`}
            onClick={() => void project.open()}
          >
            {label}
            {project.status === 'view-only' ? ' · view only' : ''}
          </button>
        )}
        {project.status === 'view-only' && (
          <button class="pb-ghost" title="Chrome opened the folder view-only. One click asks for edit access." onClick={() => void project.allow()}>
            Allow editing
          </button>
        )}
      </header>

      <main class="ad-body">
        <Admin project={project} notify={notify} />
      </main>

      <footer class="pb-bar pb-bar-bottom">
        <span class="pb-status">
          <i class={`pb-dot ${project.status}`} aria-hidden="true" />
          {project.status === 'ready' ? `Saves to ${label}` : project.status === 'view-only' ? 'View only' : 'No folder open'}
        </span>
        <span class="pb-grow" />
        <span class="pb-hint">What is saved here is in this folder, for everyone who opens it</span>
      </footer>

      {toast && <div class="pb-notice">{toast}</div>}
    </div>
  );
}

const root = document.getElementById('app');
if (root) render(<AdminTool />, root);
