// Documents on the board (model/docs.ts).
//
// Defended: the files Drive for desktop writes for Google documents are recognised by extension and read as
// links, with or without an address in them; the board's own link files carry a name and a kind; anything
// without a usable address is nothing; a link file round-trips; and link files never take each other's names.

import { describe, expect, it } from 'vitest';

import { docDisplayName, docIdOf, docKindOfUrl, docLinkFileName, docLinkJson, isDocFile, readDocLink } from '../src/model/docs.ts';

const DOC = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=drivesdk';

describe('documents', () => {
  it('recognise Drive’s files for Google documents, and the board’s link files', () => {
    for (const f of ['Brief.gdoc', 'Budget.gsheet', 'Deck.gslides', 'Map.gdraw', 'Survey.gform', 'spring-copy.link.json']) expect(isDocFile(f)).toBe(true);
    for (const f of ['photo.png', 'notes.md', 'spring.template.json', '.Brief.gdoc', 'links.json']) expect(isDocFile(f)).toBe(false);
    expect(docDisplayName('Spring brief.gdoc')).toBe('Spring brief');
    expect(docDisplayName('spring_copy-deck.link.json')).toBe('spring copy deck');
  });

  it('tell what a Google address opens, and its id', () => {
    expect(docKindOfUrl(DOC)).toBe('doc');
    expect(docKindOfUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0')).toBe('sheet');
    expect(docKindOfUrl('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit')).toBe('slides');
    expect(docKindOfUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view')).toBe('link');
    expect(docKindOfUrl('https://switchyards.com/brief')).toBe('link');
    expect(docKindOfUrl('not an address')).toBe('link');
    expect(docIdOf(DOC)).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
    expect(docIdOf('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
    expect(docIdOf('https://switchyards.com/brief')).toBeNull();
  });

  it('read Drive’s files as links, from the address or from the id alone', () => {
    const drive = JSON.stringify({ url: DOC, doc_id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', email: 'jared@switchyards.com', resource_id: 'document:1AbC' });
    expect(readDocLink(drive, 'Spring brief.gdoc')).toEqual({ kind: 'doc', name: 'Spring brief', url: DOC, id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' });
    expect(readDocLink(JSON.stringify({ doc_id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' }), 'Budget.gsheet')).toEqual({
      kind: 'sheet',
      name: 'Budget',
      url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit',
      id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
    });
    // A .gsheet is a sheet whatever its address says: the extension is Drive's word for what the file is.
    expect(readDocLink(JSON.stringify({ url: DOC }), 'Budget.gsheet')?.kind).toBe('sheet');
  });

  it('read nothing from a file with no address in it', () => {
    expect(readDocLink('', 'Brief.gdoc')).toBeNull();
    expect(readDocLink('nope', 'Brief.gdoc')).toBeNull();
    expect(readDocLink('{"email":"x"}', 'Brief.gdoc')).toBeNull();
    expect(readDocLink('{"url":"ftp://x"}', 'x.link.json')).toBeNull();
    expect(readDocLink('{"doc_id":"short"}', 'Brief.gdoc')).toBeNull();
  });

  it('write link files that read back, with the kind worked out from the address', () => {
    const text = docLinkJson({ url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', name: '  Budget  ' }, 7);
    expect(JSON.parse(text)).toEqual({ version: 1, kind: 'sheet', name: 'Budget', url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', addedAt: 7 });
    expect(readDocLink(text, 'budget.link.json')).toEqual({
      kind: 'sheet',
      name: 'Budget',
      url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit',
      id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
    });
    expect(readDocLink(docLinkJson({ url: 'https://switchyards.com/brief', name: 'Brief' }), 'brief.link.json')).toMatchObject({ kind: 'link', name: 'Brief', id: null });
  });

  it('name link files for the link, and never for another', () => {
    expect(docLinkFileName('Spring brief', [])).toBe('spring-brief.link.json');
    expect(docLinkFileName('Spring brief', ['spring-brief.link.json'])).toBe('spring-brief-2.link.json');
    expect(docLinkFileName('Café ☕', [])).toBe('cafe.link.json');
    expect(docLinkFileName('   ', [])).toBe('link.link.json');
  });
});
