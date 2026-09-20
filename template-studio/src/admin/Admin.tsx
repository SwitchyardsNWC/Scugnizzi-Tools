// The studio library: the emails a new template starts from, what Create a project makes, and the design
// systems a folder holds.
//
// Jared: "Can you make a admin tool for me that allows me to edit the default templates and create new ones",
// then "Creating and editing the project start templates too", and "If it can import a claude design system for
// colors, type and general direction that would be ideal."
//
// Three lists over one folder. Editing a starter is not a second editor: it opens Template Studio on the file,
// the way the board opens an email, and Studio's back arrow returns here. Editing a project type is a form,
// because a type is data — folders, picture groups, frames and emails — and there is nothing to draw.
//
// What ships in the app is the floor and is always listed: a folder that has never been opened here still has
// the five starters and the five project types, and anything saved here sits over them by id.

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

import { DEFAULT_DESIGN_SYSTEM, type DesignSystem } from '../model/design-system.ts';
import { importDesignSystem, type SystemImport } from '../model/import-system.ts';
import { libraryId, mergeById, type ProjectTypeFile, type StarterFile } from '../model/library.ts';
import { META } from '../model/layout.ts';
import { PROJECT_TYPES, type ProjectType, type StarterFrame, type StarterGroup } from '../model/project-types.ts';
import {
  fileSlug,
  projectTypeFileName,
  serializeDesignSystem,
  serializeProjectType,
  serializeStarter,
  starterFileName,
  systemFileName,
} from '../model/serialize.ts';
import { STARTERS } from '../app/starters-list.ts';
import { folderWorkspace, type Workspace } from '../workspace/workspace.ts';
import type { Project } from '../project/useProject.ts';
import type { Template } from '../model/types.ts';

type Tab = 'starters' | 'types' | 'systems';

export interface AdminProps {
  project: Project;
  notify(message: string, undo?: () => void): void;
}

/** A starter as the page shows it: from the app, or from the folder with the file it came from. */
interface StarterRow {
  id: string;
  name: string;
  summary: string;
  from: 'app' | 'folder';
  fileName?: string;
  template?: Template;
}

interface TypeRow {
  type: ProjectType;
  from: 'app' | 'folder';
  fileName?: string;
}

/** Where an email that a starter is edited as lives, so Studio opens it by name the way it opens any template. */
const draftFileName = (name: string) => `${fileSlug(name)}.template.json`;

export function Admin({ project, notify }: AdminProps) {
  const [tab, setTab] = useState<Tab>('starters');
  const [folderStarters, setFolderStarters] = useState<Array<{ fileName: string; item: StarterFile }>>([]);
  const [folderTypes, setFolderTypes] = useState<Array<{ fileName: string; item: ProjectTypeFile }>>([]);
  const [systems, setSystems] = useState<Record<string, DesignSystem>>({});
  /** The template files in the folder, so a starter can say when the email it was edited as is waiting. */
  const [templateFiles, setTemplateFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const workspace: Workspace | null = useMemo(
    () => (project.dir ? folderWorkspace(project.dir, project.writable) : null),
    [project.dir, project.writable],
  );

  const read = useCallback(async () => {
    if (!workspace) {
      setFolderStarters([]);
      setFolderTypes([]);
      setSystems({});
      return;
    }
    const [s, t, d, files] = await Promise.all([
      workspace.starters().catch(() => []),
      workspace.projectTypes().catch(() => []),
      workspace.designSystems().catch(() => ({})),
      workspace.list().catch(() => []),
    ]);
    setFolderStarters(s);
    setFolderTypes(t);
    setSystems(d);
    setTemplateFiles(files.map((f) => f.fileName));
  }, [workspace]);

  useEffect(() => {
    void read();
  }, [read, project.generation]);

  const starters: StarterRow[] = useMemo(() => {
    const app: StarterRow[] = STARTERS.map((s) => ({ id: s.id, name: s.name, summary: s.summary, from: 'app' }));
    const folder: StarterRow[] = folderStarters.map(({ fileName, item }) => ({
      id: item.id,
      name: item.name,
      summary: item.summary,
      from: 'folder',
      fileName,
      template: item.template,
    }));
    return mergeById(app, folder);
  }, [folderStarters]);

  const types: TypeRow[] = useMemo(() => {
    const app: Array<TypeRow & { id: string }> = PROJECT_TYPES.map((t) => ({ id: t.id, type: t, from: 'app' }));
    const folder: Array<TypeRow & { id: string }> = folderTypes.map(({ fileName, item }) => ({ id: item.type.id, type: item.type, from: 'folder', fileName }));
    return mergeById(app, folder);
  }, [folderTypes]);

  const writable = project.status === 'ready';
  const cannot = (what: string) => notify(`This folder is open view-only. Allow editing to ${what}.`);

  /** A starter written into the folder, over whatever was there under its id. */
  const saveStarter = async (row: StarterRow, template: Template, summary: string) => {
    if (!workspace || !writable) return cannot('save a starter');
    setBusy(true);
    try {
      const was = folderStarters.find((f) => f.item.id === row.id);
      const file: StarterFile = {
        schema: template.schema,
        id: row.id,
        name: row.name,
        summary,
        version: (was?.item.version ?? 0) + 1,
        template,
      };
      const fileName = was?.fileName ?? starterFileName(row.name);
      await workspace.writeStarter(fileName, serializeStarter(file));
      await read();
      notify(`${row.name} is a starter in this folder. It shows in New, over the one the app ships.`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The starter could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Opens a starter in Template Studio.
   *
   * A starter is an email, and Studio is the email editor — so rather than build a second one, the template is
   * written into the folder as an ordinary file and Studio is opened on it by name, the way the board opens any
   * email. Saving it back as a starter is one button when you return.
   */
  const editStarter = async (row: StarterRow) => {
    if (!workspace || !writable) return cannot('edit a starter');
    setBusy(true);
    try {
      const template = row.template ?? STARTERS.find((s) => s.id === row.id)?.make();
      if (!template) throw new Error(`${row.name} has nothing to edit.`);
      const fileName = draftFileName(row.name);
      const existing = (await workspace.list()).find((f) => f.fileName === fileName);
      if (!existing) await workspace.writeTemplate(fileName, `${JSON.stringify(template, null, 2)}\n`, 0);
      const url = new URL(`index.html?open=${encodeURIComponent(fileName)}&from=admin`, window.location.href).href;
      window.location.href = url;
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'That starter could not be opened.');
      setBusy(false);
    }
  };

  /**
   * The email a starter was edited as, back into the starter.
   *
   * Edit writes the starter's template into the folder as an ordinary email and opens Template Studio on it, so
   * the loop closes here rather than in Studio: the file is read again and becomes the starter's template. The
   * email stays in the folder, because it is a real email and deleting somebody's file to tidy up is not this
   * tool's call.
   */
  const pullFromEmail = async (row: StarterRow) => {
    if (!workspace || !writable) return cannot('update a starter');
    setBusy(true);
    try {
      const fileName = draftFileName(row.name);
      const file = (await workspace.list()).find((f) => f.fileName === fileName);
      if (!file) throw new Error(`${fileName} is not in this folder.`);
      const { template } = await file.load();
      await saveStarter(row, template, row.summary);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The starter could not be updated.');
      setBusy(false);
    }
  };

  const removeLibraryFile = async (folder: 'starters' | 'project-types', fileName: string, what: string) => {
    if (!workspace?.deleteLibraryFile || !writable) return cannot(`remove ${what}`);
    setBusy(true);
    try {
      await workspace.deleteLibraryFile(folder, fileName, what);
      await read();
      notify(`${what} is back to the one the app ships.`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : `${what} could not be removed.`);
    } finally {
      setBusy(false);
    }
  };

  const saveType = async (type: ProjectType, fileName?: string) => {
    if (!workspace || !writable) return cannot('save a project type');
    setBusy(true);
    try {
      const was = folderTypes.find((f) => f.item.type.id === type.id);
      const file: ProjectTypeFile = { schema: 1, version: (was?.item.version ?? 0) + 1, type };
      await workspace.writeProjectType(fileName ?? was?.fileName ?? projectTypeFileName(type.id), serializeProjectType(file));
      await read();
      notify(`${type.name} is what Create a project makes in this folder.`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The project type could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const saveSystem = async (name: string, ds: DesignSystem) => {
    if (!workspace || !writable) return cannot('save a design system');
    setBusy(true);
    try {
      await workspace.writeDesignSystem(fileSlug(name), serializeDesignSystem(ds));
      await read();
      notify(`Saved ${systemFileName(name)}. Any template can follow it from Design.`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The design system could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (!project.dir) {
    return (
      <div class="ad-empty">
        <b>Open a folder</b>
        <p>
          The library is kept in a project folder, beside its design systems and its saved sections. Open the folder your
          team shares, and what you make here is in everyone’s New menu.
        </p>
        <button class="btn primary" onClick={() => void project.open()}>
          Open a folder…
        </button>
      </div>
    );
  }

  return (
    <div class="ad">
      <nav class="ad-tabs" role="tablist">
        {(
          [
            ['starters', `Starter emails (${starters.length})`],
            ['types', `Project types (${types.length})`],
            ['systems', `Design systems (${Object.keys(systems).length})`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} class={`ad-tab ${tab === id ? 'on' : ''}`} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'starters' && (
        <StarterList
          rows={starters}
          writable={writable}
          busy={busy}
          draftFor={(row) => (templateFiles.includes(draftFileName(row.name)) ? draftFileName(row.name) : null)}
          onEdit={(row) => void editStarter(row)}
          onPull={(row) => void pullFromEmail(row)}
          onSaveAsStarter={(row, summary) => void saveStarter(row, row.template ?? STARTERS.find((s) => s.id === row.id)!.make(), summary)}
          onRemove={(row) => void removeLibraryFile('starters', row.fileName!, row.name)}
          onNew={(name, summary) => {
            const id = libraryId(name, starters.map((s) => s.id));
            const blank = STARTERS.find((s) => s.id === 'blank')!.make();
            void saveStarter({ id, name, summary, from: 'folder' }, { ...blank, name, hubspotLabel: name }, summary);
          }}
        />
      )}

      {tab === 'types' && (
        <TypeList
          rows={types}
          writable={writable}
          busy={busy}
          onSave={(type, fileName) => void saveType(type, fileName)}
          onRemove={(row) => void removeLibraryFile('project-types', row.fileName!, row.type.name)}
        />
      )}

      {tab === 'systems' && <SystemList systems={systems} writable={writable} busy={busy} onSave={(name, ds) => void saveSystem(name, ds)} />}
    </div>
  );
}

// --- starters ------------------------------------------------------------------------------------------------

function StarterList({
  rows,
  writable,
  busy,
  onEdit,
  onPull,
  draftFor,
  onSaveAsStarter,
  onRemove,
  onNew,
}: {
  rows: StarterRow[];
  writable: boolean;
  busy: boolean;
  onEdit(row: StarterRow): void;
  onPull(row: StarterRow): void;
  /** The email this starter was edited as, when the folder holds one. */
  draftFor(row: StarterRow): string | null;
  onSaveAsStarter(row: StarterRow, summary: string): void;
  onRemove(row: StarterRow): void;
  onNew(name: string, summary: string): void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  return (
    <section class="ad-pane">
      <p class="ad-lead">
        What Template Studio offers on New, and on its Welcome screen. Edit one and it opens in Template Studio; save it
        back here and this folder’s copy is what the team sees.
      </p>
      <ul class="ad-list">
        {rows.map((row) => (
          <li key={row.id} class="ad-row">
            <span class="ad-row-main">
              <b>{row.name}</b>
              <span class="ad-row-sum">{row.summary || 'No description yet.'}</span>
            </span>
            <span class={`ad-tag ${row.from}`} title={row.from === 'folder' ? 'Saved in this folder, over the one the app ships.' : 'Ships with the app. Editing it saves a copy into this folder.'}>
              {row.from === 'folder' ? 'this folder' : 'the app'}
            </span>
            <span class="ad-row-acts">
              <button class="btn" disabled={!writable || busy} title="Open it in Template Studio. The back arrow returns here." onClick={() => onEdit(row)}>
                Edit
              </button>
              {row.from === 'app' && (
                <button class="btn" disabled={!writable || busy} title="Copy it into this folder, so the team gets this folder's version." onClick={() => onSaveAsStarter(row, row.summary)}>
                  Copy here
                </button>
              )}
              {row.from === 'folder' && draftFor(row) && (
                <button
                  class="btn primary"
                  disabled={!writable || busy}
                  title={`Take what ${draftFor(row)} says now and make it this starter.`}
                  onClick={() => onPull(row)}
                >
                  Update from the email
                </button>
              )}
              {row.from === 'folder' && row.fileName && (
                <button class="btn" disabled={!writable || busy} title="Remove this folder's copy. The app's own comes back." onClick={() => onRemove(row)}>
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {adding ? (
        <div class="ad-form">
          <label class="ad-field">
            <span>Name</span>
            <input value={name} maxLength={60} placeholder="Monthly note" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </label>
          <label class="ad-field">
            <span>One line</span>
            <input value={summary} maxLength={140} placeholder="What you get when you pick it." onInput={(e) => setSummary((e.target as HTMLInputElement).value)} />
          </label>
          <div class="ad-form-acts">
            <button class="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button
              class="btn primary"
              disabled={!name.trim() || busy}
              onClick={() => {
                onNew(name.trim(), summary.trim());
                setAdding(false);
                setName('');
                setSummary('');
              }}
            >
              Make it
            </button>
          </div>
          <p class="ad-note">It starts blank. Edit opens it in Template Studio, where you build it like any email.</p>
        </div>
      ) : (
        <button class="btn wide" disabled={!writable || busy} onClick={() => setAdding(true)}>
          + A new starter
        </button>
      )}
    </section>
  );
}

// --- project types --------------------------------------------------------------------------------------------

function TypeList({
  rows,
  writable,
  busy,
  onSave,
  onRemove,
}: {
  rows: TypeRow[];
  writable: boolean;
  busy: boolean;
  onSave(type: ProjectType, fileName?: string): void;
  onRemove(row: TypeRow): void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const row = rows.find((r) => r.type.id === editing);
  return (
    <section class="ad-pane">
      <p class="ad-lead">
        What “Create a project” puts in a new folder: the folders it works in, the picture groups that become boards, the
        frames it starts with, and the emails.
      </p>
      {row ? (
        <TypeForm
          type={row.type}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(next) => {
            onSave(next, row.fileName);
            setEditing(null);
          }}
        />
      ) : (
        <>
          <ul class="ad-list">
            {rows.map((r) => (
              <li key={r.type.id} class="ad-row">
                <span class="ad-row-main">
                  <b>{r.type.name}</b>
                  <span class="ad-row-sum">{r.type.blurb}</span>
                  <span class="ad-row-facts">
                    {r.type.folders.length} folders · {r.type.groups.length} groups · {r.type.frames.length} frames ·{' '}
                    {r.type.emails.length} {r.type.emails.length === 1 ? 'email' : 'emails'}
                  </span>
                </span>
                <span class={`ad-tag ${r.from}`}>{r.from === 'folder' ? 'this folder' : 'the app'}</span>
                <span class="ad-row-acts">
                  <button class="btn" disabled={!writable || busy} onClick={() => setEditing(r.type.id)}>
                    Edit
                  </button>
                  {r.from === 'folder' && r.fileName && (
                    <button class="btn" disabled={!writable || busy} onClick={() => onRemove(r)}>
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <button
            class="btn wide"
            disabled={!writable || busy}
            onClick={() => {
              const id = libraryId('New type', rows.map((r) => r.type.id));
              onSave({ id, name: 'New type', blurb: '', folders: ['assets', 'docs', 'exports'], groups: [], frames: [], emails: [] });
              setEditing(id);
            }}
          >
            + A new project type
          </button>
        </>
      )}
    </section>
  );
}

function TypeForm({ type, busy, onCancel, onSave }: { type: ProjectType; busy: boolean; onCancel(): void; onSave(type: ProjectType): void }) {
  const [draft, setDraft] = useState<ProjectType>(() => structuredClone(type));
  const set = <K extends keyof ProjectType>(key: K, value: ProjectType[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const lines = (list: string[]) => list.join('\n');
  const fromLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div class="ad-form">
      <label class="ad-field">
        <span>Name</span>
        <input value={draft.name} maxLength={60} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} />
      </label>
      <label class="ad-field">
        <span>One line</span>
        <input value={draft.blurb} maxLength={140} onInput={(e) => set('blurb', (e.target as HTMLInputElement).value)} />
      </label>
      <label class="ad-field" title="One per line. Every project sees these at the top of its folder.">
        <span>Folders</span>
        <textarea rows={3} value={lines(draft.folders)} onInput={(e) => set('folders', fromLines((e.target as HTMLTextAreaElement).value))} />
      </label>
      <label class="ad-field" title="One per line, as `folder — what goes in it`. Each becomes a group on the board and a folder under assets/.">
        <span>Picture groups</span>
        <textarea
          rows={4}
          value={draft.groups.map((g) => (g.note ? `${g.folder} — ${g.note}` : g.folder)).join('\n')}
          onInput={(e) =>
            set(
              'groups',
              fromLines((e.target as HTMLTextAreaElement).value).map<StarterGroup>((line) => {
                const [folder, ...rest] = line.split(/\s+—\s+|\s+--\s+/);
                return { folder: (folder ?? '').trim(), note: rest.join(' ').trim() };
              }),
            )
          }
        />
      </label>
      <label class="ad-field" title="One per line, as `name 1080×1080`. The frames a project starts with, at the sizes its pieces are made at.">
        <span>Frames</span>
        <textarea
          rows={4}
          value={draft.frames.map((f) => `${f.name} ${f.width}×${f.height}`).join('\n')}
          onInput={(e) =>
            set(
              'frames',
              fromLines((e.target as HTMLTextAreaElement).value).flatMap<StarterFrame>((line) => {
                const m = /^(.*?)\s+(\d+)\s*[x×]\s*(\d+)$/i.exec(line);
                return m ? [{ name: m[1]!.trim(), width: Number(m[2]), height: Number(m[3]) }] : [];
              }),
            )
          }
        />
      </label>
      <label class="ad-field" title="One per line. `{project}` becomes the project's name.">
        <span>Emails</span>
        <textarea rows={2} value={lines(draft.emails)} onInput={(e) => set('emails', fromLines((e.target as HTMLTextAreaElement).value))} />
      </label>
      <div class="ad-form-acts">
        <button class="btn" onClick={onCancel}>
          Cancel
        </button>
        <button class="btn primary" disabled={busy || !draft.name.trim()} onClick={() => onSave(draft)}>
          Save to the folder
        </button>
      </div>
      <p class="ad-note">
        Saved as <code>{META.projectTypes}/{projectTypeFileName(draft.id)}</code>. Create a project reads it from there.
      </p>
    </div>
  );
}

// --- design systems -------------------------------------------------------------------------------------------

function SystemList({
  systems,
  writable,
  busy,
  onSave,
}: {
  systems: Record<string, DesignSystem>;
  writable: boolean;
  busy: boolean;
  onSave(name: string, ds: DesignSystem): void;
}) {
  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const [onto, setOnto] = useState('');
  const [result, setResult] = useState<SystemImport | null>(null);

  const base = onto && systems[onto] ? systems[onto]! : DEFAULT_DESIGN_SYSTEM;

  return (
    <section class="ad-pane">
      <p class="ad-lead">
        The design systems this folder holds. A template names one and follows it, so changing it moves every template
        that does.
      </p>
      <ul class="ad-list">
        {Object.entries(systems).map(([key, ds]) => (
          <li key={key} class="ad-row">
            <span class="ad-row-main">
              <b>{key}</b>
              <span class="ad-row-facts">
                {Object.keys(ds.colors).length} colours · {Object.keys(ds.type).length} type roles · {ds.containerWidth}px
              </span>
            </span>
            <span class="ad-swatches">
              {Object.entries(ds.colors)
                .slice(0, 8)
                .map(([n, hex]) => (
                  <i key={n} style={{ background: hex }} title={n} />
                ))}
            </span>
          </li>
        ))}
        {Object.keys(systems).length === 0 && <li class="ad-row ad-row-none">None in this folder yet. Import one below.</li>}
      </ul>

      <h3 class="ad-h">Import a design system</h3>
      <p class="ad-lead">
        Paste a Claude design system — the page itself, its CSS, a token file, or a <code>.system.json</code> this
        project wrote. A browser cannot read a claude.ai page across origins, so paste it rather than linking it.
      </p>
      <textarea
        class="ad-paste"
        rows={8}
        spellcheck={false}
        placeholder={':root {\n  --color-brand-navy: #011272;\n  --font-body: Helvetica, Arial, sans-serif;\n  --text-h1: 36px;\n}'}
        value={source}
        onInput={(e) => {
          setSource((e.target as HTMLTextAreaElement).value);
          setResult(null);
        }}
      />
      <div class="ad-form-acts">
        <label class="ad-field inline" title="What unstated values fall back to. On a system already here, an import only changes what it brings.">
          <span>Onto</span>
          <select value={onto} onChange={(e) => setOnto((e.target as HTMLSelectElement).value)}>
            <option value="">the shipped values</option>
            {Object.keys(systems).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        <button
          class="btn"
          disabled={!source.trim()}
          onClick={() => {
            const out = importDesignSystem(source, base);
            setResult(out);
            if (out.name && !name) setName(out.name);
          }}
        >
          Read it
        </button>
      </div>

      {result && (
        <div class="ad-result">
          <p class="ad-result-head">
            Read as <b>{SHAPE_WORDS[result.shape]}</b>. {result.touched.length === 0 ? 'Nothing in it changed the system.' : `${result.touched.length} values changed.`}
          </p>
          {result.touched.length > 0 && (
            <>
              <div class="ad-swatches big">
                {Object.entries(result.ds.colors).map(([n, hex]) => (
                  <i key={n} style={{ background: hex }} title={`${n} ${hex}`} />
                ))}
              </div>
              <ul class="ad-changes">
                {result.touched.slice(0, 12).map((path) => (
                  <li key={path}>
                    <code>{path}</code>
                  </li>
                ))}
                {result.touched.length > 12 && <li>and {result.touched.length - 12} more</li>}
              </ul>
            </>
          )}
          {result.warnings.length > 0 && (
            <ul class="ad-warnings">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {result.touched.length > 0 && (
            <div class="ad-form-acts">
              <label class="ad-field inline">
                <span>Save as</span>
                <input value={name} maxLength={60} placeholder="acme" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              </label>
              <button
                class="btn primary"
                disabled={!writable || busy || !name.trim()}
                title="Writes design-systems/<name>.system.json. Nothing follows it until a template says so."
                onClick={() => onSave(name.trim(), result.ds)}
              >
                Save to the folder
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const SHAPE_WORDS: Record<SystemImport['shape'], string> = {
  system: 'a design system file',
  tokens: 'a token file',
  css: 'CSS',
  html: 'a page',
  text: 'text with colours in it',
  none: 'nothing usable',
};
