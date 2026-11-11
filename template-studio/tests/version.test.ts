// The suite's version is written once, in version.js, and the changelog's newest entry agrees with it.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SUITE_VERSION } from '../src/version.ts';

const root = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('suite version', () => {
  const written = /SCUGNIZZI_VERSION\s*=\s*'([^']+)'/.exec(root('version.js'))?.[1];

  it('is semver', () => {
    expect(written).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('reaches the build', () => {
    expect(SUITE_VERSION).toBe(written);
  });

  it('heads the changelog', () => {
    expect(/^## (\S+)/m.exec(root('CHANGELOG.md'))?.[1]).toBe(written);
  });
});
