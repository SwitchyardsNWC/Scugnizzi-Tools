// The contract with HubSpot. This is the gate.
//
// Jared's decision, 2026-09-11: **depart from v1 freely, as long as the HubSpot integration and
// handoff stay correct.** So v1's markup stops being the definition of right, and this file becomes
// the thing that is. Everything asserted here was paid for by a real send or by a round of feedback
// on v1; nothing here is a preference.
//
// The rule for adding to this file: an assertion belongs here if breaking it means a template that
// uploads but misbehaves in HubSpot — a field that does not appear in the Contents panel, a name an
// existing email is no longer bound to, a template Design Manager refuses to publish. Rendering
// differences, however ugly, belong in `blocks.test.ts` and `learnings.test.ts` instead.
//
// It runs against what the compiler **actually emits**, not against parity mode.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { branchVariables, enumerateBranches } from '../src/compile/branches.ts';
import { importV1 } from '../src/model/import-v1.ts';
import { hubspotFields, setValue } from '../src/model/edit.ts';
import { declaredFields } from './structure.ts';

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const fixture = JSON.parse(readFileSync(at('reference/v1-standard-email.design.json'), 'utf8'));
const golden = readFileSync(at('reference/v1-export-regenerated.html'), 'utf8');

const { template } = importV1(fixture);
const out = compile(template, { mode: 'hubl', date: '2026-09-10' });

describe('the fields the team will meet', () => {
  it('are the same fields, with the same names and labels, in the same order as v1', () => {
    // The one thing that can never drift. A field name is what an existing email's content is bound
    // to: rename it and whatever the team typed is orphaned (learnings 1.10). The label is what they
    // read, and the order is the order HubSpot's Contents panel lists them in (1.4).
    //
    // Asserted against what the compiler emits normally — not in parity mode — because this is the
    // half of v1 that still matters now that its markup does not.
    expect(declaredFields(out.html)).toEqual(declaredFields(golden));
  });

  it('appear in the output in the order the document holds them', () => {
    // The editability view reads the document rather than the compiled template, so the two have to
    // agree or it is showing the team a panel order that does not exist.
    const inDocument = hubspotFields(template).map((f) => f.field);
    const inOutput = declaredFields(out.html).map((f) => f.name);
    expect(inOutput.filter((n) => inDocument.includes(n))).toEqual(inDocument);
  });

  it('every one of them exports to the template context', () => {
    // Without `export_to_template_context` the tag renders where it stands and the template cannot
    // put its own section, background or conditional around it (learnings 1.3). Counted against the
    // declarations rather than parsed per field, because one missing flag is one silently
    // unwrappable block.
    const declarations = (out.html.match(/\{%\s*(?:text|rich_text|module)\s+"/g) ?? []).length;
    const exports = (out.html.match(/export_to_template_context=True/g) ?? []).length;
    expect(declarations).toBeGreaterThan(6);
    expect(exports).toBe(declarations);
  });

  it('keeps its name when the label is rewritten', () => {
    const renamed = setValue(template, { kind: 'template' }, 'template.name', 'x');
    const edited = template.sections.reduce(
      (acc, s) =>
        s.rows[0]!.columns[0]!.blocks.reduce(
          (inner, b) =>
            'lock' in b && b.lock.editable
              ? setValue(inner, { kind: 'block', sectionId: s.id, blockId: b.id }, 'block.lock.label', `${b.lock.label} v2`)
              : inner,
          acc,
        ),
      renamed,
    );
    const before = declaredFields(out.html).map((f) => f.name);
    const after = declaredFields(compile(edited, { mode: 'hubl' }).html).map((f) => f.name);
    expect(after).toEqual(before);
  });
});

describe('what Design Manager requires', () => {
  it('carries the annotation header, or HubSpot will not offer the template', () => {
    // learnings 1.1. Without this the template uploads and then cannot be picked when creating an
    // email, which looks like the upload failed.
    expect(out.html.startsWith('<!--')).toBe(true);
    expect(out.html).toContain('templateType: email');
    expect(out.html).toContain('isAvailableForNewContent: true');
    expect(out.html).toContain('label: Switchyards Standard Email');
  });

  it('carries the CAN-SPAM variables and both unsubscribe links', () => {
    // learnings 1.8. HubSpot refuses to publish without them.
    for (const token of [
      'site_settings.company_name',
      'site_settings.company_street_address_1',
      'site_settings.company_city',
      'site_settings.company_state',
      'site_settings.company_zip',
      'unsubscribe_link_all',
      'unsubscribe_link',
    ]) {
      expect(out.html, `missing ${token}`).toContain(`{{ ${token} }}`);
    }
  });

  it('passes every rule a real send has taught us', () => {
    expect(errorsIn(lint({ ...out, mode: 'hubl' }))).toEqual([]);
  });

  it('stays under the size Gmail clips at', () => {
    // learnings 2.12: past ~102KB Gmail truncates, and the footer — with the unsubscribe link in
    // it — is what goes first.
    expect(out.bytes).toBeLessThan(102 * 1024);
  });
});

describe('the shapes that only fail in a live send', () => {
  it('never declares a field inside a conditional', () => {
    // learnings 1.5: a tag inside an `{% if %}` that starts false never registers, so the field is
    // missing from the Contents panel entirely and the team cannot fill in the thing that would
    // make the conditional true. The linter checks the tree, not the string.
    expect(errorsIn(lint({ ...out, mode: 'hubl' })).filter((f) => f.rule === 'decl-in-conditional')).toEqual([]);
  });

  it('emits balanced markup in every branch the template can take', () => {
    // A template with n optional fields is 2ⁿ emails. An unclosed tag in one of them is invisible
    // until somebody sends that combination.
    const variables = branchVariables(out.tree);
    expect(variables.length).toBeGreaterThan(4);
    for (const branch of enumerateBranches(variables)) {
      const html = compile(template, { mode: 'preview', branch }).html;
      const opens = (html.match(/<(table|tr|td|tbody|div)\b/g) ?? []).length;
      const closes = (html.match(/<\/(table|tr|td|tbody|div)>/g) ?? []).length;
      expect(opens, `unbalanced in ${JSON.stringify(branch)}`).toBe(closes);
    }
  });

  it('reads the image link from the path the probe actually proved', () => {
    // learnings 1.6, verified 2026-09-11. `.link.url`, `.link.url.href` and `.img.link` are all
    // empty; the link arrives as a bare URL at `widget_data.<name>.link`. Guessing cost v1 a send.
    expect(out.html).toContain('.link }}');
    expect(out.html).not.toContain('.link.url');
    expect(out.html).not.toContain('.img.link');
  });

  it('takes the width from the block, never from the uploaded file', () => {
    // The module reports the file's natural width, not the declared one. Trusting it reproduces the
    // bug v1 shipped: a 1080px upload rendering at 1080 (learnings 1.6a, 2.9).
    expect(out.html).not.toContain('img.width');
  });
});
