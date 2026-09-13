// The email Template Studio has open when no folder is, kept in this browser.
//
// Without a folder an email lived only in its tab: a reload lost it, and so did a browser that opened
// Freeform or Riso in that same tab. It is written here as it changes and read back on the way in. With a
// folder open the email's file is where it lives, and the draft is cleared.

import { migrate } from './schema.ts';
import type { Template } from './types.ts';

export const DRAFT_KEY = 'scuggnizzi.studio.draft';

export function draftJson(template: Template, now = Date.now()): string {
  return JSON.stringify({ version: 1, savedAt: now, template });
}

/** The kept email, brought up to the current schema; null when there is none or it cannot be read. */
export function readDraft(raw: string | null): Template | null {
  try {
    const value = raw ? (JSON.parse(raw) as { version?: unknown; template?: unknown }) : null;
    if (!value || value.version !== 1 || !value.template || typeof value.template !== 'object') return null;
    return migrate(value.template);
  } catch {
    return null;
  }
}
