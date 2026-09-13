// The compiler is pure and DOM-free (acceptance.md §1, plan.md "What is fixed regardless of stack").
//
// That claim used to be guaranteed by the tsconfig having no DOM lib. The app needs DOM types, so
// the guarantee moved here, where it is stronger anyway: this reads the source anyone could write
// tomorrow rather than trusting a compiler setting. If it fails, something in the compiler reached
// for the browser — which would mean the canvas and the exported template no longer come from the
// same code, and learnings 3.1 is the one architectural rule the brief asked me to keep.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });
}

/**
 * Browser globals as they are actually *used*, not merely mentioned. Matching the bare word would
 * fail on prose — half this codebase discusses what Gmail does to a document — so each pattern
 * looks for the global being read or called.
 */
const BROWSER: Array<[string, RegExp]> = [
  ['document', /\bdocument\s*\./],
  ['window', /\bwindow\s*\./],
  ['localStorage', /\blocalStorage\s*\./],
  ['sessionStorage', /\bsessionStorage\s*\./],
  ['indexedDB', /\bindexedDB\s*\./],
  ['navigator', /\bnavigator\s*\./],
  ['fetch', /\bfetch\s*\(/],
  ['DOM types', /\b(HTMLElement|Element|Node|Event)\b\s*[;,)>]/],
];

/**
 * Node-only globals matter just as much, and in the other direction. The compiler runs under Node
 * for the tests and inside the editor for the canvas, so a reference to either environment's
 * globals breaks one of the two. `Buffer.byteLength` got into the size calculation and only showed
 * up as a blank page in the browser; nothing in the test suite could have caught it.
 */
const NODE: Array<[string, RegExp]> = [
  ['Buffer', /\bBuffer\s*\./],
  ['process', /\bprocess\s*\./],
  ['__dirname', /\b__dirname\b/],
  ['require', /\brequire\s*\(/],
];

describe('the compiler and the model run in both Node and the browser', () => {
  const files = [...sources(join(root, 'src/compile')), ...sources(join(root, 'src/model'))];

  it('covers every file in both directories', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.slice(root.length), f] as const))('%s', (_label, path) => {
    // Comments and strings discuss the browser constantly; only code counts.
    const code = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
    for (const [name, pattern] of [...BROWSER, ...NODE]) {
      expect(code, `${path} reaches for ${name}`).not.toMatch(pattern);
    }
  });
});

/**
 * acceptance.md §2: "No native `confirm`, `prompt` or `alert` appears anywhere in the app."
 *
 * Not a style preference. In this environment they silently do nothing, which is how v1 produced
 * "I'm unable to delete blocks" — a button that appeared dead because the confirmation it was
 * waiting on never rendered (learnings 3.2). The replacement is an undo toast, which Jared
 * preferred anyway.
 */
describe('the app never reaches for a native dialog', () => {
  const files = sources(join(root, 'src/app'));

  it('has app source to check', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(files.map((f) => [f.slice(root.length), f] as const))('%s', (_label, path) => {
    const code = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const pattern of [/\bconfirm\s*\(/, /\balert\s*\(/, /\bprompt\s*\(/, /window\.(confirm|alert|prompt)/]) {
      expect(code, `${path} uses a native dialog`).not.toMatch(pattern);
    }
  });
});

describe('the compiler never reaches into the palette for a key', () => {
  it('has no `ds.colors[...]` lookups outside the design system itself', () => {
    // Three separate bugs in one afternoon had this shape: `ds.colors['red']` looks like using the
    // design system and is not. It pins the output to a *name*, so renaming that entry — or
    // removing it, which is the same walk — leaves the output on a literal while everything that
    // referenced it properly moves.
    //
    // A preset is itself a set of references, so `theme(ds, 'cream').link` follows the palette all
    // the way down and `ds.colors['red']` does not. The design system's own module is exempt: it is
    // the thing doing the resolving.
    const offenders: string[] = [];
    for (const path of [...sources(join(root, 'src', 'compile')), ...sources(join(root, 'src', 'model'))]) {
      if (path.endsWith('design-system.ts')) continue;
      for (const [i, line] of readFileSync(path, 'utf8').split('\n').entries()) {
        // Comments are skipped, or this test fails on the paragraph explaining why it exists —
        // which is the same prose trap the browser-global patterns above are written around.
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) continue;
        if (/\.colors\[['"`]/.test(code)) offenders.push(`${path.slice(root.length)}:${i + 1}  ${code}`);
      }
    }
    expect(offenders, 'resolve through a preset or a ColorRef instead').toEqual([]);
  });
});
