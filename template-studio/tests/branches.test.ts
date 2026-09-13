// Branch coverage.
//
// The point of this file: a template with optional content describes many possible emails, and the
// canvas only ever shows one. These tests check the other ones — specifically that a collapsed
// block takes its surrounding spacing with it (learnings 2.11), which is the failure that looks
// fine in the builder and leaves a hole in the send.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { importV1 } from '../src/model/import-v1.ts';
import { compile } from '../src/compile/compile.ts';
import { branchVariables, defaultsOf, enumerateBranches } from '../src/compile/branches.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { tokenize } from './structure.ts';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../reference/v1-standard-email.design.json', import.meta.url)), 'utf8'),
);
const { template } = importV1(fixture);
const hubl = compile(template, { mode: 'hubl', date: '2026-09-10' });
const variables = branchVariables(hubl.tree);

describe('branch enumeration', () => {
  it('finds every condition the standard email actually tests', () => {
    // `body` and `closing_text` are here because rich text now exports and can therefore collapse
    // its own section (learnings 1.14) — two branches v1 did not have.
    expect(variables.map((v) => v.key).sort()).toEqual([
      'body',
      'button_text',
      'closing_text',
      'hero_image',
      'hero_image__link',
      'secondary_image',
      'secondary_image__link',
      'site_settings.company_street_address_2',
    ]);
  });

  it('knows the unset images start absent, because the fixture ships them empty', () => {
    const defaults = defaultsOf(variables);
    expect(defaults['hero_image']).toBe(false);
    expect(defaults['secondary_image']).toBe(false);
    // The button ships with a label, so it is present until someone clears it.
    expect(defaults['button_text']).toBe(true);
  });

  it('enumerates every combination while the count is small enough to be a proof', () => {
    const few = Array.from({ length: 5 }, (_, i) => ({ key: `f${i}`, label: `F${i}`, presentByDefault: false }));
    expect(enumerateBranches(few)).toHaveLength(2 ** few.length);
  });

  it('falls back to corners and single flips once the count runs away', () => {
    // The standard email is now past the cap itself: eight conditions is 256 emails, so the
    // validator takes the two corners plus one flip of each variable either way instead.
    expect(variables).toHaveLength(8);
    expect(enumerateBranches(variables)).toHaveLength(2 + variables.length * 2);

    const many = Array.from({ length: 10 }, (_, i) => ({ key: `f${i}`, label: `F${i}`, presentByDefault: false }));
    expect(enumerateBranches(many)).toHaveLength(2 + many.length * 2);
  });
});

describe('every branch of the standard email', () => {
  const branches = enumerateBranches(variables);

  it('renders without leaving an unclosed tag', () => {
    for (const branch of branches) {
      const preview = compile(template, { mode: 'preview', branch });
      const open: string[] = [];
      for (const token of tokenize(preview.html)) {
        if (token.startsWith('/')) {
          expect(open.pop(), `branch ${JSON.stringify(branch)}`).toBe(token.slice(1));
        } else if (
          !token.startsWith('text:') &&
          !token.startsWith('comment:') &&
          !token.startsWith('hubl:') &&
          !token.startsWith('doctype:')
        ) {
          const name = token.slice(0, token.indexOf('['));
          if (!name.endsWith('/')) open.push(name);
        }
      }
      expect(open, `branch ${JSON.stringify(branch)} left tags open`).toEqual([]);
    }
  });

  it('collapses an optional image completely, taking its section with it', () => {
    const withImage = compile(template, { mode: 'preview', branch: { ...defaultsOf(variables), hero_image: true } });
    const without = compile(template, { mode: 'preview', branch: { ...defaultsOf(variables), hero_image: false } });
    expect(withImage.html).toContain('hse-image-wrapper');
    // Not just the img: the wrapper, the cell and the section band all go.
    expect(countOf(without.html, 'hse-image-wrapper')).toBe(countOf(withImage.html, 'hse-image-wrapper') - 1);
    expect(countOf(without.html, 'hse-section')).toBe(countOf(withImage.html, 'hse-section') - 1);
  });

  it('removes the button and its padding when the label is cleared', () => {
    const filled = compile(template, { mode: 'preview', branch: { ...defaultsOf(variables), button_text: true } });
    const blank = compile(template, { mode: 'preview', branch: { ...defaultsOf(variables), button_text: false } });
    // `class="sy-btn` rather than `sy-btn`, because the stylesheet mentions the class either way.
    expect(filled.html).toContain('class="sy-btn');
    expect(blank.html).not.toContain('class="sy-btn');
    // The section survives but carries no padding of its own, so it collapses to nothing visible.
    expect(blank.html).not.toContain('CTA Button.');
  });

  it('passes validation in the HubL output, which covers all branches at once', () => {
    const findings = lint({ tree: hubl.tree, registry: hubl.registry, html: hubl.html, bytes: hubl.bytes });
    expect(errorsIn(findings)).toEqual([]);
  });
});

const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;
