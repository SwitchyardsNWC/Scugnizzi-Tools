// A structural diff for email HTML.
//
// acceptance.md §1 asks for a structural diff rather than byte equality, which is the right call:
// the compiler is free to write `padding:10px 20px` where v1 wrote the same thing with different
// whitespace, and a gate that fails on that would be abandoned within a week.
//
// So both documents are reduced to a token sequence — tags with their attributes sorted, HubL tags,
// comments (MSO conditionals are load-bearing markup, not decoration), and collapsed text — and the
// sequences are compared. Anything that changes what a client renders changes the sequence.

export type Token = string;

const VOID = new Set(['img', 'br', 'meta', 'hr', 'input', 'link', 'source', 'area', 'base', 'col']);

export function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < html.length) {
    const next = html.indexOf('<', i);
    const hubl = nextHubl(html, i);

    if (hubl !== -1 && (next === -1 || hubl < next)) {
      pushText(tokens, html.slice(i, hubl));
      const end = html.startsWith('{{', hubl) ? html.indexOf('}}', hubl) + 2 : html.indexOf('%}', hubl) + 2;
      if (end <= 1) {
        pushText(tokens, html.slice(hubl));
        break;
      }
      tokens.push(`hubl:${collapse(html.slice(hubl, end))}`);
      i = end;
      continue;
    }

    if (next === -1) {
      pushText(tokens, html.slice(i));
      break;
    }
    pushText(tokens, html.slice(i, next));

    if (html.startsWith('<!DOCTYPE', next) || html.startsWith('<!doctype', next)) {
      const end = findTagEnd(html, next);
      const stop = end === -1 ? html.length : end + 1;
      tokens.push(`doctype:${collapse(html.slice(next, stop))}`);
      i = stop;
      continue;
    }

    if (html.startsWith('<!--', next)) {
      const end = html.indexOf('-->', next);
      const stop = end === -1 ? html.length : end + 3;
      // MSO conditional comments carry the Outlook layout; they are compared, not skipped.
      tokens.push(`comment:${collapse(html.slice(next, stop))}`);
      i = stop;
      continue;
    }

    const end = findTagEnd(html, next);
    if (end === -1) {
      pushText(tokens, html.slice(next));
      break;
    }
    tokens.push(tagToken(html.slice(next, end + 1)));
    i = end + 1;
  }

  return tokens;
}

function nextHubl(html: string, from: number): number {
  const a = html.indexOf('{{', from);
  const b = html.indexOf('{%', from);
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

/** Walks past `>` characters that sit inside a quoted attribute value. */
function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < html.length; i += 1) {
    const c = html[i]!;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

function tagToken(tag: string): Token {
  const closing = tag.startsWith('</');
  const name = /^<\/?\s*([a-zA-Z0-9:-]+)/.exec(tag)?.[1]?.toLowerCase() ?? '?';
  if (closing) return `/${name}`;

  const attrs: string[] = [];
  const re = /([a-zA-Z0-9:_-]+)\s*=\s*"([^"]*)"|([a-zA-Z0-9:_-]+)\s*=\s*'([^']*)'|([a-zA-Z0-9:_-]+)(?=[\s/>])/g;
  const body = tag.slice(name.length + 1, -1);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const key = (m[1] ?? m[3] ?? m[5] ?? '').toLowerCase();
    if (!key) continue;
    attrs.push(`${key}=${normaliseAttr(key, m[2] ?? m[4] ?? '')}`);
  }
  attrs.sort();
  const self = VOID.has(name) ? '/' : '';
  return `${name}${self}[${attrs.join(' ')}]`;
}

/** `style` and `class` are order-insensitive sets; everything else is compared as written. */
function normaliseAttr(key: string, value: string): string {
  if (key === 'style') {
    return value
      .split(';')
      .map((d) => collapse(d).replace(/\s*:\s*/, ':'))
      .filter(Boolean)
      .sort()
      .join(';');
  }
  if (key === 'class') return collapse(value).split(' ').filter(Boolean).sort().join(' ');
  return collapse(value);
}

function pushText(tokens: Token[], raw: string): void {
  const t = collapse(raw);
  if (t) tokens.push(`text:${t}`);
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface Difference {
  index: number;
  expected: Token | undefined;
  actual: Token | undefined;
}

/** First `limit` positions where the sequences disagree, with a little context either side. */
export function diffTokens(expected: Token[], actual: Token[], limit = 12): Difference[] {
  const out: Difference[] = [];
  const max = Math.max(expected.length, actual.length);
  for (let i = 0; i < max && out.length < limit; i += 1) {
    if (expected[i] !== actual[i]) out.push({ index: i, expected: expected[i], actual: actual[i] });
  }
  return out;
}

export function formatDiff(diffs: Difference[], expected: Token[], actual: Token[]): string {
  return diffs
    .map(({ index, expected: e, actual: a }) => {
      const before = expected.slice(Math.max(0, index - 2), index).join('  ');
      return [
        `@${index}  after: …${before}`,
        `  expected: ${e ?? '<end of document>'}`,
        `  actual:   ${a ?? '<end of document>'}`,
      ].join('\n');
    })
    .concat(`(${expected.length} expected tokens, ${actual.length} actual)`)
    .join('\n\n');
}

// --- HubSpot field extraction ------------------------------------------------------------------

export interface DeclaredField {
  kind: string;
  name: string;
  label: string;
  /** The default, whichever parameter carries it. */
  value: string;
}

/**
 * Every field declaration in source order. This is the HubSpot-facing contract: the Contents panel
 * lists fields in exactly this order (learnings 1.4), with exactly these labels, and the team's
 * existing emails are bound to exactly these names (learnings 1.10).
 */
export function declaredFields(html: string): DeclaredField[] {
  const out: DeclaredField[] = [];
  const re = /\{%\s*(text|rich_text|module|linked_image|boolean)\s+"([^"]+)"([\s\S]*?)%\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const body = m[3] ?? '';
    out.push({
      kind: m[1]!,
      name: m[2]!,
      label: /label="([^"]*)"/.exec(body)?.[1] ?? '',
      value: collapse(
        /value='([\s\S]*?)'\s*(?:,|$)/.exec(body)?.[1] ??
          /html='([\s\S]*?)'\s*(?:,|$)/.exec(body)?.[1] ??
          /path="([^"]*)"/.exec(body)?.[1] ??
          '',
      ),
    });
  }
  return out;
}
