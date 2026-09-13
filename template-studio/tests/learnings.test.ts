// The verified HubSpot facts, as executable checks.
//
// `docs/learnings.md` is the asset that outlives this project, and prose alone does not stop a
// refactor from quietly undoing a fact someone paid a test send to find out. Everything here was
// confirmed in the Phase 0 send on 2026-09-11; each test names the section it defends.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { importV1 } from '../src/model/import-v1.ts';
import { compile } from '../src/compile/compile.ts';
import { lint } from '../src/compile/lint.ts';
import type { Template } from '../src/model/types.ts';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../reference/v1-standard-email.design.json', import.meta.url)), 'utf8'),
);
const { template } = importV1(fixture);
const out = compile(template, { mode: 'hubl', date: '2026-09-10' });
const findings = lint({ tree: out.tree, registry: out.registry, html: out.html, bytes: out.bytes });

describe('1.6 — the image module hands over its link', () => {
  it('reads the link from .link, the only path that carries it', () => {
    expect(out.html).toContain('{% if widget_data.hero_image.link %}');
    expect(out.html).toContain('href="{{ widget_data.hero_image.link }}"');
  });

  it('never reads the paths that came back empty', () => {
    for (const dead of ['.link.url', '.link.url.href', '.img.link']) {
      expect(out.html, `${dead} is always empty in a real send`).not.toContain(dead);
    }
  });

  it('tests presence on img.src, so the block is absent until an image is picked', () => {
    expect(out.html).toContain('{% if widget_data.hero_image.img.src %}');
  });
});

describe('1.6a / 2.9 — width comes from the block, never from the module', () => {
  // The send proved the module reports the *file's* natural width: a 1080px upload came back as
  // 1080 despite 400 being declared. Trusting it reproduces the bug v1 actually shipped.
  it('declares the block width to the module', () => {
    expect(out.html).toContain('"width": 560');
  });

  it('hardcodes the block width on the img rather than interpolating the module value', () => {
    // A window rather than a balanced match: the hero block nests a second conditional for the
    // link, so anything non-greedy stops at the wrong {% endif %}.
    const start = out.html.indexOf('{% if widget_data.hero_image.img.src %}');
    const hero = out.html.slice(start, start + 2000);
    expect(hero).toContain('<img alt="{{ widget_data.hero_image.img.alt }}"');
    expect(hero).toContain('width="560"');
    expect(hero).not.toContain('widget_data.hero_image.img.width');
  });

  it('uses the sign-off block’s 280px, not the 560px of its neighbours', () => {
    // A per-block value, to prove the width is read per block and not from one global default.
    expect(out.html).toContain('width="280"');
  });
});

describe('1.5 — declarations never sit inside a conditional', () => {
  it('holds across the whole standard email', () => {
    expect(findings.filter((f) => f.rule === 'declaration-inside-conditional')).toEqual([]);
  });

  it('declares the optional images above the conditional that hides them', () => {
    const decl = out.html.indexOf('{% module "hero_image"');
    const cond = out.html.indexOf('{% if widget_data.hero_image.img.src %}');
    expect(decl).toBeGreaterThan(-1);
    expect(cond).toBeGreaterThan(decl);
  });
});

describe('1.9 — HubSpot injects a 1em bottom margin onto every <p>', () => {
  it('states a margin on every paragraph the compiler emits', () => {
    // v1 omits these, which is why its legal footer ships with a gap nobody chose — invisible
    // wherever the `p { margin:0 }` reset survives, present in Gmail, which strips it.
    expect(findings.filter((f) => f.rule === 'paragraph-margin')).toEqual([]);
  });

  it('puts the margin first, so the block can still override it', () => {
    // HubSpot prepends what it inlines and keeps the element's own style last, so the later
    // declaration wins. Ours being present at all is the whole fix.
    expect(out.html).toContain('<p style="margin:0; line-height:115%');
  });
});

describe('1.14 — rich text exports, so it can be wrapped and collapsed', () => {
  it('declares the field as exported rather than rendering it in place', () => {
    expect(out.html).toContain('{% rich_text "body" label="Body"');
    expect(out.html).toMatch(/\{% rich_text "body"[^%]*export_to_template_context=True %\}/);
  });

  it('prints the html inside the template’s own section, not where the tag sits', () => {
    expect(out.html).toContain('{{ widget_data.body.html }}');
    const decl = out.html.indexOf('{% rich_text "body"');
    const printed = out.html.indexOf('{{ widget_data.body.html }}');
    const section = out.html.indexOf('hse-section', decl);
    // declaration, then the section wrapper, then the value inside it
    expect(section).toBeGreaterThan(decl);
    expect(printed).toBeGreaterThan(section);
  });

  it('wraps the section in a conditional so an empty field takes its block with it', () => {
    expect(out.html).toContain('{% if widget_data.body.html %}');
  });

  it('keeps the declaration outside that conditional', () => {
    expect(findings.filter((f) => f.rule === 'declaration-inside-conditional')).toEqual([]);
    expect(out.html.indexOf('{% rich_text "body"')).toBeLessThan(out.html.indexOf('{% if widget_data.body.html %}'));
  });
});

describe('2.5 — all three dark-mode layers reach the inbox', () => {
  it('emits the meta, the media query and the Outlook attribute selectors', () => {
    expect(out.html).toContain('<meta name="color-scheme" content="light">');
    expect(out.html).toContain('@media (prefers-color-scheme: dark)');
    expect(out.html).toMatch(/\[data-ogsb\] \.sy-bg-/);
    expect(out.html).toMatch(/\[data-ogsc\] \.sy-text-/);
  });
});

describe('1.8 — CAN-SPAM, without which HubSpot refuses to publish', () => {
  it('emits every required variable', () => {
    for (const variable of [
      '{{ site_settings.company_name }}',
      '{{ site_settings.company_street_address_1 }}',
      '{{ site_settings.company_city }}',
      '{{ unsubscribe_link }}',
      '{{ unsubscribe_link_all }}',
    ]) {
      expect(out.html).toContain(variable);
    }
  });
});

describe('3.1 — preview substitutes sample content, and only preview', () => {
  it('shows a labelled box where an unpicked image will sit', () => {
    const shown = compile(template, { mode: 'preview', branch: { hero_image: true } }).html;
    expect(shown).toContain('data:image/svg+xml');
    expect(shown).toContain(encodeURIComponent('Hero image · 560px'));
  });

  it('never lets the sample reach the exported template', () => {
    // The placeholder is the fallback on a `print`, and HubL mode emits the interpolation instead.
    // If this ever fails, a dashed grey box has shipped to someone's inbox.
    expect(out.html).not.toContain('data:image/svg+xml');
    expect(out.html).toContain('src="{{ widget_data.hero_image.img.src }}"');
  });
});

describe('editor chrome never reaches the exported template', () => {
  /** A template with a two-column row, one column left empty — the case that draws a slot. */
  const withEmptyColumn = (): Template => {
    const first = template.sections[0]!;
    const col = first.rows[0]!.columns[0]!;
    return {
      ...template,
      sections: [
        ...template.sections,
        {
          ...first,
          id: 'sec-cols',
          rows: [
            {
              id: 'row-cols',
              mobile: 'stack',
              columns: [
                { ...col, id: 'col-a', span: 6 },
                { ...col, id: 'col-b', span: 6, blocks: [] },
              ],
            },
          ],
        },
      ],
    };
  };

  it('draws a slot in an empty column for the canvas, and never for a send', () => {
    // An empty column has no height and nothing to aim at, so the canvas draws it a labelled slot.
    // It is markup the compiler invents for the tool's convenience, which makes it exactly the kind
    // of thing that ends up in somebody's inbox if nothing is watching.
    const shown = compile(withEmptyColumn(), { mode: 'preview', annotate: true }).html;
    expect(shown).toContain('data-sy-slot');
    expect(shown).toContain('Drop a block here');

    for (const mode of ['hubl', 'preview'] as const) {
      const exported = compile(withEmptyColumn(), { mode }).html;
      expect(exported, `${mode} leaked the slot`).not.toContain('data-sy-slot');
      expect(exported, `${mode} leaked the slot`).not.toContain('Drop a block here');
    }
  });

  it('marks columns for dropping only when annotating', () => {
    expect(compile(withEmptyColumn(), { mode: 'preview', annotate: true }).html).toContain('data-sy-column');
    expect(compile(withEmptyColumn(), { mode: 'hubl' }).html).not.toContain('data-sy-column');
  });

  it('tags blocks only when asked to', () => {
    // `annotate` exists for the canvas, which needs to map a click back to a block. The exported
    // file is the product and carries nothing that exists for the tool's convenience.
    expect(out.html).not.toContain('data-sy-block');

    const annotated = compile(template, { mode: 'preview', annotate: true }).html;
    expect(annotated).toContain('data-sy-block');
    expect(annotated).toContain('data-sy-section');
  });

  it('tags each visible block exactly once, so a click resolves unambiguously', () => {
    const annotated = compile(template, { mode: 'preview', annotate: true, branch: { hero_image: true } }).html;
    const ids = [...annotated.matchAll(/data-sy-block="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves the markup otherwise identical', () => {
    const plain = compile(template, { mode: 'preview' }).html;
    const annotated = compile(template, { mode: 'preview', annotate: true }).html;
    // Every editor-only mark: the block and section ids, the column a stack's cell belongs to,
    // and the flag on a block that draws its own band.
    expect(annotated.replace(/ data-sy-(block|section|column)="[^"]*"| data-sy-band=""/g, '')).toBe(plain);
  });
});
