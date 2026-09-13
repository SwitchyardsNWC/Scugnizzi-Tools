// Multi-column rows.
//
// The thing being defended against is a layout that only breaks in Outlook. Word's engine has no
// float, no flex and no inline-block worth relying on, so the div grid the single-column path uses
// only survives there inside an MSO conditional that rebuilds it as a table — two layouts that must
// agree, and the one nobody can see is the one that breaks. A row of columns is therefore a real
// table with one `<td>` each: the same markup everywhere, and stacking is a media query turning the
// cells into blocks, which is the oldest reliable trick in email.
//
// The other thing being defended: **a single-column row still takes the path it always took.** The
// golden file in `v1-parity.test.ts` is the proof, and the first test here says it directly.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { branchVariables } from '../src/compile/branches.ts';
import { DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import {
  addBlockToColumn,
  addSectionAt,
  duplicateBlock,
  moveBlockInto,
  moveBlockToColumn,
  moveBlockToSection,
  moveBlockWithin,
  removeBlock,
  setRowColumns,
} from '../src/model/edit.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import type { Align, Block, Column, MobileBehaviour, Template } from '../src/model/types.ts';

const lock = (label: string, field: string, editable = true) => ({ editable, label, field });

const heading = (id: string, text: string, field = ''): Block => ({
  id,
  type: 'heading',
  lock: lock('Headline', field, field !== ''),
  text,
  level: 'h2',
  align: 'left',
});

const column = (id: string, span: number, blocks: Block[], hideOnPhone = false): Column => ({
  id,
  span,
  padTop: 10,
  padBottom: 10,
  padLeft: 20,
  padRight: 20,
  align: 'left' as Align,
  ...(hideOnPhone ? { hideOnPhone: true } : {}),
  blocks,
});

/** One section, one row, however many columns. */
function rowOf(columns: Column[], mobile: MobileBehaviour = 'stack'): Template {
  const t = theme(DEFAULT_DESIGN_SYSTEM, 'cream');
  return {
    schema: SCHEMA_VERSION,
    id: 'tpl',
    name: 'Row',
    hubspotLabel: 'Row',
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
        rows: [{ id: 'r1', mobile, columns }],
      },
    ],
  };
}

const out = (template: Template) => compile(template, { mode: 'hubl', date: '2026-01-01' }).html;
const body = (html: string) => html.slice(html.indexOf('<div id="hs_cos_wrapper_main">'), html.indexOf('</div>\n</td></tr></tbody></table>'));

describe('a single column is unchanged', () => {
  it('does not become a table, and emits none of the column rules', () => {
    const html = out(rowOf([column('c1', 12, [heading('b1', 'Alone')])]));
    expect(html).not.toContain('class="sy-row');
    expect(html).not.toContain('sy-col');
    // The stacking rules cost bytes in every send, and a template with no columns should not carry
    // them — Gmail clips at ~102KB (learnings 2.12).
    expect(html).not.toContain('.sy-row-stack');
  });
});

describe('two columns', () => {
  const two = rowOf([column('c1', 6, [heading('b1', 'Left')]), column('c2', 6, [heading('b2', 'Right')])]);

  it('is one table row with one cell per column', () => {
    const html = body(out(two));
    expect(html).toContain('class="sy-row sy-row-stack"');
    expect((html.match(/class="sy-col"/g) ?? [])).toHaveLength(2);
    expect(html).toContain('Left');
    expect(html).toContain('Right');
  });

  it('states its width as an attribute as well as a style', () => {
    // Outlook honours the attribute and ignores a percentage width in CSS on a td; everything else
    // prefers the style. Saying both is the only way to get one layout.
    const html = body(out(two));
    expect(html).toContain('width="50%"');
    expect(html).toContain('width:50%');
  });

  it('holds one band between them rather than one each', () => {
    // The whole point of a row: two blocks that share a background instead of stacking two of them.
    expect((body(out(two)).match(/class="hse-section/g) ?? [])).toHaveLength(1);
  });

  it('follows the ratio', () => {
    const uneven = rowOf([column('c1', 8, [heading('b1', 'Wide')]), column('c2', 4, [heading('b2', 'Narrow')])]);
    const html = body(out(uneven));
    expect(html).toContain('width="66.67%"');
    expect(html).toContain('width="33.33%"');
  });

  it('emits the stacking rules exactly once, however many rows there are', () => {
    const many: Template = { ...two, sections: [two.sections[0]!, { ...two.sections[0]!, id: 's2' }] };
    expect((out(many).match(/\.sy-row-stack \.sy-col/g) ?? [])).toHaveLength(1);
  });
});

describe('what happens on a phone', () => {
  it('stacks by default', () => {
    const html = out(rowOf([column('c1', 6, [heading('b1', 'L')]), column('c2', 6, [heading('b2', 'R')])], 'stack'));
    expect(html).toContain('class="sy-row sy-row-stack"');
    expect(html).toContain('.sy-row-stack .sy-col { display:block !important');
  });

  it('stays side by side when asked', () => {
    const html = out(rowOf([column('c1', 6, [heading('b1', 'L')]), column('c2', 6, [heading('b2', 'R')])], 'side-by-side'));
    expect(html).toContain('class="sy-row"');
    expect(html).not.toContain('sy-row-stack"');
  });

  it('drops a column that asked to be dropped', () => {
    const html = out(
      rowOf([column('c1', 8, [heading('b1', 'Copy')]), column('c2', 4, [heading('b2', 'Decoration')], true)]),
    );
    expect(html).toContain('class="sy-col sy-col-hide"');
    expect(html).toContain('.sy-col-hide { display:none !important }');
  });
});

describe('fields inside columns', () => {
  const two = rowOf([
    column('c1', 6, [heading('b1', 'Left', 'left_head')]),
    column('c2', 6, [heading('b2', 'Right', 'right_head')]),
  ]);

  it('declares every field outside the table, never inside a cell', () => {
    // A declaration inside a cell is a declaration inside the conditional that collapses an empty
    // block — and a tag inside a false `{% if %}` never registers, so the field would vanish from
    // the Contents panel the moment someone cleared it (learnings 1.5).
    const html = out(two);
    const table = html.indexOf('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="sy-row');
    expect(html.indexOf('{% text "left_head"')).toBeLessThan(table);
    expect(html.indexOf('{% text "right_head"')).toBeLessThan(table);
    // Everything except the CAN-SPAM rule, which fires because this fixture is a bare row with no
    // legal footer in it — correct, and not what this test is about.
    const findings = errorsIn(lint({ ...compile(two, { mode: 'hubl' }), mode: 'hubl' })).filter(
      (f) => f.rule !== 'can-spam',
    );
    expect(findings).toEqual([]);
  });

  it('declares them left to right, which is the order the email is read in', () => {
    const html = out(two);
    expect(html.indexOf('left_head')).toBeLessThan(html.indexOf('right_head'));
  });

  it('collapses one empty column without disturbing the other', () => {
    const vars = branchVariables(compile(two, { mode: 'hubl' }).tree);
    expect(vars).toHaveLength(2);
    const onlyRight = compile(two, { mode: 'preview', branch: { left_head: false, right_head: true } }).html;
    expect(onlyRight).not.toContain('Left');
    expect(onlyRight).toContain('Right');
    // The column itself survives, holding its width — a grid that reflowed when one cell emptied
    // would move the other one under the reader's eye.
    expect((onlyRight.match(/class="sy-col"/g) ?? [])).toHaveLength(2);
  });
});

describe('blocks that cannot live in a column', () => {
  it('render nothing rather than half a navy band', () => {
    // The top bar, the stripes and the legal footer each draw their own full-width band, which is
    // the one thing a column cannot do. The editor does not offer them; this is the compiler
    // refusing to be asked.
    const stripes: Block = { id: 'b2', type: 'stripes', stripes: [{ color: '#d20000', height: 4 }] };
    const html = body(out(rowOf([column('c1', 6, [heading('b1', 'Copy')]), column('c2', 6, [stripes])])));
    expect(html).toContain('Copy');
    expect(html).not.toContain('#d20000');
  });
});

describe('changing the columns of a row', () => {
  const three = rowOf([
    column('c1', 4, [heading('b1', 'One')]),
    column('c2', 4, [heading('b2', 'Two')]),
    column('c3', 4, [heading('b3', 'Three')]),
  ]);

  it('moves orphaned blocks into the last surviving column rather than losing them', () => {
    // The failure mode worth designing against. Going from three columns to two has to put the
    // third one's blocks somewhere, and the only answer a designer forgives is "the last one left".
    const next = setRowColumns(three, 'r1', [6, 6]);
    const row = next.sections[0]!.rows[0]!;
    expect(row.columns).toHaveLength(2);
    expect(row.columns[1]!.blocks.map((b) => b.id)).toEqual(['b2', 'b3']);
  });

  it('inherits padding and alignment when a column is added', () => {
    const next = setRowColumns(rowOf([column('c1', 12, [heading('b1', 'One')])]), 'r1', [6, 6]);
    const row = next.sections[0]!.rows[0]!;
    expect(row.columns[1]!.padTop).toBe(row.columns[0]!.padTop);
    expect(row.columns[1]!.blocks).toEqual([]);
    expect(row.columns[1]!.id).not.toBe(row.columns[0]!.id);
  });

  it('keeps the ratio it was given', () => {
    const next = setRowColumns(three, 'r1', [6, 3, 3]);
    expect(next.sections[0]!.rows[0]!.columns.map((c) => c.span)).toEqual([6, 3, 3]);
  });

  it('moves one block between columns', () => {
    const next = moveBlockToColumn(three, 'b1', 2);
    const row = next.sections[0]!.rows[0]!;
    expect(row.columns[0]!.blocks).toEqual([]);
    expect(row.columns[2]!.blocks.map((b) => b.id)).toEqual(['b3', 'b1']);
  });

  it('does nothing when the block is already there', () => {
    expect(moveBlockToColumn(three, 'b1', 0).sections[0]!.rows[0]!.columns[0]!.blocks).toHaveLength(1);
  });
});

// --- block-level operations -----------------------------------------------------------------------
//
// These exist because of a usability report, not a design idea: once a row was split into columns,
// the blocks inside it could not be deleted. `removeSection` was the only delete in the app, the
// outline offered actions on sections, and the blocks nested under them had none. Every operation
// below is one a designer reaches for on a single block, wherever it happens to live.

describe('deleting one block', () => {
  const two = rowOf([column('c1', 6, [heading('b1', 'Left')]), column('c2', 6, [heading('b2', 'Right')])]);

  it('takes the block and leaves the row standing', () => {
    const next = removeBlock(two, 'b2');
    const row = next.sections[0]!.rows[0]!;
    expect(row.columns).toHaveLength(2);
    expect(row.columns[0]!.blocks.map((b) => b.id)).toEqual(['b1']);
    expect(row.columns[1]!.blocks).toEqual([]);
  });

  it('leaves an emptied row of columns standing, because somebody dropped it', () => {
    // A multi-column row is a layout, not a by-product. Emptying its last block should leave the
    // columns ready to be filled again rather than quietly deleting the thing you just placed.
    let next = removeBlock(two, 'b1');
    next = removeBlock(next, 'b2');
    expect(next.sections).toHaveLength(1);
    expect(next.sections[0]!.rows[0]!.columns).toHaveLength(2);
  });

  it('sweeps an emptied single-column section, which is only ever debris', () => {
    // The other way round: a full-width section with nothing in it renders as nothing and cannot be
    // selected, so keeping it would leave a row in the outline that does not correspond to anything.
    const one = rowOf([column('c1', 12, [heading('b1', 'Only')])]);
    expect(removeBlock(one, 'b1').sections).toEqual([]);
  });

  it('leaves a section alone while any column still holds something', () => {
    expect(removeBlock(two, 'b1').sections).toHaveLength(1);
  });
});

describe('duplicating one block', () => {
  it('lands directly below itself with a field name of its own', () => {
    // Two blocks sharing a HubSpot field name would collide in the Contents panel. The copy is a
    // new field to the team even though it looks the same to the designer.
    //
    // A lone block is duplicated as its section — a sibling band, the look ⌘D always had — since a
    // second block in the same column is a group now (learnings 3.59). Inside a row of columns the
    // copy joins the column, directly below.
    const one = rowOf([column('c1', 12, [heading('b1', 'Only', 'headline')])]);
    const next = duplicateBlock(one, 'b1');
    expect(next.sections).toHaveLength(2);
    const copy = next.sections[1]!.rows[0]!.columns[0]!.blocks[0]!;
    expect(copy.id).not.toBe('b1');
    expect('lock' in copy ? copy.lock.field : '').toBe('headline_2');

    const two = rowOf([column('c1', 6, [heading('b1', 'Left', 'left')]), column('c2', 6, [heading('b2', 'Right', 'right')])]);
    const blocks = duplicateBlock(two, 'b1').sections[0]!.rows[0]!.columns[0]!.blocks;
    expect(blocks).toHaveLength(2);
    expect('lock' in blocks[1]! ? blocks[1]!.lock.field : '').toBe('left_2');
  });
});

describe('moving a block', () => {
  const stack = rowOf([column('c1', 12, [heading('b1', 'One'), heading('b2', 'Two'), heading('b3', 'Three')])]);

  it('nudges within its own column', () => {
    const next = moveBlockWithin(stack, 'b1', 1);
    expect(next.sections[0]!.rows[0]!.columns[0]!.blocks.map((b) => b.id)).toEqual(['b2', 'b1', 'b3']);
  });

  it('refuses to nudge off either end rather than wrapping', () => {
    expect(moveBlockWithin(stack, 'b1', -1)).toBe(stack);
    expect(moveBlockWithin(stack, 'b3', 1)).toBe(stack);
  });

  it('corrects the index when it moves down inside its own column', () => {
    // The classic off-by-one: the target index was measured before the block was lifted out, so
    // moving a block one place down lands it exactly where it started and looks like nothing
    // happened at all.
    const next = moveBlockInto(stack, 'b1', 'c1', 2);
    expect(next.sections[0]!.rows[0]!.columns[0]!.blocks.map((b) => b.id)).toEqual(['b2', 'b1', 'b3']);
  });

  it('moves into another column', () => {
    const two = rowOf([column('c1', 6, [heading('b1', 'Left')]), column('c2', 6, [heading('b2', 'Right')])]);
    const next = moveBlockInto(two, 'b1', 'c2', 0);
    const row = next.sections[0]!.rows[0]!;
    expect(row.columns[0]!.blocks).toEqual([]);
    expect(row.columns[1]!.blocks.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('keeps the section a solo block already had, rather than rebuilding it', () => {
    // Rebuilding would mint a new section and silently reset the background, the padding and the
    // preset name somebody chose.
    const a = rowOf([column('c1', 12, [heading('b1', 'One')])]);
    const b = rowOf([column('c2', 12, [heading('b2', 'Two')])]);
    const both: Template = { ...a, sections: [a.sections[0]!, { ...b.sections[0]!, id: 's2', theme: 'navy' }] };
    const next = moveBlockToSection(both, 'b2', 0);
    expect(next.sections.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(next.sections[0]!.theme).toBe('navy');
  });

  it('extracts a block out of a column into a section that inherits its surroundings', () => {
    const two = rowOf([column('c1', 6, [heading('b1', 'Left')]), column('c2', 6, [heading('b2', 'Right')])]);
    const navy: Template = { ...two, sections: [{ ...two.sections[0]!, bandColor: '#011272', theme: 'navy' }] };
    const next = moveBlockToSection(navy, 'b2', 0);
    expect(next.sections).toHaveLength(2);
    // A block dragged out of a navy row should not land on cream and look broken for reasons
    // nobody asked for.
    expect(next.sections[0]!.bandColor).toBe('#011272');
    expect(next.sections[0]!.rows[0]!.columns[0]!.span).toBe(12);
    expect(next.sections[1]!.rows[0]!.columns[1]!.blocks).toEqual([]);
  });
});

describe('adding a block', () => {
  it('goes into a column at the position asked for', () => {
    const two = rowOf([column('c1', 6, [heading('b1', 'One'), heading('b2', 'Two')]), column('c2', 6, [])]);
    const next = addBlockToColumn(two, 'c1', 'button', 1);
    const blocks = next.sections[0]!.rows[0]!.columns[0]!.blocks;
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'button', 'heading']);
  });

  it('makes a full-width section of its own at an absolute position', () => {
    const one = rowOf([column('c1', 12, [heading('b1', 'One')])]);
    const next = addSectionAt(one, 'button', 0);
    expect(next.sections).toHaveLength(2);
    expect(next.sections[0]!.rows[0]!.columns[0]!.blocks[0]!.type).toBe('button');
    expect(next.sections[0]!.rows[0]!.columns[0]!.span).toBe(12);
  });
});
