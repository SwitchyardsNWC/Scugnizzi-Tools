// The zip writer (model/zip.ts).
//
// Defended: the CRC is the standard one; an archive has a local header per entry, a central directory that
// points back at each, and an end record that counts them; names and bytes read back as written.

import { describe, expect, it } from 'vitest';

import { crc32, zip } from '../src/model/zip.ts';

const text = (s: string) => new TextEncoder().encode(s);
const u16 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint16(at, true);
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);

/** Reads an archive back the way an unzipper does: from the end record to the directory to each entry. */
function unzip(bytes: Uint8Array): Array<{ path: string; data: string; crcOk: boolean }> {
  const end = bytes.length - 22;
  expect(u32(bytes, end)).toBe(0x06054b50);
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    expect(u32(bytes, at)).toBe(0x02014b50);
    const nameLength = u16(bytes, at + 28);
    const localAt = u32(bytes, at + 42);
    const path = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(u32(bytes, localAt)).toBe(0x04034b50);
    const size = u32(bytes, localAt + 18);
    const localName = u16(bytes, localAt + 26);
    const start = localAt + 30 + localName;
    const data = bytes.subarray(start, start + size);
    out.push({ path, data: new TextDecoder().decode(data), crcOk: crc32(data) === u32(bytes, localAt + 14) });
    at += 46 + nameLength;
  }
  return out;
}

describe('the zip writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(text('hello')).toString(16)).toBe('3610a686');
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes an archive that reads back entry for entry', () => {
    const bytes = zip(
      [
        { path: 'spring/spring.html', data: text('<html>hi</html>') },
        { path: 'spring/images/héro.png', data: new Uint8Array([137, 80, 78, 71]) },
        { path: 'spring/README.md', data: text('# Spring') },
      ],
      new Date(2026, 8, 18, 12, 30, 10),
    );
    const entries = unzip(bytes);
    expect(entries.map((e) => e.path)).toEqual(['spring/spring.html', 'spring/images/héro.png', 'spring/README.md']);
    expect(entries[0]!.data).toBe('<html>hi</html>');
    expect(entries[2]!.data).toBe('# Spring');
    expect(entries.every((e) => e.crcOk)).toBe(true);
    expect(u16(bytes, 8)).toBe(0); // stored, not compressed
    expect(u16(bytes, 6)).toBe(0x0800); // names are UTF-8
  });
});
