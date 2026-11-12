// The board and the library are Enkel, written out in project.css rather than imported. Each value that says
// `/* = --token */` beside it is held to that token's value in Enkel's own files, in the theme its rule is for: the
// light rule to Enkel's `:root`, the dark rules to Enkel's `[data-theme="dark"]` over its `:root`. A change to Enkel
// that is not carried to the board fails here instead of drifting.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Theme = 'light' | 'dark';

const enkel = (file: string) => readFileSync(new URL(`../../design system/Enkel Design system v2/tokens/${file}`, import.meta.url), 'utf8');
const board = readFileSync(new URL('../src/project/project.css', import.meta.url), 'utf8');
const files = ['colors.css', 'status.css', 'controls.css', 'fonts.css'];
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every custom property declared in a rule whose selectors include `:root` (light), and for dark those declared in a
 * rule whose selectors include `[data-theme="dark"]`, laid over the light ones as the cascade does.
 */
function tokensFor(theme: Theme): Map<string, string> {
  const tokens = new Map<string, string>();
  const read = (wanted: (selector: string) => boolean) => {
    for (const css of files.map(enkel)) {
      for (const [, selectors, body] of uncomment(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selectors!.split(',').some((s) => wanted(s.trim()))) continue;
        for (const [, name, value] of body!.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) tokens.set(name!, value!.trim());
      }
    }
  };
  read((s) => s === ':root');
  if (theme === 'dark') read((s) => s === '[data-theme="dark"]');
  return tokens;
}

const tokens: Record<Theme, Map<string, string>> = { light: tokensFor('light'), dark: tokensFor('dark') };

/** A token's value with every var() in it followed to what that names, in one theme. */
function follow(theme: Theme, name: string, seen: string[] = []): string {
  const value = tokens[theme].get(name);
  if (value === undefined) throw new Error(`Enkel has no ${name}`);
  if (seen.includes(name)) throw new Error(`${[...seen, name].join(' → ')} goes round in a circle`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, inner: string) => follow(theme, inner, [...seen, name]));
}

/** Two ways of writing one value: spaces and case do not count. */
const same = (value: string) => value.replace(/\s+/g, '').toLowerCase();

/** Where the board's `@media (prefers-color-scheme: dark) { … }` blocks start and end. */
const systemDark = [...board.matchAll(/@media[^{]*prefers-color-scheme:\s*dark[^{]*\{/g)].map((m) => {
  let depth = 1;
  let i = m.index! + m[0].length;
  for (; depth > 0 && i < board.length; i++) depth += board[i] === '{' ? 1 : board[i] === '}' ? -1 : 0;
  return [m.index!, i] as const;
});

/**
 * The board's palette rules: a selector ending in `.pb-app`. Dark when the selector names the dark theme or the rule
 * sits in a system-dark media block; light otherwise.
 */
const rules = [...board.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ at: m.index!, selector: uncomment(m[1]!).trim().replace(/\s+/g, ' '), body: m[2]! }))
  .filter(({ selector }) => /\.pb-app$/.test(selector))
  .map(({ at, selector, body }) => ({
    theme: (selector.includes('[data-theme="dark"]') || systemDark.some(([from, to]) => at > from && at < to) ? 'dark' : 'light') as Theme,
    selector,
    body,
  }));

/** The claims: `--pb-name: value; /* = --token *\/`, with the theme of the rule they are in. */
const claims = rules.flatMap(({ theme, selector, body }) =>
  [...body.matchAll(/(--pb-[\w-]+)\s*:\s*([^;]+);\s*\/\*\s*=\s*(--[\w-]+)\s*\*\//g)].map(([, pb, value, token]) => ({
    theme,
    where: selector,
    pb: pb!,
    value: value!,
    token: token!,
  })),
);

const boardValue = (name: string) => new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(board)?.[1] ?? '';
const firstFamily = (stack: string) => stack.split(',')[0]!.trim().replace(/^["']|["']$/g, '');

describe('the board on Enkel', () => {
  it('reads both sides', () => {
    expect(tokens.light.get('--surface-sunken')).toBe('#f5f5f4');
    expect(tokens.dark.get('--surface-sunken')).toBe('#0e0e0e');
    expect(claims.filter((c) => c.theme === 'light').length).toBeGreaterThanOrEqual(25);
    // Dark is written twice (picked by hand, and the system's when nothing is picked), each with every claim.
    expect(rules.filter((r) => r.theme === 'dark')).toHaveLength(2);
    expect(claims.filter((c) => c.theme === 'dark').length).toBeGreaterThanOrEqual(50);
  });

  it.each(claims)('$where: $pb is $token', ({ theme, value, token }) => {
    expect(same(value)).toBe(same(follow(theme, token)));
  });

  it('flips every themed colour: what the light rule names, both dark rules name too', () => {
    const light = new Set(claims.filter((c) => c.theme === 'light').map((c) => c.pb));
    for (const rule of rules.filter((r) => r.theme === 'dark')) {
      const dark = new Set(claims.filter((c) => c.where === rule.selector).map((c) => c.pb));
      expect([...light].filter((pb) => !dark.has(pb))).toEqual([]);
    }
  });

  it('sets words and figures in Enkel’s faces first', () => {
    expect(firstFamily(boardValue('--pb-sans'))).toBe(firstFamily(follow('light', '--font-sans')));
    expect(firstFamily(boardValue('--pb-mono'))).toBe(firstFamily(follow('light', '--font-mono')));
  });
});
