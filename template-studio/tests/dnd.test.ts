// The drag and drop area.
//
// Everything here is one of HubSpot's four rules for an area in an email template, and each one
// fails in a way that is expensive to discover: a second area or a bad module path is rejected at
// upload, a container under 624px renders the area wider than the email around it, and `dnd_row`
// is accepted on a web page and silently wrong in email. None of that is visible without a send,
// so it is asserted here instead.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { lint, errorsIn } from '../src/compile/lint.ts';
import { DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import { DND_MIN_WIDTH, newDndArea } from '../src/model/dnd.ts';
import type { Align, Block, DndAreaBlock, Template } from '../src/model/types.ts';

const area = (over: Partial<DndAreaBlock> = {}): DndAreaBlock => ({
  id: 'a1',
  ...newDndArea('email_body'),
  ...over,
});

/** A template holding the given blocks, wide enough for an area unless told otherwise. */
function holding(blocks: Block[], containerWidth = DND_MIN_WIDTH): Template {
  const t = theme(DEFAULT_DESIGN_SYSTEM, 'cream');
  return {
    schema: SCHEMA_VERSION,
    id: 'tpl',
    name: 'Area',
    hubspotLabel: 'Area',
    pageBackground: '#f7f6f3',
    forceLight: true,
    ds: { ...DEFAULT_DESIGN_SYSTEM, containerWidth },
    preview: { company: 'SWITCHYARDS U.S.A.', address: '151 Ted Turner Dr SE', city: 'Atlanta', state: 'GA', zip: '30303' },
    sections: [
      {
        id: 's1',
        bandColor: t.band,
        containerColor: t.container,
        textColor: t.text,
        linkColor: t.link,
        padTop: 0,
        padBottom: 0,
        rows: [
          {
            id: 'r1',
            mobile: 'stack',
            columns: [{ id: 'c1', span: 12, padTop: 10, padBottom: 10, padLeft: 20, padRight: 20, align: 'left' as Align, blocks }],
          },
        ],
      },
    ],
  };
}

const hubl = (t: Template) => compile(t, { mode: 'hubl', date: '2026-01-01' }).html;
const preview = (t: Template) => compile(t, { mode: 'preview' }).html;
const rules = (t: Template, mode: 'hubl' | 'preview' = 'hubl') => {
  const out = compile(t, { mode, date: '2026-01-01' });
  return lint({ ...out, mode, template: t }).map((f) => f.rule);
};

describe('the tags it emits', () => {
  it('nests area, section, column, module, and closes each one', () => {
    const html = hubl(holding([area()]));
    const order = [...html.matchAll(/\{%\s*(end_)?dnd_(area|section|column|module)/g)].map(
      (m) => `${m[1] ?? ''}dnd_${m[2]}`,
    );
    expect(order).toEqual([
      'dnd_area',
      'dnd_section',
      'dnd_column',
      'dnd_module',
      'end_dnd_module',
      'end_dnd_column',
      'end_dnd_section',
      'end_dnd_area',
    ]);
  });

  it('never emits dnd_row, which HubSpot supports on pages and not in email', () => {
    const wide = area({
      sections: [
        {
          id: 's',
          background: null,
          padTop: 10,
          padBottom: 10,
          columns: [
            { id: 'c1', width: 6, modules: [{ id: 'm1', path: '@hubspot/email_body', label: 'Left', params: [] }] },
            { id: 'c2', width: 6, modules: [{ id: 'm2', path: '@hubspot/email_body', label: 'Right', params: [] }] },
          ],
        },
      ],
    });
    expect(hubl(holding([wide]))).not.toContain('dnd_row');
    expect(preview(holding([wide]))).not.toContain('dnd_row');
  });

  it('names the area by its identifier and labels it separately', () => {
    // The name is what HubSpot stores the team's arrangement against, so the two must not be the
    // same value wearing two hats (learnings 1.10).
    const html = hubl(holding([area({ name: 'email_body', label: 'Write your email here' })]));
    expect(html).toContain('{% dnd_area "email_body", label="Write your email here" %}');
  });

  it('keeps HubL out of the canvas and markup out of the file', () => {
    const t = holding([area()]);
    expect(preview(t)).not.toContain('dnd_area');
    expect(hubl(t)).not.toContain('the team lays this out');
  });
});

describe('the stylesheet HubSpot requires', () => {
  it('goes in the head of a template that has an area', () => {
    const html = hubl(holding([area()]));
    expect(html).toContain('{{ dnd_area_stylesheet }}');
    expect(html).toContain('{{ email_header_includes }}');
  });

  it('stays out of a template that has none', () => {
    const plain = holding([{ id: 's', type: 'spacer', height: 24 }]);
    expect(hubl(plain)).not.toContain('dnd_area_stylesheet');
    expect(hubl(plain)).not.toContain('email_header_includes');
  });

  it('stays out of the canvas, where the HubL would be text nobody asked for', () => {
    expect(preview(holding([area()]))).not.toContain('dnd_area_stylesheet');
  });
});

describe('the rules that cannot be broken', () => {
  it('rejects a second area, because HubSpot allows one', () => {
    const two = holding([area({ id: 'a1' }), area({ id: 'a2', name: 'email_body_2' })]);
    expect(rules(two)).toContain('dnd-area-count');
    expect(errorsIn(lint({ ...compile(two, { mode: 'hubl' }), mode: 'hubl', template: two })).length).toBeGreaterThan(0);
  });

  it('accepts exactly one', () => {
    expect(rules(holding([area()]))).not.toContain('dnd-area-count');
  });

  it('rejects a container narrower than HubSpot’s floor', () => {
    expect(rules(holding([area()], 600))).toContain('dnd-container-width');
    expect(rules(holding([area()], DND_MIN_WIDTH))).not.toContain('dnd-container-width');
    expect(rules(holding([area()], 700))).not.toContain('dnd-container-width');
  });

  it('leaves a narrow template alone when it has no area', () => {
    expect(rules(holding([{ id: 's', type: 'spacer', height: 24 }], 600))).not.toContain('dnd-container-width');
  });

  it('warns about a module path it does not recognise', () => {
    const typo = area({
      sections: [
        {
          id: 's',
          background: null,
          padTop: 0,
          padBottom: 0,
          columns: [{ id: 'c', width: 12, modules: [{ id: 'm', path: '@hubspot/emial_body', label: 'Body', params: [] }] }],
        },
      ],
    });
    expect(rules(holding([typo]))).toContain('dnd-module-path');
  });

  it('warns about an area the team would open to nothing', () => {
    expect(rules(holding([area({ sections: [] })]))).toContain('dnd-empty-area');
    expect(rules(holding([area()]))).not.toContain('dnd-empty-area');
  });

  it('compiles a well-formed one clean', () => {
    // Of its own findings. The fixture is one block in one section and has no legal footer, so
    // `can-spam` fires and should — asserting on every rule would make this test about that one.
    const t = holding([area()]);
    const found = errorsIn(lint({ ...compile(t, { mode: 'hubl' }), mode: 'hubl', template: t }));
    expect(found.filter((f) => f.rule.startsWith('dnd-'))).toEqual([]);
  });
});
