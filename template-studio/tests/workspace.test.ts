// The folder workspace's judgement of what is on disk (workspace/workspace.ts).
//
// Defended: two texts that read as the same template are the same, however they are spaced or ordered, so a
// synced folder rewriting a file's time is not taken for another author; a different template is different;
// text that is not a template at all is compared as it is.

import { describe, expect, it } from 'vitest';

import { serializeTemplate } from '../src/model/serialize.ts';
import { blankTemplate } from '../src/model/starters.ts';
import { sameTemplate } from '../src/workspace/workspace.ts';

describe('the same template on disk', () => {
  const template = { ...blankTemplate(), name: 'Spring launch' };
  const text = serializeTemplate(template);

  it('is the same however it is spaced or ordered', () => {
    const spaced = JSON.stringify(JSON.parse(text), null, 4);
    const raw = JSON.parse(text) as Record<string, unknown>;
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(raw).reverse()));
    expect(sameTemplate(text, spaced)).toBe(true);
    expect(sameTemplate(text, reordered)).toBe(true);
    expect(sameTemplate(text, `${text}\n\n`)).toBe(true);
  });

  it('is not the same once the template differs', () => {
    const other = serializeTemplate({ ...template, name: 'Summer launch' });
    expect(sameTemplate(text, other)).toBe(false);
  });

  it('compares anything unreadable as it is', () => {
    expect(sameTemplate('not json', ' not json ')).toBe(true);
    expect(sameTemplate('not json', 'still not json')).toBe(false);
    expect(sameTemplate(text, 'not json')).toBe(false);
  });
});
