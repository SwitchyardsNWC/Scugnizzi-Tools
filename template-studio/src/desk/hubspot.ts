/**
 * The HubSpot desk's one way to HubSpot: the viewer's own HubSpot connector, called through the artifact's
 * `mcp` capability. Nothing here holds a token; every call runs as whoever has the page open.
 *
 * What the connector can do with coded email templates, as of 2026-11-11 (learnings §1.19): list them, read one's
 * full source, and make a draft marketing email from one. It cannot write a template file. Uploading stays a
 * handoff to Design Manager or `hs cms upload`.
 *
 * The connector calls are pure data in and out, so the error mapping below is tested under Node with a fake.
 */

/** The connector's display name in claude.ai, which is what the page's manifest and every call name. */
export const SERVER = 'HubSpot';
/** The connector's one tool for marketing email and its templates. */
export const TOOL = 'manage_marketing_email';

/** The slice of the runtime's `mcp` namespace the desk uses. */
export interface McpLike {
  callTool(server: string, tool: string, input?: unknown, options?: CallOptions): Promise<{ payload?: unknown; content?: unknown }>;
}
interface CallOptions {
  cache?: false | { staleTime?: number; gcTime?: number; refresh?: boolean };
}

export interface PortalTemplate {
  id: number;
  path: string;
  label: string;
}

export interface TemplateSource {
  id: number | null;
  path: string;
  source: string;
}

export interface SubscriptionType {
  id: number;
  name: string;
  description: string;
}

export interface FromAddress {
  email: string;
  name: string;
}

/** What the page asks HubSpot to create. The names are the connector's own CREATE fields. */
export interface DraftRequest {
  name: string;
  subject: string;
  previewText: string;
  fromName: string;
  replyToEmail: string;
  subscriptionTypeId: number;
  emailType: 'BATCH' | 'AUTOMATED';
  templatePath: string;
}

/** Where a draft got to. HubSpot sometimes answers CREATE before the email exists, so a pending draft is polled. */
export interface DraftOutcome {
  contentId: number | null;
  objectId: number | null;
  pending: boolean;
  editorUrl: string | null;
  warnings: string[];
  raw: unknown;
}

/**
 * A failure the page can act on. `kind` picks the copy and the one control that fixes it; nothing collapses into a
 * single "something went wrong".
 */
export type DeskErrorKind =
  | 'no-runtime' // the page is open outside claude.ai, or the connector capability was not granted
  | 'add-connector' // no HubSpot connector for this viewer
  | 'reconnect' // the connector's sign-in lapsed
  | 'choose-connector' // two HubSpot connectors, none chosen
  | 'not-allowed' // the viewer declined HubSpot for this page, or turned it off
  | 'needs-approval' // this call needs a yes the viewer has not given
  | 'blocked' // an organisation policy blocks the tool
  | 'scope' // the connection lacks a HubSpot permission the call needs
  | 'busy' // HubSpot did not answer in time; worth one more try
  | 'refused' // HubSpot answered and said no
  | 'other';

export interface DeskError {
  kind: DeskErrorKind;
  /** One line that says what is wrong. */
  title: string;
  /** What fixes it. */
  fix: string;
  /** HubSpot's own words, when it gave any. */
  detail: string;
  /** True only when the runtime stamped the failure as safe to repeat unattended, and only ever used for reads. */
  retryable: boolean;
}

const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);

/** A tool failure's own message, which some runtimes deliver as JSON text. */
function toolMessage(err: Record<string, unknown>): string {
  const msg = text(err['message']);
  const result = record(err['result']);
  const blocks = Array.isArray(result['content']) ? (result['content'] as unknown[]) : [];
  const fromBlocks = blocks.map((b) => text(record(b)['text'])).filter(Boolean).join(' ');
  const raw = fromBlocks || msg;
  try {
    const parsed = record(JSON.parse(raw));
    return text(parsed['message']) || text(record(parsed['error'])['message']) || raw;
  } catch {
    return raw;
  }
}

/** Maps a rejection from the runtime, or anything else thrown, to what the page should say. */
export function explain(cause: unknown): DeskError {
  const err = record(cause);
  const code = text(err['code']);
  const retryable = err['retryable'] === true;
  const detail = code === 'tool_error' ? toolMessage(err) : text(err['message']) || (cause instanceof Error ? cause.message : '');
  const make = (kind: DeskErrorKind, title: string, fix: string): DeskError => ({ kind, title, fix, detail, retryable });
  switch (code) {
    case 'not_granted':
    case 'capability_disabled':
    case 'capability_removed':
      return make('no-runtime', 'HubSpot is not reachable from this view.', 'Open the desk in claude.ai, where it can use your HubSpot connector.');
    case 'server_not_connected':
    case 'server_not_found':
      return make('add-connector', 'No HubSpot connector is connected.', 'Add HubSpot in claude.ai Settings → Connectors, then reload the desk.');
    case 'needs_reauth':
      return make('reconnect', 'The HubSpot connection has lapsed.', 'Reconnect HubSpot in claude.ai Settings → Connectors, then reload the desk.');
    case 'selection_required':
      return make('choose-connector', 'Two HubSpot connectors are connected and neither is chosen.', 'Choose one when claude.ai asks, or remove the other in Settings → Connectors.');
    case 'not_in_manifest':
    case 'consent_required':
      return make('not-allowed', 'HubSpot is turned off for this page.', 'Allow HubSpot from the artifact’s Permissions menu, then reload.');
    case 'approval_required':
      return make('needs-approval', 'This needs your approval first.', 'Press the button again and allow it when claude.ai asks.');
    case 'blocked_by_policy':
      return make('blocked', 'An organisation policy blocks this HubSpot tool.', 'A claude.ai admin can lift the policy; nothing on this page can.');
    case 'server_unavailable':
    case 'rate_limited':
      return make('busy', 'HubSpot did not answer in time.', 'Try again in a moment.');
    case 'tool_error': {
      if (/permission|scope/i.test(detail)) {
        return make('scope', 'The HubSpot connection is missing a permission this needs.', 'Reconnect HubSpot in claude.ai Settings → Connectors and tick the permissions it names.');
      }
      return make('refused', 'HubSpot refused the request.', 'Read HubSpot’s reason below, change what it names, and try again.');
    }
    case 'cancelled':
      return make('other', 'The request was cancelled.', 'Try again.');
    default:
      return make('other', 'The HubSpot call failed.', retryable ? 'Try again in a moment.' : 'Reload the desk. If it keeps failing, check the HubSpot connector in claude.ai Settings.');
  }
}

/** The payload of a call: the runtime's parsed JSON, else the first text block parsed. */
export function payloadOf(result: { payload?: unknown; content?: unknown }): Record<string, unknown> {
  if (result.payload && typeof result.payload === 'object') return result.payload as Record<string, unknown>;
  const blocks = Array.isArray(result.content) ? (result.content as unknown[]) : [];
  const first = text(record(blocks[0])['text']) || text(result.payload);
  try {
    return record(JSON.parse(first));
  } catch {
    return {};
  }
}

/** A read the page may cache for a minute; the refresh control passes `refresh` to go to HubSpot regardless. */
const READ = (refresh = false): CallOptions => ({ cache: { staleTime: 60_000, gcTime: 300_000, refresh } });
/** Writes and polls are never cached and never repeated by machinery. */
const LIVE: CallOptions = { cache: false };

async function call(mcp: McpLike, operation: Record<string, unknown>, options: CallOptions, extra: Record<string, unknown> = {}) {
  const result = await mcp.callTool(SERVER, TOOL, { operation, ...extra }, options);
  return payloadOf(result);
}

/** Every coded email template in the portal, a page of a hundred at a time. */
export async function listTemplates(mcp: McpLike, refresh = false): Promise<PortalTemplate[]> {
  const out: PortalTemplate[] = [];
  for (let offset = 0, guard = 0; guard < 50; guard++) {
    const page = await call(mcp, { _type: 'LIST_TEMPLATES', emailTemplateType: 'CODED', limit: 100, offset }, READ(refresh));
    const rows = Array.isArray(page['templates']) ? (page['templates'] as unknown[]) : [];
    for (const row of rows) {
      const r = record(row);
      const path = text(r['path']);
      if (!path) continue;
      out.push({ id: num(r['templateId']) ?? 0, path, label: text(r['label']) || path.split('/').pop() || path });
    }
    if (page['hasMore'] !== true || rows.length === 0) break;
    offset += rows.length;
  }
  return out;
}

export async function getTemplate(mcp: McpLike, path: string, refresh = false): Promise<TemplateSource> {
  const p = await call(mcp, { _type: 'GET_TEMPLATE', path }, READ(refresh));
  return { id: num(p['templateId']), path: text(p['templatePath']) || path, source: text(p['source']) };
}

export async function listSubscriptionTypes(mcp: McpLike): Promise<SubscriptionType[]> {
  const p = await call(mcp, { _type: 'LIST_SUBSCRIPTION_TYPES' }, READ());
  const rows = Array.isArray(p['subscriptionTypes']) ? (p['subscriptionTypes'] as unknown[]) : [];
  return rows
    .map((row) => record(row))
    .map((r) => ({ id: num(r['id']) ?? 0, name: text(r['name']), description: text(r['description']) }))
    .filter((t) => t.id > 0);
}

/**
 * The portal's verified from addresses. The connector needs two extra HubSpot permissions for this
 * (settings.users.teams.read, crm.objects.owners.read); without them the call fails with `scope` and the form takes a
 * typed address instead, which HubSpot itself checks on create.
 */
export async function listFromAddresses(mcp: McpLike): Promise<FromAddress[]> {
  const p = await call(mcp, { _type: 'LIST_FROM_ADDRESSES' }, READ());
  const rows = (Array.isArray(p['fromAddresses']) ? p['fromAddresses'] : Array.isArray(p['addresses']) ? p['addresses'] : []) as unknown[];
  return rows
    .map((row) => (typeof row === 'string' ? { email: row, name: '' } : { email: text(record(row)['email']) || text(record(row)['address']), name: text(record(row)['name']) || text(record(row)['fromName']) }))
    .filter((a) => a.email.includes('@'));
}

/** The exact operation CREATE receives; the confirmation panel shows this object before anything is sent. */
export function draftOperation(req: DraftRequest): Record<string, unknown> {
  const op: Record<string, unknown> = {
    _type: 'CREATE',
    name: req.name.trim(),
    subject: req.subject.trim(),
    fromName: req.fromName.trim(),
    replyToEmail: req.replyToEmail.trim(),
    subscriptionTypeId: req.subscriptionTypeId,
    emailType: req.emailType,
    templatePath: req.templatePath,
  };
  if (req.previewText.trim()) op['previewText'] = req.previewText.trim();
  return op;
}

/** What is missing before a draft can be asked for, in the words the form shows. Empty means ready. */
export function draftProblems(req: DraftRequest): string[] {
  const out: string[] = [];
  if (!req.name.trim()) out.push('Name the email. HubSpot lists it by this name.');
  if (!req.subject.trim()) out.push('Write a subject line.');
  if (!req.fromName.trim()) out.push('Give a sender name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.replyToEmail.trim())) out.push('Give a reply-to address HubSpot has verified.');
  if (!req.subscriptionTypeId) out.push('Pick a subscription type.');
  if (!req.templatePath) out.push('Pick a template.');
  return out;
}

function outcome(p: Record<string, unknown>): DraftOutcome {
  const warnings = (Array.isArray(p['readinessWarnings']) ? (p['readinessWarnings'] as unknown[]) : [])
    .map((w) => (typeof w === 'string' ? w : text(record(w)['message']) || text(record(w)['description']) || JSON.stringify(w)))
    .filter(Boolean);
  const status = text(p['status']);
  const objectId = num(p['marketingEmailObjectId']);
  return {
    contentId: num(p['marketingEmailId']) ?? num(p['contentId']) ?? num(p['id']),
    objectId,
    pending: status === 'CREATION_PENDING' && objectId === null,
    editorUrl: text(p['emailUrl']) || text(p['editorUrl']) || text(p['url']) || null,
    warnings,
    raw: p,
  };
}

/** Creates the draft. Called once per confirmed click; never retried by the page. */
export async function createDraft(mcp: McpLike, req: DraftRequest): Promise<DraftOutcome> {
  const p = await call(mcp, draftOperation(req), LIVE, { confirmationStatus: 'CONFIRMED' });
  return outcome(p);
}

/** Asks whether a pending draft exists yet. A read, so it is safe to repeat. */
export async function pollDraft(mcp: McpLike, contentId: number): Promise<DraftOutcome> {
  const p = await call(mcp, { _type: 'POLL_EMAIL_CREATION', marketingEmailId: contentId }, LIVE);
  const o = outcome(p);
  return { ...o, contentId: o.contentId ?? contentId };
}

/** A draft's settings as HubSpot now holds them, for the result panel. */
export async function draftDetails(mcp: McpLike, id: number): Promise<Record<string, unknown>> {
  return call(mcp, { _type: 'GET_EMAIL_DETAILS', marketingEmailId: id }, LIVE);
}
