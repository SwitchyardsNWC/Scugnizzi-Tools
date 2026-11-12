// @vitest-environment jsdom
//
// A box around a Text block sits outside `.sy-rich` (learnings 3.104).
//
// `.sy-rich td { border:1px solid #d9d8d3; font-size:16px }` is for tables the team types, and HubSpot inlines it
// onto every match at send. A box's own table under a `sy-rich` cell picked it up: cards 1 and 3 of the card starter
// drew a grey hairline inside the ink border, and the copy's cell was 16px in a 13px system. The canvas showed it too.
//
// A DOM test rather than a string one, because the defect is a selector matching and only a parsed document says
// what matches. jsdom applies the `hs-inline-css` block the way a browser does, which is near enough to what
// HubSpot's inliner does with it at send.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import { cardTemplate } from '../src/model/starters.ts';
import type { Column, Template } from '../src/model/types.ts';

const HAIRLINE = 'rgb(217, 216, 211)';

/** The compiled email, loaded into the test's document so its stylesheets apply. */
function load(t: Template, mode: 'hubl' | 'preview' = 'preview'): Document {
  document.documentElement.innerHTML = compile(t, mode === 'hubl' ? { mode, date: '2026-11-11' } : { mode }).html;
  return document;
}

/** The tables `boxed()` draws (layout.ts), told apart by the style it gives them and nothing else does. */
const boxesIn = (doc: Document) =>
  [...doc.querySelectorAll('table')].filter((t) => (t.getAttribute('style') ?? '').startsWith('width:100%; border-collapse:separate'));

/** One Text block, locked so its words are in the markup, alone in a full-width column with the given box. */
function boxedCopy(html: string, box: Partial<Column>): Template {
  const t = theme(DEFAULT_DESIGN_SYSTEM, 'cream');
  return {
    schema: SCHEMA_VERSION,
    id: 'tpl',
    name: 'Box',
    hubspotLabel: 'Box',
    pageBackground: '#f7f6f3',
    forceLight: true,
    preview: { company: 'SWITCHYARDS U.S.A.', address: '151 Ted Turner Dr SE', city: 'Atlanta', state: 'GA', zip: '30303' },
    sections: [
      {
        id: 's1',
        theme: 'cream',
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
            columns: [
              { id: 'c', span: 12, padTop: 10, padBottom: 10, align: 'left', ...box, blocks: [{ id: 'p', type: 'richtext', lock: { editable: false, label: 'Copy', field: '' }, html, align: 'left' }] },
            ],
          },
        ],
      },
    ],
  };
}

describe('a box around a Text block sits outside `.sy-rich`', () => {
  for (const mode of ['hubl', 'preview'] as const) {
    it(`no box table in the card starter has a \`.sy-rich\` ancestor (${mode})`, () => {
      const doc = load(cardTemplate(), mode);
      const boxes = boxesIn(doc);
      // Three cards: two Text blocks on their own, and one Text block stacked over a button.
      expect(boxes).toHaveLength(3);
      for (const box of boxes) {
        expect(box.closest('.sy-rich')).toBeNull();
        const inside = getComputedStyle(box.querySelector('td')!);
        expect(inside.getPropertyValue('border-top')).not.toContain(HAIRLINE);
        expect(inside.fontSize).not.toBe('16px');
        // The words are still under `.sy-rich`, inside the box, so the inlined type scale reaches them.
        expect(box.querySelector('.sy-rich')).not.toBeNull();
      }
      // Nothing the starter's copy holds is a table, so any table under `.sy-rich` would be the compiler's.
      expect(doc.querySelectorAll('.sy-rich table')).toHaveLength(0);
    });
  }

  it('holds for a fill with no line, and for a system with text padding', () => {
    const card = cardTemplate();
    const cases = [boxedCopy('<p>Copy.</p>', { fill: 'white', borderPad: 12 }), { ...card, ds: { ...card.ds!, textPadX: 12, textPadY: 6 } }];
    for (const t of cases) {
      const doc = load(t);
      expect(boxesIn(doc).length).toBeGreaterThan(0);
      for (const box of boxesIn(doc)) expect(box.closest('.sy-rich')).toBeNull();
      expect(doc.querySelectorAll('.sy-rich table')).toHaveLength(0);
    }
  });

  it('still reaches a table the team typed', () => {
    const doc = load(boxedCopy('<table><tbody><tr><td>Typed</td></tr></tbody></table>', { borderWidth: 2, borderColor: 'navy', borderPad: 12 }));
    const typed = [...doc.querySelectorAll('.sy-rich td')].find((td) => td.textContent === 'Typed');
    expect(typed).toBeDefined();
    expect(getComputedStyle(typed!).getPropertyValue('border-top')).toContain(HAIRLINE);
  });
});
