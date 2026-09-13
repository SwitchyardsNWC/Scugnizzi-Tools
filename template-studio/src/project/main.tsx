// Project: one folder for every tool, and the board that shows all of it.
//
// Jared: "add the project folder - this could be a new tool that starts linking all these projects together
// and can turn into the project canvas that brings everything to one endless canvas." (docs/projects.md)
//
// A page of its own over the same source tree as Template Studio and Freeform, so the board draws emails with
// the real compiler and frames with the real canvas code.

import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';

import { Board } from './Board.tsx';
import { CreateProject } from './CreateProject.tsx';
import { useProject, type Project } from './useProject.ts';
import '../app/app.css';
import './project.css';

function ProjectTool() {
  const project = useProject();
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4200);
  }, []);
  const open = (project.status === 'ready' || project.status === 'view-only') && project.dir && project.info;

  useEffect(() => {
    document.title = open && project.info ? `${project.info.name} · Project` : 'Project';
  }, [open, project.info]);

  const created = useCallback(
    async (dir: FileSystemDirectoryHandle, name: string, where: string) => {
      await project.use(dir);
      setCreating(false);
      notify(where ? `Created ${name} in ${where}.` : `Created ${name}.`);
    },
    [project, notify],
  );

  return (
    <div class="pb-app">
      {open && project.info ? (
        <Board key={project.info.id} project={project} notify={notify} onCreateProject={() => setCreating(true)} />
      ) : (
        <Welcome project={project} onCreate={() => setCreating(true)} />
      )}
      {creating && <CreateProject onClose={() => setCreating(false)} onCreated={created} />}
      {toast && (
        <div class="pb-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Welcome({ project, onCreate }: { project: Project; onCreate(): void }) {
  const remembered = project.status === 'asking' ? project.dir?.name : null;
  return (
    <div class="pb-welcome">
      <a class="fig-pill pb-back" href="../../index.html" title="Back to Scugnizzi tools">
        <span aria-hidden="true">←</span> Tools
      </a>
      <div class="pb-welcome-card">
        <div class="pb-float email" aria-hidden="true">
          <i>Email</i>
          <s />
          <s />
          <s class="short" />
        </div>
        <div class="pb-float frame" aria-hidden="true">
          <i>Frame</i>
          <u />
        </div>
        <div class="pb-float picture" aria-hidden="true">
          <i>Picture</i>
          <em />
        </div>

        <p class="pb-kicker">Project</p>
        <h1>One folder for every tool.</h1>
        <p class="pb-lede">
          A project is a folder, and everything in it lands on one board: the emails from Template Studio, the frames from Freeform, and the pictures they use,
          with lines showing what is made from what. Create one from a type, or open a folder you already have. Template Studio and Freeform open it on their own
          from then on.
        </p>

        {project.status === 'loading' ? null : project.status === 'unsupported' ? (
          <p class="pb-warn">Opening a folder needs Chrome or Edge on a computer.</p>
        ) : remembered ? (
          <div class="pb-actions">
            <button class="pb-primary" onClick={() => void project.allow()}>
              Reopen {remembered}
            </button>
            <button class="pb-secondary" onClick={onCreate}>
              Create a project…
            </button>
            <button class="pb-secondary" onClick={() => void project.open()}>
              Open a different folder…
            </button>
          </div>
        ) : (
          <div class="pb-actions">
            <button class="pb-primary" onClick={onCreate}>
              Create a project…
            </button>
            <button class="pb-secondary" onClick={() => void project.open()}>
              Open a folder…
            </button>
          </div>
        )}

        <ul class="pb-tree">
          <li>
            <code>templates/</code>
            <span>emails, from Template Studio</span>
          </li>
          <li>
            <code>frames/</code>
            <span>Freeform frames, one file each</span>
          </li>
          <li>
            <code>assets/</code>
            <span>pictures every tool can use</span>
          </li>
          <li>
            <code>design-systems/</code>
            <span>the colours and type emails follow</span>
          </li>
          <li>
            <code>board.json</code>
            <span>where each card sits on the board</span>
          </li>
        </ul>
        <p class="pb-foot">
          Any folder works, including one Google Drive for desktop or Dropbox keeps in sync, so the team sees the same project. When Chrome asks, choose
          “Edit files”.
        </p>
      </div>
    </div>
  );
}

const root = document.getElementById('app');
if (root) render(<ProjectTool />, root);
