// What ⌘C puts on the clipboard, and what ⌘V reads back.
//
// Text, not a custom MIME type: a custom type never survives the system clipboard between two
// browser tabs reliably, and text does. The payload is JSON with a marker key, so a paste of
// ordinary text — a URL, a sentence — is recognised as not ours and left to whatever has focus.
// The blocks travel whole, with their locks; the receiving template mints new ids and field
// names for them (edit.ts), so a paste is a new set of fields to the team.

import type { Block, Section } from './types.ts';

const MARK = 'template-studio';

export type Clip =
  | { kind: 'blocks'; blocks: Block[] }
  /** A whole section — a row of columns — which has no single block to copy. */
  | { kind: 'section'; section: Section };

export function clipText(clip: Clip): string {
  return JSON.stringify({ [MARK]: 1, ...clip });
}

/** The clip in a pasted text, or null when the text is anything else. */
export function parseClip(text: string): Clip | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>)[MARK] !== 1) return null;
  const clip = raw as Record<string, unknown>;
  if (clip['kind'] === 'blocks' && Array.isArray(clip['blocks']) && clip['blocks'].every(isBlock)) {
    return { kind: 'blocks', blocks: clip['blocks'] as Block[] };
  }
  if (clip['kind'] === 'section' && clip['section'] && typeof clip['section'] === 'object') {
    const section = clip['section'] as Section;
    if (Array.isArray(section.rows)) return { kind: 'section', section };
  }
  return null;
}

const isBlock = (b: unknown): boolean =>
  Boolean(b) && typeof b === 'object' && typeof (b as Block).type === 'string' && typeof (b as Block).id === 'string';
