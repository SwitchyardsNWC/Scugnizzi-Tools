// Project: one folder for every tool, and the board that shows all of it.
//
// Jared: "add the project folder - this could be a new tool that starts linking all these projects together
// and can turn into the project canvas that brings everything to one endless canvas." (docs/projects.md)
//
// A page of its own over the same source tree as Template Studio and Freeform, so the board draws emails with
// the real compiler and frames with the real canvas code.

import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { Board } from './Board.tsx';
import { CreateProject } from './CreateProject.tsx';
import { useInstall, watchLaunches, type InstallState, type LaunchedFile } from './launch.ts';
import { useProject, type Project } from './useProject.ts';
import '../app/app.css';
import './project.css';

/**
 * `?create` or `?create=<type>`: the dashboard's Create a project, landing straight on the sheet with that type
 * chosen. Taken off the address once read, so a reload does not open the sheet again.
 */
function createFromAddress(): string | null {
  const params = new URLSearchParams(location.search);
  if (!params.has('create')) return null;
  const type = params.get('create') ?? '';
  params.delete('create');
  const rest = params.toString();
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  return type;
}

function ProjectTool() {
  const project = useProject();
  const [toast, setToast] = useState<string | null>(null);
  /** The type the create sheet starts on; null when the sheet is closed. */
  const [creating, setCreating] = useState<string | null>(createFromAddress);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4200);
  }, []);
  const open = (project.status === 'ready' || project.status === 'view-only') && project.dir && project.info;
  const install = useInstall();
  /** A `.scug` this page was opened with, whose folder this browser has yet to be shown. */
  const [launch, setLaunch] = useState<LaunchedFile | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    document.title = open && project.info ? `${project.info.name} · Project` : 'Project';
  }, [open, project.info]);

  // Opened from Finder with a .scug: the project it names, from the folder remembered for it, or else a word
  // about which folder to choose.
  useEffect(() => {
    watchLaunches(
      (file) => {
        void (async () => {
          setLaunch(null);
          if (await projectRef.current.openById(file.launcher.id)) return;
          setLaunch(file);
        })();
      },
      (fileName) => notify(`${fileName} isn't a project's launch file.`),
    );
  }, [notify]);

  useEffect(() => {
    if (open) setLaunch(null);
  }, [open]);

  const created = useCallback(
    async (dir: FileSystemDirectoryHandle, name: string, where: string) => {
      await project.use(dir);
      setCreating(null);
      notify(where ? `Created ${name} in ${where}.` : `Created ${name}.`);
    },
    [project, notify],
  );

  return (
    <div class="pb-app">
      {open && project.info ? (
        <Board key={project.info.id} project={project} notify={notify} onCreateProject={() => setCreating('')} />
      ) : (
        <Welcome project={project} launch={launch} onDropLaunch={() => setLaunch(null)} install={install} onCreate={() => setCreating('')} />
      )}
      {creating !== null && <CreateProject initialType={creating} onClose={() => setCreating(null)} onCreated={created} />}
      {toast && (
        <div class="pb-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

interface WelcomeProps {
  project: Project;
  launch: LaunchedFile | null;
  onDropLaunch(): void;
  install: { state: InstallState; install(): Promise<boolean> };
  onCreate(): void;
}

function Welcome({ project, launch, onDropLaunch, install, onCreate }: WelcomeProps) {
  const remembered = project.status === 'asking' ? project.dir?.name : null;
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setProblem(null), [launch]);

  const chooseFor = async () => {
    if (!launch) return;
    setProblem(await project.openFor(launch.launcher, launch.fileName));
  };

  const bar = (
    <header class="pb-bar pb-bar-top">
      <a class="pb-ghost" href="../../index.html" title="Back to Scugnizzi tools">
        ← Tools
      </a>
      <span class="pb-sep" aria-hidden="true" />
      <span class="pb-title" aria-hidden="true">
        <b>Project</b>
      </span>
    </header>
  );

  if (launch) {
    return (
      <div class="pb-welcome">
        {bar}
        <div class="pb-welcome-page">
          <div class="pb-welcome-intro">
            <p class="pb-eyebrow">Project</p>
            <h1>Open {launch.launcher.name}.</h1>
            <p class="pb-lede">
              You opened <b>{launch.fileName}</b>, and this browser hasn’t been shown the folder it lives in yet. Choose that folder once. From then on the file
              opens the project on its own, and so do Template Studio and Freeform.
            </p>
            {problem && (
              <p class="pb-warn" role="alert">
                {problem}
              </p>
            )}
            <div class="pb-actions-row">
              <button class="pb-primary" onClick={() => void chooseFor()}>
                Choose the folder…
              </button>
              <button class="pb-secondary" onClick={onDropLaunch}>
                Not now
              </button>
            </div>
            <p class="pb-foot">When Chrome asks, choose “Edit files”, so the tools can save into it.</p>
          </div>
          <aside class="pb-welcome-aside">
            <div class="pb-section-head">The file</div>
            <ul class="pb-tree">
              <li>
                <code>{launch.fileName}</code>
                <span>names the project by its id, not by where its folder is</span>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div class="pb-welcome">
      {bar}
      <div class="pb-welcome-page">
        <div class="pb-welcome-intro">
          <p class="pb-eyebrow">Project</p>
          <h1>One folder for every tool.</h1>
          <p class="pb-lede">
            A project is a folder, and everything in it lands on one board: the emails from Template Studio, the frames from Freeform, the documents beside
            them, and the pictures they use, with lines showing what is made from what. Create one from a type, or open a folder you already have. Template
            Studio and Freeform open it on their own from then on.
          </p>

          {project.status === 'loading' ? null : project.status === 'unsupported' ? (
            <p class="pb-warn">Opening a folder needs Chrome or Edge on a computer.</p>
          ) : remembered ? (
            <div class="pb-actions-row">
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
            <div class="pb-actions-row">
              <button class="pb-primary" onClick={onCreate}>
                Create a project…
              </button>
              <button class="pb-secondary" onClick={() => void project.open()}>
                Open a folder…
              </button>
            </div>
          )}
          <p class="pb-foot">
            Any folder works, including one Google Drive for desktop or Dropbox keeps in sync, so the team sees the same project. When Chrome asks, choose
            “Edit files”.
          </p>
        </div>

        <aside class="pb-welcome-aside">
          <div class="pb-section-head">
            The folder
            <span class="pb-grow" />
            <span class="pb-hint">What a project is made of</span>
          </div>
          <ul class="pb-tree">
            <li>
              <code>assets/</code>
              <span>pictures every tool can use; each folder in it is a group on the board</span>
            </li>
            <li>
              <code>docs/</code>
              <span>briefs and copy: Google Docs, Sheets and Slides in a synced folder, or links to them</span>
            </li>
            <li>
              <code>exports/</code>
              <span>what ships: the HubSpot template files</span>
            </li>
            <li>
              <code>.scug/</code>
              <span>the tools’ own files: the board, the emails and frames as the tools save them, design systems. Finder hides it</span>
            </li>
            <li>
              <code>name.scug</code>
              <span>double-click in Finder to open the project, once the tools are installed as an app</span>
            </li>
          </ul>
          {install.state === 'installable' && (
            <p class="pb-install">
              <button class="pb-secondary" onClick={() => void install.install()}>
                Install as an app
              </button>
              <span>Then a project’s .scug file opens it from Finder.</span>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

const root = document.getElementById('app');
if (root) render(<ProjectTool />, root);
