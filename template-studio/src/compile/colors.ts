// The colour registry and the dark-mode layers it generates.
//
// The mechanism (learnings 2.6): every background, text and link colour the output actually uses
// gets a class alongside its inline style, and is registered. At the end the registry writes the
// matching `prefers-color-scheme` and `[data-ogsc]` / `[data-ogsb]` rules. No colour can be used
// without gaining an override, which is what makes layers 2 and 3 of learnings 2.5 automatic
// rather than something a designer has to remember.
//
// The change from v1: this is a walk over a finished tree, not a side effect during string
// building. A block declares `colors: { bg, text, link }` on the element that carries them and has
// no idea the registry exists, so a block author cannot forget to register — and the registry
// cannot double-count, because it runs once over a tree that is already complete.

import { colorOf, type DesignSystem } from '../model/design-system.ts';
import { walk, type IRNode } from './ir.ts';

export type ColorKind = 'bg' | 'text' | 'link';

export interface Registry {
  bg: Map<string, string>;
  text: Map<string, string>;
  link: Map<string, string>;
}

export function emptyRegistry(): Registry {
  return { bg: new Map(), text: new Map(), link: new Map() };
}

/** `#D20000` -> `d20000`. The key is also the class suffix, so it has to be stable and lowercase. */
export function colorKey(hex: string): string {
  return hex.replace('#', '').toLowerCase();
}

export function className(kind: ColorKind, hex: string): string {
  return `sy-${kind}-${colorKey(hex)}`;
}

/**
 * Walks the tree, registers every declared colour, and writes the generated class onto the
 * element's own class attribute. Mutates the tree in place — it runs once, between build and
 * serialize, and copying the tree to avoid that would buy nothing.
 */
export function collectColors(root: IRNode, registry: Registry = emptyRegistry()): Registry {
  walk(root, (node) => {
    if (node.k !== 'el' || !node.colors) return;
    const classes: string[] = [];
    for (const kind of ['bg', 'text', 'link'] as const) {
      const hex = node.colors[kind];
      if (!hex) continue;
      registry[kind].set(colorKey(hex), hex);
      classes.push(className(kind, hex));
    }
    if (!classes.length) return;
    const attrs = (node.attrs ??= {});
    const existing = attrs['class'];
    const prefix = existing === undefined || existing === null || existing === '' ? '' : `${String(existing)} `;
    attrs['class'] = prefix + classes.join(' ');
  });
  return registry;
}

/** Registers a colour that is applied by the document shell rather than by a tree node. */
export function register(registry: Registry, kind: ColorKind, hex: string): void {
  registry[kind].set(colorKey(hex), hex);
}

// Text colour has to beat whatever the client rewrote it to, on the element and on anything the
// team's rich text put inside it — hence the descendant list rather than a bare class.
const TEXT_DESCENDANTS = ['', ' p', ' span', ' h1', ' h2', ' h3', ' h4', ' strong', ' td'];

/**
 * Layers 2 and 3 of learnings 2.5. Layer 1 (the meta tags and the :root rule) is in head.ts,
 * because it is a constant rather than a function of what the design used.
 */
export function darkModeLayers(registry: Registry, pageBackground: string, ds: DesignSystem): string {
  const dark: string[] = [
    `body, .hse-body-background, .hse-body-wrapper-table, .hse-body-wrapper-td { background-color:${pageBackground} !important }`,
  ];
  const ogs: string[] = [
    `[data-ogsb] body, [data-ogsb] .hse-body-background, [data-ogsb] .hse-body-wrapper-table { background-color:${pageBackground} !important }`,
  ];

  for (const [key, hex] of registry.bg) {
    dark.push(`.sy-bg-${key} { background-color:${hex} !important }`);
    ogs.push(`[data-ogsb] .sy-bg-${key} { background-color:${hex} !important }`);
  }
  for (const [key, hex] of registry.text) {
    const sel = TEXT_DESCENDANTS.map((d) => `.sy-text-${key}${d}`);
    dark.push(`${sel.join(', ')} { color:${hex} !important }`);
    ogs.push(`${sel.map((s) => `[data-ogsc] ${s}`).join(', ')} { color:${hex} !important }`);
  }
  // A type role's own colour, re-asserted after the section colours above.
  //
  // This is the bug Jared found: a role coloured red rendered red in a light client and reverted to
  // the section's colour in a dark one. The force-light layer re-asserts `.sy-text-<hex> h1` with
  // `!important` across every descendant — which is what keeps a dark client from rewriting the
  // email, and was also overriding the designer's own choice, because a colour that lives only in a
  // stylesheet rule never reaches the registry.
  //
  // learnings 2.6 is exactly this case: the dark layers have to be a function of what the design
  // used, not of what someone remembered to register. Same `!important`, same specificity, emitted
  // after — so source order settles it and the role wins.
  for (const [name, role] of Object.entries(ds.type)) {
    const hex = colorOf(ds, role.color ?? null);
    if (!hex) continue;
    for (const sel of roleSelectors(name)) {
      dark.push(`${sel} { color:${hex} !important }`);
      ogs.push(`[data-ogsc] ${sel} { color:${hex} !important }`);
    }
  }

  for (const [key, hex] of registry.link) {
    const sel = `.sy-link-${key} a, .sy-link-${key} a span, .sy-link-${key} a strong`;
    dark.push(`${sel} { color:${hex} !important }`);
    ogs.push(
      `[data-ogsc] .sy-link-${key} a, [data-ogsc] .sy-link-${key} a span, [data-ogsc] .sy-link-${key} a strong { color:${hex} !important }`,
    );
  }

  return `@media (prefers-color-scheme: dark) {\n${dark.join('\n')}\n}\n${ogs.join('\n')}`;
}

/**
 * Where a type role's colour lands, at a specificity that ties with `.sy-text-<hex> <element>`.
 *
 * Both forms matter and they are different elements: `.sy-rich h1` is an `<h1>` the team typed in
 * HubSpot's editor, and `h1.sy-h1` is a Heading block the template rendered. Element-plus-class for
 * the second one on purpose — a bare `.sy-h1` is one notch less specific and would lose the tie.
 */
function roleSelectors(name: string): string[] {
  if (name === 'body') return ['.sy-rich p', '.sy-rich li', '.sy-rich blockquote'];
  if (/^h[1-6]$/.test(name)) return [`.sy-rich ${name}`, `${name}.sy-${name}`];
  return [];
}

/** Every colour the output uses, as `kind:hex`. The validator compares this against the emitted CSS. */
export function allColors(registry: Registry): string[] {
  const out: string[] = [];
  for (const kind of ['bg', 'text', 'link'] as const) {
    for (const hex of registry[kind].values()) out.push(`${kind}:${hex.toLowerCase()}`);
  }
  return out.sort();
}
