// The design a coded template was made from, carried inside the template itself.
//
// Jared, 2026-11-11, asked where a template's editable design should live when he works from Claude: "Inside the
// HubSpot file". So every file Template Studio ships to HubSpot ends its header with one HubL comment holding the
// document it was compiled from, and anything that can read the template back (the HubSpot desk reads it through
// the connector) can reopen the design without the folder it came from (learnings 1.19).
//
// A HubL comment, never an HTML one: HubL comments are dropped when HubSpot renders the email, so none of this
// reaches an inbox, while an HTML comment would ship to every recipient. That is also why the size the checks hold
// against Gmail's clip leaves it out (compile.ts).
//
// The payload is the template exactly as the app saves it, plus the design system it compiled with when the saved
// file would not carry one (a template that follows a folder system drops its copy on save, serialize.ts). It is
// JSON, minified, with every character that could mean something to HubL, to HubSpot's checks or to ours written
// as a \u escape inside its strings. JSON only ever has those characters inside strings, so `JSON.parse` reads
// back the identical value, and the comment holds no `#}` to end it early, no `{{` or `{%` for HubL, and no `<` for
// the linter or the packager to mistake for markup.
//
// Pure and DOM-free, like the rest of the compiler.

import type { DesignSystem } from '../model/design-system.ts';
import type { Template } from '../model/types.ts';

/** The comment's first word. Distinct from the generated-by comment, which is also `{# … #}`. */
export const DESIGN_MARK = 'template-studio:design';
/** The envelope's format. A reader refuses a newer one rather than guess at it. */
export const DESIGN_FORMAT = 1;

/** What the comment carries, parsed. */
export interface EmbeddedDesign {
  format: number;
  /** The template as its *.template.json holds it: open it with `migrate`. */
  template: Record<string, unknown>;
  /**
   * The design system the file compiled with, as a *.system.json holds it, when the template does not carry its own:
   * it follows a folder system, or has never opened the design panel and so compiled against the defaults.
   */
  ds: Record<string, unknown> | null;
  /** The folder system the template follows, by name, when it follows one. */
  system: string | null;
  /** The suite version that wrote the file, when the caller said. */
  by: string | null;
}

export type ReadDesign = { ok: true; design: EmbeddedDesign } | { ok: false; reason: string } | null;

const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '%': '\\u0025',
  '#': '\\u0023',
  '{': '\\u007b',
  '}': '\\u007d',
};

/**
 * JSON text with the characters above escaped inside its strings. A string-aware walk, because `{` and `}` are
 * also JSON's own punctuation and those must stay as they are.
 */
export function commentSafe(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
    } else if (escaped) {
      escaped = false;
      out += ch;
    } else if (ch === '\\') {
      escaped = true;
      out += ch;
    } else if (ch === '"') {
      inString = false;
      out += ch;
    } else {
      out += ESCAPES[ch] ?? ch;
    }
  }
  return out;
}

/** Sorted keys, as the saved files have them, so the same design always writes the same comment. */
function sortedKeys(_key: string, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) out[key] = (value as Record<string, unknown>)[key];
  return out;
}

/** The template as `serializeTemplate` would write it, without the dependency on how that function spaces it. */
function storedTemplate(template: Template): Record<string, unknown> {
  if (!template.designSystem) return template as unknown as Record<string, unknown>;
  const { ds, ...rest } = template;
  void ds;
  return rest as unknown as Record<string, unknown>;
}

/**
 * The comment, one line of explanation and one line of payload, ending in a newline.
 *
 * `ds` is the system the compiler actually used. It is written when the stored template would not reproduce it on
 * its own: always for a template that follows a folder system or was compiled with an override, and for one with no
 * system of its own at all, so a later build with different defaults still reopens it as it was.
 */
export function designComment(template: Template, ds: DesignSystem, options: { overridden?: boolean; by?: string } = {}): string {
  const stored = storedTemplate(template);
  const carriesOwn = !template.designSystem && !options.overridden && template.ds !== undefined;
  const envelope = {
    by: options.by ?? null,
    ds: carriesOwn ? null : ds,
    format: DESIGN_FORMAT,
    system: template.designSystem ?? null,
    template: stored,
  };
  const json = commentSafe(JSON.stringify(envelope, sortedKeys));
  return (
    `{# ${DESIGN_MARK} ${DESIGN_FORMAT}\n` +
    `   The design this file was compiled from, so Template Studio can open it again. HubSpot does not render HubL comments, so none of it reaches an inbox.\n` +
    `${json}\n#}\n`
  );
}

/** Where the comment sits in a source, if it is there. */
function locate(source: string): { start: number; end: number; body: string } | null {
  const start = source.indexOf(`{# ${DESIGN_MARK}`);
  if (start < 0) return null;
  const close = source.indexOf('#}', start + 2);
  if (close < 0) return null;
  let end = close + 2;
  if (source[end] === '\r') end += 1;
  if (source[end] === '\n') end += 1;
  return { start, end, body: source.slice(start + 2, close) };
}

/**
 * The design inside a template's source: `null` when it has none, a reason when it has one this build cannot read
 * (a newer format, or text someone edited until it no longer parses).
 */
export function readDesign(source: string): ReadDesign {
  const found = locate(source);
  if (!found) return null;
  const lines = found.body.split(/\r?\n/).map((l) => l.trim());
  const head = /^\S+\s+(\d+)/.exec(lines[0] ?? '');
  const format = head ? Number(head[1]) : NaN;
  if (!Number.isInteger(format)) return { ok: false, reason: 'The design comment has no format number.' };
  if (format > DESIGN_FORMAT) return { ok: false, reason: `The design was written by a newer Template Studio (format ${format}); this build reads format ${DESIGN_FORMAT}.` };
  const payload = [...lines].reverse().find((l) => l.startsWith('{'));
  if (!payload) return { ok: false, reason: 'The design comment holds no design.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { ok: false, reason: 'The design comment has been edited and no longer reads as JSON.' };
  }
  const env = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const template = env['template'];
  if (!template || typeof template !== 'object' || Array.isArray(template)) return { ok: false, reason: 'The design comment holds no template.' };
  const ds = env['ds'];
  return {
    ok: true,
    design: {
      format,
      template: template as Record<string, unknown>,
      ds: ds && typeof ds === 'object' && !Array.isArray(ds) ? (ds as Record<string, unknown>) : null,
      system: typeof env['system'] === 'string' ? (env['system'] as string) : null,
      by: typeof env['by'] === 'string' ? (env['by'] as string) : null,
    },
  };
}

/** The source with the design comment taken out: what HubSpot renders, and what a drift check compares. */
export function withoutDesign(source: string): string {
  const found = locate(source);
  return found ? source.slice(0, found.start) + source.slice(found.end) : source;
}
