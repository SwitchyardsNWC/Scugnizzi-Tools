// The slash menu's pure half: what the commands are, how a query finds them, and which typed
// markers mean a format. The DOM half — running a command against a contenteditable — is verified
// in the browser, like the rest of the canvas.

import { describe, expect, it } from 'vitest';

import { blockItem, filterItems, FORMAT_COMMANDS, markdownShortcut, SHORTCUTS, slashQuery } from '../src/app/slash.ts';
import { sanitise } from '../src/model/sanitise.ts';

describe('what the menu offers', () => {
  it('is HubSpot’s editor minus what the design system owns', () => {
    const ids = FORMAT_COMMANDS.map((c) => c.id);
    for (const has of ['p', 'h1', 'h6', 'ul', 'ol', 'quote', 'hr', 'bold', 'italic', 'underline', 'strike', 'sup', 'sub', 'small', 'code', 'link', 'unlink', 'clear']) {
      expect(ids).toContain(has);
    }
    // Font, size, colour and highlight are in HubSpot's toolbar and deliberately not here: an
    // inline style beats the block's own scale (learnings 3.5) and the sanitiser strips them.
    for (const not of ['font', 'size', 'color', 'colour', 'highlight']) expect(ids).not.toContain(not);
  });

  it('every command carries a hint, which is the explanation on hover', () => {
    for (const c of FORMAT_COMMANDS) expect(c.hint.length, c.id).toBeGreaterThan(8);
  });

  it('everything a format command produces survives the sanitiser', () => {
    // The whole premise: a command whose markup the sanitiser strips on commit is a button that
    // looks like it worked. Each tag a command can emit has to come back out.
    const produced = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 's', 'sup', 'sub', 'small', 'code', 'strong', 'em', 'u'];
    for (const tag of produced) {
      const wrapped = ['ul', 'ol'].includes(tag) ? `<${tag}><li>x</li></${tag}>` : `<${tag}>x</${tag}>`;
      const inline = ['s', 'sup', 'sub', 'small', 'code', 'strong', 'em', 'u'].includes(tag);
      expect(sanitise(inline ? `<p>${wrapped}</p>` : wrapped), tag).toContain(`<${tag}>`);
    }
    expect(sanitise('<p>a<hr>b</p>')).toContain('<hr>');
    // Chrome's strikethrough command emits `<strike>`; it comes back as `<s>`.
    expect(sanitise('<p><strike>gone</strike></p>')).toBe('<p><s>gone</s></p>');
    expect(sanitise('<p><span style="text-decoration: line-through">gone</span></p>')).toBe('<p><s>gone</s></p>');
  });
});

describe('finding the query', () => {
  it('starts at a slash at the start of a line or after a space', () => {
    expect(slashQuery('/')).toEqual({ at: 0, query: '' });
    expect(slashQuery('/he')).toEqual({ at: 0, query: 'he' });
    expect(slashQuery('some words /li')).toEqual({ at: 11, query: 'li' });
    expect(slashQuery('some words /li')).toEqual({ at: 11, query: 'li' });
  });

  it('ignores a slash inside a word, which is what a URL is', () => {
    expect(slashQuery('https://example.com')).toBeNull();
    expect(slashQuery('and/or')).toBeNull();
  });

  it('gives up once the query has a space in it', () => {
    // Typing on past a menu that matched nothing dismisses it, rather than following you down
    // the paragraph.
    expect(slashQuery('/heading two')).toBeNull();
  });

  it('returns null with no slash at all', () => {
    expect(slashQuery('plain words')).toBeNull();
    expect(slashQuery('')).toBeNull();
  });
});

describe('matching', () => {
  it('shows everything for an empty query, in the written order', () => {
    expect(filterItems(FORMAT_COMMANDS, '')).toEqual(FORMAT_COMMANDS);
  });

  it('puts a label prefix above a keyword match', () => {
    const out = filterItems(FORMAT_COMMANDS, 'h').map((c) => c.id);
    expect(out[0]).toBe('h1');
    expect(out).toContain('hr');
    expect(out.indexOf('h6')).toBeLessThan(out.indexOf('hr'));
  });

  it('finds a list by its keyword and both lists by the word', () => {
    expect(filterItems(FORMAT_COMMANDS, 'bul')[0]?.id).toBe('ul');
    const both = filterItems(FORMAT_COMMANDS, 'list').map((c) => c.id);
    expect(both).toContain('ul');
    expect(both).toContain('ol');
  });

  it('forgives a subsequence, so a typo still finds it', () => {
    expect(filterItems(FORMAT_COMMANDS, 'hrzl').map((c) => c.id)).toContain('hr');
  });

  it('returns nothing for a query nothing matches', () => {
    expect(filterItems(FORMAT_COMMANDS, 'zzzz')).toEqual([]);
  });

  it('ranks blocks and formats together by the same rule', () => {
    const items = [...FORMAT_COMMANDS, blockItem('heading', 'Heading', 'A headline.'), blockItem('divider', 'Divider', 'A rule.')];
    const out = filterItems(items, 'div').map((c) => c.id);
    expect(out[0]).toBe('block-divider');
    // "divider" is also a keyword of the horizontal rule, which is the right thing to offer second.
    expect(out).toContain('hr');
  });
});

describe('markdown markers', () => {
  it('reads the habits', () => {
    expect(markdownShortcut('#')).toEqual({ command: 'formatBlock', value: 'h1' });
    expect(markdownShortcut('###')).toEqual({ command: 'formatBlock', value: 'h3' });
    expect(markdownShortcut('-')).toEqual({ command: 'insertUnorderedList' });
    expect(markdownShortcut('*')).toEqual({ command: 'insertUnorderedList' });
    expect(markdownShortcut('1.')).toEqual({ command: 'insertOrderedList' });
    expect(markdownShortcut('1)')).toEqual({ command: 'insertOrderedList' });
    expect(markdownShortcut('>')).toEqual({ command: 'formatBlock', value: 'blockquote' });
    expect(markdownShortcut('---')).toEqual({ command: 'insertHorizontalRule' });
  });

  it('treats a hyphen in a sentence as a hyphen', () => {
    expect(markdownShortcut('a -')).toBeNull();
    expect(markdownShortcut('2.')).toBeNull();
    expect(markdownShortcut('#######')).toBeNull();
    expect(markdownShortcut('')).toBeNull();
  });

  it('copes with the non-breaking space a contenteditable writes', () => {
    expect(markdownShortcut('- ')).toEqual({ command: 'insertUnorderedList' });
  });
});

describe('the shortcut sheet', () => {
  it('lists the slash menu first and says what each key does', () => {
    expect(SHORTCUTS[0]?.keys).toBe('/');
    for (const s of SHORTCUTS) expect(s.does.length).toBeGreaterThan(4);
  });
});
