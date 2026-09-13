// Validation, run on the tree rather than on the string.
//
// This is the payoff for the IR. Half of acceptance.md §1 reads as hard work when the compiler
// produces a string — "no field declared inside a conditional that could prevent registration",
// "field declaration order matches canvas order", "every colour has a matching rule, tested by
// parsing the output" — and reads as a few lines each when it produces a tree.
//
// The first rule is the important one. Learnings 1.4, 1.5 and 2.11 admit exactly one arrangement:
// declaration, then conditional, then markup. A declaration that ends up inside a conditional
// produces a field that never appears in HubSpot's Contents panel — a checkbox that does nothing,
// which was a live bug Jared hit. Convention will not hold that across twenty block types, so it is
// checked structurally here and cannot be talked around.

import { walk, type IRNode } from './ir.ts';
import { allColors, type Registry } from './colors.ts';
import { pictureHash } from '../model/freeform.ts';
import { allBlocks } from '../model/edit.ts';
import { CATALOG } from '../model/catalog.ts';
import { untidyBlocks } from '../model/tidy.ts';
import type { Template } from '../model/types.ts';

export type Severity = 'error' | 'warning';

export interface Finding {
  severity: Severity;
  rule: string;
  message: string;
}

export interface LintInput {
  tree: IRNode;
  registry: Registry;
  /** The compiled output. Some checks can only be made on the finished document. */
  html: string;
  bytes: number;
  /**
   * Which output this is. A few rules only mean anything about the file that gets uploaded: in a
   * preview the HubL has already been substituted away, so looking for `{{ unsubscribe_link }}`
   * would report a missing footer on an email that has one.
   */
  mode?: 'preview' | 'hubl';
  /**
   * The document, for the few rules that are about a *decision* rather than about markup.
   *
   * Rendering text as a picture is the first: the output is an ordinary `<img>` and there is
   * nothing in it to find. What makes it worth saying is visible only in the document.
   */
  template?: Template;
}

/** Gmail clips around here, and a clipped email loses its unsubscribe link (learnings 2.12). */
const CLIP_BYTES = 102 * 1024;
const WARN_BYTES = 90 * 1024;

export function lint({ tree, registry, html, bytes, mode = 'hubl', template }: LintInput): Finding[] {
  const findings: Finding[] = [];
  const error = (rule: string, message: string) => findings.push({ severity: 'error', rule, message });
  const warn = (rule: string, message: string) => findings.push({ severity: 'warning', rule, message });

  // --- the invariant ---------------------------------------------------------------------------
  const declared = new Map<string, number>();
  walk(tree, (node, ancestors) => {
    if (node.k !== 'decl') return;
    const name = node.field.name;
    declared.set(name, (declared.get(name) ?? 0) + 1);

    if (ancestors.some((a) => a.k === 'if' || a.k === 'wrapIf')) {
      error(
        'declaration-inside-conditional',
        `Field "${name}" is declared inside a conditional. HubSpot only registers a tag that actually ` +
          `renders, so the team would never see this field (learnings 1.5). Declare it above the ` +
          `conditional and put the condition around the markup instead.`,
      );
    }
    if (!name) error('unnamed-field', `A ${node.field.kind} field has no name.`);
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      error('field-name-shape', `Field name "${name}" is not slug-safe; HubSpot needs lowercase, digits and underscores.`);
    }
    if (!node.field.label.trim()) {
      error('unlabelled-field', `Field "${name}" has no label. The label is the entire interface the team sees.`);
    }
  });

  for (const [name, count] of declared) {
    if (count > 1) error('duplicate-field', `Field "${name}" is declared ${count} times. Field names must be unique.`);
  }

  // --- references resolve ----------------------------------------------------------------------
  const referenced = new Set<string>();
  const noteRef = (path: string) => {
    const match = /^widget_data\.([a-z0-9_]+)\b/.exec(path);
    if (match?.[1]) referenced.add(match[1]);
  };
  walk(tree, (node) => {
    if (node.k === 'print') noteRef(node.path);
    if (node.k === 'if' || node.k === 'wrapIf') noteRef(node.test.k === 'path' ? node.test.path : `widget_data.${node.test.field}`);
    if (node.k === 'el' && node.attrs) {
      for (const value of Object.values(node.attrs)) collectAttrRefs(value, noteRef);
    }
    if (node.k === 'wrapIf') {
      for (const value of Object.values(node.attrs)) collectAttrRefs(value, noteRef);
    }
  });
  for (const name of referenced) {
    if (!declared.has(name)) {
      error('dangling-reference', `The template reads widget_data.${name} but never declares it, so it will always be empty.`);
    }
  }

  // --- dark mode coverage ----------------------------------------------------------------------
  // Checked by parsing the emitted CSS, not by trusting the generator that just wrote it.
  for (const entry of allColors(registry)) {
    const [kind, hex] = entry.split(':') as [string, string];
    const key = hex.replace('#', '');
    const selector = kind === 'link' ? `.sy-link-${key} a` : `.sy-${kind}-${key}`;
    if (!html.includes(selector)) {
      error('dark-mode-coverage', `Colour ${hex} is used but has no ${kind} override class in the output.`);
    }
    const ogs = kind === 'bg' ? `[data-ogsb] .sy-bg-${key}` : `[data-ogsc] .sy-${kind}-${key}`;
    if (!html.includes(ogs)) {
      error(
        'dark-mode-coverage',
        `Colour ${hex} has no ${ogs} rule, so Outlook's dark mode will rewrite it (learnings 2.5).`,
      );
    }
  }

  // --- HubL balance ----------------------------------------------------------------------------
  const opens = (html.match(/\{%\s*if\b/g) ?? []).length;
  const closes = (html.match(/\{%\s*endif\s*%\}/g) ?? []).length;
  if (opens !== closes) {
    error('unbalanced-hubl', `${opens} {% if %} tags and ${closes} {% endif %} tags. HubSpot will refuse the file.`);
  }

  // --- email rules -----------------------------------------------------------------------------
  for (const tag of html.match(/<img\b[^>]*>/g) ?? []) {
    // Outlook shows alt text when images are blocked, which is most of the time on first open.
    if (!/\balt=/.test(tag)) warn('image-alt', `An image has no alt text: ${truncate(tag)}`);
    // The width has to be both an attribute and inline, at the intended display size (learnings 2.9).
    if (!/\bwidth=/.test(tag)) error('image-width', `An image has no width attribute: ${truncate(tag)}`);
  }
  for (const tag of html.match(/<a\b[^>]*href="([^"]*)"/g) ?? []) {
    const href = /href="([^"]*)"/.exec(tag)?.[1] ?? '';
    if (href && !/^(https?:|mailto:|\{\{|#)/.test(href)) {
      error('relative-link', `Link "${href}" is not absolute. Email clients have no base URL to resolve it against.`);
    }
  }
  if (mode === 'hubl' && !html.includes('{{ unsubscribe_link')) {
    error('can-spam', 'No unsubscribe link. HubSpot will refuse to publish the template (learnings 1.8).');
  }

  // HubSpot inlines a default `margin-bottom: 1em` onto every <p> at send (learnings 1.9, verified
  // 2026-09-11). A paragraph that states no margin of its own therefore ships with a 1em gap under
  // it — in Gmail especially, where the `p { margin:0 }` reset in the ordinary <style> block is
  // stripped and cannot save it. The template's own inline style wins, so the fix is simply to
  // always state one.
  //
  // Two exclusions, both about reaching only the markup the compiler emits directly. HubL tag
  // bodies are stripped, which removes the rich text default inside `{% rich_text … html='<p>…' %}`
  // — that is the team's content and the `.sy-rich p` rule in hs-inline-css gives it a margin (the
  // probe showed HubSpot's default lands *before* our rules, so the scale's shorthand wins). And
  // the rule only runs on the HubL output, because a preview has the same rich text substituted
  // inline where stripping cannot see it.
  const paragraphs = mode === 'hubl' ? (stripHubl(html).match(/<p\b[^>]*>/g) ?? []) : [];
  for (const tag of paragraphs) {
    const style = /style="([^"]*)"/.exec(tag)?.[1] ?? '';
    if (!/(^|;|\s)margin(-bottom)?\s*:/.test(style)) {
      error(
        'paragraph-margin',
        `A paragraph states no margin, so HubSpot's injected 1em bottom margin applies to it and ` +
          `Gmail has no reset to fall back on. Add an explicit margin to its inline style: ${truncate(tag)}`,
      );
    }
  }

  // --- images that never left the laptop --------------------------------------------------------
  //
  // An `src` that is a file name rather than a URL is a picture sitting in somebody's assets folder.
  // It shows on the canvas because the preview substitutes a blob URL for it, and it would arrive in
  // every inbox as a broken image — which is exactly the kind of defect that only appears after a
  // send, so it is an error rather than a warning.
  if (mode === 'hubl') {
    for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)) {
      if (!src || /^(https?:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('{{') || src.startsWith('{%')) {
        continue;
      }
      error(
        'local-image',
        `"${truncate(src)}" is a local file, not a URL an email client can fetch. Upload it to HubSpot Files and paste that URL into the block.`,
      );
    }
  }

  // --- freeform blocks that have no picture, or a stale one ------------------------------------
  //
  // The canvas draws the recipe; the file can only carry a picture. A block never rendered would
  // ship `<img src="">`, and one rendered before its last change would ship the old drawing — the
  // second is the quieter defect, and the one worth a warning rather than silence.
  if (template && mode === 'hubl') {
    for (const block of allBlocks(template)) {
      if (block.type !== 'freeform' && block.type !== 'brand') continue;
      const what = block.type === 'brand' ? 'brand mark' : 'freeform block';
      if (!block.src) {
        error('picture-render', `The ${what} "${block.alt || block.type}" has never been rendered. Render it in its Picture panel, upload the PNG to HubSpot Files, and paste the URL.`);
      } else if (block.renderedHash !== pictureHash(block)) {
        warn('picture-render', `The ${what} "${block.alt || block.type}" has changed since its picture was rendered. Render it again, or the email carries the old picture.`);
      }
    }
  }

  // --- pictures of text --------------------------------------------------------------------------
  // A warning, not an error. It is a legitimate choice — Word rounds line heights, ignores letter
  // spacing and substitutes fonts, and a picture does none of those things — but it is a trade,
  // and the half nobody remembers is that Outlook on Windows and most corporate mail block images
  // by default. For those readers the alt text is the block.
  if (template) {
    const pictures = allBlocks(template).filter((b) => b.type === 'image' && b.wasText);
    const wordless = pictures.filter((b) => b.type === 'image' && !b.alt.trim());
    if (wordless.length > 0) {
      error(
        'text-as-image-alt',
        `${wordless.length === 1 ? 'One block is a picture' : String(wordless.length) + ' blocks are pictures'} of text with no alt text. Where images are blocked — Outlook on Windows, most corporate mail — that is a blank space where the words were.`,
      );
    } else if (pictures.length > 0) {
      warn(
        'text-as-image',
        `${pictures.length === 1 ? 'One block is a picture' : String(pictures.length) + ' blocks are pictures'} of text. It renders identically everywhere, and readers with images off get the alt text instead — check it reads on its own.`,
      );
    }
  }

  // --- markup nobody uses ------------------------------------------------------------------------
  //
  // Two shapes. A style rule whose selectors match nothing in the body is bytes every send pays
  // for and a rule the next reader has to reason about; the compiler emits its rules once per
  // need (`ctx.once`), and this is what notices when one slips back in as boilerplate. And a
  // block whose markup the sanitiser would rewrite — empty paragraphs, a pasted span's inline
  // style, a `target` no mail client reads — is the designer's own to clean, so Checks offers to.
  const dead = unusedRules(html);
  if (dead.length > 0) {
    warn(
      'unused-css',
      `${dead.length} style rule${dead.length === 1 ? '' : 's'} match nothing in this email: ${dead.slice(0, 4).join('; ')}${dead.length > 4 ? '; …' : ''}. Bytes for nothing.`,
    );
  }
  if (template) {
    const untidy = untidyBlocks(template, (b) => CATALOG[b.type].outline(b));
    for (const u of untidy) {
      warn('untidy-markup', `“${u.label}” carries ${u.what}. Clean up takes it out.`);
    }
  }

  // --- size ------------------------------------------------------------------------------------
  if (bytes > CLIP_BYTES) {
    error('gmail-clip', `${kb(bytes)} exceeds Gmail's ~102KB clip. The end of the email, including the footer, is cut off.`);
  } else if (bytes > WARN_BYTES) {
    warn('gmail-clip', `${kb(bytes)} is close to Gmail's ~102KB clip.`);
  }

  return findings;
}

export const errorsIn = (findings: Finding[]): Finding[] => findings.filter((f) => f.severity === 'error');

/**
 * Classes that are legitimately absent from the output: a client or HubSpot adds them at render.
 * Thunderbird marks the body `moz-text-html`; a CTA the team inserts renders as `a.cta_button`;
 * HubSpot's inline editor wraps paragraphs in `ShadowHTML`. A selector naming one of these is
 * kept whatever else it names.
 */
const ADDED_AT_RENDER = ['moz-text-html', 'cta_button', 'hs-screen-reader-text', 'ShadowHTML', 'sh-modified-inline'];

/**
 * Every rule in the ordinary `<style>` blocks whose selectors all name a class or an id that
 * appears nowhere in the body. The `hs-inline-css` block is exempt: HubSpot inlines it onto what
 * the team types, which does not exist yet, and so is any selector under `.sy-rich`.
 */
export function unusedRules(html: string): string[] {
  const at = html.indexOf('<body');
  const body = at === -1 ? html : html.slice(at);
  const classes = new Set<string>();
  for (const m of body.matchAll(/class="([^"]*)"/g)) for (const c of m[1]!.split(/\s+/)) if (c) classes.add(c);
  const ids = new Set<string>();
  for (const m of body.matchAll(/\sid="([^"]*)"/g)) ids.add(m[1]!);

  const couldMatch = (selector: string): boolean => {
    if (/\.sy-rich\b/.test(selector)) return true;
    if (ADDED_AT_RENDER.some((name) => selector.includes(name))) return true;
    const cls = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]!);
    const idm = [...selector.matchAll(/#([A-Za-z0-9_-]+)/g)].map((m) => m[1]!);
    // Element and attribute selectors alone (`p`, `a[x-apple-data-detectors]`) match what they match.
    if (cls.length === 0 && idm.length === 0) return true;
    return cls.every((c) => classes.has(c)) && idm.every((i) => ids.has(i));
  };

  const out: string[] = [];
  for (const block of html.matchAll(/<style(?![^>]*id="hs-inline-css")[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = block[1]!.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/(?:^|[}{;])\s*([^{}@;]+?)\s*\{/g)) {
      const selectors = rule[1]!.split(',').map((s) => s.trim()).filter(Boolean);
      if (selectors.length && !selectors.some(couldMatch)) out.push(selectors.join(', '));
    }
  }
  return out;
}

function collectAttrRefs(value: unknown, note: (path: string) => void): void {
  if (Array.isArray(value)) {
    for (const part of value) collectAttrRefs(part, note);
    return;
  }
  if (value && typeof value === 'object' && (value as { k?: string }).k === 'attrPrint') {
    note((value as { path: string }).path);
  }
}

/** Removes `{% … %}` and `{{ … }}`, leaving only markup the compiler itself emitted. */
const stripHubl = (html: string) => html.replace(/\{%[\s\S]*?%\}/g, '').replace(/\{\{[\s\S]*?\}\}/g, '');

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}KB`;
const truncate = (s: string) => (s.length > 90 ? `${s.slice(0, 90)}…` : s);
