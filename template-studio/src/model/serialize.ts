// Writing a template back to disk.
//
// Keys are sorted, always. The workspace is a synced folder today and may be a git repo later
// (architecture.md §1), and the difference between those two futures is whether a file's diff is
// readable. Object key order in JavaScript follows insertion, so an edit that rebuilds a node with
// a spread can reorder its keys and produce a diff touching every line for a one-character change.
// Sorting costs nothing and removes the whole class of noise.
//
// Nothing volatile goes in the file either — no timestamps, no generated ids beyond the document's
// own stable ones — so saving an unchanged template produces an identical file.

import type { DesignSystem } from './design-system.ts';
import type { Pattern } from './patterns.ts';
import type { Template } from './types.ts';

export function serializeTemplate(template: Template): string {
  // A template that follows a folder system carries that system in memory only. Writing it into
  // the template's file would give the folder two copies of one system, and the second copy is
  // the one that drifts.
  const stored = template.designSystem ? withoutSystem(template) : template;
  return `${JSON.stringify(stored, sortedKeys, 2)}\n`;
}

function withoutSystem(template: Template): Omit<Template, 'ds'> {
  const { ds, ...rest } = template;
  void ds;
  return rest;
}

/** A pattern file. Sorted keys, for the same reason as the template. */
export function serializePattern(pattern: Pattern): string {
  return `${JSON.stringify(pattern, sortedKeys, 2)}\n`;
}

/** The folder's design system file. Sorted keys, for the same reason as the template. */
export function serializeDesignSystem(ds: DesignSystem): string {
  return `${JSON.stringify(ds, sortedKeys, 2)}\n`;
}

/** A file-safe slug: lowercase, hyphens, never empty. */
export const fileSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';

/** `design-systems/<slug>.system.json`, without the folder. */
export const systemFileName = (name: string): string => `${fileSlug(name)}.system.json`;

/** `patterns/<slug>.pattern.json`, without the folder. */
export const patternFileName = (name: string): string => `${fileSlug(name)}.pattern.json`;

/** A replacer that rebuilds every plain object with its keys in order. Arrays keep theirs. */
function sortedKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) out[key] = source[key];
  return out;
}

/**
 * The file name a template saves under.
 *
 * `taken` is every file already in the folder. A new template called "Standard email" must not
 * land on `standard-email.template.json` if that file exists — the first autosave would silently
 * overwrite somebody's template with a blank one, and on a synced folder that overwrite reaches
 * everybody before anybody notices. It gets `-2` instead, and the name can be fixed afterwards.
 */
export function templateFileName(template: Template, taken: Iterable<string> = []): string {
  const slug = template.name.trim() ? fileSlug(template.name) : 'template';
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  let candidate = `${slug}.template.json`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${slug}-${n}.template.json`;
    n += 1;
  }
  return candidate;
}
