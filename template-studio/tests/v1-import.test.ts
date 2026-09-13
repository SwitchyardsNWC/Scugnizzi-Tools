// Importing a v1 design, and what has to survive the trip.
//
// This replaces `v1-parity.test.ts`, which diffed the compiled output against a golden file
// produced by v1's own compiler. That gate did its job — it caught four real mistakes and it is the
// reason the model could be trusted with the other templates — and it was retired on 2026-09-11
// when Jared decided to depart from v1 freely, as long as the HubSpot integration and handoff stay
// correct.
//
// What it was protecting was v1's *shape*. What it should have been protecting is the *contract*,
// and that moved to `tests/hubspot-contract.test.ts`, where it runs against what the compiler
// actually emits rather than against a compatibility mode. Markup regressions are caught by
// `blocks.test.ts`, which snapshots every block in every theme — v2's own output, which is the
// thing worth guarding.
//
// What is left here is the import itself: a v1 design has to arrive in the v2 model with every
// block, every setting and every field name intact, because that is what an existing HubSpot email
// is bound to. The golden file stays in `reference/` as documentation of where this came from.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { importV1 } from '../src/model/import-v1.ts';
import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { declaredFields } from './structure.ts';

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const fixture = JSON.parse(readFileSync(at('reference/v1-standard-email.design.json'), 'utf8'));
const golden = readFileSync(at('reference/v1-export-regenerated.html'), 'utf8');

const { template, warnings } = importV1(fixture);
const result = compile(template, { mode: 'hubl', date: '2026-09-10' });

describe('the standard email, imported', () => {
  it('brings every block across, with nothing dropped silently', () => {
    expect(warnings).toEqual([]);
    expect(template.sections).toHaveLength(fixture.blocks.length);
  });

  it('carries the template settings', () => {
    expect(template.hubspotLabel).toBe('Switchyards Standard Email');
    expect(template.pageBackground).toBe('#f7f6f3');
    expect(template.forceLight).toBe(true);
  });

  it('keeps every field name v1 allocated', () => {
    // The whole reason the import is careful: a name is what an existing email's content is bound
    // to, and v1 allocated one only for editable blocks — which is what keeps the hero image called
    // `hero_image` rather than shifting to `hero_image_2` (learnings 1.10).
    expect(declaredFields(result.html).map((f) => f.name)).toEqual(declaredFields(golden).map((f) => f.name));
  });

  it('compiles clean', () => {
    expect(errorsIn(lint({ ...result, mode: 'hubl' }))).toEqual([]);
  });
});

describe('what departing from v1 actually changed', () => {
  // Recorded rather than asserted loosely, so the differences are a list somebody can read rather
  // than a diff somebody has to interpret.

  it('exports rich text instead of rendering it in place', () => {
    // v1's `{% rich_text %}` rendered where it was declared, so the block could not be wrapped,
    // themed or collapsed. Exporting is what makes the section around it possible (learnings 1.14).
    expect(result.html).toContain('export_to_template_context=True');
    expect(result.html).toContain('widget_data.body.html');
  });

  it('states a margin on every paragraph it emits', () => {
    // HubSpot inlines `margin-bottom: 1em` onto paragraphs at send, and Gmail strips the reset that
    // would otherwise cover it (learnings 1.9). v1 shipped the gap.
    const paragraphs = result.html.match(/<p style="[^"]*"/g) ?? [];
    expect(paragraphs.length).toBeGreaterThan(2);
    for (const p of paragraphs) expect(p, `${p} states no margin`).toContain('margin:0');
  });

  it('bounds the band to the email’s own width', () => {
    // v1's band ran to the edge of the message area, which is why "email width" did not mean the
    // email until it was fixed (learnings 3.22).
    expect(result.html).toContain('class="hse-section" style="padding:0; max-width:600px; margin:0 auto');
  });

  it('gives every heading its own line height', () => {
    // v1 wrote a flat 125% into the markup and a different number per level into the stylesheet, so
    // an h1 the template rendered and an h1 the team typed were set differently.
    expect(result.html).toContain('line-height:120%');
  });

  it('collapses a button’s whole section, like every other block', () => {
    // v1 wrapped only the padded cell, leaving an empty section behind — harmless, and one block
    // behaving differently from the rest for no reason anyone could state.
    const button = result.html.indexOf('{% if widget_data.button_text');
    expect(button).toBeGreaterThan(-1);
    expect(result.html.slice(button, button + 160)).toContain('hse-section');
  });
});
