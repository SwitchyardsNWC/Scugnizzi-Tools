// The trash a delete goes through.
//
// Defended: a record reads back as written and a file that is not one throws a sentence; the sweep keeps the
// newest and throws the oldest, and honours each of the three caps on its own; the single newest thing is never
// swept, even when it is larger than the whole cap, because a cap that ate what you just deleted would be worse
// than no cap; and a restore never writes over whatever took the old name.

import { describe, expect, it } from 'vitest';

import {
  daysLeft,
  parseTrashRecord,
  planSweep,
  restorePath,
  trashBytes,
  trashDataName,
  trashKindOf,
  trashRecordName,
  newTrashId,
  TRASH_CAPS,
  type TrashRecord,
} from '../src/model/trash.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

const at = (days: number, over: Partial<TrashRecord> = {}): TrashRecord => ({
  schema: SCHEMA_VERSION,
  id: over.id ?? `tr${days}`,
  path: '.scug/templates/a.template.json',
  name: 'A',
  kind: 'email',
  deletedAt: NOW - days * DAY,
  size: 1000,
  ...over,
});

describe('a trash record', () => {
  it('reads back as what was written', () => {
    const record = at(1);
    expect(parseTrashRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it('fills in what it can and refuses what it cannot', () => {
    const read = parseTrashRecord({ id: 'tr1', path: 'assets/photos/hero.png' });
    expect(read.name).toBe('hero.png');
    expect(read.kind).toBe('file');
    expect(read.deletedAt).toBe(0);
    expect(read.size).toBe(0);
    expect(() => parseTrashRecord(null)).toThrow(/Not a trash record/);
    expect(() => parseTrashRecord({ id: 'tr1' })).toThrow(/the path it came from/);
  });

  it('names its two files apart, so a trashed .json never collides with its own record', () => {
    expect(trashRecordName('tr1')).toBe('tr1.trash.json');
    expect(trashDataName('tr1')).toBe('tr1.data');
    expect(trashRecordName('tr1')).not.toBe(trashDataName('tr1'));
    expect(newTrashId()).not.toBe(newTrashId());
  });

  it('says what a path was', () => {
    expect(trashKindOf('.scug/templates/a.template.json')).toBe('email');
    expect(trashKindOf('.scug/frames/hero.frame.json')).toBe('frame');
    expect(trashKindOf('.scug/design-systems/sy.system.json')).toBe('system');
    expect(trashKindOf('.scug/starters/note.starter.json')).toBe('starter');
    expect(trashKindOf('.scug/project-types/email.type.json')).toBe('project-type');
    expect(trashKindOf('docs/brief.link.json')).toBe('doc');
    expect(trashKindOf('assets/photos/hero.png')).toBe('picture');
    expect(trashKindOf('README.md')).toBe('file');
  });
});

describe('sweeping the trash to its caps', () => {
  it('keeps everything when nothing is over', () => {
    const entries = [at(1), at(2), at(3)];
    const { keep, drop } = planSweep(entries, NOW);
    expect(keep.map((e) => e.id)).toEqual(['tr1', 'tr2', 'tr3']);
    expect(drop).toEqual([]);
  });

  it('throws away what is older than the age cap', () => {
    const { keep, drop } = planSweep([at(1), at(TRASH_CAPS.days + 1), at(TRASH_CAPS.days - 1)], NOW);
    expect(keep.map((e) => e.id)).toEqual(['tr1', `tr${TRASH_CAPS.days - 1}`]);
    expect(drop.map((e) => e.id)).toEqual([`tr${TRASH_CAPS.days + 1}`]);
  });

  it('keeps the newest and drops the oldest when the bytes are over', () => {
    const caps = { days: 30, bytes: 250, count: 100 };
    const entries = [at(1, { id: 'new', size: 100 }), at(2, { id: 'mid', size: 100 }), at(3, { id: 'old', size: 100 })];
    const { keep, drop } = planSweep(entries, NOW, caps);
    expect(keep.map((e) => e.id)).toEqual(['new', 'mid']);
    expect(drop.map((e) => e.id)).toEqual(['old']);
    expect(trashBytes(keep)).toBeLessThanOrEqual(caps.bytes);
  });

  it('keeps the newest even when it alone is larger than the whole cap', () => {
    const caps = { days: 30, bytes: 100, count: 100 };
    const { keep, drop } = planSweep([at(1, { id: 'huge', size: 5000 }), at(2, { id: 'small', size: 10 })], NOW, caps);
    expect(keep.map((e) => e.id)).toEqual(['huge']);
    expect(drop.map((e) => e.id)).toEqual(['small']);
  });

  it('and sweeps that oversized one as soon as something newer arrives', () => {
    const caps = { days: 30, bytes: 100, count: 100 };
    const { keep, drop } = planSweep([at(0, { id: 'newer', size: 10 }), at(1, { id: 'huge', size: 5000 })], NOW, caps);
    expect(keep.map((e) => e.id)).toEqual(['newer']);
    expect(drop.map((e) => e.id)).toEqual(['huge']);
  });

  it('honours the count cap on its own', () => {
    const caps = { days: 30, bytes: 1_000_000, count: 3 };
    const entries = [1, 2, 3, 4, 5].map((d) => at(d, { id: `e${d}`, size: 1 }));
    const { keep, drop } = planSweep(entries, NOW, caps);
    expect(keep.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(drop.map((e) => e.id)).toEqual(['e4', 'e5']);
  });

  it('is stable when two things were deleted in the same millisecond', () => {
    const same = [at(1, { id: 'b' }), at(1, { id: 'a' })];
    expect(planSweep(same, NOW).keep.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('how long a thing has left', () => {
  it('counts whole days down from the age cap, and never reads zero while it is still here', () => {
    expect(daysLeft(at(0), NOW)).toBe(TRASH_CAPS.days);
    expect(daysLeft(at(29), NOW)).toBe(1);
    // Four hours left is still a day to somebody deciding whether to put it back.
    expect(daysLeft(at(0, { deletedAt: NOW - (TRASH_CAPS.days * DAY - 4 * 60 * 60 * 1000) }), NOW)).toBe(1);
    expect(daysLeft(at(TRASH_CAPS.days + 5), NOW)).toBe(0);
  });

  it('agrees with the sweep about what is past it', () => {
    const entries = [at(1), at(TRASH_CAPS.days + 1)];
    const { drop } = planSweep(entries, NOW);
    for (const record of entries) expect(daysLeft(record, NOW) === 0).toBe(drop.includes(record));
  });
});

describe('putting something back', () => {
  it('goes to its own path when nothing took it', () => {
    expect(restorePath('.scug/templates/a.template.json', [])).toBe('.scug/templates/a.template.json');
  });

  it('numbers around whatever took the name, keeping the whole suffix', () => {
    expect(restorePath('.scug/templates/a.template.json', ['.scug/templates/a.template.json'])).toBe('.scug/templates/a 2.template.json');
    expect(restorePath('assets/hero.png', ['assets/hero.png', 'assets/hero 2.png'])).toBe('assets/hero 3.png');
    expect(restorePath('README', ['README'])).toBe('README 2');
  });
});
