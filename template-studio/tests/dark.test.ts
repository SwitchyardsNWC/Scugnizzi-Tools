// The dark-mode simulation is the one part of the preview that transforms the compiled output
// rather than showing it, so it gets its own tests.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { importV1 } from '../src/model/import-v1.ts';
import { compile } from '../src/compile/compile.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { darkRules, simulateDark } from '../src/compile/dark.ts';
import { walk, type IRNode } from '../src/compile/ir.ts';
import { STACKABLE } from '../src/model/catalog.ts';
import { addBlockToColumn, addSectionAt } from '../src/model/edit.ts';
import { blankTemplate, cardTemplate } from '../src/model/starters.ts';
import { switchyardsShortTemplate, switchyardsTemplate } from '../src/model/switchyards.ts';
import type { Template } from '../src/model/types.ts';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../reference/v1-standard-email.design.json', import.meta.url)), 'utf8'),
);
const template = importV1(fixture).template;
const html = compile(template, { mode: 'preview' }).html;

describe('simulateDark', () => {
  it('lifts every rule out of the media block', () => {
    const rules = darkRules(html);
    expect(rules).toContain('.sy-bg-011272 { background-color:#011272 !important }');
    expect(rules).toContain('background-color:#f7f6f3 !important');
    // Every colour the design used, not a sample of them.
    expect(rules.split('\n').length).toBeGreaterThan(5);
  });

  it('re-asserts them unconditionally, inside the head', () => {
    const dark = simulateDark(html);
    expect(dark).toContain('Dark-mode simulation');
    expect(dark.indexOf('Dark-mode simulation')).toBeLessThan(dark.indexOf('</head>'));
    // The original media block is left alone — this adds, it does not rewrite.
    expect(dark).toContain('@media (prefers-color-scheme: dark)');
  });

  it('is a no-op on markup with no dark block', () => {
    expect(simulateDark('<p>hi</p>')).toBe('<p>hi</p>');
    expect(darkRules('<p>hi</p>')).toBe('');
  });

  it('does not inject a broken stylesheet when the braces are unbalanced', () => {
    const broken = '<head></head>@media (prefers-color-scheme: dark) { .a { color:red }';
    expect(simulateDark(broken)).toBe(broken);
  });

  it('handles the nested braces of a real rule block', () => {
    const nested = '@media (prefers-color-scheme: dark) { .a { color:red } .b { color:blue } } .c { color:green }';
    expect(darkRules(nested)).toBe('.a { color:red } .b { color:blue }');
  });
});

describe('a type role’s own colour survives dark mode', () => {
  // The bug Jared found: a role coloured red rendered red in a light client and reverted to the
  // section's colour in a dark one. The force-light layer re-asserts `.sy-text-<hex> <element>`
  // with `!important` across every descendant — which is what stops a dark client rewriting the
  // email, and was also overriding the designer's own choice, because a colour living only in a
  // stylesheet rule never reached the registry (learnings 2.6).
  const withRoleColour = (role: string) => {
    const ds = structuredClone(DEFAULT_DESIGN_SYSTEM);
    ds.type[role] = { ...ds.type[role]!, color: 'red' };
    return compile({ ...template, ds }, { mode: 'hubl' }).html;
  };

  it('re-asserts the role after the section colour, so the role wins the tie', () => {
    const html = withRoleColour('h1');
    const dark = html.slice(html.indexOf('@media (prefers-color-scheme: dark)'));
    const section = dark.indexOf('.sy-text-011272');
    const role = dark.indexOf('.sy-rich h1 { color:#d10000 !important }');
    expect(section).toBeGreaterThan(-1);
    expect(role).toBeGreaterThan(-1);
    // Same specificity and both `!important`, so source order decides it.
    expect(role).toBeGreaterThan(section);
  });

  it('covers the block the template renders as well as the one the team types', () => {
    // Two different elements: `.sy-rich h1` is an h1 typed in HubSpot's editor, `h1.sy-h1` is a
    // Heading block. Element-plus-class on the second, or it loses to `.sy-text-x h1` by a notch.
    const html = withRoleColour('h2');
    expect(html).toContain('.sy-rich h2 { color:#d10000 !important }');
    expect(html).toContain('h2.sy-h2 { color:#d10000 !important }');
  });

  it('covers the Outlook.com layer too', () => {
    expect(withRoleColour('h1')).toContain('[data-ogsc] .sy-rich h1 { color:#d10000 !important }');
  });

  it('says nothing for a role that follows the background', () => {
    // The default, and the common case. A rule per role per layer for colours nobody chose would be
    // bytes in every send against the Gmail clip (learnings 2.12).
    const plain = compile(template, { mode: 'hubl' }).html;
    expect(plain).not.toContain('.sy-rich h1 { color:');
    expect(plain).not.toContain('h1.sy-h1 { color:');
  });
});

// --- nested colour scopes ------------------------------------------------------------------------
//
// learnings 2.6a. Every dark rule is `!important` at one class of specificity, so when two
// `sy-text-*` / `sy-link-*` classes both sit above one element, nothing but source order picks the
// colour — and source order is registration order, which is wherever a colour first appeared in the
// email. The card email's second card was a stack whose outer cell wore the section's ink and whose
// button wore its own white: add a button section at the top, white registers first, and the label
// went ink on an ink fill.

type El = Extract<IRNode, { k: 'el' }>;
interface Box {
  tag: string;
  classes: Set<string>;
  attrs: Set<string>;
}
interface Rule {
  selectors: string[];
  color: string;
}

const boxOf = (node: El): Box => ({
  tag: node.tag,
  classes: new Set(String(node.attrs?.['class'] ?? '').split(/\s+/).filter(Boolean)),
  attrs: new Set(Object.keys(node.attrs ?? {})),
});
/** What the shell wraps the blocks in. Carries `data-ogsc` so Outlook's layer can be resolved too. */
const ROOT: Box = { tag: 'body', classes: new Set(), attrs: new Set(['data-ogsc']) };

/** `color` rules only; `background-color` is per element and cannot be fought over by an ancestor. */
function rulesOf(css: string): Rule[] {
  const rules: Rule[] = [];
  for (const [, head, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decl = body!.split(';').map((d) => d.trim()).find((d) => /^color\s*:/.test(d));
    if (!decl) continue;
    const color = decl.replace(/^color\s*:/, '').replace('!important', '').trim().toLowerCase();
    rules.push({ selectors: head!.split(',').map((s) => s.trim()), color });
  }
  return rules;
}

/** The Outlook.com layer: the `[data-ogsc]` rules that follow the media block in the force-light head. */
function ogscRules(html: string): string {
  const inner = darkRules(html);
  const after = html.slice(html.indexOf(inner) + inner.length);
  return after.slice(after.indexOf('}') + 1, after.indexOf('</style>'));
}

function compoundMatches(compound: string, box: Box): boolean {
  const m = /^([a-z][a-z0-9]*)?((?:\.[\w-]+|\[[\w-]+\])*)$/i.exec(compound);
  if (!m) throw new Error(`the resolver does not read "${compound}"; teach it, or keep the dark rules simple`);
  if (m[1] && m[1] !== box.tag) return false;
  for (const [, cls, attr] of m[2]!.matchAll(/\.([\w-]+)|\[([\w-]+)\]/g)) {
    if (cls && !box.classes.has(cls)) return false;
    if (attr && !box.attrs.has(attr)) return false;
  }
  return true;
}

/** Descendant combinators only, which is all the dark layers use. `chain` runs from the root to the element. */
function selectorMatches(selector: string, chain: Box[]): boolean {
  const parts = selector.split(/\s+/);
  if (!compoundMatches(parts.at(-1)!, chain.at(-1)!)) return false;
  let i = chain.length - 2;
  for (let p = parts.length - 2; p >= 0; p -= 1) {
    while (i >= 0 && !compoundMatches(parts[p]!, chain[i]!)) i -= 1;
    if (i < 0) return false;
    i -= 1;
  }
  return true;
}

/** Classes and attributes, then types. No ids: the dark layers never use one. */
function specificity(selector: string): [number, number] {
  let classes = 0;
  let types = 0;
  for (const part of selector.split(/\s+/)) {
    classes += (part.match(/\.[\w-]+|\[[\w-]+\]/g) ?? []).length;
    if (/^[a-z]/i.test(part)) types += 1;
  }
  return [classes, types];
}

/**
 * The colour a client applying these rules gives the element: highest specificity, and the later
 * rule on a tie. Every rule is `!important`, so the inline colour only shows when nothing matches.
 */
function resolve(rules: Rule[], chain: Box[]): string | null {
  let best: [number, number] | null = null;
  let color: string | null = null;
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      if (!selectorMatches(selector, chain)) continue;
      const s = specificity(selector);
      if (!best || s[0] > best[0] || (s[0] === best[0] && s[1] >= best[1])) {
        best = s;
        color = rule.color;
      }
    }
  }
  return color;
}

/** Each button label in document order: its own ink, and what each dark layer paints it. */
function buttonLabels(t: Template) {
  const out = compile(t, { mode: 'preview' });
  const layers = { media: rulesOf(darkRules(out.html)), ogsc: rulesOf(ogscRules(out.html)) };
  const labels: Array<{ ink: string; media: string | null; ogsc: string | null }> = [];
  walk(out.tree, (node, ancestors) => {
    if (node.k !== 'el' || node.tag !== 'strong') return;
    const els = ancestors.filter((a): a is El => a.k === 'el');
    const btn = [...els].reverse().find((a) => a.tag === 'td' && boxOf(a).classes.has('sy-btn'));
    if (!btn) return;
    const chain = [ROOT, ...els.map(boxOf), boxOf(node)];
    labels.push({ ink: btn.colors!.link!.toLowerCase(), media: resolve(layers.media, chain), ogsc: resolve(layers.ogsc, chain) });
  });
  return { labels, links: [...out.registry.link.keys()] };
}

describe('a button’s own colour wins over the cell it sits in (learnings 2.6a)', () => {
  // The repro, both ways round: the card email as it ships, and with a button section above it.
  const plain = buttonLabels(cardTemplate());
  const inserted = buttonLabels(addSectionAt(cardTemplate(), 'button', 0));

  it('compiles the two registration orders this is about', () => {
    // Without this the test could pass by never reaching the case. The card's ink link registers
    // first as shipped; the button section above puts the white first.
    expect(plain.links.indexOf('111111')).toBeLessThan(plain.links.indexOf('ffffff'));
    expect(inserted.links.indexOf('ffffff')).toBeLessThan(inserted.links.indexOf('111111'));
  });

  it('paints card two’s label white in both, in both dark layers', () => {
    const cardTwo = (r: typeof plain) => r.labels.at(-1)!;
    expect(cardTwo(plain)).toEqual({ ink: '#ffffff', media: '#ffffff', ogsc: '#ffffff' });
    expect(cardTwo(inserted)).toEqual(cardTwo(plain));
  });

  it('paints every label its own ink', () => {
    for (const { ink, media, ogsc } of [...plain.labels, ...inserted.labels]) {
      expect(media).toBe(ink);
      expect(ogsc).toBe(ink);
    }
  });
});

describe('no colour scope sits inside a different one', () => {
  // The structural half. Two text or link scopes of different colours, one inside the other, tie in
  // every dark layer, so the compiler never emits one. A block that wants a colour of its own puts it
  // on its own cell, and anything wrapping several blocks — a stack's outer cell — wears none.
  function nested(t: Template): string[] {
    const found: string[] = [];
    walk(compile(t, { mode: 'hubl' }).tree, (node, ancestors) => {
      if (node.k !== 'el' || !node.colors) return;
      for (const kind of ['text', 'link'] as const) {
        const own = node.colors[kind];
        if (!own) continue;
        const outer = [...ancestors].reverse().find((a): a is El => a.k === 'el' && !!a.colors?.[kind]);
        const theirs = outer?.colors?.[kind];
        if (theirs && theirs.toLowerCase() !== own.toLowerCase()) {
          found.push(`${kind} ${own} on <${node.tag} class="${String(node.attrs?.['class'] ?? '')}"> inside ${theirs} on <${outer!.tag}>`);
        }
      }
    });
    return found;
  }

  /** Every block a stack can hold, in one column at the top, on the template's own first preset. */
  const everyStackable = (t: Template): Template => {
    let out = addSectionAt(t, 'heading', 0);
    const columnId = out.sections[0]!.rows[0]!.columns[0]!.id;
    for (const type of STACKABLE.filter((s) => s !== 'heading')) out = addBlockToColumn(out, columnId, type);
    return out;
  };

  const starters: Array<[string, () => Template]> = [
    ['blank', blankTemplate],
    ['card', cardTemplate],
    ['Switchyards', switchyardsTemplate],
    ['Switchyards short', switchyardsShortTemplate],
    ['standard (v1)', () => template],
  ];

  it.each(starters)('the %s starter, as shipped and with every stackable block in one column', (_, make) => {
    expect(nested(make())).toEqual([]);
    const stacked = everyStackable(make());
    expect(stacked.sections[0]!.rows[0]!.columns[0]!.blocks.length).toBe(STACKABLE.length);
    expect(nested(stacked)).toEqual([]);
  });
});
