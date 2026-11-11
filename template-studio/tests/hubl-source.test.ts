// Reading a coded template's source, whoever wrote it (model/hubl-source.ts, learnings 1.19).
//
// *2026-11-11.* Jared: "Create an artifact of the template studio to run in Claude that works directly with hubspot
// to manage templates." The HubSpot desk reads templates back from HubSpot, most of which this build did not compile.
//
// Defended: the tokenizer reads quoted defaults whole, so `%}` or `{{` inside a value neither closes nor opens a tag;
// the field list is the compiler's own declarations, in panel order, for every fixture and for version one's export;
// the maker and the date come from the generated-by comment; the checks pass a clean export and name what a broken
// one lacks; drawn from its defaults, a template is the compiler's own preview; pictures become labelled boxes.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { completeDesignSystem, type DesignSystem } from '../src/model/design-system.ts';
import { materialiseFolderSystem } from '../src/model/edit.ts';
import { annotationOf, boxPictures, evaluate, makerOf, parseStatement, PLACEHOLDER_PREVIEW, renderDefaults, sourceChecks, sourceFields, tokenize } from '../src/model/hubl-source.ts';
import { migrate } from '../src/model/schema.ts';
import type { Template } from '../src/model/types.ts';
import { declaredFields } from './structure.ts';

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const read = (p: string) => readFileSync(at(p), 'utf8');
const systems: Record<string, DesignSystem> = {
  switchyards: completeDesignSystem(JSON.parse(read('design-systems/switchyards.system.json'))),
  card: completeDesignSystem(JSON.parse(read('design-systems/card.system.json'))),
};
const opened = (file: string): Template => materialiseFolderSystem(migrate(JSON.parse(read(`templates/${file}`))), systems).template;
const FIXTURES = ['standard-email.template.json', 'card-email.template.json', 'baseline.template.json'];
const hubl = (t: Template, embedDesign = false) => compile(t, { mode: 'hubl', date: '2026-11-11', embedDesign }).html;

describe('the tokenizer', () => {
  it('reads a quoted default whole, whatever it holds', () => {
    const src = `<p>{% text "a" label="A", value='It’s %} and {{ x }} and {# not' %}</p>{{ widget_data.a.value }}{# c #}`;
    const tokens = tokenize(src);
    expect(tokens.map((t) => t.t)).toEqual(['html', 'stmt', 'html', 'expr', 'comment']);
    expect(parseStatement(tokens[1]!.text).args['value']).toBe('It’s %} and {{ x }} and {# not');
  });

  it('leaves single braces and unclosed tags as markup', () => {
    expect(tokenize('a{b}c {% unclosed').map((t) => t.t)).toEqual(['html']);
    expect(tokenize('@media{.x{width:100%}}').map((t) => t.t)).toEqual(['html']);
  });

  it('parses each argument shape the compiler writes', () => {
    const st = parseStatement(`module "hero" path="@hubspot/image_email", label="It&quot;s", alignment="center", img={ "src": "https://x/y.png", "alt": "", "width": 560 }, link="https://y.com/", export_to_template_context=True`);
    expect(st).toMatchObject({ tag: 'module', name: 'hero', args: { path: '@hubspot/image_email', label: 'It"s', img: { src: 'https://x/y.png', width: 560 }, link: 'https://y.com/', export_to_template_context: true } });
    expect(parseStatement(`dnd_section padding={'top':'20'}, full_width=False`).args).toMatchObject({ padding: { top: '20' }, full_width: false });
  });
});

describe('the field list', () => {
  it('is the compiler’s own declarations, in panel order', () => {
    for (const file of FIXTURES) {
      const html = hubl(opened(file));
      const theirs = declaredFields(html).map((f) => f.name);
      const ours = sourceFields(html).filter((f) => f.name !== 'preview_text' && f.tag !== 'dnd_area').map((f) => f.name);
      expect(ours).toEqual(theirs);
    }
  });

  it('is unchanged by the embedded design', () => {
    for (const file of FIXTURES) expect(sourceFields(hubl(opened(file), true))).toEqual(sourceFields(hubl(opened(file))));
  });

  it('names kinds, labels and defaults the way the panel shows them', () => {
    const fields = sourceFields(hubl(opened(FIXTURES[0]!)));
    const kinds = new Set(fields.map((f) => f.kind));
    expect(kinds).toContain('text');
    expect(kinds).toContain('rich text');
    expect(kinds).toContain('image');
    const image = fields.find((f) => f.kind === 'image');
    expect(image?.path).toBe('@hubspot/image_email');
    expect(fields.every((f) => f.label.length > 0)).toBe(true);
  });

  it('reads version one’s export too', () => {
    const v1 = read('reference/v1-export-regenerated.html');
    const ours = sourceFields(v1).filter((f) => f.name !== 'preview_text').map((f) => f.name);
    expect(ours).toEqual(declaredFields(v1).map((f) => f.name));
    expect(makerOf(v1)).toEqual({ maker: 'template-builder', date: '2026-09-11' });
  });
});

describe('the header and the maker', () => {
  it('reads the annotation HubSpot requires, and whether it comes first', () => {
    const html = hubl(opened(FIXTURES[0]!));
    expect(annotationOf(html)).toEqual({ templateType: 'email', available: true, label: 'Switchyards Standard Email', first: true });
    expect(annotationOf(`<p></p>${html}`)?.first).toBe(false);
    expect(annotationOf('<html></html>')).toBeNull();
  });

  it('knows Template Studio’s files by their generated-by comment', () => {
    expect(makerOf(hubl(opened(FIXTURES[0]!)))).toEqual({ maker: 'template-studio', date: '2026-11-11' });
    expect(makerOf('<html></html>')).toEqual({ maker: 'other', date: null });
  });
});

describe('the checks', () => {
  it('pass every fixture', () => {
    for (const file of FIXTURES) {
      const states = sourceChecks(hubl(opened(file), true)).map((c) => `${c.id}:${c.state}`);
      expect(states).toEqual(['annotation:pass', 'unsubscribe:pass', 'address:pass', 'size:pass', 'pictures:pass', 'design:pass']);
    }
  });

  it('say there is no design inside a file exported before it travelled', () => {
    const design = sourceChecks(hubl(opened(FIXTURES[0]!))).find((c) => c.id === 'design');
    expect(design?.state).toBe('info');
  });

  it('name what a broken template lacks', () => {
    const html = hubl(opened(FIXTURES[0]!))
      .replace(/\{\{ unsubscribe_link(_all)? \}\}/g, '#')
      .replace(/site_settings\.company_zip/g, 'nothing')
      .replace(/^<!--[\s\S]*?-->\n/, '');
    const failed = sourceChecks(html).filter((c) => c.state === 'fail').map((c) => c.id);
    expect(failed).toEqual(['annotation', 'unsubscribe', 'address']);
    expect(sourceChecks(html).find((c) => c.id === 'address')?.detail).toContain('company_zip');
  });

  it('measure size without the embedded design, as Gmail sees it', () => {
    const plain = sourceChecks(hubl(opened(FIXTURES[2]!))).find((c) => c.id === 'size');
    const embedded = sourceChecks(hubl(opened(FIXTURES[2]!), true)).find((c) => c.id === 'size');
    expect(embedded?.title).toBe(plain?.title);
  });

  it('warn on a picture with no address', () => {
    const t = structuredClone(opened(FIXTURES[2]!));
    const image = t.sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))).find((b) => b.type === 'image');
    if (!image || image.type !== 'image') throw new Error('baseline has an image');
    image.src = 'photos/hero.png';
    const pictures = sourceChecks(hubl(t)).find((c) => c.id === 'pictures');
    expect(pictures?.state).toBe('warn');
    expect(pictures?.detail).toContain('photos/hero.png');
  });
});

describe('drawing a template from its defaults', () => {
  it('is the compiler’s own preview, for every template that has no drawn pictures', () => {
    for (const file of FIXTURES.slice(0, 2)) {
      const t = opened(file);
      const drawn = renderDefaults(hubl(t), { preview: t.preview, subject: t.name });
      expect(drawn.trim()).toBe(compile(t, { mode: 'preview' }).html.trim());
    }
  });

  it('draws the same whether or not the design is inside', () => {
    const t = opened(FIXTURES[0]!);
    const sample = { preview: t.preview, subject: t.name };
    expect(renderDefaults(hubl(t, true), sample)).toBe(renderDefaults(hubl(t), sample));
  });

  it('takes the branches HubL takes, and fills HubSpot’s own variables', () => {
    const scope = { data: { a: { value: '  ' }, b: { html: '<p>x</p>' } }, vars: {}, sample: { preview: PLACEHOLDER_PREVIEW, subject: 'S' } };
    expect(evaluate('widget_data.a.value|trim', scope)).toBe('');
    expect(evaluate('widget_data.b.html', scope)).toBe('<p>x</p>');
    expect(evaluate('(site_settings.company_city ~ ", " ~ site_settings.company_state)|urlencode', scope)).toBe('City%2C%20ST');
    expect(evaluate("personalization_token('contact.firstname', 'there')", scope)).toBe('there');
    expect(evaluate('widget_data.missing.value or 560', scope)).toBe(560);
    expect(evaluate('not widget_data.a.value|trim and widget_data.b.html', scope)).toBe('<p>x</p>');
    const src = `{% set h = widget_data.x.value|trim %}{% text "x" label="X", value=' hi ', export_to_template_context=True %}{% if h %}A{% elif subject %}B{% else %}C{% endif %}{% if widget_data.x.value|trim %}[{{ widget_data.x.value }}]{% endif %}`;
    expect(renderDefaults(src, { preview: PLACEHOLDER_PREVIEW, subject: 'S' })).toBe('B[ hi ]');
  });

  it('outlines a drag-and-drop area rather than inventing its modules', () => {
    const drawn = renderDefaults(hubl(opened(FIXTURES[2]!)), { preview: PLACEHOLDER_PREVIEW, subject: 'S' });
    expect(drawn).toContain('Drag-and-drop area');
    expect(drawn).not.toContain('{%');
    expect(drawn).not.toContain('{{');
  });
});

describe('pictures in the desk’s frame', () => {
  it('become labelled boxes of the same width, because the frame cannot load HubSpot’s', () => {
    const out = boxPictures('<img alt="Hero &amp; co" src="https://x.net/a.png" width="560"><img src="data:image/png;base64,AA">');
    expect(out).toContain('width="560"');
    expect(out).not.toContain('https://x.net');
    expect(decodeURIComponent(out)).toContain('Hero &amp; co');
    expect(out).toContain('data:image/png;base64,AA');
  });
});
