// @vitest-environment jsdom
//
// The one part of the editor with a DOM test around it, and it is here because this file has now
// produced two bugs that nothing in four hundred tests could have caught. The compiler and the
// model are pure and tested to death; the editor's DOM path had no harness at all, and both bugs
// were invisible in the panel and fatal on the canvas.
//
// What is tested is the *markup* half — turning what the canvas shows into something a
// `<foreignObject>` will accept. The drawing half needs a real canvas and is verified in the
// browser.

import { describe, expect, it } from 'vitest';

import { fileNameFor, foreignImages, textOf, xhtmlOf } from '../src/app/rasterise.ts';

const cell = (html: string): Element => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

describe('serialising a block for the SVG', () => {
  it('closes a line break, which is the bug that broke this twice', () => {
    // `innerHTML` gives `<br>`. Inside a foreignObject the markup is parsed as XML, where that is
    // a fatal error — so a paragraph with a line break in it, the most ordinary thing in an email,
    // took the whole render down with "something in it is not well-formed markup".
    const out = xhtmlOf(cell('<p>First line<br>second line</p>'));
    expect(out).not.toMatch(/<br>/);
    expect(out).toMatch(/<br ?\/>/);
  });

  it('closes every other void element too', () => {
    // The serialiser stamps the XHTML namespace on each top-level node, so what comes out is
    // `<hr xmlns="…" />`. Self-closed is the part that matters.
    const out = xhtmlOf(cell('<hr><p>after</p>'));
    expect(out).not.toMatch(/<hr\s*>/);
    expect(out).toMatch(/<hr[^>]*\/>/);
  });

  it('parses as XML, which is the actual requirement', () => {
    // The rule this file exists for, stated the way the browser states it: hand the result to an
    // XML parser and it has to come back without a parsererror.
    const markup = xhtmlOf(cell('<h1>Heading</h1><p>a<br>b &amp; c</p><hr><p><strong>x</strong></p>'));
    const doc = new DOMParser().parseFromString(`<root xmlns="http://www.w3.org/1999/xhtml">${markup}</root>`, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
  });

  it('keeps the text, the emphasis and the links intact', () => {
    const out = xhtmlOf(cell('<p>a <strong>bold</strong> and a <a href="https://x.test">link</a></p>'));
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('href="https://x.test"');
  });

  it('escapes an ampersand rather than emitting one raw', () => {
    expect(xhtmlOf(cell('<p>Ben &amp; Jerry</p>'))).toContain('&amp;');
  });
});

describe('the alt text', () => {
  it('is the words, because that is the block where images are blocked', () => {
    expect(textOf('<h1>Heading one</h1><p>Some <strong>copy</strong> here.</p>')).toBe('Heading one Some copy here.');
  });

  it('collapses the whitespace markup leaves behind', () => {
    expect(textOf('<p>a</p>\n   <p>b</p>')).toBe('a b');
  });
});

describe('images a browser will not let us draw', () => {
  it('names one from another site, so the failure is said before it happens', () => {
    // A cross-origin image taints the canvas, and a tainted canvas cannot be read back at all —
    // `toBlob` throws. Catching it late means a SecurityError; catching it here means a sentence.
    expect(foreignImages(cell('<img src="https://cdn.example.com/a.png">'))).toEqual([
      'https://cdn.example.com/a.png',
    ]);
  });

  it('leaves a local one alone', () => {
    expect(foreignImages(cell('<img src="hero.png">'))).toEqual([]);
    expect(foreignImages(cell('<p>no images at all</p>'))).toEqual([]);
  });
});

describe('naming the file', () => {
  it('says what it holds, in the generated folder', () => {
    expect(fileNameFor('Heading one', 'b00h')).toBe('rendered/heading-one-b00h.png');
  });
});
