/**
 * The HubSpot desk: Template Studio's side of HubSpot, as a page that runs in claude.ai.
 *
 * Jared, 2026-11-11: "Create an artifact of the template studio to run in Claude that works directly with hubspot to
 * manage templates." Asked how much, he chose this desk first, the full editor after it, on the same base; asked
 * where the design lives, inside the HubSpot file (compile/embed.ts); asked about writes, drafts, each confirmed.
 *
 * It lists the portal's coded email templates through the viewer's own HubSpot connector, reads each one back, and
 * shows what HubSpot will make of it: who made it and when, its fields, its checks, a preview, its source, whether it
 * still matches its design under this build, and a form that makes a draft email from it. It cannot write a template
 * file, because the connector cannot (learnings 1.19); a template goes up as the file it downloads.
 *
 * Outside claude.ai there is no connector, and the page says so and still opens an exported file from disk.
 */

import { Component, render, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import cardSystem from '../../design-systems/card.system.json';
import switchyardsSystem from '../../design-systems/switchyards.system.json';
import { compile } from '../compile/compile.ts';
import { completeDesignSystem, type DesignSystem } from '../model/design-system.ts';
import { fileSlug, serializeDesignSystem, serializeTemplate, systemFileName } from '../model/serialize.ts';
import { annotationOf, boxPictures, makerOf, PLACEHOLDER_PREVIEW, renderDefaults, renderedBytes, sourceChecks, sourceFields, type SourceCheck, type SourceField } from '../model/hubl-source.ts';
import { SUITE_VERSION } from '../version.ts';
import { buildFile, compareWithBuild, designFromFiles, designInside, fieldChanges, packLike, shownRows, type Design } from './compare.ts';
import {
  createDraft,
  draftDetails,
  draftOperation,
  draftProblems,
  explain,
  getTemplate,
  listFromAddresses,
  listSubscriptionTypes,
  listTemplates,
  pollDraft,
  SERVER,
  type DeskError,
  type DraftOutcome,
  type DraftRequest,
  type FromAddress,
  type McpLike,
  type SubscriptionType,
} from './hubspot.ts';

// --- the runtime ---------------------------------------------------------------------------------------------------

interface McpRuntime extends McpLike {
  listTools(server?: string): Promise<{ servers: Array<{ server: string; authStatus: string; tools: unknown[] }> }>;
}
interface Downloads {
  save(req: { filename: string; data: string }): Promise<{ status: string }>;
}
interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}
const runtime = (): ClaudeRuntime | null => {
  const c = (globalThis as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === 'function' ? c : null;
};

const SHIPPED: Record<string, DesignSystem> = {
  switchyards: completeDesignSystem(switchyardsSystem),
  card: completeDesignSystem(cardSystem),
};

const today = () => new Date().toISOString().slice(0, 10);

const store = {
  get(key: string): string {
    try {
      return localStorage.getItem(`scuggnizzi.desk.${key}`) ?? '';
    } catch {
      return '';
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(`scuggnizzi.desk.${key}`, value);
    } catch {
      /* a private window keeps nothing, which is fine */
    }
  },
};

// --- the data ------------------------------------------------------------------------------------------------------

type Conn = { k: 'waiting' } | { k: 'ready'; mcp: McpRuntime } | { k: 'absent' } | { k: 'failed'; err: DeskError };
type Listing = { k: 'idle' } | { k: 'loading' } | { k: 'ok' } | { k: 'failed'; err: DeskError };
type SourceState = { k: 'loading' } | { k: 'ok'; text: string } | { k: 'failed'; err: DeskError };

interface Entry {
  key: string;
  label: string;
  path: string;
  folder: string;
  id: number | null;
  /** Opened from disk rather than read from HubSpot. */
  local: boolean;
}

const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const labelOf = (path: string, label: string) => (label || path.split('/').pop() || path).replace(/\.html?$/i, '');

/** The cheap facts the rail shows, cached per source text. */
const facts = new Map<string, { maker: ReturnType<typeof makerOf>; design: boolean; failing: number }>();
function factsOf(text: string) {
  let f = facts.get(text);
  if (!f) {
    const checks = sourceChecks(text);
    f = { maker: makerOf(text), design: checks.some((c) => c.id === 'design' && c.state === 'pass'), failing: checks.filter((c) => c.state === 'fail').length };
    facts.set(text, f);
  }
  return f;
}

const shortDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};
const ago = (iso: string | null) => {
  if (!iso) return '';
  const days = Math.round((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

// --- small parts ---------------------------------------------------------------------------------------------------

const MAKER_WORD = { 'template-studio': 'Template Studio', 'template-builder': 'Template Builder', other: 'Other' } as const;

function MakerChip({ maker }: { maker: ReturnType<typeof makerOf> }) {
  const tone = maker.maker === 'template-studio' ? 'progress' : 'neutral';
  return (
    <span class={`chip ${tone}${maker.maker === 'other' ? ' hollow' : ''}`}>
      {MAKER_WORD[maker.maker]}
      {maker.date ? ` · ${shortDate(maker.date)}` : ''}
    </span>
  );
}

const CHECK_WORD: Record<SourceCheck['state'], string> = { pass: 'Pass', warn: 'Check', fail: 'Fails', info: 'Note' };
const CHECK_TONE: Record<SourceCheck['state'], string> = { pass: 'done', warn: 'risk', fail: 'blocked', info: 'neutral hollow' };

function Refusal({ err, onRetry }: { err: DeskError; onRetry?: () => void }) {
  const amber = err.kind === 'busy' || err.kind === 'needs-approval' || err.kind === 'scope';
  return (
    <div class={`refusal${amber ? ' amber' : ''}`} role="alert">
      <div class="r-title">{err.title}</div>
      <div class="r-fix">{err.fix}</div>
      {err.detail ? <div class="r-detail">{err.detail}</div> : null}
      {onRetry ? (
        <div class="row" style={{ marginTop: '8px' }}>
          <button class="btn small" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

// --- the page ------------------------------------------------------------------------------------------------------

function Desk() {
  const [conn, setConn] = useState<Conn>({ k: 'waiting' });
  const [downloads, setDownloads] = useState<Downloads | null>(null);
  const [listing, setListing] = useState<Listing>({ k: 'idle' });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sources, setSources] = useState<Record<string, SourceState>>({});
  const [selected, setSelected] = useState<string | null>(() => store.get('selected') || null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'studio' | 'other'>('all');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number>();
  // Drafts live here, not in the tab, so one in flight survives a tab switch, another template, or a refresh.
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const sending = useRef(new Set<string>());
  // Each listing pass has a number; a read from a pass that Refresh has replaced is dropped, and its workers stop.
  const pass = useRef(0);

  const say = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2400);
  }, []);

  // The runtime answers after the first paint, never during it; the page draws without it and lights up after.
  useEffect(() => {
    const claude = runtime();
    if (!claude) {
      setConn({ k: 'absent' });
      return;
    }
    claude
      .use('downloads')
      .then((d) => setDownloads((d as Downloads | null) ?? null))
      .catch(() => setDownloads(null));
    claude
      .use('mcp')
      .then(async (m) => {
        const mcp = m as McpRuntime | null;
        if (!mcp) return setConn({ k: 'absent' });
        try {
          const listed = await mcp.listTools(SERVER);
          const hubspot = listed.servers.find((s) => s.server === SERVER);
          if (!hubspot) return setConn({ k: 'failed', err: explain({ code: 'server_not_connected' }) });
          if (hubspot.authStatus === 'needs_reauth') return setConn({ k: 'failed', err: explain({ code: 'needs_reauth' }) });
        } catch {
          // An older viewer may not list; the first call says what is wrong instead.
        }
        setConn({ k: 'ready', mcp });
      })
      .catch(() => setConn({ k: 'absent' }));
  }, []);

  const fetchSource = useCallback(
    async (mcp: McpRuntime, entry: Entry, refresh = false, of = pass.current) => {
      const current = () => of === pass.current;
      setSources((s) => ({ ...s, [entry.key]: { k: 'loading' } }));
      try {
        const got = await getTemplate(mcp, entry.path, refresh);
        if (current()) setSources((s) => ({ ...s, [entry.key]: { k: 'ok', text: got.source } }));
      } catch (cause) {
        if (current()) setSources((s) => ({ ...s, [entry.key]: { k: 'failed', err: explain(cause) } }));
      }
    },
    [],
  );

  const load = useCallback(
    async (refresh = false) => {
      if (conn.k !== 'ready') return;
      const of = ++pass.current;
      setListing({ k: 'loading' });
      try {
        const rows = await listTemplates(conn.mcp, refresh);
        if (of !== pass.current) return;
        const remote = rows.map<Entry>((r) => ({ key: `hs:${r.path}`, label: labelOf(r.path, r.label), path: r.path, folder: folderOf(r.path), id: r.id || null, local: false }));
        setEntries((prev) => [...remote, ...prev.filter((e) => e.local)]);
        setListing({ k: 'ok' });
        // Every template's source, two at a time, so the rail can say who made each one.
        const queue = [...remote];
        const worker = async () => {
          for (let next = queue.shift(); next && of === pass.current; next = queue.shift()) await fetchSource(conn.mcp, next, refresh, of);
        };
        await Promise.all([worker(), worker()]);
      } catch (cause) {
        if (of === pass.current) setListing({ k: 'failed', err: explain(cause) });
      }
    },
    [conn, fetchSource],
  );

  useEffect(() => {
    if (conn.k === 'ready' && listing.k === 'idle') void load();
  }, [conn, listing, load]);

  const draftOf = (entry: Entry): DraftState => drafts[entry.key] ?? freshDraft(entry);
  const setDraft = (key: string, d: DraftState) => setDrafts((all) => ({ ...all, [key]: d }));
  const create = (entry: Entry) => {
    if (conn.k !== 'ready' || sending.current.has(entry.key)) return;
    const { req } = draftOf(entry);
    sending.current.add(entry.key);
    store.set('fromName', req.fromName);
    store.set('replyTo', req.replyToEmail);
    store.set('subscriptionType', String(req.subscriptionTypeId));
    const report = (step: Step) => setDrafts((all) => ({ ...all, [entry.key]: { req: (all[entry.key] ?? { req }).req, step } }));
    report({ k: 'sending' });
    void makeDraft(conn.mcp, req, report).finally(() => sending.current.delete(entry.key));
  };

  const choose = (key: string) => {
    setSelected(key);
    setOpen(true);
    store.set('selected', key);
  };

  const openLocal = async (files: FileList | null) => {
    if (!files) return;
    const added: Entry[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text();
      const key = `local:${file.name}`;
      added.push({ key, label: labelOf(file.name, annotationOf(text)?.label ?? ''), path: file.name, folder: 'Opened from this computer', id: null, local: true });
      setSources((s) => ({ ...s, [key]: { k: 'ok', text } }));
    }
    setEntries((prev) => [...prev.filter((e) => !added.some((a) => a.key === e.key)), ...added]);
    if (added[0]) choose(added[0].key);
  };

  const visible = entries.filter((e) => {
    if (query && !`${e.label} ${e.path}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'all') return true;
    const s = sources[e.key];
    if (s?.k !== 'ok') return filter === 'other';
    const isStudio = factsOf(s.text).maker.maker === 'template-studio';
    return filter === 'studio' ? isStudio : !isStudio;
  });
  const folders = [...new Set(visible.map((e) => e.folder))];
  const current = entries.find((e) => e.key === selected) ?? null;
  const studioCount = entries.filter((e) => {
    const s = sources[e.key];
    return s?.k === 'ok' && factsOf(s.text).maker.maker === 'template-studio';
  }).length;

  return (
    <div class="shell" data-open={open && current ? 'true' : 'false'}>
      <header class="shell-header">
        <div class="wordmark">
          <span class="kicker">Template Studio</span>hubspot desk_
        </div>
        <div class="spacer" />
        <ConnState conn={conn} listing={listing} count={entries.filter((e) => !e.local).length} />
        {conn.k === 'ready' ? (
          <button class="btn small" onClick={() => void load(true)} disabled={listing.k === 'loading'}>
            Refresh
          </button>
        ) : null}
      </header>

      <nav class="rail" aria-label="Templates">
        <div class="rail-head">
          <div class="rail-count">
            {entries.length ? (
              <>
                <span class="mono">{entries.length}</span> coded templates · <span class="mono">{studioCount}</span> from Template Studio
              </>
            ) : conn.k === 'ready' && listing.k !== 'failed' ? (
              'Reading templates from HubSpot…'
            ) : (
              'No templates yet'
            )}
          </div>
          <input class="search" id="desk-search" type="search" placeholder="Find a template" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} aria-label="Find a template" />
          <Seg
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              ['all', 'All'],
              ['studio', 'Template Studio'],
              ['other', 'Other'],
            ]}
          />
        </div>

        {conn.k === 'absent' ? (
          <div class="rail-empty">
            HubSpot is reachable only when the desk is open in claude.ai. An exported template can still be opened from this computer.
          </div>
        ) : null}
        {conn.k === 'failed' ? (
          <div style={{ padding: '16px' }}>
            <Refusal err={conn.err} />
          </div>
        ) : null}
        {listing.k === 'failed' ? (
          <div style={{ padding: '16px' }}>
            <Refusal err={listing.err} onRetry={() => void load(true)} />
          </div>
        ) : null}

        {folders.map((folder) => (
          <div key={folder}>
            <div class="folder">{folder || 'Top level'}</div>
            {visible
              .filter((e) => e.folder === folder)
              .map((e) => {
                const s = sources[e.key];
                const f = s?.k === 'ok' ? factsOf(s.text) : null;
                return (
                  <button key={e.key} class="trow" aria-current={e.key === selected} onClick={() => choose(e.key)}>
                    <span class="trow-name">{e.label}</span>
                    <span class="trow-meta">
                      {f ? <MakerChip maker={f.maker} /> : s?.k === 'failed' ? <span class="chip blocked">Unread</span> : <span class="chip neutral hollow">Reading…</span>}
                      {f?.design ? <span class="chip done">Design inside</span> : null}
                      {f && f.failing ? <span class="chip blocked">{f.failing} failing</span> : null}
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
        {entries.length && !visible.length ? <div class="rail-empty">No templates match.</div> : null}

        <div class="rail-head" style={{ borderTop: '1px solid var(--border-muted)', borderBottom: 0 }}>
          <label class="btn small" style={{ justifySelf: 'start' }}>
            Open a file from this computer
            <input id="desk-open-file" class="file-input" type="file" accept=".html,.htm,text/html" multiple onChange={(e) => void openLocal((e.target as HTMLInputElement).files)} />
          </label>
        </div>
      </nav>

      <main class="main">
        <div class="main-inner">
          {current ? (
            <Guard reset={current.key}>
              <TemplateView
                key={current.key}
                entry={current}
                state={sources[current.key]}
                conn={conn}
                downloads={downloads}
                say={say}
                draft={draftOf(current)}
                onDraft={(d) => setDraft(current.key, d)}
                onCreate={() => create(current)}
                onBack={() => setOpen(false)}
                onReload={conn.k === 'ready' && !current.local ? () => void fetchSource(conn.mcp, current, true) : undefined}
              />
            </Guard>
          ) : (
            <Welcome conn={conn} />
          )}
        </div>
      </main>
      {toast ? (
        <div class="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ConnState({ conn, listing, count }: { conn: Conn; listing: Listing; count: number }) {
  if (conn.k === 'waiting') return <span class="conn"><span class="chip neutral hollow">Connecting</span></span>;
  if (conn.k === 'absent') return <span class="conn"><span class="chip neutral hollow">Not in claude.ai</span></span>;
  if (conn.k === 'failed') return <span class="conn"><span class="chip blocked">Not connected</span></span>;
  if (listing.k === 'failed') return <span class="conn"><span class="chip blocked">HubSpot refused</span></span>;
  if (listing.k === 'loading') return <span class="conn"><span class="chip progress">Reading HubSpot</span></span>;
  return (
    <span class="conn">
      <span class="chip done">HubSpot</span>
      <span class="mono">{count}</span> templates
    </span>
  );
}

function Welcome({ conn }: { conn: Conn }) {
  return (
    <div class="empty">
      <div class="title" style={{ marginBottom: '12px' }}>
        Coded email templates in HubSpot
      </div>
      <p class="lede">
        Pick a template to see who made it and when, the fields the team fills in, what HubSpot checks before it publishes, a preview, and whether it still matches its
        design. A draft email can be made from it here; sending stays in HubSpot.
      </p>
      <p class="note">
        {conn.k === 'absent'
          ? 'This view has no HubSpot connector. Open the desk in claude.ai to read the portal.'
          : 'The connector reads templates and makes drafts. It cannot write a template file, so a template goes up as the file this desk downloads: Design Manager, or hs cms upload.'}
      </p>
    </div>
  );
}

// --- one template --------------------------------------------------------------------------------------------------

type Tab = 'preview' | 'fields' | 'checks' | 'source' | 'compare' | 'draft';

function TemplateView({
  entry,
  state,
  conn,
  downloads,
  say,
  draft,
  onDraft,
  onCreate,
  onBack,
  onReload,
}: {
  entry: Entry;
  state: SourceState | undefined;
  conn: Conn;
  downloads: Downloads | null;
  say: (t: string) => void;
  draft: DraftState;
  onDraft: (d: DraftState) => void;
  onCreate: () => void;
  onBack: () => void;
  onReload: (() => void) | undefined;
}) {
  const [tab, setTab] = useState<Tab>(() => (store.get('tab') as Tab) || 'preview');
  const pick = (t: Tab) => {
    setTab(t);
    store.set('tab', t);
  };
  const source = state?.k === 'ok' ? state.text : null;
  const info = useMemo(() => {
    if (source === null) return null;
    return {
      maker: makerOf(source),
      fields: sourceFields(source),
      checks: sourceChecks(source),
      inside: designInside(source),
      bytes: renderedBytes(source),
      annotation: annotationOf(source),
    };
  }, [source]);

  const head = (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div class="row" style={{ justifyContent: 'space-between' }}>
        <button class="btn small ghost only-phone" onClick={onBack}>
          ← Templates
        </button>
        <span class="crumb">{entry.local ? 'Opened from this computer' : entry.folder || 'Design Manager'}</span>
      </div>
      <div class="title">{entry.label}</div>
      <div class="row muted" style={{ fontSize: 'var(--t-meta)' }}>
        <span class="code">{entry.path}</span>
        {entry.id ? <span class="mono">· id {entry.id}</span> : null}
        {onReload ? (
          <button class="btn small ghost" onClick={onReload}>
            Read again
          </button>
        ) : null}
      </div>
    </div>
  );

  if (!state || state.k === 'loading') return (
    <>
      {head}
      <div class="note">Reading the template from HubSpot…</div>
    </>
  );
  if (state.k === 'failed') return (
    <>
      {head}
      <Refusal err={state.err} onRetry={onReload} />
    </>
  );
  if (!info || source === null) return null;

  const failing = info.checks.filter((c) => c.state === 'fail').length;
  const warning = info.checks.filter((c) => c.state === 'warn').length;
  const design = info.inside && info.inside.ok ? info.inside.design : null;

  return (
    <>
      {head}
      <div class="stats">
        <div class="stat">
          <span class="stat-label">Made by</span>
          <span class="stat-value word">{MAKER_WORD[info.maker.maker]}</span>
          <span class="stat-hint">{info.maker.date ? `${shortDate(info.maker.date)} · ${ago(info.maker.date)}` : 'No generated-by comment'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Fields the team fills in</span>
          <span class="stat-value">{info.fields.filter((f) => f.name !== 'preview_text').length}</span>
          <span class="stat-hint">{info.fields.some((f) => f.kind === 'drag-and-drop area') ? 'Plus a drag-and-drop area' : 'In the order HubSpot lists them'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Size Gmail sees</span>
          <span class="stat-value">{kb(info.bytes)}</span>
          <span class="stat-hint">Gmail clips at 102 KB</span>
        </div>
        <div class="stat">
          <span class="stat-label">Checks</span>
          <span class="stat-value word">{failing ? `${failing} failing` : warning ? `${warning} to look at` : 'All pass'}</span>
          <span class="stat-hint">{design ? 'Design inside' : info.inside ? 'Design unreadable' : 'No design inside'}</span>
        </div>
      </div>

      <Seg
        label="View"
        value={tab}
        onChange={pick}
        options={[
          ['preview', 'Preview'],
          ['fields', 'Fields'],
          ['checks', 'Checks'],
          ['source', 'Source'],
          ['compare', 'Compare'],
          ['draft', 'Draft email'],
        ]}
      />

      {tab === 'preview' ? <PreviewTab source={source} design={design} label={entry.label} /> : null}
      {tab === 'fields' ? <FieldsTab fields={info.fields} /> : null}
      {tab === 'checks' ? <ChecksTab checks={info.checks} /> : null}
      {tab === 'source' ? <SourceTab source={source} entry={entry} downloads={downloads} say={say} /> : null}
      {tab === 'compare' ? <CompareTab source={source} inside={info.inside} entry={entry} downloads={downloads} say={say} /> : null}
      {tab === 'draft' ? <DraftTab entry={entry} conn={conn} label={info.annotation?.label ?? entry.label} draft={draft} onDraft={onDraft} onCreate={onCreate} /> : null}
    </>
  );
}

function PreviewTab({ source, design, label }: { source: string; design: Design | null; label: string }) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const html = useMemo(() => {
    const sample = { preview: PLACEHOLDER_PREVIEW, subject: label };
    let drawn: string;
    try {
      drawn = design ? compile(design.template, { mode: 'preview', ...(design.ds ? { ds: design.ds } : {}) }).html : renderDefaults(source, sample);
    } catch {
      drawn = renderDefaults(source, sample);
    }
    return boxPictures(drawn);
  }, [source, design, label]);
  return (
    <div class="card">
      <div class="card-head">
        <span class="card-title">{design ? 'Compiled from the design inside' : 'Drawn from the field defaults'}</span>
        <Seg
          label="Width"
          value={device}
          onChange={setDevice}
          options={[
            ['desktop', 'Desktop'],
            ['phone', 'Phone'],
          ]}
        />
      </div>
      <div class="card-body">
        <div class="frame-wrap">
          <iframe title={`Preview of ${label}`} sandbox="" srcdoc={html} style={{ width: device === 'desktop' ? '680px' : '375px' }} />
        </div>
        <p class="note">
          {design ? (
            <>
              <strong>Exact.</strong> The compiler drew this from the design the file carries. Pictures show as boxes: the desk cannot load images from HubSpot’s servers.
            </>
          ) : (
            <>
              <strong>Approximate.</strong> Every field at its default, read from the HubL. Company details are placeholders, HubSpot’s links point nowhere, and pictures show as boxes:
              the desk cannot load images from HubSpot’s servers.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

function FieldsTab({ fields }: { fields: SourceField[] }) {
  if (!fields.length) return <div class="empty">This template declares no fields. The team can change nothing in it.</div>;
  return (
    <div class="card">
      <div class="card-head">
        <span class="card-title">Fields, in the order HubSpot lists them</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Label</th>
              <th>Kind</th>
              <th>Name</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.name}>
                <td>{f.label.replace(/<[^>]*>[\s\S]*$/, '').trim() || f.name}</td>
                <td class="muted">{f.kind === 'module' && f.path ? f.path.replace('@hubspot/', '') : f.kind}</td>
                <td class="code">{f.name}</td>
                <td class="clip">{(f.kind === 'rich text' ? plainText(f.value) : f.value).slice(0, 160) || <span class="muted">Empty</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChecksTab({ checks }: { checks: SourceCheck[] }) {
  return (
    <div class="card">
      <div class="card-head">
        <span class="card-title">What HubSpot holds the file to</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <tbody>
            {checks.map((c) => (
              <tr key={c.id}>
                <td style={{ width: '1%', whiteSpace: 'nowrap' }}>
                  <span class={`chip ${CHECK_TONE[c.state]}`}>{CHECK_WORD[c.state]}</span>
                </td>
                <td>
                  <div>{c.title}</div>
                  <div class="note">{c.detail}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Copies on the click itself, and selects the text when the viewer’s app refuses the clipboard. */
function copyText(text: string, say: (t: string) => void, fallback: () => void) {
  try {
    navigator.clipboard.writeText(text).then(
      () => say('Copied.'),
      () => {
        fallback();
        say('Selected. Copy with ⌘C.');
      },
    );
  } catch {
    fallback();
    say('Selected. Copy with ⌘C.');
  }
}

function selectAll(el: HTMLElement | null) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

async function saveFile(downloads: Downloads | null, filename: string, data: string, say: (t: string) => void) {
  if (!downloads) return say('Downloads are not available in this view. Copy the source instead.');
  try {
    const r = await downloads.save({ filename, data });
    say(r.status === 'saved' ? `Saved ${filename}.` : 'Sent.');
  } catch (cause) {
    const code = (cause as { code?: string })?.code;
    if (code === 'declined') return;
    say(code === 'rate_limited' ? 'A save is already waiting for an answer.' : 'The file could not be saved here. Copy the source instead.');
  }
}

function SourceTab({ source, entry, downloads, say }: { source: string; entry: Entry; downloads: Downloads | null; say: (t: string) => void }) {
  const pre = useRef<HTMLPreElement>(null);
  const file = entry.path.split('/').pop() || `${fileSlug(entry.label)}.html`;
  return (
    <div class="card">
      <div class="card-head">
        <span class="card-title">
          The file as HubSpot holds it · <span class="mono">{kb(new TextEncoder().encode(source).length)}</span>
        </span>
        <div class="row">
          <button class="btn small" onClick={() => copyText(source, say, () => selectAll(pre.current))}>
            Copy source
          </button>
          {downloads ? (
            <button class="btn small" onClick={() => void saveFile(downloads, file, source, say)}>
              Download
            </button>
          ) : null}
        </div>
      </div>
      <div class="card-body">
        <pre class="source" ref={pre}>
          {source}
        </pre>
      </div>
    </div>
  );
}

function CompareTab({
  source,
  inside,
  entry,
  downloads,
  say,
}: {
  source: string;
  inside: ReturnType<typeof designInside>;
  entry: Entry;
  downloads: Downloads | null;
  say: (t: string) => void;
}) {
  const [attached, setAttached] = useState<{ design: Design; files: string[] } | null>(null);
  const [problem, setProblem] = useState('');
  const design = attached?.design ?? (inside && inside.ok ? inside.design : null);
  const work = useMemo(() => {
    if (!design) return null;
    try {
      const result = compareWithBuild(source, design, today());
      // The replacement is packed the way HubSpot's copy was, so pictures it shipped beside the template stay pointed at
      // those copies (learnings 3.70).
      const built = packLike(buildFile(design, { date: today(), by: SUITE_VERSION }), source);
      return { ok: true as const, result, built, changes: fieldChanges(source, built) };
    } catch (cause) {
      return { ok: false as const, reason: cause instanceof Error ? cause.message : 'The design could not be compiled.' };
    }
  }, [source, design]);

  const attach = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const read = await Promise.all(Array.from(files).map(async (f) => ({ name: f.name, text: await f.text() })));
    const got = designFromFiles(read, SHIPPED);
    if (got.ok) {
      setAttached({ design: got.design, files: read.map((f) => f.name) });
      setProblem('');
    } else {
      setProblem(got.reason);
    }
  };

  const slug = (entry.path.split('/').pop() || entry.label).replace(/\.html?$/i, '');
  const designName = design ? fileSlug(design.template.name || slug) : slug;
  const origin = design ? (design.origin === 'inside' ? `the design inside (${design.template.name || 'unnamed'})` : `${attached?.files.join(' + ') ?? 'the attached design'} (${design.template.name || 'unnamed'})`) : '';
  const system = design?.template.designSystem ?? null;

  return (
    <div class="card">
      <div class="card-head">
        <span class="card-title">HubSpot’s copy against this build of Template Studio ({SUITE_VERSION})</span>
        <label class="btn small">
          {design ? 'Attach a different design' : 'Attach the design'}
          <input id="desk-attach" class="file-input" type="file" accept=".json,application/json" multiple onChange={(e) => void attach((e.target as HTMLInputElement).files)} />
        </label>
      </div>
      <div class="card-body">
        {problem ? <Refusal err={{ kind: 'refused', title: 'Those files are not a design.', fix: problem, detail: '', retryable: false }} /> : null}
        {inside && !inside.ok && !attached ? <Refusal err={{ kind: 'refused', title: 'The design inside cannot be used.', fix: inside.reason, detail: '', retryable: false }} /> : null}
        {!design ? (
          <p class="lede">
            This file was exported before the design travelled inside it. Attach its <span class="code">.template.json</span> from the project folder, and the{' '}
            <span class="code">.system.json</span> it follows if it follows one, to see whether HubSpot’s copy still matches it. The desk then offers the file with the design inside,
            ready to upload in its place.
          </p>
        ) : null}
        {design && work && !work.ok ? <Refusal err={{ kind: 'refused', title: 'The design does not compile.', fix: work.reason, detail: '', retryable: false }} /> : null}
        {design && work && work.ok ? (
          <>
            <div class="row">
              <span class={`chip ${work.result.same ? 'done' : 'risk'}`}>{work.result.same ? 'Matches' : 'Differs'}</span>
              <span>
                {work.result.same
                  ? `This build writes the same file from ${origin}.`
                  : work.result.diff
                    ? `${work.result.removed} line${work.result.removed === 1 ? '' : 's'} in HubSpot’s copy that this build would not write from ${origin}; ${work.result.added} it would write instead.`
                    : `HubSpot’s copy differs from what this build writes from ${origin}.`}
              </span>
            </div>
            {!work.result.same ? (
              <p class="note">
                {design.origin === 'inside' && design.by === SUITE_VERSION
                  ? 'The file was written by this same version, so the difference was made after export: an edit in Design Manager, most likely.'
                  : design.origin === 'inside'
                    ? `The file was written by ${design.by ?? 'an earlier version'}. The difference may be compiler changes since then, edits made in Design Manager, or both.`
                    : 'Either the template was edited in Design Manager, the attached design is not the one it was exported from, or the compiler has changed since.'}
                {work.result.packed ? ' Compared with the export as HubSpot holds it, its pictures pointing at the copies packed beside it.' : ''}
              </p>
            ) : null}
            {design.warnings.map((w) => (
              <p class="note" key={w}>
                ▲ {w}
              </p>
            ))}
            {!work.result.same && work.result.diff ? (
              <div class="diff" aria-label="Line differences">
                {shownRows(work.result.diff).map((d, i) =>
                  d.k === 'gap' ? (
                    <div key={i} class="gap">
                      … {d.count} unchanged line{d.count === 1 ? '' : 's'}
                    </div>
                  ) : (
                    <div key={i} class={d.k === 'same' ? undefined : d.k}>
                      {d.text}
                    </div>
                  ),
                )}
              </div>
            ) : null}
            {!work.result.same && !work.result.diff ? <p class="note">The files are too long to compare line by line here.</p> : null}
            {work.changes.lost.length || work.changes.changed.length ? (
              <p class="note">
                ▲ <strong>Emails already made from it lose what was typed into</strong>{' '}
                <span class="code">{[...work.changes.lost, ...work.changes.changed].join(', ')}</span>.{' '}
                {work.changes.lost.length ? `This build does not declare ${work.changes.lost.length === 1 ? 'that field' : 'those fields'}${work.changes.changed.length ? ', and declares the rest as a different kind of field' : ''}.` : 'This build declares them as a different kind of field.'} HubSpot keeps content only under a name and kind both versions share.
              </p>
            ) : (
              <p class="note">Every field HubSpot’s copy declares is still there, as the same kind, so emails already made from it keep their content.</p>
            )}
            <div class="row">
              {downloads ? (
                <>
                  <button class={`btn${work.result.same && design.origin === 'inside' ? '' : ' primary'}`} onClick={() => void saveFile(downloads, `${slug}.html`, work.built, say)}>
                    Download this build, design inside
                  </button>
                  <button class="btn" onClick={() => void saveFile(downloads, `${designName}.template.json`, serializeTemplate(design.template), say)}>
                    Download the design
                  </button>
                  {system && design.ds ? (
                    <button class="btn" onClick={() => void saveFile(downloads, systemFileName(system), serializeDesignSystem(design.ds!), say)}>
                      Download its design system
                    </button>
                  ) : null}
                </>
              ) : (
                <span class="note">Downloads are not available in this view.</span>
              )}
            </div>
            <p class="note">
              The design opens in Template Studio as a template file{system ? `, with ${systemFileName(system)} in the folder’s design-systems` : ''}. The connector cannot write a
              template, so a new build goes up by hand: in Design Manager open <span class="code">{entry.path}</span> and replace its code, or{' '}
              <span class="code">
                hs cms upload "{slug}.html" "{entry.path}"
              </span>{' '}
              with the file under the name you saved it as.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

// --- a draft email -------------------------------------------------------------------------------------------------

type Step = { k: 'form' } | { k: 'confirm' } | { k: 'sending' } | { k: 'done'; outcome: DraftOutcome; details: Record<string, unknown> | null } | { k: 'failed'; err: DeskError; ambiguous: boolean };

/** A draft's form and where it got to. Kept by the page, not the tab, so a draft in flight survives leaving the tab. */
interface DraftState {
  req: DraftRequest;
  step: Step;
}

const freshDraft = (entry: Entry): DraftState => ({
  req: {
    name: '',
    subject: '',
    previewText: '',
    fromName: store.get('fromName'),
    replyToEmail: store.get('replyTo'),
    subscriptionTypeId: Number(store.get('subscriptionType')) || 0,
    emailType: 'BATCH',
    templatePath: entry.path,
  },
  step: { k: 'form' },
});

/**
 * Makes the draft: one CREATE, then polls while HubSpot finishes it. Never retried. A CREATE that fails says so; once
 * CREATE has answered, the draft exists, so a poll or a read that fails afterwards still reports the draft made.
 */
async function makeDraft(mcp: McpLike, req: DraftRequest, report: (step: Step) => void): Promise<void> {
  let outcome: DraftOutcome;
  try {
    outcome = await createDraft(mcp, req);
  } catch (cause) {
    const err = explain(cause);
    // A write that timed out or was lost may still have run (mcp.d.ts): never offer a blind second try. Approval,
    // policy and connection failures never reached HubSpot.
    report({ k: 'failed', err, ambiguous: err.kind === 'busy' || err.kind === 'other' });
    return;
  }
  try {
    for (let tries = 0; outcome.pending && outcome.contentId && tries < 10; tries++) {
      await new Promise((r) => setTimeout(r, 2000));
      outcome = await pollDraft(mcp, outcome.contentId);
    }
  } catch {
    /* the draft exists; it is only not confirmed finished, and the result says so */
  }
  const id = outcome.objectId ?? outcome.contentId;
  const details = id ? await draftDetails(mcp, id).catch(() => null) : null;
  report({ k: 'done', outcome, details });
}

function DraftTab({ entry, conn, label, draft, onDraft, onCreate }: { entry: Entry; conn: Conn; label: string; draft: DraftState; onDraft: (d: DraftState) => void; onCreate: () => void }) {
  const [types, setTypes] = useState<SubscriptionType[] | null>(null);
  const [typesErr, setTypesErr] = useState<DeskError | null>(null);
  const [addresses, setAddresses] = useState<FromAddress[] | null>(null);
  const [addressErr, setAddressErr] = useState<DeskError | null>(null);
  const [armed, setArmed] = useState(false);
  const { req, step } = draft;
  const mcp = conn.k === 'ready' ? conn.mcp : null;

  const loadTypes = useCallback(() => {
    if (!mcp) return;
    setTypesErr(null);
    listSubscriptionTypes(mcp).then(setTypes, (cause) => setTypesErr(explain(cause)));
  }, [mcp]);
  const loadAddresses = useCallback(() => {
    if (!mcp) return;
    setAddressErr(null);
    listFromAddresses(mcp).then(setAddresses, (cause) => setAddressErr(explain(cause)));
  }, [mcp]);

  useEffect(() => {
    if (!mcp || entry.local) return;
    loadTypes();
    loadAddresses();
  }, [mcp, entry.local, loadTypes, loadAddresses]);

  // The confirm button lands where Review was; it waits a moment, so a double click on Review cannot also press it.
  useEffect(() => {
    if (step.k !== 'confirm') {
      setArmed(false);
      return;
    }
    const t = setTimeout(() => setArmed(true), 600);
    return () => clearTimeout(t);
  }, [step.k]);

  if (entry.local) return <div class="empty">A draft is made from a template in HubSpot. This one was opened from this computer; upload it first, then pick it from the list.</div>;
  if (!mcp) return <div class="empty">Drafts need the HubSpot connector, which this view does not have.</div>;

  const set = <K extends keyof DraftRequest>(key: K, value: DraftRequest[K]) => onDraft({ ...draft, req: { ...req, [key]: value } });
  const toStep = (s: Step) => onDraft({ ...draft, step: s });
  const problems = draftProblems(req);
  const typeName = types?.find((t) => t.id === req.subscriptionTypeId)?.name ?? '';

  if (step.k === 'done') {
    const d = step.details ?? {};
    const url = step.outcome.editorUrl || (typeof d['emailUrl'] === 'string' ? (d['emailUrl'] as string) : '') || (typeof d['editorUrl'] === 'string' ? (d['editorUrl'] as string) : '');
    return (
      <div class="panel">
        <div class="row">
          <span class="chip done">Draft made</span>
          <span>{req.name}</span>
        </div>
        <p class="note">
          {step.outcome.pending
            ? 'HubSpot accepted it and had not finished making it when the desk stopped asking. It will appear under Marketing › Email; look there before making it again.'
            : `In HubSpot as a draft${step.outcome.objectId ? `, id ${step.outcome.objectId}` : ''}. Nothing is sent or scheduled. Recipients, test sends and scheduling are done in HubSpot.`}
        </p>
        {step.outcome.warnings.length ? (
          <ul class="problems">
            {step.outcome.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        <div class="row">
          {url ? (
            <a class="btn primary" href={url} target="_blank" rel="noreferrer">
              Open in HubSpot
            </a>
          ) : (
            <span class="note">Find it under Marketing › Email › Drafts.</span>
          )}
          <button class="btn" onClick={() => onDraft(freshDraft(entry))}>
            Make another
          </button>
        </div>
      </div>
    );
  }

  if (step.k === 'confirm' || step.k === 'sending') {
    return (
      <div class="panel">
        <div class="card-title">Make this draft in HubSpot?</div>
        <p class="lede">
          A draft marketing email named <strong>{req.name}</strong>, subject “{req.subject}”, from {req.fromName} with replies to <span class="code">{req.replyToEmail}</span>,
          for contacts subscribed to {typeName || 'the chosen type'}, built on <span class="code">{entry.path}</span>. Nothing is sent or scheduled. HubSpot does not let a
          draft change its template afterwards.
        </p>
        <pre>{JSON.stringify({ operation: draftOperation(req), confirmationStatus: 'CONFIRMED' }, null, 2)}</pre>
        <div class="row">
          <button class="btn primary" onClick={onCreate} disabled={step.k === 'sending' || !armed}>
            {step.k === 'sending' ? 'Making the draft…' : 'Make the draft'}
          </button>
          <button class="btn" onClick={() => toStep({ k: 'form' })} disabled={step.k === 'sending'}>
            Back
          </button>
        </div>
        {step.k === 'sending' ? <p class="note">The draft keeps going if you leave this tab.</p> : null}
      </div>
    );
  }

  return (
    <div class="card">
      <div class="card-head">
        <span class="card-title">A draft marketing email built on {label}</span>
      </div>
      <div class="card-body">
        {step.k === 'failed' ? (
          <>
            <Refusal err={step.err} />
            {step.ambiguous ? <p class="note">▲ HubSpot may have made the draft before the answer was lost. Look under Marketing › Email before making it again.</p> : null}
          </>
        ) : null}
        <form
          class="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problems.length) toStep({ k: 'confirm' });
          }}
        >
          <div class="field">
            <label for="draft-name">Email name</label>
            <input id="draft-name" value={req.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} placeholder="2026-11 · Members newsletter" />
            <span class="hint">How HubSpot lists it. The team never sees it.</span>
          </div>
          <div class="field">
            <label for="draft-subject">Subject line</label>
            <input id="draft-subject" value={req.subject} onInput={(e) => set('subject', (e.target as HTMLInputElement).value)} />
          </div>
          <div class="field wide">
            <label for="draft-preview">Preview text</label>
            <input id="draft-preview" value={req.previewText} onInput={(e) => set('previewText', (e.target as HTMLInputElement).value)} />
            <span class="hint">The line after the subject in an inbox. Optional; 50 to 100 characters reads best.</span>
          </div>
          <div class="field">
            <label for="draft-from">Sender name</label>
            <input id="draft-from" value={req.fromName} onInput={(e) => set('fromName', (e.target as HTMLInputElement).value)} placeholder="Switchyards" />
          </div>
          <div class="field">
            <label for="draft-reply">Reply-to address</label>
            {addresses && addresses.length ? (
              <select id="draft-reply" value={req.replyToEmail} onChange={(e) => set('replyToEmail', (e.target as HTMLSelectElement).value)}>
                <option value="">Pick a verified address</option>
                {addresses.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.name ? `${a.name} · ${a.email}` : a.email}
                  </option>
                ))}
              </select>
            ) : (
              <input id="draft-reply" type="email" value={req.replyToEmail} onInput={(e) => set('replyToEmail', (e.target as HTMLInputElement).value)} />
            )}
            <span class="hint">
              {addressErr
                ? addressErr.kind === 'scope'
                  ? 'The HubSpot connection cannot list verified addresses (it lacks two permissions). Type one HubSpot has verified.'
                  : `Verified addresses could not be listed: ${addressErr.title} Type one.`
                : 'Use an address HubSpot has verified.'}
            </span>
            {addressErr && addressErr.kind !== 'scope' ? (
              <button type="button" class="btn small" style={{ justifySelf: 'start' }} onClick={loadAddresses}>
                List them again
              </button>
            ) : null}
          </div>
          <div class="field">
            <label for="draft-type">Subscription type</label>
            <select id="draft-type" value={String(req.subscriptionTypeId || '')} onChange={(e) => set('subscriptionTypeId', Number((e.target as HTMLSelectElement).value) || 0)} disabled={!types}>
              <option value="">{types ? 'Pick one' : typesErr ? 'Could not list them' : 'Reading…'}</option>
              {(types ?? []).map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
            <span class="hint">Which contacts may receive it.</span>
          </div>
          <div class="field">
            <span class="field-label" id="draft-kind-label">
              Kind
            </span>
            <Seg
              label="Kind"
              value={req.emailType}
              onChange={(v) => set('emailType', v)}
              options={[
                ['BATCH', 'One send to lists'],
                ['AUTOMATED', 'Sent by a workflow'],
              ]}
            />
            <span class="hint">Fixed once the draft exists.</span>
          </div>
          {typesErr ? (
            <div class="field wide">
              <Refusal err={typesErr} onRetry={loadTypes} />
            </div>
          ) : null}
          <div class="field wide">
            {problems.length ? (
              <ul class="problems">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            <div class="row">
              <button class="btn primary" type="submit" disabled={problems.length > 0}>
                Review the draft
              </button>
              <span class="note">Nothing goes to HubSpot until the next step.</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/** One template's view, kept from taking the whole page down when something in it throws. */
class Guard extends Component<{ reset: string; children: ComponentChildren }, { error: string | null }> {
  override state = { error: null as string | null };
  static override getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  override componentDidUpdate(prev: { reset: string }) {
    if (prev.reset !== this.props.reset && this.state.error) this.setState({ error: null });
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return <Refusal err={{ kind: 'other', title: 'This template could not be shown.', fix: 'Pick another template, or read this one again. The rest of the desk still works.', detail: this.state.error, retryable: false }} />;
  }
}

const root = document.getElementById('desk');
if (root) render(<Desk />, root);
