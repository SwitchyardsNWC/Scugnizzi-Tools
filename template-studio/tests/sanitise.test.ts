// The paste sanitiser.
//
// This is the thing that blocked inline editing of rich text twice. `contentEditable` works; paste
// is what breaks. Content copied from Word, Docs, a web page or another email arrives carrying its
// own inline styles, and an inline style beats the block's own size, colour and line height
// (learnings 3.5). v1 shipped without this and it cost a round of feedback.
//
// The tests are written against what actually comes off a clipboard rather than against tidy
// fixtures, because the whole problem is that real paste data is not tidy.

import { describe, expect, it } from 'vitest';

import { fromContentEditable, sanitise } from '../src/model/sanitise.ts';

describe('inline styles', () => {
  it('strips every one of them', () => {
    // The failure the whole file exists to prevent: this paragraph would render at 11pt Calibri in
    // a 18px Helvetica email, and no amount of stylesheet can beat an inline style.
    const word =
      '<p style="margin:0cm;font-size:11.0pt;font-family:Calibri,sans-serif;line-height:107%;color:#1F1F1F">Hello</p>';
    expect(sanitise(word)).toBe('<p>Hello</p>');
  });

  it('keeps the meaning when the style was the only thing carrying it', () => {
    // Word and Docs both express bold and italic as styled spans. Dropping the span without
    // reading it loses the bold, which reads as the sanitiser eating the designer's formatting.
    expect(sanitise('<span style="font-weight:700">Bold</span>')).toBe('<p><strong>Bold</strong></p>');
    expect(sanitise('<span style="font-style:italic">Slanted</span>')).toBe('<p><em>Slanted</em></p>');
    expect(sanitise('<span style="text-decoration:underline">Under</span>')).toBe('<p><u>Under</u></p>');
  });

  it('drops a span that was only carrying a font', () => {
    expect(sanitise('<p>a <span style="font-family:Calibri">b</span> c</p>')).toBe('<p>a b c</p>');
  });
});

describe('what survives', () => {
  it('keeps the tags the compiled stylesheet has a rule for', () => {
    const html = '<h2>Title</h2><p>Body <strong>bold</strong> <em>it</em></p><ul><li>one</li><li>two</li></ul>';
    expect(sanitise(html)).toBe(html);
  });

  it('keeps a link and nothing else about it', () => {
    expect(sanitise('<a href="https://example.com" target="_blank" class="x" style="color:red">Go</a>')).toBe(
      '<p><a href="https://example.com">Go</a></p>',
    );
  });

  it('unwraps a link that goes nowhere a mail client would follow', () => {
    // An allowlist of schemes, not a blocklist: `javascript:` in a template that lands in someone's
    // inbox is not a link, and the words are still worth keeping.
    expect(sanitise('<a href="javascript:alert(1)">Click</a>')).toBe('<p>Click</p>');
    expect(sanitise('<a href="data:text/html,x">Click</a>')).toBe('<p>Click</p>');
    expect(sanitise('<a href="mailto:a@b.com">Mail</a>')).toBe('<p><a href="mailto:a@b.com">Mail</a></p>');
  });

  it('takes the content of a script or a style with it', () => {
    expect(sanitise('<p>a</p><script>alert(1)</script><style>p{color:red}</style><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });

  it('drops an image rather than shipping a link to someone else’s server', () => {
    // An image pasted from a web page points at that page's host. It would break the moment they
    // change it and it leaks the reader's open to a third party. Images go through the Image block.
    expect(sanitise('<p>before<img src="https://other.example/x.png">after</p>')).toBe('<p>beforeafter</p>');
  });
});

describe('the shapes real clipboards produce', () => {
  it('survives Word’s conditional comments and empty paragraphs', () => {
    const word =
      '<!--StartFragment--><!--[if gte mso 9]><xml><w:WordDocument/></xml><![endif]-->' +
      '<p class="MsoNormal"><o:p>&nbsp;</o:p></p><p class="MsoNormal">Real text</p><!--EndFragment-->';
    expect(sanitise(word)).toBe('<p>Real text</p>');
  });

  it('collapses the whitespace a document editor leaves behind', () => {
    expect(sanitise('<p>a   \n\n  b&nbsp;&nbsp;c</p>')).toBe('<p>a b c</p>');
  });

  it('wraps loose text so the block’s own scale applies to it', () => {
    expect(sanitise('just some words')).toBe('<p>just some words</p>');
  });

  it('closes what a fragment left open, rather than emitting unbalanced markup', () => {
    // A clipboard fragment routinely starts mid-element. Unbalanced output would break the section
    // around it, and in an email that means the rest of the message disappears in Outlook.
    expect(sanitise('<p>one<p>two')).toBe('<p>one</p><p>two</p>');
    expect(sanitise('<strong>bold')).toBe('<p><strong>bold</strong></p>');
  });

  it('ignores a stray closing tag', () => {
    expect(sanitise('</p></div>text')).toBe('<p>text</p>');
  });

  it('escapes text that looks like markup', () => {
    expect(sanitise('<p>5 &lt; 6 &amp; 7 > 4</p>')).toBe('<p>5 &lt; 6 &amp; 7 &gt; 4</p>');
  });

  it('returns nothing for markup that was only styling', () => {
    expect(sanitise('<div><span style="color:red">  </span></div>')).toBe('');
  });
});

describe('what a contenteditable produces', () => {
  it('turns a browser’s div line breaks into paragraphs', () => {
    // Chrome and Safari disagree about whether a paragraph break is a div, a p or a br. The
    // document should not record which browser the designer happened to be using.
    expect(fromContentEditable('<div>one</div><div>two</div>')).toBe('<p>one</p><p>two</p>');
  });

  it('leaves already-clean markup alone, so editing is idempotent', () => {
    // Round-tripping matters more here than anywhere: every keystroke re-reads the element, and a
    // sanitiser that rewrote its own output would fight the cursor.
    const clean = '<p>Copy goes here.</p>';
    expect(fromContentEditable(clean)).toBe(clean);
    expect(fromContentEditable(fromContentEditable(clean))).toBe(clean);
  });

  it('drops the empty paragraph a cleared field leaves behind', () => {
    expect(fromContentEditable('<p><br></p>')).toBe('');
    expect(fromContentEditable('<p>&nbsp;</p>')).toBe('');
  });
});

describe('a converted span closes where the span closed', () => {
  it('does not let the bold run to the end of the paragraph', () => {
    // Found on a real paste from Word, in the running app. A `<span style="font-weight:700">` is
    // read as a span and written as a `<strong>`; tracking only the written name meant the matching
    // `</span>` found nothing to close, and everything after it came out bold.
    const word =
      '<p style="font-family:Calibri">Pasted from <span style="font-weight:700">Word</span>' +
      ' with <span style="font-family:Georgia;color:red">styles</span>.</p>';
    expect(sanitise(word)).toBe('<p>Pasted from <strong>Word</strong> with styles.</p>');
  });

  it('closes nested conversions in the right order', () => {
    const html = '<span style="font-weight:bold">a<span style="font-style:italic">b</span>c</span>d';
    expect(sanitise(html)).toBe('<p><strong>a<em>b</em>c</strong>d</p>');
  });

  it('unwraps a dead link without swallowing what follows it', () => {
    expect(sanitise('<p><a href="javascript:x">click</a> then more</p>')).toBe('<p>click then more</p>');
  });
});
