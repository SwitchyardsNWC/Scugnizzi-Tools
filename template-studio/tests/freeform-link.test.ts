// A freeform block that follows a frame in the Freeform app.
//
// Defended: the block takes the frame's drawing and nothing that belongs to its place in the email, a
// block already showing the frame counts as current, and unlinking keeps the drawing.

import { describe, expect, it } from 'vitest';

import { risoStep } from '../src/model/effects.ts';
import { recipeHash } from '../src/model/freeform.ts';
import { FREEFORM_APP_FRAME, followFrame, isCurrent, linkedBlocks, readAppFrame, unlinkFrame } from '../src/model/freeform-link.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import type { FreeformBlock, Template } from '../src/model/types.ts';

const page = (over: Partial<FreeformBlock> = {}): FreeformBlock => ({
  id: 'f',
  type: 'freeform',
  alt: 'In the email',
  width: 560,
  height: 280,
  background: null,
  layers: [{ kind: 'text', id: 'l1', text: 'hello world', role: 'h2', color: null, x: 10, y: 10, width: 300, align: 'left' }],
  src: 'rendered/old.png',
  align: 'center',
  ...over,
});

const doc = (block: FreeformBlock, name = 'Email'): Template =>
  ({
    schema: SCHEMA_VERSION,
    id: 't',
    name,
    hubspotLabel: name,
    pageBackground: '#fff',
    forceLight: true,
    preview: { company: 'C', address: 'A', city: 'C', state: 'S', zip: 'Z' },
    sections: [{ id: 's', theme: 'cream', bandColor: null, containerColor: null, textColor: null, linkColor: null, padTop: 0, padBottom: 0, rows: [{ id: 'r', mobile: 'stack', columns: [{ id: 'c', span: 12, padTop: 0, padBottom: 0, align: 'left', blocks: [block] }] }] }],
  }) as unknown as Template;
const blockOf = (t: Template) => t.sections[0]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock;

const appFrame = () =>
  page({
    id: 'ff1',
    alt: 'Freeform',
    width: 700,
    height: 480,
    background: 'navy',
    layers: [{ kind: 'text', id: 'l1', text: 'Defend the club', role: 'h2', color: null, x: 0, y: 0, width: 400, align: 'left' }],
    effects: [risoStep(1, 3)],
    src: '',
  });

describe('following a frame in the Freeform app', () => {
  it('reads the frame the app keeps, and nothing from what it cannot read', () => {
    const frame = readAppFrame(JSON.stringify(doc(appFrame(), 'Freeform')));
    expect(frame).toMatchObject({ key: FREEFORM_APP_FRAME, name: 'Freeform', hash: recipeHash(appFrame()) });
    expect(readAppFrame(null)).toBeNull();
    expect(readAppFrame('not json')).toBeNull();
    expect(readAppFrame(JSON.stringify({ sections: [] }))).toBeNull();
  });

  it('takes the drawing and keeps what belongs to the email', () => {
    const frame = readAppFrame(JSON.stringify(doc(appFrame(), 'Freeform')))!;
    const linked = blockOf(followFrame(doc(page({ effects: [risoStep(0)] })), 'f', frame));
    expect(linked).toMatchObject({ id: 'f', alt: 'In the email', align: 'center', src: 'rendered/old.png', width: 700, height: 480, background: 'navy', source: { app: 'freeform', key: FREEFORM_APP_FRAME } });
    expect(linked.layers).toEqual(appFrame().layers);
    expect(linked.effects).toEqual(appFrame().effects);
    expect(isCurrent(linked, frame)).toBe(true);
    expect(linkedBlocks(doc(linked)).map((b) => b.id)).toEqual(['f']);
  });

  it('drops effects the frame no longer has, and notices when the frame moves on', () => {
    const withFx = readAppFrame(JSON.stringify(doc(appFrame(), 'Freeform')))!;
    const plain = readAppFrame(JSON.stringify(doc(page({ ...appFrame(), effects: undefined }), 'Freeform')))!;
    const linked = blockOf(followFrame(doc(page()), 'f', withFx));
    expect(isCurrent(linked, plain)).toBe(false);
    expect('effects' in blockOf(followFrame(doc(linked), 'f', plain))).toBe(false);
  });

  it('unlinks without losing the drawing', () => {
    const frame = readAppFrame(JSON.stringify(doc(appFrame(), 'Freeform')))!;
    const linked = followFrame(doc(page()), 'f', frame);
    const free = blockOf(unlinkFrame(linked, 'f'));
    expect('source' in free).toBe(false);
    expect(free.layers).toEqual(appFrame().layers);
    const already = doc(page());
    expect(unlinkFrame(already, 'f')).toBe(already);
  });
});

describe('a printed page on the email canvas', () => {
  it('swaps exactly that page’s drawing for its print, and leaves a page without effects drawn', async () => {
    const { compile } = await import('../src/compile/compile.ts');
    const { withPrints } = await import('../src/app/printed-preview.ts');
    const printed = page({ id: 'p', effects: [risoStep(0)] });
    const plain = page({ id: 'q', layers: [{ kind: 'rect', id: 'r1', x: 0, y: 0, width: 10, height: 10, fill: 'navy', stroke: null, strokeWidth: 0, radius: 0 }] });
    const t = doc(printed);
    t.sections[0]!.rows[0]!.columns[0]!.blocks.push(plain);
    const html = compile(t, { mode: 'preview' }).html;
    expect((html.match(/<svg[^>]*data-sy-freeform/g) ?? []).length).toBe(2);
    const shown = withPrints(html, t, { p: { url: 'blob:http://x/print' }, q: { url: 'blob:http://x/never' } });
    expect(shown).toContain('<img data-sy-freeform="" src="blob:http://x/print" width="560"');
    expect(shown).not.toContain('blob:http://x/never');
    expect((shown.match(/<svg[^>]*data-sy-freeform/g) ?? []).length).toBe(1);
    expect(withPrints(html, t, {})).toBe(html);
  });
});

describe('a linked print looks the same wherever the email puts it', () => {
  it('brings the ground the frame sits on in the app, only when it prints, and stays current', () => {
    const app = doc(page({ ...appFrame(), background: null }), 'Freeform');
    app.sections[0]!.containerColor = '#123456';
    const frame = readAppFrame(JSON.stringify(app))!;
    expect(frame.ground).toBe('#123456');
    const linked = blockOf(followFrame(doc(page()), 'f', frame));
    expect(linked.background).toBe('#123456');
    expect(isCurrent(linked, frame)).toBe(true);
    // Following again changes nothing, so a linked block can never loop on its own update.
    const t = followFrame(doc(page()), 'f', frame);
    expect(followFrame(t, 'f', frame)).toEqual(t);

    const plainApp = doc(page({ ...appFrame(), background: null, effects: undefined }), 'Freeform');
    plainApp.sections[0]!.containerColor = '#123456';
    const plain = readAppFrame(JSON.stringify(plainApp))!;
    const drawn = blockOf(followFrame(doc(page()), 'f', plain));
    expect(drawn.background).toBeNull();
    expect(isCurrent(drawn, plain)).toBe(true);
  });
});
