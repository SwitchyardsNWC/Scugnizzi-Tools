// The brand block: a bundled mark drawn live in a colour, shipped as a picture.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { brandSvg } from '../src/compile/blocks/brand.ts';
import { lint } from '../src/compile/lint.ts';
import { DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import { renderAsImage } from '../src/model/edit.ts';
import { isRendered, markHash } from '../src/model/freeform.ts';
import { MARKS, markOf } from '../src/model/marks.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import type { BrandBlock, Template } from '../src/model/types.ts';

const mark = (over: Partial<BrandBlock> = {}): BrandBlock => ({ id: 'b', type: 'brand', mark: 'sy', alt: 'Switchyards', width: 120, align: 'center', color: null, src: '', ...over });

const doc = (block: BrandBlock, preset = 'cream'): Template => {
  const t = theme(DEFAULT_DESIGN_SYSTEM, preset);
  return {
    schema: SCHEMA_VERSION,
    id: 'tpl',
    name: 'Brand',
    hubspotLabel: 'Brand',
    pageBackground: '#f7f6f3',
    forceLight: true,
    preview: { company: 'SWITCHYARDS U.S.A.', address: '151 Ted Turner Dr SE', city: 'Atlanta', state: 'GA', zip: '30303' },
    sections: [
      {
        id: 's1',
        theme: preset,
        bandColor: t.band,
        containerColor: t.container,
        textColor: t.text,
        linkColor: t.link,
        padTop: 0,
        padBottom: 0,
        rows: [{ id: 'r1', mobile: 'stack', columns: [{ id: 'c1', span: 12, padTop: 10, padBottom: 10, align: 'left', blocks: [block] }] }],
      },
    ],
  };
};

describe('the marks', () => {
  it('are bundled, four of them, with no ids and no fills of their own', () => {
    expect(MARKS.map((m) => m.key)).toEqual(['sy', 'scgnzi', 'ica', 'nwca']);
    for (const m of MARKS) {
      expect(m.body).not.toMatch(/ id="/);
      expect(m.body).not.toMatch(/fill="/);
      expect(m.ratio).toBeGreaterThan(0.5);
    }
    expect(markOf('nothing').key).toBe('sy');
  });
});

describe('what the canvas shows and the email carries', () => {
  it('draws the mark at its width, in the section’s ink unless told otherwise', () => {
    const onCream = compile(doc(mark()), { mode: 'preview' }).html;
    expect(onCream).toContain('data-sy-brand="sy"');
    expect(onCream).toContain('width="120"');
    expect(onCream).toContain('fill="#011272"');
    const onNavy = compile(doc(mark(), 'navy'), { mode: 'preview' }).html;
    expect(onNavy).toContain('fill="#fcfff5"');
    expect(brandSvg(mark({ color: 'red' }), '#000000')).toContain('fill="#000000"');
    expect(compile(doc(mark({ color: 'red' })), { mode: 'preview' }).html).toContain('fill="#d10000"');
  });

  it('ships a picture, never the SVG', () => {
    const hubl = compile(doc(mark({ src: 'https://x.test/sy.png' })), { mode: 'hubl' }).html;
    expect(hubl).toContain('<img alt="Switchyards" src="https://x.test/sy.png"');
    expect(hubl).not.toContain('<svg');
  });

  it('is checked like any picture block: an error unrendered, a warning when stale', () => {
    const t = doc(mark());
    expect(lint({ ...compile(t, { mode: 'hubl' }), mode: 'hubl', template: t }).some((f) => f.rule === 'picture-render' && f.severity === 'error')).toBe(true);
    const rendered = renderAsImage(t, 'b', { src: 'https://x.test/sy.png', alt: 'Switchyards', width: 120 });
    const block = rendered.sections[0]!.rows[0]!.columns[0]!.blocks[0] as BrandBlock;
    expect(block.type).toBe('brand');
    expect(isRendered(block)).toBe(true);
    expect(lint({ ...compile(rendered, { mode: 'hubl' }), mode: 'hubl', template: rendered }).filter((f) => f.rule === 'picture-render')).toEqual([]);
    expect(markHash({ ...block, color: 'red' })).not.toBe(markHash(block));
  });
});
