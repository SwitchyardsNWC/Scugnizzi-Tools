// The baseline template: one email holding every block, every style and every edge case.
//
// It is built by `tools/make-baseline.ts` rather than written as JSON, so it type-checks against the
// model — and this file is the other half of that: coverage the type system cannot see. A baseline
// that quietly stops containing a block type is worse than no baseline, because it is still called
// one and still gets sent.
//
// It earned its place before it shipped. The first compile turned up `paragraph-margin` errors on
// seven paragraphs: markup pasted into a *locked* rich text block renders straight into the output,
// and nothing was giving those paragraphs the margin HubSpot would otherwise inject over
// (learnings 1.9). The standard email never caught it because its rich text is editable, so the
// markup becomes a field default instead of markup.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { branchVariables } from '../src/compile/branches.ts';
import { migrate } from '../src/model/schema.ts';
import { allBlocks } from '../src/model/edit.ts';
import { CATALOG } from '../src/model/catalog.ts';
import type { BlockType } from '../src/model/types.ts';

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const template = migrate(JSON.parse(readFileSync(at('templates/baseline.template.json'), 'utf8')));
const out = compile(template, { mode: 'hubl', date: '2026-01-01' });

describe('the baseline is complete', () => {
  it('contains every block type there is', () => {
    // The check that keeps it a baseline. Adding a block type to the catalog without adding one to
    // this page means the next real send tests everything except the new thing.
    const present = new Set(allBlocks(template).map((b) => b.type));
    const missing = (Object.keys(CATALOG) as BlockType[]).filter((type) => !present.has(type));
    expect(missing, 'add these to tools/make-baseline.ts').toEqual([]);
  });

  it('shows every heading level and the whole rich text vocabulary', () => {
    const html = compile(template, { mode: 'preview' }).html;
    for (const tag of ['<h1', '<h2', '<h3', '<h4', '<h5', '<h6', '<ul>', '<ol>', '<li>', '<blockquote>', '<hr>', '<strong>', '<em>', '<u>', '<small>']) {
      expect(html, `nothing in the baseline produces ${tag}`).toContain(tag);
    }
  });

  it('shows a nested list, which is where indents go wrong', () => {
    expect(compile(template, { mode: 'preview' }).html).toMatch(/<li>[^]*?<ul><li>/);
  });

  it('covers every column arrangement, including one that leaves on a phone', () => {
    const rows = template.sections.flatMap((s) => s.rows);
    const counts = new Set(rows.map((r) => r.columns.length));
    // Four since the brand marks went in a row of four, which is the widest the panel offers.
    expect([...counts].sort()).toEqual([1, 2, 3, 4]);
    expect(rows.some((r) => r.mobile === 'side-by-side')).toBe(true);
    expect(rows.some((r) => r.columns.some((c) => c.hideOnPhone))).toBe(true);
  });

  it('covers every background preset and both button variants', () => {
    const themes = new Set(template.sections.map((s) => s.theme));
    expect([...themes].sort()).toEqual(['cream', 'navy', 'offwhite']);
    // And the two blocks that draw the dark band sit on it *by preset*, not by a literal.
    for (const section of template.sections) {
      const types = section.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks.map((b) => b.type)));
      if (types.includes('topbar') || types.includes('legal')) expect(section.theme).toBe('navy');
    }
    const styles = new Set(allBlocks(template).flatMap((b) => (b.type === 'button' ? [b.style] : [])));
    expect([...styles].sort()).toEqual(['primary', 'secondary']);
  });

  it('has an optional image that can genuinely be absent', () => {
    // The flag only does anything on an editable image going through HubSpot's own module: a locked
    // static one renders or it does not, so putting `optional` on one shows the flag doing nothing.
    const optional = allBlocks(template).filter((b) => b.type === 'image' && b.optional);
    expect(optional.length).toBeGreaterThan(0);
    expect(optional.some((b) => b.type === 'image' && b.lock.editable && b.mode === 'module')).toBe(true);
    // And the branch enumerator can see it, which is what "absent from the send" actually means.
    expect(branchVariables(out.tree).some((v) => v.label.toLowerCase().includes('optional'))).toBe(true);
  });
});

describe('the baseline is sendable', () => {
  it('compiles clean', () => {
    expect(errorsIn(lint({ ...out, mode: 'hubl' }))).toEqual([]);
  });

  it('states a margin on every paragraph it renders', () => {
    // The defect this page found on its first compile.
    //
    // Declarations are cut out first, for the same reason the linter ignores them: the `html=` of a
    // `{% rich_text %}` is a *default* HubSpot copies into the email and then re-serialises through
    // its own editor, where the inlined `.sy-rich p` rule is what covers it. Only markup the
    // compiler renders is the compiler's to get right.
    const rendered = out.html.replace(/\{%[^]*?%\}/g, '');
    const paragraphs = rendered.match(/<p(\s[^>]*)?>/g) ?? [];
    expect(paragraphs.length).toBeGreaterThan(8);
    for (const tag of paragraphs) expect(tag, `${tag} states no margin`).toMatch(/margin\s*:/);
  });

  it('stays well under the size Gmail clips at, despite holding everything', () => {
    expect(out.bytes).toBeLessThan(102 * 1024);
  });

  it('keeps its editable fields few, because it is a test page and not a template', () => {
    // Almost everything is locked, so the page renders as designed rather than as forty empty
    // fields in the Contents panel. The handful that stay open are the ones whose *absence* is
    // worth seeing: the body copy and the optional image.
    const fields = branchVariables(out.tree);
    expect(fields.length).toBeGreaterThan(1);
    expect(fields.length).toBeLessThan(6);
  });
});
