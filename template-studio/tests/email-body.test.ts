// HubSpot's `email_body` (model/ids.ts, compile/lint.ts).
//
// Jared: "If an email has body text make sure you give it email_body - I get an error in hubspot 'The template
// does not contain the module email_body, it will not work for blog/rss emails'."
//
// Defended: the first Text block a template gets is named email_body and the next is named for its label; both
// Switchyards starters and the card email carry it; a template with bodies and no email_body gets the warning, and
// one with the name, a drag and drop area, or no body at all does not; the v1 standard email keeps its names.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { lint } from '../src/compile/lint.ts';
import { createBlock } from '../src/model/catalog.ts';
import { addSection, hubspotFields } from '../src/model/edit.ts';
import { bodyFieldName, EMAIL_BODY, sequentialIds } from '../src/model/ids.ts';
import { importV1 } from '../src/model/import-v1.ts';
import { blankTemplate, cardTemplate } from '../src/model/starters.ts';
import { switchyardsShortTemplate, switchyardsTemplate } from '../src/model/switchyards.ts';
import type { RichTextBlock, Template } from '../src/model/types.ts';
import fixture from '../reference/v1-standard-email.design.json';

const warnings = (t: Template) => lint({ ...compile(t, { mode: 'hubl', date: '2026-09-18' }), mode: 'hubl', template: t }).filter((f) => f.rule === 'email-body');

describe('email_body', () => {
  it('is the first body’s name, and the label names the next', () => {
    const taken = new Set<string>();
    expect(bodyFieldName('Body', taken)).toBe(EMAIL_BODY);
    expect(bodyFieldName('Body', taken)).toBe('body');
    const ctx = { id: sequentialIds(), taken: new Set<string>() };
    const first = createBlock('richtext', ctx) as RichTextBlock;
    const second = createBlock('richtext', ctx) as RichTextBlock;
    expect(first.lock.field).toBe(EMAIL_BODY);
    expect(second.lock.field).toBe('body');
  });

  it('is in every starter that has body text, and compiles as the rich text tag of that name', () => {
    for (const make of [switchyardsTemplate, switchyardsShortTemplate, cardTemplate]) {
      const t = make();
      expect(hubspotFields(t).some((f) => f.field === EMAIL_BODY), t.name).toBe(true);
      expect(compile(t, { mode: 'hubl' }).html, t.name).toContain(`{% rich_text "${EMAIL_BODY}"`);
      expect(warnings(t), t.name).toEqual([]);
    }
  });

  it('arrives with the first Text block added to a blank template', () => {
    const t = addSection(blankTemplate(), 'richtext', null);
    expect(hubspotFields(t).map((f) => f.field)).toContain(EMAIL_BODY);
    expect(warnings(t)).toEqual([]);
  });

  it('warns when a template has bodies and none is named email_body, and only then', () => {
    const t = addSection(blankTemplate(), 'richtext', null);
    const renamed: Template = JSON.parse(JSON.stringify(t).replace(new RegExp(`"${EMAIL_BODY}"`, 'g'), '"body"')) as Template;
    const found = warnings(renamed);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('warning');
    expect(found[0]!.message).toContain(EMAIL_BODY);
    expect(found[0]!.message).toContain('Body');
    expect(warnings(blankTemplate())).toEqual([]);
    expect(warnings(addSection(blankTemplate(), 'dndarea', null))).toEqual([]);
  });

  it('leaves the v1 standard email’s names alone, and says so in the checks', () => {
    // Its fields are the contract existing emails are bound to (learnings 1.10); renaming one is not ours to do.
    const { template } = importV1(fixture as never);
    expect(hubspotFields(template).some((f) => f.field === EMAIL_BODY)).toBe(false);
    expect(warnings(template)).toHaveLength(1);
  });
});
