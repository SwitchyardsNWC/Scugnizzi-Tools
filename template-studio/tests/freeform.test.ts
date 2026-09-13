// The freeform block: a recipe of layers the canvas draws live and the email carries as a picture.
//
// Two things are defended. The drawing is a pure function of the recipe and the design system, so
// the export "creates that image exactly". And the file never carries the drawing — only an
// `<img>` — with the checks saying so when the picture is missing or older than the recipe.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { canvasTypeSampleSvg, freeformSvg } from '../src/compile/freeform.ts';
import { lint } from '../src/compile/lint.ts';
import { canvasTypeOf, DEFAULT_CANVAS_TYPE, DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import { convertBlock, renderAsImage } from '../src/model/edit.ts';
import {
  addLayer,
  addMarkAt,
  addShapeAt,
  addStickyAt,
  drawPath,
  duplicateGroup,
  groupBox,
  groupKey,
  groupOfKey,
  groupRuns,
  isRendered,
  layerClipText,
  markRendered,
  membersOf,
  nudgeLayer,
  paintGroup,
  paintLayer,
  parseLayerClip,
  pasteLayers,
  recipeHash,
  removeGroup,
  removeLayer,
  reorderLayer,
  replaceLayers,
  scaleLayers,
  STICKY_COLORS,
  ungroupLayers,
  updateLayer,
} from '../src/model/freeform.ts';
import { markOf } from '../src/model/marks.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import type { FreeformBlock, Template } from '../src/model/types.ts';

const surface = (over: Partial<FreeformBlock> = {}): FreeformBlock => ({
  id: 'f',
  type: 'freeform',
  alt: 'A card',
  width: 400,
  height: 200,
  background: 'offwhite',
  layers: [
    { kind: 'rect', id: 'l1', x: 10, y: 10, width: 380, height: 180, fill: null, stroke: 'navy', strokeWidth: 2, radius: 6 },
    { kind: 'text', id: 'l2', text: 'Hello\nthere', role: 'h2', color: 'red', x: 30, y: 30, width: 300, align: 'left' },
    { kind: 'line', id: 'l3', x1: 30, y1: 150, x2: 370, y2: 150, stroke: null, strokeWidth: 3 },
    { kind: 'ellipse', id: 'l4', x: 300, y: 100, width: 40, height: 40, fill: 'red', stroke: null, strokeWidth: 0 },
    { kind: 'image', id: 'l5', src: 'hero.png', x: 200, y: 20, width: 100, height: 60, opacity: 0.5 },
    { kind: 'path', id: 'l6', points: [10, 10, 20, 30, 40, 35], stroke: 'navy', strokeWidth: 4 },
  ],
  src: '',
  align: 'center',
  ...over,
});

const doc = (block: FreeformBlock): Template => {
  const t = theme(DEFAULT_DESIGN_SYSTEM, 'cream');
  return {
    schema: SCHEMA_VERSION,
    id: 'tpl',
    name: 'Freeform',
    hubspotLabel: 'Freeform',
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
        rows: [{ id: 'r1', mobile: 'stack', columns: [{ id: 'c1', span: 12, padTop: 10, padBottom: 10, align: 'left', blocks: [block] }] }],
      },
    ],
  };
};

const block = (t: Template) => t.sections[0]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock;

describe('drawing the recipe', () => {
  it('is one SVG with every layer marked, in order, bottom to top', () => {
    const svg = freeformSvg(surface(), DEFAULT_DESIGN_SYSTEM);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" data-sy-freeform="" width="400" height="200"')).toBe(true);
    for (const id of ['l1', 'l2', 'l3', 'l4', 'l5', 'l6']) expect(svg).toContain(`data-sy-layer="${id}"`);
    expect(svg.indexOf('data-sy-layer="l1"')).toBeLessThan(svg.indexOf('data-sy-layer="l6"'));
    // The background first, resolved from the palette.
    expect(svg).toContain('<rect x="0" y="0" width="400" height="200" fill="#fcfff5"/>');
  });

  it('sets text in its type role, resolved from the design system, and wraps it', () => {
    const svg = freeformSvg(surface(), DEFAULT_DESIGN_SYSTEM);
    expect(svg).toContain('<foreignObject data-sy-layer="l2"');
    expect(svg).toContain('font-size:22px; line-height:125%; font-weight:bold; color:#d10000; text-align:left');
    expect(svg).toContain('Hello<br/>there');
  });

  it('gives a shape with no fill and no outline an outline, so it can be seen', () => {
    const bare = surface({ layers: [{ kind: 'rect', id: 'l1', x: 0, y: 0, width: 10, height: 10, fill: null, stroke: null, strokeWidth: 2, radius: 0 }] });
    expect(freeformSvg(bare, DEFAULT_DESIGN_SYSTEM)).toContain('fill="none" stroke="#011272" stroke-width="2" pointer-events="all"');
  });

  it('is the same drawing every time for the same recipe', () => {
    expect(freeformSvg(surface(), DEFAULT_DESIGN_SYSTEM)).toBe(freeformSvg(surface(), DEFAULT_DESIGN_SYSTEM));
    expect(recipeHash(surface())).toBe(recipeHash(surface()));
    expect(recipeHash(surface())).not.toBe(recipeHash(surface({ height: 201 })));
  });
});

describe('what the email carries', () => {
  it('draws the recipe on the canvas and ships a picture in the file', () => {
    const rendered = surface({ src: 'https://x.test/card.png' });
    const preview = compile(doc(rendered), { mode: 'preview' }).html;
    const hubl = compile(doc(rendered), { mode: 'hubl' }).html;
    expect(preview).toContain('<svg xmlns="http://www.w3.org/2000/svg" data-sy-freeform=""');
    expect(preview).not.toContain('card.png');
    expect(hubl).toContain('<img alt="A card" src="https://x.test/card.png"');
    expect(hubl).toContain('width="400"');
    expect(hubl).not.toContain('<svg');
    expect(hubl).not.toContain('data-sy-layer');
  });

  it('refuses a file with no picture, and warns about one older than the recipe', () => {
    const never = compile(doc(surface()), { mode: 'hubl' });
    const findings = lint({ ...never, mode: 'hubl', template: doc(surface()) });
    expect(findings.some((f) => f.rule === 'picture-render' && f.severity === 'error')).toBe(true);

    const current = block(markRendered(doc(surface()), 'f', 'https://x.test/card.png'));
    expect(isRendered(current)).toBe(true);
    const ok = compile(doc(current), { mode: 'hubl' });
    expect(lint({ ...ok, mode: 'hubl', template: doc(current) }).filter((f) => f.rule === 'picture-render')).toEqual([]);

    const stale = block(updateLayer(doc(current), 'f', 'l2', { text: 'Changed' }));
    expect(isRendered(stale)).toBe(false);
    const warned = lint({ ...compile(doc(stale), { mode: 'hubl' }), mode: 'hubl', template: doc(stale) });
    expect(warned.some((f) => f.rule === 'picture-render' && f.severity === 'warning')).toBe(true);
  });

  it('takes the render path every picture takes, keeping the recipe', () => {
    const next = block(renderAsImage(doc(surface()), 'f', { src: 'assets/rendered/card.png', alt: 'A card', width: 400 }));
    expect(next.type).toBe('freeform');
    expect(next.src).toBe('assets/rendered/card.png');
    expect(next.layers).toHaveLength(6);
    expect(isRendered(next)).toBe(true);
  });
});

describe('changing the recipe', () => {
  it('adds, moves, reorders and removes layers', () => {
    let t = addLayer(doc(surface()), 'f', 'rect');
    expect(block(t).layers).toHaveLength(7);
    expect(block(t).layers[6]!.id).toBe('l7');
    t = nudgeLayer(t, 'f', 'l3', 5, -5);
    const line = block(t).layers.find((l) => l.id === 'l3');
    expect(line?.kind === 'line' && [line.x1, line.y1, line.x2, line.y2]).toEqual([35, 145, 375, 145]);
    t = nudgeLayer(t, 'f', 'l6', 1, 1);
    const path = block(t).layers.find((l) => l.id === 'l6');
    expect(path?.kind === 'path' && path.points).toEqual([11, 11, 21, 31, 41, 36]);
    t = reorderLayer(t, 'f', 'l1', 1);
    expect(block(t).layers.map((l) => l.id).slice(0, 2)).toEqual(['l2', 'l1']);
    t = removeLayer(t, 'f', 'l5');
    expect(block(t).layers.some((l) => l.id === 'l5')).toBe(false);
  });

  it('turns a stroke into a layer, and a single point into nothing', () => {
    const t = drawPath(doc(surface()), 'f', [1, 1, 2, 2, 3, 3.33333], 'navy', 3);
    const drawn = block(t).layers[6];
    expect(drawn?.kind === 'path' && drawn.points).toEqual([1, 1, 2, 2, 3, 3.3]);
    const one = doc(surface());
    expect(drawPath(one, 'f', [1, 1], 'navy', 3)).toBe(one);
  });

  it('can share a cell, and converts like any block that can', () => {
    const t = doc(surface());
    const asHeading = convertBlock(t, 'f', 'heading').sections[0]!.rows[0]!.columns[0]!.blocks[0]!;
    expect(asHeading.type).toBe('heading');
    expect(asHeading.type === 'heading' && asHeading.text).toBe('A card');
  });
});

describe('sticky notes, stamps and colour', () => {
  const board = () => doc(surface({ layers: [] }));

  it('draws a note with its words and a stamp in its colour, tilted', () => {
    let t = addStickyAt(board(), 'f', { x: 100, y: 100 }, null);
    t = addMarkAt(t, 'f', 'scgnzi', { x: 300, y: 100 }, 'red', 6);
    t = updateLayer(t, 'f', 'l1', { text: 'Hi' });
    const b = block(t);
    expect(b.layers.map((l) => l.kind)).toEqual(['sticky', 'mark']);
    const note = b.layers[0]!;
    expect(note.kind === 'sticky' && [note.x, note.y, note.width, note.height]).toEqual([10, 10, 180, 180]);
    const stamp = b.layers[1]!;
    expect(stamp.kind === 'mark' && [stamp.width, stamp.height, stamp.rotation]).toEqual([88, Math.round(88 / markOf('scgnzi').ratio), 6]);
    const svg = freeformSvg(b, DEFAULT_DESIGN_SYSTEM);
    expect(svg).toContain('fill="#FFE58A"');
    expect(svg).toContain('>Hi</div>');
    // Stated, not inherited: the email's cell centres its content, and the canvas does not.
    expect(svg).toMatch(/text-align:left; text-transform:none; letter-spacing:normal; font-style:normal[^"]*">Hi<\/div>/);
    expect(svg).toContain(`viewBox="${markOf('scgnzi').viewBox}"`);
    expect(svg).toContain('fill="#d10000"');
    expect(svg).toMatch(/data-sy-layer="l2" transform="rotate\(6 /);
  });

  it('paints whichever property a kind is coloured by', () => {
    let t = addShapeAt(board(), 'f', 'rect', { x: 0, y: 0 }, { x: 40, y: 40 }, 'navy');
    t = addShapeAt(t, 'f', 'line', { x: 0, y: 0 }, { x: 40, y: 40 }, 'navy');
    t = addStickyAt(t, 'f', { x: 0, y: 0 }, '#C4E4FF');
    expect(block(t).layers[0]!.kind === 'rect' && (block(t).layers[0] as { fill: string }).fill).toBe('navy');
    t = paintLayer(t, 'f', 'l1', 'red');
    t = paintLayer(t, 'f', 'l2', 'red');
    t = paintLayer(t, 'f', 'l3', null);
    const [r, l, s] = block(t).layers;
    expect(r?.kind === 'rect' && r.fill).toBe('red');
    expect(l?.kind === 'line' && l.stroke).toBe('red');
    expect(s?.kind === 'sticky' && s.fill).toBe(STICKY_COLORS[0]);
  });
});

describe('drawings group themselves', () => {
  const board = () => doc(surface({ layers: [] }));
  const strokes = () => {
    let t = drawPath(board(), 'f', [0, 0, 10, 10], 'navy', 3, 'g1');
    t = drawPath(t, 'f', [20, 0, 30, 10], 'navy', 3, 'g1');
    return drawPath(t, 'f', [0, 40, 40, 40], 'navy', 3);
  };

  it('lists a drawing as one item, and a lone stroke as a layer', () => {
    const items = groupRuns(block(strokes()).layers);
    expect(items.map((i) => (i.kind === 'group' ? `group of ${i.layers.length}` : i.layer.id))).toEqual(['group of 2', 'l3']);
    expect(groupOfKey(groupKey('g1'))).toBe('g1');
    expect(groupOfKey('l1')).toBeNull();
  });

  it('moves, scales, copies, colours and removes a drawing as one', () => {
    const t = strokes();
    const members = membersOf(block(t), 'g1');
    expect(groupBox(members)).toEqual({ x: 0, y: 0, width: 30, height: 10 });
    const scaled = block(replaceLayers(t, 'f', scaleLayers(members, groupBox(members), { x: 100, y: 100, width: 60, height: 20 })));
    expect(groupBox(membersOf(scaled, 'g1'))).toEqual({ x: 100, y: 100, width: 60, height: 20 });
    const copied = block(duplicateGroup(t, 'f', 'g1'));
    expect(copied.layers).toHaveLength(5);
    expect(new Set(copied.layers.map((l) => l.group).filter(Boolean))).toEqual(new Set(['g1', 'g2']));
    expect(block(removeGroup(t, 'f', 'g1')).layers.map((l) => l.id)).toEqual(['l3']);
    expect(block(ungroupLayers(t, 'f', 'g1')).layers.every((l) => !l.group)).toBe(true);
    expect(membersOf(block(paintGroup(t, 'f', 'g1', 'red')), 'g1').every((l) => l.kind === 'path' && l.stroke === 'red')).toBe(true);
  });

  it('copies layers as clipboard text of its own, and pastes them with new ids and a new group', () => {
    const t = strokes();
    const layers = parseLayerClip(layerClipText(membersOf(block(t), 'g1')))!;
    expect(layers).toHaveLength(2);
    expect(parseLayerClip('{"template-studio":1,"kind":"blocks"}')).toBeNull();
    expect(parseLayerClip('hello')).toBeNull();
    const pasted = block(pasteLayers(t, 'f', layers, 24));
    const fresh = pasted.layers.slice(3);
    expect(fresh.map((l) => l.id)).toEqual(['l4', 'l5']);
    expect(new Set(fresh.map((l) => l.group))).toEqual(new Set(['g2']));
    expect(fresh[0]!.kind === 'path' && fresh[0]!.points).toEqual([24, 24, 34, 34]);
  });
});

describe('canvas type', () => {
  const withLook = (look?: string) =>
    surface({ layers: [{ kind: 'text', id: 't', text: 'Hey', role: 'h2', color: null, x: 10, y: 10, width: 300, align: 'center', ...(look ? { look } : {}) }] });
  const svgOf = (look?: string) => freeformSvg(withLook(look), DEFAULT_DESIGN_SYSTEM);

  it('falls back to the shipped styles for a system that has none', () => {
    expect(Object.keys(canvasTypeOf(DEFAULT_DESIGN_SYSTEM))).toEqual(Object.keys(DEFAULT_CANVAS_TYPE));
  });

  it('draws each effect as something the picture carries', () => {
    expect(svgOf()).not.toContain('text-shadow');
    expect(svgOf('outline')).toContain('-webkit-text-stroke:');
    expect(svgOf('retro')).toContain('text-shadow:');
    expect((svgOf('sticker').match(/px 0 #ffffff/g) ?? []).length).toBe(16);
    expect(svgOf('highlight')).toContain('linear-gradient(transparent');
    expect((svgOf('marker').match(/display:inline-block/g) ?? []).length).toBe(3);
    expect(svgOf('arc')).toMatch(/<textPath href="#sy-arc-t-10-10-300" startOffset="50%" text-anchor="middle">HEY<\/textPath>/);
  });

  it('wobbles the same way every time, and a changed style is a stale picture', () => {
    expect(svgOf('marker')).toBe(svgOf('marker'));
    expect(recipeHash(withLook('outline'))).not.toBe(recipeHash(withLook('retro')));
  });

  it('samples a style with the same renderer', () => {
    expect(canvasTypeSampleSvg(DEFAULT_DESIGN_SYSTEM, 'retro', 'Aa')).toContain('text-shadow:');
    expect(canvasTypeSampleSvg(DEFAULT_DESIGN_SYSTEM, null, 'Aa')).toContain('>Aa</div>');
  });
});

