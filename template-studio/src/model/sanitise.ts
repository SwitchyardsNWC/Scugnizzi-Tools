// Reducing pasted markup to what a template may safely carry.
//
// This is the thing that has blocked inline editing of rich text twice. `contentEditable` works
// fine; what breaks is paste. Content copied from Word, Google Docs, a web page or another email
// arrives carrying its own inline styles — `font-family: Calibri`, `font-size: 11pt`,
// `line-height: 1.2`, `color: #1a1a1a`, `mso-*` everything — and inline styles beat the block's own
// size, colour and line height (learnings 3.5). v1 shipped without this and it cost a round of
// feedback: copy in a paragraph from a doc and the email quietly stops being the design.
//
// The rule is an **allowlist**, not a blocklist. A blocklist is a promise to have thought of
// everything, and the next version of Word will have something new. Anything not named below is
// unwrapped — its children are kept, its own tag is dropped — so pasting always produces readable
// text rather than nothing.
//
// Pure and DOM-free by construction, so it is testable under Node like the compiler is. It parses
// with a small tokenizer rather than `DOMParser` for the same reason — and it lives in the model
// rather than the app for the same reason again: the linter reads it to say when a block carries
// markup the template does not use, and Clean up runs it to take that markup out.

/** Tags that survive, because `.sy-rich` in the compiled stylesheet has a rule for each. */
const KEEP = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'hr',
  // The rest of what HubSpot's editor offers that the template can carry. Each has a `.sy-rich`
  // rule in head.ts; font, size and colour are deliberately absent, because the design system owns
  // those and an inline style would beat it (learnings 3.5).
  's',
  'small',
  'code',
  'sup',
  'sub',
]);

/** Tags read as one thing and written as another. Chrome's strikethrough command emits `<strike>`. */
const RENAME: Record<string, string> = { strike: 's', del: 's' };

/** Tags whose *content* goes too, not just their markup. */
const DROP_WHOLE = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'object', 'iframe', 'noscript']);

/** Void elements, which never have a closing tag. */
const VOID = new Set(['br', 'hr']);

/**
 * Tags that implicitly close an open paragraph.
 *
 * HTML says `<p>one<p>two` is two paragraphs, and a clipboard fragment relies on it constantly —
 * without this the second `<p>` nests inside the first, and the output is markup no email client
 * agrees about.
 */
const CLOSES_P = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'hr']);

/** Word and Docs both mark up bold and italic as spans; these become real tags rather than nothing. */
const IMPLIED: Array<[RegExp, string]> = [
  [/font-weight\s*:\s*(bold|[6-9]00)/i, 'strong'],
  [/font-style\s*:\s*italic/i, 'em'],
  [/text-decoration[^;]*underline/i, 'u'],
  [/text-decoration[^;]*line-through/i, 's'],
];

interface Token {
  kind: 'open' | 'close' | 'text';
  name: string;
  attrs: string;
}

function tokenize(html: string): Token[] {
  const out: Token[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<!--[\s\S]*?-->|<!\[[\s\S]*?\]>/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > at) out.push({ kind: 'text', name: '', attrs: html.slice(at, m.index) });
    at = m.index + m[0].length;
    // A comment or a conditional: Word fills documents with both, and neither is content.
    if (!m[1]) continue;
    const name = m[1].toLowerCase();
    const selfClosing = /\/\s*$/.test(m[2] ?? '');
    out.push({ kind: m[0].startsWith('</') ? 'close' : 'open', name, attrs: m[2] ?? '' });
    if (selfClosing && !VOID.has(name)) out.push({ kind: 'close', name, attrs: '' });
  }
  if (at < html.length) out.push({ kind: 'text', name: '', attrs: html.slice(at) });
  return out;
}

/** The one attribute worth keeping, and only when it points somewhere a mail client will follow. */
function hrefOf(attrs: string): string | null {
  const m = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  const raw = (m?.[2] ?? m?.[3] ?? m?.[4] ?? '').trim();
  if (!raw) return null;
  // `javascript:` and `data:` in a template that ends up in someone's inbox is not a link, and an
  // allowlist of schemes is the only version of this check that stays correct.
  if (!/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(raw)) return null;
  return raw.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const escapeText = (s: string) =>
  s.replace(/&(?!#?[a-zA-Z0-9]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface SanitiseOptions {
  /** Tags to allow beyond the defaults. Nothing uses this yet; it exists so the set is a parameter. */
  allow?: string[];
}

/**
 * Pasted HTML, reduced to the allowlist with every attribute but `href` removed.
 *
 * Whitespace is normalised because Word emits runs of `&nbsp;` and newlines that render as ragged
 * gaps once the email's own line height applies.
 */
export function sanitise(html: string, options: SanitiseOptions = {}): string {
  const keep = options.allow ? new Set([...KEEP, ...options.allow]) : KEEP;
  const out: string[] = [];
  /**
   * The open elements, each remembering both what was *read* and what was *written*.
   *
   * Both, because they differ: a `<span style="font-weight:700">` is read as a span and written as
   * a `<strong>`. Tracking only the written name means the matching `</span>` finds nothing to
   * close, and the bold then runs to the end of the paragraph — which is precisely what happened
   * the first time, on a real paste from Word.
   */
  const open: Array<{ src: string; out: string }> = [];
  let skipping: string | null = null;

  /** The innermost still-open element that was read as `name`. A plain loop, because
   *  `findLastIndex` is ES2023 and this file is built against ES2022 like the compiler is. */
  const lastOpen = (name: string, floor = -1): number => {
    for (let i = open.length - 1; i > floor; i -= 1) if (open[i]!.src === name) return i;
    return -1;
  };

  /** The innermost open list, so an item closes the previous item of *its* list and not one above. */
  const lastList = (): number => {
    for (let i = open.length - 1; i >= 0; i -= 1) if (/^[uo]l$/.test(open[i]!.out)) return i;
    return -1;
  };

  const unwindTo = (at: number) => {
    for (let i = open.length - 1; i >= at; i -= 1) {
      const name = open[i]!.out;
      if (name) out.push(`</${name}>`);
    }
    open.length = at;
  };

  for (const token of tokenize(html)) {
    if (skipping) {
      if (token.kind === 'close' && token.name === skipping) skipping = null;
      continue;
    }

    if (token.kind === 'text') {
      const text = token.attrs.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      if (text) out.push(escapeText(text));
      continue;
    }

    if (DROP_WHOLE.has(token.name)) {
      if (token.kind === 'open') skipping = token.name;
      continue;
    }

    if (token.kind === 'open') {
      // A list directly inside a list — which is what a browser's indent command produces — is
      // not valid HTML, and clients disagree about what it means. It belongs inside the item
      // before it; when there is no item before it, one is made.
      if ((token.name === 'ul' || token.name === 'ol') && open.length > 0 && /^[uo]l$/.test(open[open.length - 1]!.out)) {
        if (out[out.length - 1] === '</li>') {
          out.pop();
          open.push({ src: 'li', out: 'li' });
        } else {
          out.push('<li>');
          open.push({ src: 'li', out: 'li' });
        }
        out.push(`<${token.name}>`);
        open.push({ src: token.name, out: token.name });
        continue;
      }

      // Implied end tags. `<p>one<p>two` is two paragraphs, not one inside another. An item
      // closes the previous item of its own list only: the first item of a nested list must not
      // close the outer item it sits inside, which was how the sanitiser flattened every nested
      // list until a test said so.
      const implicit = CLOSES_P.has(token.name) ? 'p' : token.name === 'li' ? 'li' : null;
      if (implicit) {
        const at = lastOpen(implicit, implicit === 'li' ? lastList() : -1);
        if (at !== -1) unwindTo(at);
      }

      const renamed = RENAME[token.name];
      if (renamed && keep.has(renamed)) {
        out.push(`<${renamed}>`);
        open.push({ src: token.name, out: renamed });
        continue;
      }

      if (keep.has(token.name)) {
        if (token.name === 'a') {
          const href = hrefOf(token.attrs);
          // A link with nowhere to go is not a link. Unwrapping keeps the words.
          if (!href) {
            open.push({ src: 'a', out: '' });
            continue;
          }
          out.push(`<a href="${href}">`);
          open.push({ src: 'a', out: 'a' });
        } else if (VOID.has(token.name)) {
          out.push(`<${token.name}>`);
        } else {
          out.push(`<${token.name}>`);
          open.push({ src: token.name, out: token.name });
        }
        continue;
      }
      // Not on the list. Word and Docs express bold and italic as styled spans, so the *meaning* is
      // recovered before the tag is dropped — otherwise pasting a bold sentence loses the bold.
      const implied = IMPLIED.find(([re]) => re.test(token.attrs));
      if (implied) {
        out.push(`<${implied[1]}>`);
        open.push({ src: token.name, out: implied[1] });
      } else {
        open.push({ src: token.name, out: '' });
      }
      continue;
    }

    // A close tag. Matched on what was read, not on what was written, and unwinding everything
    // opened inside it — so a stray closer cannot unbalance the output and a converted span closes
    // where the span closed.
    const at = lastOpen(token.name);
    if (at === -1) continue;
    unwindTo(at);
  }

  unwindTo(0);

  return tidy(out.join(''));
}

/**
 * The last pass: drop empty wrappers, collapse the runs of `<p></p>` Word leaves behind, and make
 * sure the result is a series of block elements rather than loose text.
 */
function tidy(html: string): string {
  // Trailing line breaks go before the empty check, not after: `<p><br></p>` is what a cleared
  // contenteditable leaves behind, and it has to end up as nothing rather than as an empty
  // paragraph that ships a gap nobody chose.
  let s = html.replace(/(<br>\s*)+<\/(p|h[1-6]|li|blockquote)>/g, '</$2>');
  let before = '';
  while (s !== before) {
    before = s;
    s = s
      .replace(/<(p|h[1-6]|blockquote|li|strong|em|u|a|s|small|code|sup|sub)>(\s|&nbsp;)*<\/\1>/g, '')
      .replace(/(<br>\s*)+<\/(p|h[1-6]|li|blockquote)>/g, '</$2>');
  }
  s = s.replace(/^\s+|\s+$/g, '');
  if (!s) return '';
  // Loose text at the top level gets a paragraph, so the block's own scale applies to it.
  if (!/^<(p|h[1-6]|ul|ol|blockquote|hr)\b/i.test(s)) s = `<p>${s}</p>`;
  return s;
}

/**
 * What a `contenteditable` produced, on its way back into the document.
 *
 * The same reduction, plus the one case a browser adds by itself: `<div>` for a new line. Chrome
 * and Safari disagree about whether a paragraph break is a `div`, a `p` or a `br`, and the document
 * should not record which browser the designer happened to use.
 */
export function fromContentEditable(html: string): string {
  // The zero-width spaces the editor stands the caret on after a converted run (Preview.tsx) never ship.
  return sanitise(html.replace(/\u200b/g, '').replace(/<div\b[^>]*>/gi, '<p>').replace(/<\/div>/gi, '</p>'));
}
