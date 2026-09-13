// Clean up, and the two lint rules that say when it is wanted.
//
// Two shapes of markup nobody uses. A style rule whose selectors match nothing in the body — the
// compiler used to carry six hundred bytes of footer variants that were never built and a page of
// HubSpot module styles a coded template cannot hold. And a block whose markup the sanitiser
// would rewrite — empty paragraphs, a pasted span's inline style, a `target` no client reads.
// The first is the compiler's to keep clean; the second is the designer's, so Checks offers to.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { lint, unusedRules } from '../src/compile/lint.ts';
import { importV1 } from '../src/model/import-v1.ts';
import { migrate } from '../src/model/schema.ts';
import { sanitise } from '../src/model/sanitise.ts';
import { blankTemplate, cardTemplate } from '../src/model/starters.ts';
import { tidyTemplate, untidyBlocks, untidyOf } from '../src/model/tidy.ts';
import { allBlocks, setValue } from '../src/model/edit.ts';
import { CATALOG } from '../src/model/catalog.ts';
import type { Block, Template } from '../src/model/types.ts';

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const standard = () => importV1(JSON.parse(readFileSync(at('reference/v1-standard-email.design.json'), 'utf8'))).template;
const baseline = () => migrate(JSON.parse(readFileSync(at('templates/baseline.template.json'), 'utf8')));
const label = (b: Block) => CATALOG[b.type].outline(b);

describe('style rules that match nothing', () => {
  it.each([
    ['the standard email', standard],
    ['the baseline', baseline],
    ['the card email', cardTemplate],
    ['a blank template', blankTemplate],
  ])('%s emits none', (_name, make) => {
    const html = compile(make(), { mode: 'hubl' }).html;
    expect(unusedRules(html)).toEqual([]);
  });

  it('is what the compiler used to emit by the page', () => {
    // The old boilerplate, put back: footer variants nothing produces, HubSpot module styles a
    // coded template cannot hold, a hide-on-phone class nothing sets.
    const html = compile(standard(), { mode: 'hubl' }).html.replace(
      '</head>',
      '<style>.sy-footer-left { width:55% !important } .hs-hm, table.hs-hm { display:none } .hse-border-m { border:1px solid #ccc }</style></head>',
    );
    expect(unusedRules(html)).toEqual(['.sy-footer-left', '.hs-hm, table.hs-hm', '.hse-border-m']);
    const findings = lint({ ...compile(standard(), { mode: 'hubl' }), html, mode: 'hubl' });
    expect(findings.find((f) => f.rule === 'unused-css')?.message).toMatch(/3 style rules match nothing/);
  });

  it('lets through what a client or HubSpot adds at render', () => {
    // Thunderbird marks the body `moz-text-html`; a CTA the team inserts is `a.cta_button`;
    // anything under `.sy-rich` styles what the team types, which does not exist yet.
    const html = compile(standard(), { mode: 'hubl' }).html.replace(
      '</head>',
      '<style>.moz-text-html .hse-column { display:table-cell } a.cta_button { color:red } .sy-rich h5 { color:red } p { margin:0 } #hs_body a[x-apple-data-detectors] { color:inherit }</style></head>',
    );
    expect(unusedRules(html)).toEqual([]);
  });

  it('keeps a rule alive when any one of its selectors matches', () => {
    const html = compile(standard(), { mode: 'hubl' }).html.replace('</head>', '<style>.nothing-here, .hs_padded { padding:0 }</style></head>');
    expect(unusedRules(html)).toEqual([]);
  });

  it('never judges the block HubSpot inlines onto the team’s content', () => {
    const html = compile(standard(), { mode: 'hubl' }).html.replace(
      '<style type="text/css" id="hs-inline-css">',
      '<style type="text/css" id="hs-inline-css">.team-typed-this { color:red }',
    );
    expect(unusedRules(html)).toEqual([]);
  });
});

describe('a block’s own markup', () => {
  const withHtml = (html: string): { template: Template; block: Block } => {
    const t = cardTemplate();
    const block = allBlocks(t).find((b) => b.type === 'richtext')!;
    const section = t.sections.find((s) => s.rows.some((r) => r.columns.some((c) => c.blocks.includes(block))))!;
    return { template: setValue(t, { kind: 'block', sectionId: section.id, blockId: block.id }, 'block.html', html), block };
  };

  it('is clean when the sanitiser would change nothing', () => {
    for (const block of allBlocks(cardTemplate())) expect(untidyOf(block), block.id).toBeNull();
    expect(untidyBlocks(blankTemplate(), label)).toEqual([]);
    const t = cardTemplate();
    expect(tidyTemplate(t)).toBe(t);
  });

  it('names what a pasted paragraph carries', () => {
    const { template, block } = withHtml('<p><span style="font-family:Calibri">Pasted</span></p><p></p><p>&nbsp;</p>');
    const found = untidyBlocks(template, label);
    expect(found).toHaveLength(1);
    expect(found[0]!.blockId).toBe(block.id);
    expect(found[0]!.what).toMatch(/tags? the template does not use/);
    expect(found[0]!.what).toMatch(/attributes an email client ignores/);
    expect(found[0]!.what).toMatch(/empty paragraphs/);
  });

  it('says so through the linter, and Clean up takes it out', () => {
    const { template, block } = withHtml('<p>Fine.</p><p><br></p><p style="color:red">Red</p>');
    const out = compile(template, { mode: 'hubl' });
    const findings = lint({ ...out, mode: 'hubl', template });
    const untidy = findings.filter((f) => f.rule === 'untidy-markup');
    expect(untidy).toHaveLength(1);
    expect(untidy[0]!.severity).toBe('warning');
    expect(untidy[0]!.message).toMatch(/Clean up takes it out/);

    const cleaned = tidyTemplate(template);
    const after = allBlocks(cleaned).find((b) => b.id === block.id)!;
    expect(after.type === 'richtext' && after.html).toBe('<p>Fine.</p><p>Red</p>');
    expect(lint({ ...compile(cleaned, { mode: 'hubl' }), mode: 'hubl', template: cleaned }).filter((f) => f.rule === 'untidy-markup')).toEqual([]);
    // And once is enough: cleaning a clean document is the same document.
    expect(tidyTemplate(cleaned)).toBe(cleaned);
  });

  it('trims the spaces a heading did not mean', () => {
    const t = cardTemplate();
    const heading = allBlocks(t).find((b) => b.type === 'heading')!;
    const section = t.sections.find((s) => s.rows.some((r) => r.columns.some((c) => c.blocks.includes(heading))))!;
    const untidy = setValue(t, { kind: 'block', sectionId: section.id, blockId: heading.id }, 'block.text', '  A   headline ');
    expect(untidyBlocks(untidy, label)[0]?.what).toBe('stray spaces in the text');
    const cleaned = allBlocks(tidyTemplate(untidy)).find((b) => b.id === heading.id)!;
    expect(cleaned.type === 'heading' && cleaned.text).toBe('A headline');
  });

  it('flags the standard email’s links for the target nothing reads', () => {
    // v1 wrote `target="_blank"` onto rich text links; no mail client honours it and the sanitiser
    // has always dropped it from a paste. Clean up drops it from the import too.
    const found = untidyBlocks(standard(), label);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((u) => /attributes an email client ignores/.test(u.what))).toBe(true);
    const html = allBlocks(tidyTemplate(standard())).filter((b) => b.type === 'richtext').map((b) => (b as { html: string }).html).join('');
    expect(html).not.toContain('target=');
    expect(html).toContain('href="https://www.switchyards.com/"');
  });
});

describe('a list nested outside its item', () => {
  it('is put inside the item before it, which is what indent meant', () => {
    // Chrome's indent command writes `<ul><li>a</li><ul><li>b</li></ul></ul>`, which is not HTML.
    expect(sanitise('<ul><li>a</li><ul><li>b</li></ul><li>c</li></ul>')).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  });

  it('gets an item of its own when there is none before it', () => {
    expect(sanitise('<ul><ul><li>b</li></ul><li>c</li></ul>')).toBe('<ul><li><ul><li>b</li></ul></li><li>c</li></ul>');
  });

  it('leaves a properly nested list alone', () => {
    const ok = '<ul><li>a<ul><li>b</li></ul></li></ul>';
    expect(sanitise(ok)).toBe(ok);
  });
});
