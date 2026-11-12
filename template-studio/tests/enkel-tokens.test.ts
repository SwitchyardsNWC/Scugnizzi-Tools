// The board and the library are Enkel, written out in project.css rather than imported. Each value that says
// `/* = --token */` beside it is held to that token's light value in Enkel's own files (the board stays light, so
// Enkel's `:root`). A change to Enkel that is not carried to the board fails here instead of drifting.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const enkel = (file: string) => readFileSync(new URL(`../../design system/Enkel Design system v2/tokens/${file}`, import.meta.url), 'utf8');
const board = readFileSync(new URL('../src/project/project.css', import.meta.url), 'utf8');
const files = ['colors.css', 'status.css', 'controls.css', 'fonts.css'];
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every custom property Enkel declares in a rule whose selectors include `:root`: its light theme. */
const tokens = new Map<string, string>();
for (const css of files.map(enkel)) {
  for (const [, selectors, body] of uncomment(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors!.split(',').some((s) => s.trim() === ':root')) continue;
    for (const [, name, value] of body!.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) tokens.set(name!, value!.trim());
  }
}

/** A token's value with every var() in it followed to what that names. */
function follow(name: string, seen: string[] = []): string {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Enkel has no ${name}`);
  if (seen.includes(name)) throw new Error(`${[...seen, name].join(' → ')} goes round in a circle`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, inner: string) => follow(inner, [...seen, name]));
}

/** Two ways of writing one value: spaces and case do not count. */
const same = (value: string) => value.replace(/\s+/g, '').toLowerCase();

/** The claims: `--pb-name: value; /* = --token *\/`, anywhere in project.css. */
const claims = [...board.matchAll(/(--pb-[\w-]+)\s*:\s*([^;]+);\s*\/\*\s*=\s*(--[\w-]+)\s*\*\//g)].map(([, pb, value, token]) => ({
  pb: pb!,
  value: value!,
  token: token!,
}));

const boardValue = (name: string) => new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(board)?.[1] ?? '';
const firstFamily = (stack: string) => stack.split(',')[0]!.trim().replace(/^["']|["']$/g, '');

describe('the board on Enkel', () => {
  it('reads both sides', () => {
    expect(tokens.get('--surface-sunken')).toBe('#f5f5f4');
    expect(claims.length).toBeGreaterThanOrEqual(25);
  });

  it('stays light: no dark rules to drift', () => {
    expect(uncomment(board)).not.toMatch(/data-theme|prefers-color-scheme/);
  });

  it.each(claims)('$pb is $token', ({ value, token }) => {
    expect(same(value)).toBe(same(follow(token)));
  });

  it('sets words and figures in Enkel’s faces first', () => {
    expect(firstFamily(boardValue('--pb-sans'))).toBe(firstFamily(follow('--font-sans')));
    expect(firstFamily(boardValue('--pb-mono'))).toBe(firstFamily(follow('--font-mono')));
  });
});
