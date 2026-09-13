// The document model: migrations, and the rule about field names.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { MigrationError, migrate, SCHEMA_VERSION } from '../src/model/schema.ts';
import { fieldName, slug } from '../src/model/ids.ts';
import { importV1 } from '../src/model/import-v1.ts';
import { serializeTemplate, templateFileName } from '../src/model/serialize.ts';
import { compile } from '../src/compile/compile.ts';
import { declaredFields } from './structure.ts';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../reference/v1-standard-email.design.json', import.meta.url)), 'utf8'),
);

describe('migrations', () => {
  it('stamps an unversioned document rather than rejecting it', () => {
    expect(migrate({ name: 'Old' }).schema).toBe(SCHEMA_VERSION);
  });

  it('leaves a current document alone', () => {
    expect(migrate({ schema: SCHEMA_VERSION, name: 'Now' }).schema).toBe(SCHEMA_VERSION);
  });

  it('refuses a document from a newer build instead of silently downgrading it', () => {
    // On a shared folder this is a teammate running a newer Template Studio. Opening their file
    // with an older reader and saving it back is how you lose their work, so it stops here.
    expect(() => migrate({ schema: SCHEMA_VERSION + 5 })).toThrow(MigrationError);
    expect(() => migrate({ schema: SCHEMA_VERSION + 5 })).toThrow(/newer version/);
  });

  it('fills in the page frame on a system saved before it existed', () => {
    // A document that has opened the design panel carries a *whole* copy of the system, so a token
    // added later is simply absent from it — and `border:${undefined}px` is a frame nobody asked
    // for. The values written are the shipped ones, which are all off.
    const saved = { schema: 4, name: 'Tuned', ds: { version: 1, containerWidth: 480, pagePadding: 20 } };
    const ds = migrate(saved).ds as unknown as Record<string, unknown>;
    expect(ds['pageBorderWidth']).toBe(0);
    expect(ds['pageBorderColor']).toBe('navy');
    expect(ds['pageMargin']).toBe(0);
    // And it leaves what was already there alone.
    expect(ds['containerWidth']).toBe(480);
  });

  it('does not invent a design system for a document that never had one', () => {
    // Most documents have no `ds` at all: they compile against the shipped values, and giving them
    // three tokens would make them look tuned in the panel and in every diff.
    expect(migrate({ schema: 4, name: 'Untouched' }).ds).toBeUndefined();
  });

  it('strips the side padding nothing had ever read', () => {
    // Every column carried `padLeft: 20` and `padRight: 20`; the compiler took both sides from
    // `pagePadding` and never looked. Keeping them would detach every block in every saved
    // document from the page gutter the moment the compiler started reading them — the global
    // would stop moving them, which is the one thing a global is for.
    const saved = {
      schema: 5,
      name: 'Old',
      sections: [
        { id: 's1', rows: [{ id: 'r1', columns: [{ id: 'c1', span: 12, padTop: 10, padBottom: 10, padLeft: 20, padRight: 20, blocks: [] }] }] },
      ],
    };
    const column = (migrate(saved).sections[0]!.rows[0]!.columns[0] ?? {}) as Record<string, unknown>;
    expect('padLeft' in column).toBe(false);
    expect('padRight' in column).toBe(false);
    expect(column['padTop']).toBe(10);
  });

  it('refuses something that is not a document at all', () => {
    expect(() => migrate(null)).toThrow(MigrationError);
    expect(() => migrate([1, 2, 3])).toThrow(MigrationError);
  });
});

describe('field names', () => {
  it('is slug-safe, lowercase and never empty', () => {
    expect(slug('Hero image')).toBe('hero_image');
    expect(slug('  ***  ')).toBe('field');
    expect(slug('Button text (blank to hide)')).toBe('button_text_blank_to_hide');
  });

  it('avoids names HubSpot reserves', () => {
    expect(slug('content')).toBe('content_field');
    expect(slug('widget data')).toBe('widget_data_field');
  });

  it('deduplicates rather than colliding', () => {
    const taken = new Set<string>();
    expect(fieldName('Image', taken)).toBe('image');
    expect(fieldName('Image', taken)).toBe('image_2');
    expect(fieldName('Image', taken)).toBe('image_3');
  });

  it('does not change when a label is edited afterwards', () => {
    // learnings 1.10: renaming a field orphans whatever the team already typed into the old one.
    // Labels are editable; names are allocated once at import and stored.
    const { template } = importV1(fixture);
    const before = template.sections.flatMap((s) =>
      s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks.map((b) => ('lock' in b ? b.lock.field : '')))),
    );

    for (const s of template.sections) {
      for (const r of s.rows) {
        for (const c of r.columns) {
          for (const b of c.blocks) if ('lock' in b) b.lock.label = `${b.lock.label} (renamed)`;
        }
      }
    }

    const after = template.sections.flatMap((s) =>
      s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks.map((b) => ('lock' in b ? b.lock.field : '')))),
    );
    expect(after).toEqual(before);

    // And the change reaches the output as a label, never as a name.
    const fields = declaredFields(compile(template, { mode: 'hubl' }).html);
    expect(fields.map((f) => f.name)).toContain('top_bar_tagline');
    expect(fields.find((f) => f.name === 'top_bar_tagline')?.label).toBe('Top bar tagline (renamed)');
  });
});

describe('v1 import', () => {
  it('maps each v1 block to one section holding a single full-width column', () => {
    const { template } = importV1(fixture);
    for (const s of template.sections) {
      expect(s.rows).toHaveLength(1);
      expect(s.rows[0]!.columns).toHaveLength(1);
      expect(s.rows[0]!.columns[0]!.span).toBe(12);
    }
  });

  it('names what it could not bring across instead of dropping it silently', () => {
    const { warnings } = importV1({ blocks: [{ type: 'footer_stack' }, { type: 'cities' }] });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/footer_stack/);
  });

  it('allocates a field name only for editable blocks, as v1 did', () => {
    // The logo and the sign-off are locked, so they consume no name — which is what keeps the
    // hero image called `hero_image` rather than shifting to `hero_image_2`.
    const { template } = importV1(fixture);
    const fields = template.sections
      .flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)))
      .filter((b) => 'lock' in b)
      .map((b) => ('lock' in b ? b.lock : null));
    expect(fields.filter((l) => l && !l.editable).every((l) => l!.field === '')).toBe(true);
  });
});

describe('serializing a template', () => {
  it('sorts keys, so a one-character edit is a one-line diff', () => {
    const { template } = importV1(fixture);
    const text = serializeTemplate(template);
    const top = Object.keys(JSON.parse(text));
    expect(top).toEqual([...top].sort());
    expect(text.endsWith('\n')).toBe(true);
  });

  it('is stable: the same document always produces the same bytes', () => {
    // Nothing volatile in the file — no timestamps, no regenerated ids — so saving an untouched
    // template does not churn the folder everyone else is syncing.
    const a = serializeTemplate(importV1(fixture).template);
    const b = serializeTemplate(importV1(fixture).template);
    expect(a).toBe(b);
  });

  it('round-trips through the migration chain unchanged', () => {
    const { template } = importV1(fixture);
    const reloaded = migrate(JSON.parse(serializeTemplate(template)));
    expect(serializeTemplate(reloaded)).toBe(serializeTemplate(template));
  });

  it('names the file after the template', () => {
    const { template } = importV1(fixture);
    expect(templateFileName({ ...template, name: 'Standard email' })).toBe('standard-email.template.json');
    expect(templateFileName({ ...template, name: '  ' })).toBe('template.template.json');
  });
});

describe('migration 1 -> 2: style leaves the blocks', () => {
  /** A document as it was written the day before the change. */
  const old = {
    schema: 1,
    id: 't',
    name: 'Old',
    hubspotLabel: 'Old',
    pageBackground: '#f7f6f3',
    forceLight: true,
    preview: { company: 'C', address: 'A', city: 'C', state: 'S', zip: 'Z' },
    sections: [
      {
        id: 's1',
        bandColor: null,
        containerColor: '#f7f6f3',
        textColor: '#011272',
        linkColor: '#d10000',
        padTop: 0,
        padBottom: 0,
        rows: [
          {
            id: 'r1',
            mobile: 'stack',
            columns: [
              {
                id: 'c1',
                span: 12,
                padTop: 10,
                padBottom: 10,
                padLeft: 20,
                padRight: 20,
                align: 'left',
                blocks: [
                  { id: 'b1', type: 'heading', lock: { editable: true, label: 'H', field: 'h' }, text: 'Hi', level: 'h2', align: 'left', size: 31, mobileSize: 22, color: '#d10000' },
                  { id: 'b2', type: 'richtext', lock: { editable: true, label: 'B', field: 'b' }, html: '<p>x</p>', align: 'left', size: 19, mobileSize: 17, lineHeight: 140, color: null },
                  { id: 'b3', type: 'spacer', height: 24 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it('strips the properties that became design-system roles', () => {
    const next = migrate(structuredClone(old));
    const blocks = next.sections[0]!.rows[0]!.columns[0]!.blocks;
    for (const key of ['size', 'mobileSize', 'lineHeight', 'color']) {
      expect(blocks[0]!, `heading kept ${key}`).not.toHaveProperty(key);
      expect(blocks[1]!, `richtext kept ${key}`).not.toHaveProperty(key);
    }
    expect(next.schema).toBe(SCHEMA_VERSION);
  });

  it('leaves everything else alone, content and locks included', () => {
    const blocks = migrate(structuredClone(old)).sections[0]!.rows[0]!.columns[0]!.blocks;
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: 'heading', text: 'Hi', level: 'h2', align: 'left' });
    expect('lock' in blocks[0]! ? blocks[0]!.lock : null).toEqual({ editable: true, label: 'H', field: 'h' });
    // A spacer's height is its content, not its style, and is not on the list.
    expect(blocks[2]).toMatchObject({ type: 'spacer', height: 24 });
  });

  it('produces a document that serializes without the dead keys', () => {
    const text = serializeTemplate(migrate(structuredClone(old)));
    expect(text).not.toContain('"mobileSize"');
    expect(text).not.toContain('"lineHeight"');
  });

  it('runs the whole chain from an unversioned document', () => {
    const ancient = structuredClone(old) as Record<string, unknown>;
    delete ancient['schema'];
    const next = migrate(ancient);
    expect(next.schema).toBe(SCHEMA_VERSION);
    expect(next.sections[0]!.rows[0]!.columns[0]!.blocks[0]!).not.toHaveProperty('size');
  });
});

describe('migration 2 -> 3: buttons are named for what they do', () => {
  const old = {
    schema: 2,
    id: 't',
    name: 'Old',
    hubspotLabel: 'Old',
    pageBackground: '#f7f6f3',
    forceLight: true,
    preview: { company: 'C', address: 'A', city: 'C', state: 'S', zip: 'Z' },
    ds: {
      buttons: {
        red: { fill: 'cream', ink: 'red', edge: 'red', radius: 25, padY: 12, padX: 18, size: 16, mobileSize: 0, borderWidth: 2 },
        white: { fill: 'navy', ink: 'white', edge: 'white', radius: 25, padY: 9, padX: 17, size: 13, mobileSize: 0, borderWidth: 2 },
      },
      themes: {
        cream: { band: null, container: 'cream', text: 'navy', link: 'red', button: 'red' },
        navy: { band: 'navy', container: null, text: 'offwhite', link: 'offwhite', button: 'white' },
      },
    },
    sections: [
      {
        id: 's1',
        bandColor: null,
        containerColor: '#f7f6f3',
        textColor: '#011272',
        linkColor: '#d10000',
        padTop: 0,
        padBottom: 0,
        rows: [
          {
            id: 'r1',
            mobile: 'stack',
            columns: [
              {
                id: 'c1',
                span: 12,
                padTop: 10,
                padBottom: 10,
                padLeft: 20,
                padRight: 20,
                align: 'left',
                blocks: [
                  { id: 'b1', type: 'button', lock: { editable: true, label: 'L', field: 'l' }, link: { editable: true, label: 'K', field: 'k' }, text: 'Go', href: '', style: 'white', align: 'center' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it('renames the variant a block reaches for', () => {
    const block = migrate(structuredClone(old)).sections[0]!.rows[0]!.columns[0]!.blocks[0]!;
    expect(block.type === 'button' ? block.style : null).toBe('secondary');
  });

  it('renames the design system’s own map, and the token inside it', () => {
    const ds = migrate(structuredClone(old)).ds!;
    expect(Object.keys(ds.buttons).sort()).toEqual(['primary', 'secondary']);
    expect(ds.buttons['secondary']).toMatchObject({ fill: 'navy', ink: 'white', border: 'white' });
    expect(ds.buttons['secondary']).not.toHaveProperty('edge');
  });

  it('renames the variant each background preset reaches for', () => {
    // The one that is easy to miss. A preset still saying `red` would silently fall back to primary,
    // which on the navy band is a red button nobody asked for.
    const ds = migrate(structuredClone(old)).ds!;
    expect(ds.themes['cream']?.button).toBe('primary');
    expect(ds.themes['navy']?.button).toBe('secondary');
  });

  it('leaves a document with no design system alone', () => {
    const bare = structuredClone(old) as Record<string, unknown>;
    delete bare['ds'];
    expect(() => migrate(bare)).not.toThrow();
    expect(migrate(bare).ds).toBeUndefined();
  });
});
