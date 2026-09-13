// Local pictures on the canvas, and the rule that stops one reaching an inbox.
//
// The Assets panel lists images from the workspace's `assets/` folder and writes the **file name**
// into the block. That is deliberately not a URL: a blob URL exists in one tab and a file path
// exists on one laptop, and an email is read on somebody else's machine.
//
// So the feature is two halves that only work together — the canvas substitutes a blob URL so a
// designer sees the real picture at the real size, and the linter refuses to export until a hosted
// URL has replaced it. Either half alone is a trap: substitution without the rule ships broken
// images, and the rule without substitution means designing against grey boxes.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { errorsIn, lint } from '../src/compile/lint.ts';
import { isHostedUrl, localImages, withLocalAssets, withoutMissingPictures } from '../src/app/local-assets.ts';
import { fileNameFor } from '../src/app/rasterise.ts';
import { importV1 } from '../src/model/import-v1.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import { DEFAULT_DESIGN_SYSTEM, theme } from '../src/model/design-system.ts';
import type { Template } from '../src/model/types.ts';
import fixture from '../reference/v1-standard-email.design.json';

const assets = [
  { name: 'hero.png', size: 1024, url: 'blob:http://localhost/abc-123' },
  { name: 'sign-off.svg', size: 512, url: 'blob:http://localhost/def-456' },
];

/** One locked image whose src is a file name, which is what clicking an asset produces. */
function withLocalImage(src: string): Template {
  const t = theme(DEFAULT_DESIGN_SYSTEM, 'cream');
  return {
    schema: SCHEMA_VERSION,
    id: 't',
    name: 'Local',
    hubspotLabel: 'Local',
    pageBackground: '#f7f6f3',
    forceLight: true,
    preview: { company: 'C', address: 'A', city: 'C', state: 'S', zip: 'Z' },
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
              {
                id: 'c1',
                span: 12,
                padTop: 10,
                padBottom: 10,
                padLeft: 20,
                padRight: 20,
                align: 'left',
                blocks: [
                  {
                    id: 'b1',
                    type: 'image',
                    lock: { editable: false, label: 'Hero', field: '' },
                    mode: 'static',
                    src,
                    alt: 'Hero',
                    href: '',
                    width: 560,
                    align: 'center',
                    optional: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('what counts as a URL an email client can fetch', () => {
  it.each(['https://x.test/a.png', 'http://x.test/a.png', '//x.test/a.png', 'data:image/png;base64,AA', '{{ widget_data.hero.img.src }}'])(
    'accepts %s',
    (src) => expect(isHostedUrl(src)).toBe(true),
  );

  it.each(['hero.png', 'assets/hero.png', './hero.png', 'blob:http://localhost/abc', ''])('rejects %s', (src) =>
    expect(isHostedUrl(src)).toBe(false),
  );

  it('rejects a blob URL, which is the one that looks most like it should work', () => {
    // It resolves in the tab that made it and nowhere else — including a second tab on the same
    // machine. Writing one into a document would produce a file that looks finished.
    expect(isHostedUrl('blob:http://localhost/abc-123')).toBe(false);
  });
});

describe('substituting for the canvas', () => {
  it('swaps a file name for its blob URL', () => {
    expect(withLocalAssets('<img src="hero.png">', assets)).toBe('<img src="blob:http://localhost/abc-123">');
  });

  it('matches the whole attribute, never a substring of a URL that was already fine', () => {
    // `https://cdn.test/hero.png` contains `hero.png`. A substring replace would corrupt it.
    const html = '<img src="https://cdn.test/hero.png"><img src="hero.png">';
    expect(withLocalAssets(html, assets)).toBe(
      '<img src="https://cdn.test/hero.png"><img src="blob:http://localhost/abc-123">',
    );
  });

  it('leaves a name nothing in the folder matches', () => {
    expect(withLocalAssets('<img src="missing.png">', assets)).toBe('<img src="missing.png">');
  });

  it('does nothing at all when the folder is empty', () => {
    const html = '<img src="hero.png">';
    expect(withLocalAssets(html, [])).toBe(html);
  });
});

describe('refusing to export one', () => {
  it('is an error, not a warning', () => {
    // The failure only appears after a send — every image broken in every inbox — which is exactly
    // the kind of thing that must stop an export rather than caption it.
    const out = compile(withLocalImage('hero.png'), { mode: 'hubl' });
    const found = errorsIn(lint({ ...out, mode: 'hubl' })).filter((f) => f.rule === 'local-image');
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain('hero.png');
    expect(found[0]!.message).toContain('HubSpot Files');
  });

  it('says nothing once a hosted URL replaces it', () => {
    const out = compile(withLocalImage('https://cdn.test/hero.png'), { mode: 'hubl' });
    expect(errorsIn(lint({ ...out, mode: 'hubl' })).filter((f) => f.rule === 'local-image')).toEqual([]);
  });

  it('leaves the preview alone, because the preview is where a local file is the point', () => {
    const out = compile(withLocalImage('hero.png'), { mode: 'preview' });
    expect(errorsIn(lint({ ...out, mode: 'preview' })).filter((f) => f.rule === 'local-image')).toEqual([]);
  });

  it('does not fire on the modules, which resolve their own source at send', () => {
    const standard = compile(importV1(fixture as never).template, { mode: 'hubl' });
    expect(errorsIn(lint({ ...standard, mode: 'hubl' })).filter((f) => f.rule === 'local-image')).toEqual([]);
  });
});

describe('nothing about this reaches a template', () => {
  it('a blob URL cannot get into compiled output, because the compiler never sees one', () => {
    // `withLocalAssets` transforms a preview string. The export is compiled separately and never
    // passes through it — the same arrangement as the dark-mode simulation.
    const out = compile(withLocalImage('hero.png'), { mode: 'hubl' }).html;
    expect(out).not.toContain('blob:');
    expect(out).toContain('src="hero.png"');
  });
});

describe('images in a folder inside assets/', () => {
  // Rendered text is written to `assets/rendered/`, so the path — not the bare file name — is what
  // the document stores. Three things have to agree on that spelling or the feature breaks in a
  // way that looks like the picture simply failed to draw: the canvas matches on it to swap in a
  // blob URL, `local-image` reports it, and the Assets panel writes it into the block.

  it('substitutes a path the same way it substitutes a name', () => {
    const html = '<img src="rendered/headline-b00h.png" width="560">';
    const swapped = withLocalAssets(html, [
      { name: 'rendered/headline-b00h.png', size: 1, url: 'blob:one' },
    ]);
    expect(swapped).toContain('src="blob:one"');
  });

  it('does not confuse a file with one of the same name at the top level', () => {
    // `hero.png` and `rendered/hero.png` are two files. Matching on the whole attribute is what
    // keeps them apart, and it is the same rule that stops a hosted URL ending in `hero.png`
    // being rewritten.
    const html = '<img src="hero.png"><img src="rendered/hero.png">';
    const swapped = withLocalAssets(html, [
      { name: 'hero.png', size: 1, url: 'blob:top' },
      { name: 'rendered/hero.png', size: 1, url: 'blob:sub' },
    ]);
    expect(swapped).toBe('<img src="blob:top"><img src="blob:sub">');
  });

  it('still refuses to export one, because a path is not a URL either', () => {
    expect(isHostedUrl('rendered/headline-b00h.png')).toBe(false);
    expect(localImages('<img src="rendered/headline-b00h.png">')).toEqual(['rendered/headline-b00h.png']);
  });
});

describe('naming a rendered picture', () => {
  it('says what it holds, and puts it in the generated folder', () => {
    expect(fileNameFor('Heading one', 'b00h')).toBe('rendered/heading-one-b00h.png');
  });

  it('carries the block id, so two blocks that start the same way do not collide', () => {
    expect(fileNameFor('See you around the club', 'a1')).not.toBe(fileNameFor('See you around the club', 'a2'));
  });

  it('survives text that is all punctuation, or none at all', () => {
    expect(fileNameFor('  ***  ', 'c3')).toBe('rendered/text-c3.png');
    expect(fileNameFor('', 'c4')).toBe('rendered/text-c4.png');
  });

  it('does not run away with a long paragraph', () => {
    const name = fileNameFor('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod', 'd5');
    expect(name.length).toBeLessThan(60);
    expect(name.startsWith('rendered/lorem-ipsum')).toBe(true);
  });
});

describe('pictures the canvas cannot show yet', () => {
  it('asks for nothing until a bare file name has a file behind it, and leaves every real source alone', () => {
    const svg = '<image data-sy-layer="a" href="photo.png" x="0"/><image href="blob:http://x/1"/><image href="https://cdn.test/p.png"/><image href="data:image/png;base64,AA"/><image href=""/>';
    expect(withoutMissingPictures(svg)).toBe('<image data-sy-layer="a" href="" x="0"/><image href="blob:http://x/1"/><image href="https://cdn.test/p.png"/><image href="data:image/png;base64,AA"/><image href=""/>');
    const found = withLocalAssets(svg, [{ name: 'photo.png', size: 1, url: 'blob:http://x/2' }]);
    expect(withoutMissingPictures(found)).toContain('href="blob:http://x/2"');
  });
});
