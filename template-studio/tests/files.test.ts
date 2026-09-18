// What a template is called in the Files panel.
//
// The list used to name a row after its *file*, which made renaming look broken: a duplicate stayed
// "drop step 1 copy" in the panel however many times it was renamed, because the Name field writes
// `template.name` and nothing in the list ever read it. Jared hit it and reported it as "no way to
// rename a template".
//
// The fix is not to rename files. A file name is pinned at creation on purpose — it stops a rename
// leaving a trail of files, one per name the template has had (useEditor.ts, `adoptFile`), and the
// project board identifies an email card by file name, so renaming would move somebody's card. So
// the file name stays an identifier and the list reads the name out of the file, which is what the
// board already did.

import { describe, expect, it } from 'vitest';

import { nameInside } from '../src/workspace/workspace.ts';

const named = (name: unknown) => JSON.stringify({ schema: 6, name, sections: [] });

describe('what a template is called in the list', () => {
  it('is the name inside the file, not the name of the file', () => {
    expect(nameInside(named('Drop step 1'), 'drop-step-1-copy.template.json')).toBe('Drop step 1');
  });

  it('falls back to the file name when the template has none', () => {
    // Every one of these is a file that should still be listed. A template with no usable name is
    // not a reason to drop it from the panel — that would be a file you can see in Finder and not
    // in the app, which is the worst of both.
    expect(nameInside(named(''), 'drop-step-1.template.json')).toBe('drop step 1');
    expect(nameInside(named('   '), 'card-email.template.json')).toBe('card email');
    expect(nameInside(named(undefined), 'standard-email.template.json')).toBe('standard email');
    expect(nameInside(named(42), 'standard_email.template.json')).toBe('standard email');
  });

  it('falls back rather than throwing on a file that is not JSON at all', () => {
    expect(nameInside('', 'broken.template.json')).toBe('broken');
    expect(nameInside('{ not json', 'half-written.template.json')).toBe('half written');
  });

  it('trims, because a trailing space is invisible in a list', () => {
    expect(nameInside(named('  Drop step 1  '), 'x.template.json')).toBe('Drop step 1');
  });

  it('reads a v1 design file by the same rule', () => {
    expect(nameInside(JSON.stringify({ name: 'Standard email', blocks: [] }), 'sy.design.json')).toBe('Standard email');
  });
});
