// Reading a coded email template's HubL source, whoever wrote it: what HubSpot will make of its header, who made it,
// the fields the team fills in, the checks HubSpot holds it to, and what it shows with every field at its default.
//
// The HubSpot desk (src/desk) uses this on templates it reads back from HubSpot, most of which this build did not
// compile. So it reads the dialect the compiler writes exactly (learnings 1.3–1.17: quoting, argument order, the
// two condition shapes) and degrades on anything else: a tag it does not know is skipped, never guessed at, and the
// preview it draws from defaults is labelled an approximation by the page. A template that carries its own design
// (compile/embed.ts) is drawn by the compiler instead, which is exact.
//
// Pure and DOM-free, so it is tested under Node against the compiler's own output.

import { readDesign, withoutDesign } from '../compile/embed.ts';
import { isRemoteSrc, localSources } from './export-package.ts';
import type { Preview } from './types.ts';

// --- tokens ------------------------------------------------------------------------------------------------------

export type Token =
  | { t: 'html'; text: string }
  | { t: 'comment'; text: string }
  | { t: 'stmt'; text: string }
  | { t: 'expr'; text: string };

/**
 * The end of a `{% … %}` or `{{ … }}` starting at `from`, reading quoted strings whole, so a `%}` inside
 * `value='…'` does not close the tag (the compiler leaves `%}` and `}}` raw in defaults; learnings 1.10).
 */
function closeOf(source: string, from: number, closer: string): number {
  for (let k = from; k < source.length; k++) {
    const ch = source[k];
    if (ch === "'" || ch === '"') {
      const end = source.indexOf(ch, k + 1);
      if (end < 0) return -1;
      k = end;
    } else if (source.startsWith(closer, k)) {
      return k;
    }
  }
  return -1;
}

export function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const html = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.t === 'html') last.text += text;
    else out.push({ t: 'html', text });
  };
  while (i < source.length) {
    const next = source.indexOf('{', i);
    if (next < 0) break;
    const kind = source[next + 1];
    if (kind !== '#' && kind !== '%' && kind !== '{') {
      html(source.slice(i, next + 1));
      i = next + 1;
      continue;
    }
    html(source.slice(i, next));
    if (kind === '#') {
      const end = source.indexOf('#}', next + 2);
      if (end < 0) return [...out, { t: 'html', text: source.slice(next) }];
      out.push({ t: 'comment', text: source.slice(next + 2, end) });
      i = end + 2;
      continue;
    }
    const closer = kind === '%' ? '%}' : '}}';
    const end = closeOf(source, next + 2, closer);
    if (end < 0) {
      html(source.slice(next));
      return out;
    }
    // Whitespace control (`{%-`, `-%}`) changes nothing a reader needs, so the markers go.
    const body = source.slice(next + 2, end).replace(/^-/, '').replace(/-$/, '').trim();
    out.push(kind === '%' ? { t: 'stmt', text: body } : { t: 'expr', text: body });
    i = end + 2;
  }
  html(source.slice(i));
  return out;
}

// --- statements ----------------------------------------------------------------------------------------------------

export type ArgValue = string | number | boolean | Record<string, unknown> | null;

export interface Statement {
  tag: string;
  /** The first, positional, quoted argument: a field's name. */
  name: string | null;
  args: Record<string, ArgValue>;
  /** The text after the tag, for the tags whose body is an expression (`if`, `set`). */
  rest: string;
}

const decodeAttr = (s: string) => s.replace(/&quot;/g, '"');

function argValue(raw: string): ArgValue {
  if (raw.startsWith('"')) return decodeAttr(raw.slice(1, -1));
  if (raw.startsWith("'")) return raw.slice(1, -1);
  if (raw === 'True' || raw === 'true') return true;
  if (raw === 'False' || raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith('{')) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      try {
        return JSON.parse(raw.replace(/'/g, '"')) as Record<string, unknown>;
      } catch {
        return raw;
      }
    }
  }
  return raw;
}

const KWARG = /\s*,?\s*([A-Za-z_]\w*)\s*=\s*("[^"]*"|'[^']*'|\{[^}]*\}|-?\d+(?:\.\d+)?|[^\s,]+)/y;

export function parseStatement(body: string): Statement {
  const tag = /^[A-Za-z_]+/.exec(body)?.[0] ?? '';
  const rest = body.slice(tag.length).trim();
  let at = tag.length;
  let name: string | null = null;
  const positional = /^\s*,?\s*("([^"]*)"|'([^']*)')/.exec(body.slice(at));
  if (positional) {
    name = positional[2] ?? positional[3] ?? null;
    at += positional[0].length;
  }
  const args: Record<string, ArgValue> = {};
  KWARG.lastIndex = at;
  for (let m = KWARG.exec(body); m; m = KWARG.exec(body)) args[m[1]!] = argValue(m[2]!);
  return { tag, name, args, rest };
}

// --- fields --------------------------------------------------------------------------------------------------------

export type FieldKind = 'text' | 'rich text' | 'image' | 'module' | 'drag-and-drop area' | 'other';

export interface SourceField {
  name: string;
  kind: FieldKind;
  /** The HubL tag that declares it: `text`, `rich_text`, `module`, `linked_image`… */
  tag: string;
  /** A module's path, `@hubspot/image_email`. */
  path: string | null;
  label: string;
  /** Its default, as text: a text field's value, rich text's HTML, an image's address. */
  value: string;
  /** Exported to the template context: the template prints it where it chooses. Otherwise it renders in place. */
  exported: boolean;
}

/** Tags that declare a field the team fills in. Anything else with a quoted first argument is not one. */
const FIELD_TAGS = new Set([
  'text',
  'rich_text',
  'inline_text',
  'inline_rich_text',
  'module',
  'image',
  'linked_image',
  'image_src',
  'choice',
  'boolean',
  'color',
  'number',
  'raw_html',
  'email_simple_subscription',
  'dnd_area',
]);

const str = (v: ArgValue | undefined): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
const obj = (v: ArgValue | undefined): Record<string, unknown> => (v && typeof v === 'object' ? v : {});

function fieldOf(st: Statement): SourceField | null {
  if (!st.name || !FIELD_TAGS.has(st.tag)) return null;
  const label = str(st.args['label']) || st.name;
  const exported = st.args['export_to_template_context'] === true;
  const base = { name: st.name, tag: st.tag, label, exported, path: null as string | null };
  switch (st.tag) {
    case 'text':
    case 'inline_text':
      return { ...base, kind: 'text', value: str(st.args['value']) };
    case 'rich_text':
    case 'inline_rich_text':
      return { ...base, kind: 'rich text', value: str(st.args['html']) };
    case 'linked_image':
    case 'image':
    case 'image_src':
      return { ...base, kind: 'image', value: str(st.args['src']) };
    case 'module': {
      const path = str(st.args['path']);
      const img = obj(st.args['img']);
      if (path === '@hubspot/image_email') return { ...base, kind: 'image', path, value: typeof img['src'] === 'string' ? img['src'] : '' };
      if (path === '@hubspot/linked_image') return { ...base, kind: 'image', path, value: str(st.args['src']) };
      return { ...base, kind: 'module', path, value: '' };
    }
    case 'dnd_area':
      return { ...base, kind: 'drag-and-drop area', value: '' };
    default:
      return { ...base, kind: 'other', value: str(st.args['value']) || str(st.args['default']) };
  }
}

/** Every field the source declares, in the order HubSpot lists them (learnings 1.4). A name declared twice counts once. */
export function sourceFields(source: string): SourceField[] {
  const seen = new Set<string>();
  const out: SourceField[] = [];
  for (const token of tokenize(withoutDesign(source))) {
    if (token.t !== 'stmt') continue;
    const field = fieldOf(parseStatement(token.text));
    if (!field || seen.has(field.name)) continue;
    seen.add(field.name);
    out.push(field);
  }
  return out;
}

// --- header and maker ----------------------------------------------------------------------------------------------

export interface Annotation {
  templateType: string | null;
  available: boolean | null;
  label: string | null;
  /** Whether it opens the file, which HubSpot requires (learnings 1.1). */
  first: boolean;
}

export function annotationOf(source: string): Annotation | null {
  const m = /<!--([\s\S]*?)-->/.exec(source);
  if (!m || !/templateType\s*:/.test(m[1]!)) return null;
  const field = (key: string) => new RegExp(`^\\s*${key}\\s*:\\s*(.*?)\\s*$`, 'm').exec(m[1]!)?.[1] ?? null;
  const available = field('isAvailableForNewContent');
  return {
    templateType: field('templateType'),
    available: available === null ? null : available.toLowerCase() === 'true',
    label: field('label'),
    first: source.slice(0, m.index).trim() === '',
  };
}

export type Maker = 'template-studio' | 'template-builder' | 'other';

/** Which tool wrote the file, by its generated-by comment, and the date it gave. */
export function makerOf(source: string): { maker: Maker; date: string | null } {
  const studio = /\{#\s*Generated by Template Studio on (\d{4}-\d{2}-\d{2})/.exec(source);
  if (studio) return { maker: 'template-studio', date: studio[1]! };
  const v1 = /Generated by the Switchyards Template Builder(?:[^0-9#]*(\d{4}-\d{2}-\d{2}))?/.exec(source);
  if (v1) return { maker: 'template-builder', date: v1[1] ?? null };
  return { maker: 'other', date: null };
}

// --- checks --------------------------------------------------------------------------------------------------------

export type CheckState = 'pass' | 'warn' | 'fail' | 'info';

export interface SourceCheck {
  id: string;
  state: CheckState;
  title: string;
  detail: string;
}

export const CLIP_BYTES = 102 * 1024;
export const WARN_BYTES = 90 * 1024;

const CAN_SPAM = ['site_settings.company_name', 'site_settings.company_street_address_1', 'site_settings.company_city', 'site_settings.company_state', 'site_settings.company_zip'];

/** The bytes of what HubSpot renders: the source, the embedded design left out. */
export const renderedBytes = (source: string): number => new TextEncoder().encode(withoutDesign(source)).length;

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/**
 * What HubSpot itself holds a coded email template to, read from the source: the header it needs to offer it, the
 * CAN-SPAM variables it refuses to publish without (learnings 1.8), Gmail's clip (2.12), pictures with an address an
 * inbox can fetch, and whether the design travels with it.
 */
export function sourceChecks(source: string): SourceCheck[] {
  const out: SourceCheck[] = [];
  const ann = annotationOf(source);
  if (!ann) out.push({ id: 'annotation', state: 'fail', title: 'No HubSpot header', detail: 'The file needs the templateType comment first, or HubSpot will not offer it when an email is created.' });
  else if (ann.templateType !== 'email') out.push({ id: 'annotation', state: 'fail', title: `Header says “${ann.templateType ?? ''}”`, detail: 'HubSpot offers it as an email template only when templateType is email.' });
  else if (!ann.first) out.push({ id: 'annotation', state: 'warn', title: 'Header is not first', detail: 'HubSpot reads the templateType comment only at the top of the file.' });
  else if (ann.available === false) out.push({ id: 'annotation', state: 'warn', title: 'Hidden from new emails', detail: 'isAvailableForNewContent is false, so the team will not see it under Create email.' });
  else out.push({ id: 'annotation', state: 'pass', title: 'HubSpot header', detail: `Offered as “${ann.label ?? ''}”.` });

  const body = withoutDesign(source);
  const printed = tokenize(body)
    .filter((t) => t.t === 'expr' || t.t === 'stmt')
    .map((t) => t.text)
    .join('\n');
  const unsubscribe = /\bunsubscribe_link(_all)?\b/.test(printed);
  out.push(
    unsubscribe
      ? { id: 'unsubscribe', state: 'pass', title: 'Unsubscribe link', detail: 'HubSpot fills it in at send.' }
      : { id: 'unsubscribe', state: 'fail', title: 'No unsubscribe link', detail: 'HubSpot refuses to publish without {{ unsubscribe_link }} or {{ unsubscribe_link_all }}.' },
  );
  const missing = CAN_SPAM.filter((v) => !printed.includes(v));
  out.push(
    missing.length
      ? { id: 'address', state: 'fail', title: 'Company or address missing', detail: `HubSpot refuses to publish without ${missing.map((m) => m.replace('site_settings.', '')).join(', ')}.` }
      : { id: 'address', state: 'pass', title: 'Company name and address', detail: 'From the portal’s settings at send.' },
  );

  const bytes = renderedBytes(source);
  out.push(
    bytes >= CLIP_BYTES
      ? { id: 'size', state: 'fail', title: `${kb(bytes)}, over Gmail’s clip`, detail: 'Gmail clips an email at about 102 KB and hides the rest, the unsubscribe link with it.' }
      : bytes >= WARN_BYTES
        ? { id: 'size', state: 'warn', title: `${kb(bytes)}, close to Gmail’s clip`, detail: 'Gmail clips at about 102 KB. HubSpot’s link tracking adds a little at send.' }
        : { id: 'size', state: 'pass', title: kb(bytes), detail: 'Under Gmail’s 102 KB clip, before HubSpot adds its link tracking.' },
  );

  const local = localSources(body).filter((src) => !isRemoteSrc(src));
  out.push(
    local.length
      ? { id: 'pictures', state: 'warn', title: `${local.length} picture${local.length === 1 ? '' : 's'} without an address`, detail: `${local.join(', ')}. An inbox cannot fetch a file name; host it in HubSpot’s Files and use its address.` }
      : { id: 'pictures', state: 'pass', title: 'Pictures hosted', detail: 'Every picture has an address an inbox can fetch.' },
  );

  const design = readDesign(source);
  out.push(
    !design
      ? { id: 'design', state: 'info', title: 'No design inside', detail: 'Exported before the design travelled with the file. Attach its .template.json to check it or carry the design in.' }
      : design.ok
        ? { id: 'design', state: 'pass', title: 'Design inside', detail: `Template Studio can open it again${design.design.by ? `; written by ${design.design.by}` : ''}.` }
        : { id: 'design', state: 'warn', title: 'Design unreadable', detail: design.reason },
  );
  return out;
}

// --- preview from defaults -----------------------------------------------------------------------------------------

export interface PreviewSample {
  preview: Preview;
  subject: string;
}

// As the compiler's preview escapes (compile/escape.ts), so a template drawn from defaults matches its canvas.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

type Scope = { data: Record<string, unknown>; vars: Record<string, unknown>; sample: PreviewSample };

// A small expression reader: enough HubL for paths, filters, `~`, `or`/`and`/`not`, comparisons and the odd call.
type ExprTok = { k: 'str' | 'num' | 'id' | 'op'; v: string };

function lexExpr(src: string): ExprTok[] {
  const out: ExprTok[] = [];
  const re = /\s*(?:("(?:[^"]*)"|'(?:[^']*)')|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|(==|!=|>=|<=|[~|.()[\],<>+\-*/]))/y;
  re.lastIndex = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[1] !== undefined) out.push({ k: 'str', v: m[1].slice(1, -1) });
    else if (m[2] !== undefined) out.push({ k: 'num', v: m[2] });
    else if (m[3] !== undefined) out.push({ k: 'id', v: m[3] });
    else if (m[4] !== undefined) out.push({ k: 'op', v: m[4] });
    if (re.lastIndex >= src.length) break;
  }
  return out;
}

const truthy = (v: unknown): boolean => {
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
};

const asText = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'object' ? '' : String(v));

function rootOf(name: string, scope: Scope): unknown {
  const p = scope.sample.preview;
  switch (name) {
    case 'widget_data':
      return scope.data;
    case 'site_settings':
      return {
        company_name: p.company,
        company_street_address_1: p.address,
        company_street_address_2: '',
        company_city: p.city,
        company_state: p.state,
        company_zip: p.zip,
      };
    case 'unsubscribe_link_all':
      return '#unsubscribe';
    case 'unsubscribe_link':
      return '#preferences';
    case 'subject':
      return scope.sample.subject;
    case 'True':
    case 'true':
      return true;
    case 'False':
    case 'false':
      return false;
    case 'None':
    case 'none':
      return null;
    default:
      return name in scope.vars ? scope.vars[name] : undefined;
  }
}

function applyFilter(name: string, value: unknown, args: unknown[]): unknown {
  switch (name) {
    case 'trim':
      return asText(value).trim();
    case 'urlencode':
      return encodeURIComponent(asText(value));
    case 'default':
    case 'd':
      return truthy(value) ? value : args[0];
    case 'upper':
      return asText(value).toUpperCase();
    case 'lower':
      return asText(value).toLowerCase();
    case 'striptags':
      return asText(value).replace(/<[^>]*>/g, '');
    case 'length':
      return typeof value === 'string' || Array.isArray(value) ? value.length : 0;
    case 'int':
      return Number.parseInt(asText(value), 10) || 0;
    default:
      // escape, safe, string and the rest leave a default as it is.
      return value;
  }
}

function callOf(name: string, args: unknown[]): unknown {
  switch (name) {
    case 'personalization_token':
      return args[1] ?? '';
    default:
      // get_asset_url and friends name files HubSpot hosts; the preview cannot show them.
      return '';
  }
}

/** Evaluates one expression against the defaults. Anything it cannot read is empty, never an error. */
export function evaluate(src: string, scope: Scope): unknown {
  const toks = lexExpr(src);
  let i = 0;
  const peek = (v?: string) => (v === undefined ? toks[i] : toks[i]?.v === v ? toks[i] : undefined);
  const take = () => toks[i++];

  const primary = (): unknown => {
    const t = take();
    if (!t) return undefined;
    if (t.k === 'str') return t.v;
    if (t.k === 'num') return Number(t.v);
    if (t.k === 'op' && t.v === '(') {
      const v = or();
      if (peek(')')) take();
      return v;
    }
    if (t.k === 'op' && t.v === '-') return -Number(primary());
    if (t.k !== 'id') return undefined;
    let value: unknown;
    if (peek('(')) {
      take();
      const args = list(')');
      value = callOf(t.v, args);
    } else {
      value = rootOf(t.v, scope);
    }
    for (;;) {
      if (peek('.')) {
        take();
        const key = take();
        value = value && typeof value === 'object' && key ? (value as Record<string, unknown>)[key.v] : undefined;
      } else if (peek('[')) {
        take();
        const key = or();
        if (peek(']')) take();
        value = value && typeof value === 'object' ? (value as Record<string, unknown>)[asText(key)] : undefined;
      } else break;
    }
    return value;
  };
  const list = (end: string): unknown[] => {
    const args: unknown[] = [];
    while (toks[i] && !peek(end)) {
      args.push(or());
      if (peek(',')) take();
      else break;
    }
    if (peek(end)) take();
    return args;
  };
  const filtered = (): unknown => {
    let v = primary();
    while (peek('|')) {
      take();
      const name = take()?.v ?? '';
      const args = peek('(') ? (take(), list(')')) : [];
      v = applyFilter(name, v, args);
    }
    return v;
  };
  const concat = (): unknown => {
    let v = filtered();
    while (peek('~') || peek('+')) {
      const op = take()!.v;
      const r = filtered();
      v = op === '+' && typeof v === 'number' && typeof r === 'number' ? v + r : asText(v) + asText(r);
    }
    return v;
  };
  const compare = (): unknown => {
    const l = concat();
    const op = toks[i];
    if (op && op.k === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(op.v)) {
      take();
      const r = concat();
      switch (op.v) {
        case '==':
          return l === r || asText(l) === asText(r);
        case '!=':
          return !(l === r || asText(l) === asText(r));
        case '<':
          return Number(l) < Number(r);
        case '>':
          return Number(l) > Number(r);
        case '<=':
          return Number(l) <= Number(r);
        default:
          return Number(l) >= Number(r);
      }
    }
    if (peek('is')) {
      take();
      const neg = peek('not') ? (take(), true) : false;
      const test = take()?.v ?? '';
      const result = test === 'defined' ? l !== undefined : test === 'none' ? l === null || l === undefined : truthy(l);
      return neg ? !result : result;
    }
    return l;
  };
  const not = (): unknown => (peek('not') ? (take(), !truthy(not())) : compare());
  const and = (): unknown => {
    let v = not();
    while (peek('and')) {
      take();
      const r = not();
      v = truthy(v) ? r : v;
    }
    return v;
  };
  const or = (): unknown => {
    let v = and();
    while (peek('or')) {
      take();
      const r = and();
      v = truthy(v) ? v : r;
    }
    return v;
  };
  return or();
}

/** A field's value as `widget_data.<name>` holds it, from its declaration's defaults. */
function widgetOf(st: Statement): Record<string, unknown> {
  const a = st.args;
  switch (st.tag) {
    case 'text':
    case 'inline_text':
      return { value: str(a['value']) };
    case 'rich_text':
    case 'inline_rich_text':
      return { html: str(a['html']) };
    case 'module': {
      const img = obj(a['img']);
      return { ...a, img, src: str(a['src']), alt: str(a['alt']), link: str(a['link']), width: a['width'] ?? img['width'] ?? null };
    }
    default:
      return { ...a, value: str(a['value']), src: str(a['src']), alt: str(a['alt']), href: str(a['href']) };
  }
}

/** What a field that is not exported draws where it stands (learnings 1.3). */
function inPlace(st: Statement): string {
  const w = widgetOf(st);
  if (st.tag === 'rich_text' || st.tag === 'inline_rich_text') return str(w['html'] as ArgValue);
  if (st.tag === 'text' || st.tag === 'inline_text') return esc(str(w['value'] as ArgValue));
  const img = obj(w['img'] as ArgValue);
  const src = str((w['src'] as ArgValue) || (img['src'] as ArgValue));
  if (src) return `<img src="${escAttr(src)}" alt="${escAttr(str((w['alt'] as ArgValue) || (img['alt'] as ArgValue)))}" width="${escAttr(asText(w['width'] ?? img['width'] ?? ''))}" style="max-width:100%">`;
  return '';
}

const DND_BOX = 'margin:8px auto; max-width:600px; border:1px dashed #9aa0a6; padding:12px 16px; font-family:Helvetica, Arial, sans-serif; font-size:13px; line-height:1.4; color:#6f726e; background:#fafaf9';

/**
 * The template drawn with every field at its default, the way HubSpot would draw a new email made from it before
 * anyone typed. Site settings come from `sample`; HubSpot's own links point nowhere; a drag-and-drop area is drawn
 * as its outline, because its modules are HubSpot's to render.
 */
export function renderDefaults(source: string, sample: PreviewSample): string {
  const scope: Scope = { data: {}, vars: {}, sample };
  const frames: Array<{ parent: boolean; taken: boolean; active: boolean }> = [];
  const active = () => frames.every((f) => f.active);
  let out = '';
  const inTag = () => out.lastIndexOf('<') > out.lastIndexOf('>');

  // HubSpot's header is for HubSpot; the email starts after it.
  const ann = /^\s*<!--[\s\S]*?templateType[\s\S]*?-->\n?/.exec(source);
  const body = withoutDesign(ann ? source.slice(ann[0].length) : source);
  for (const token of tokenize(body)) {
    if (token.t === 'comment') continue;
    if (token.t === 'html') {
      if (active()) out += token.text;
      continue;
    }
    if (token.t === 'expr') {
      if (!active()) continue;
      const value = asText(evaluate(token.text, scope));
      // Rich text is markup and prints as it is; everything else is text, escaped as the compiler's preview does.
      const raw = /\.html\s*$/.test(token.text) || /\|\s*safe\s*$/.test(token.text);
      out += raw ? value : inTag() ? escAttr(value) : esc(value);
      continue;
    }
    const st = parseStatement(token.text);
    switch (st.tag) {
      case 'if': {
        const parent = active();
        const cond = parent && truthy(evaluate(st.rest, scope));
        frames.push({ parent, taken: cond, active: cond });
        break;
      }
      case 'elif': {
        const f = frames[frames.length - 1];
        if (!f) break;
        const cond = f.parent && !f.taken && truthy(evaluate(st.rest, scope));
        f.active = cond;
        f.taken = f.taken || cond;
        break;
      }
      case 'else': {
        const f = frames[frames.length - 1];
        if (!f) break;
        f.active = f.parent && !f.taken;
        f.taken = true;
        break;
      }
      case 'endif':
        frames.pop();
        break;
      case 'set': {
        if (!active()) break;
        const m = /^([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(st.rest);
        if (m) scope.vars[m[1]!] = evaluate(m[2]!, scope);
        break;
      }
      case 'dnd_area':
        if (active()) out += `<div style="${DND_BOX}"><div style="text-transform:uppercase; letter-spacing:.06em; font-size:11px">Drag-and-drop area · ${esc(str(st.args['label']) || st.name || '')}</div>`;
        break;
      case 'dnd_module':
        if (active()) out += `<div style="margin-top:8px; padding:8px; border:1px solid #dededc; background:#ffffff">${esc(str(st.args['label']) || str(st.args['path']) || 'Module')}</div>`;
        break;
      case 'end_dnd_area':
        if (active()) out += '</div>';
        break;
      default: {
        if (!st.name || !FIELD_TAGS.has(st.tag) || !active()) break;
        scope.data[st.name] = widgetOf(st);
        if (st.args['export_to_template_context'] !== true) out += inPlace(st);
      }
    }
  }
  return out;
}

/**
 * Every picture in previewed HTML swapped for a drawn box of the same width, labelled with its alt text. The desk's
 * frame cannot load pictures from HubSpot's servers (an artifact loads nothing from another host), and a box that
 * says what goes there reads better than a broken image.
 */
export function boxPictures(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (whole, attrs: string) => {
    const src = /\bsrc="([^"]*)"/i.exec(attrs)?.[1] ?? '';
    if (src.startsWith('data:')) return whole;
    const width = Number(/\bwidth="(\d+)/i.exec(attrs)?.[1] ?? /width:\s*(\d+)px/i.exec(attrs)?.[1] ?? 560) || 560;
    const heightAttr = Number(/\bheight="(\d+)/i.exec(attrs)?.[1] ?? 0);
    const height = heightAttr || Math.max(24, Math.round(width * 0.5));
    const alt = (/\balt="([^"]*)"/i.exec(attrs)?.[1] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const label = alt || (src ? src.split('?')[0]!.split('/').pop()! : 'No picture yet');
    const small = height < 48 || width < 120;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs><pattern id="h" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f0f0ef"/><line x1="0" y1="0" x2="0" y2="8" stroke="#dededc" stroke-width="2"/></pattern></defs>` +
      `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="url(#h)" stroke="#a8aaa7"/>` +
      (small ? '' : `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#3a3a38">${esc(label.slice(0, 60))}</text>`) +
      `</svg>`;
    const data = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const rest = attrs.replace(/\bsrc="[^"]*"/i, '');
    return `<img src="${data}"${rest}>`;
  });
}

/** Sample site settings for a template with no design inside to take them from. Placeholders, never a real address. */
export const PLACEHOLDER_PREVIEW: Preview = { company: 'Company name', address: 'Street address', city: 'City', state: 'ST', zip: '00000' };
