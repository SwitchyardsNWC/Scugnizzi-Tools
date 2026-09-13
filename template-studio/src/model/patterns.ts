// Patterns: a section saved to the folder, placed in other templates, and kept in step.
//
// The plan's last structural gap. A footer, a signature block, a card row — built once, used in
// every template, and when it changes, changed everywhere. Three decisions hold it together:
//
//   - **A placed pattern is a copy.** The template compiles alone, with no dependency at export;
//     the exported HTML is the product (brief.md) and it must not need a second file to be right.
//     What the section carries is a marker — which pattern, which version — and that is enough for
//     the editor to notice the pattern has moved on.
//   - **Updating keeps the field names it can.** An update replaces the section's contents, and the
//     team's emails are bound to the field names inside (learnings 1.10). A block whose lock label
//     matches one in the placed copy keeps that copy's name; only a genuinely new block mints one.
//   - **Versions are integers, bumped on every push.** Not timestamps: two designers' clocks are
//     not a partial order, and "is this instance behind" has to be answered by comparing numbers.
//
// Pure, like the rest of the model. Reading and writing the files is the workspace's business.

import { cloneSection, freshIds, locksOf, takenFieldNames } from './edit.ts';
import { newId } from './ids.ts';
import { SCHEMA_VERSION } from './schema.ts';
import type { Section, Template } from './types.ts';

export interface Pattern {
  schema: number;
  id: string;
  name: string;
  version: number;
  /** The section as saved. Placed copies get new ids and field names; this keeps the originals. */
  section: Section;
}

/** A pattern id: document-local style, but it has to be unique across a folder, so random. */
export const newPatternId = (): string => newId('p');

/** The section as a pattern holds it: no instance marker, since the pattern is the source. */
function asSource(section: Section): Section {
  const copy = structuredClone(section);
  delete copy.pattern;
  return copy;
}

/**
 * Saves a section as a new pattern, and marks the section as its first instance — so the place it
 * was made from follows updates like every other placement.
 */
export function patternFromSection(
  template: Template,
  sectionId: string,
  name: string,
  id: string = newPatternId(),
): { pattern: Pattern; template: Template } | null {
  const section = template.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  const pattern: Pattern = { schema: SCHEMA_VERSION, id, name, version: 1, section: asSource(section) };
  const marked: Template = {
    ...template,
    sections: template.sections.map((s) => (s.id === sectionId ? { ...s, pattern: { id, version: 1 } } : s)),
  };
  return { pattern, template: marked };
}

/** Places a pattern as a new section at an absolute position. */
export function placePattern(template: Template, pattern: Pattern, index: number): Template {
  const section = cloneSection(pattern.section, freshIds(template), takenFieldNames(template));
  section.pattern = { id: pattern.id, version: pattern.version };
  const sections = [...template.sections];
  sections.splice(Math.max(0, Math.min(sections.length, index)), 0, section);
  return { ...template, sections };
}

/**
 * Brings a placed section up to the pattern's current version.
 *
 * The section keeps its id, its place, and — where a lock label matches — its field names. The
 * names the instance held are released before minting, so a block that kept its label keeps its
 * name rather than being handed `body_2` because `body` looked taken by its old self.
 */
export function applyPattern(template: Template, sectionId: string, pattern: Pattern): Template {
  const current = template.sections.find((s) => s.id === sectionId);
  if (!current?.pattern || current.pattern.id !== pattern.id) return template;

  const keep = new Map<string, string>();
  const own = new Set<string>();
  for (const row of current.rows) {
    for (const column of row.columns) {
      for (const block of column.blocks) {
        for (const lock of locksOf(block)) {
          if (lock.editable && lock.field) {
            keep.set(lock.label, lock.field);
            own.add(lock.field);
          }
        }
      }
    }
  }
  const taken = takenFieldNames(template);
  for (const name of own) taken.delete(name);

  const fresh = cloneSection(pattern.section, freshIds(template), taken, keep);
  const next: Section = { ...fresh, id: current.id, pattern: { id: pattern.id, version: pattern.version } };
  return { ...template, sections: template.sections.map((s) => (s.id === sectionId ? next : s)) };
}

/** An independent copy: the content stays, the marker goes, and updates stop arriving. */
export function detachPattern(template: Template, sectionId: string): Template {
  return {
    ...template,
    sections: template.sections.map((s) => {
      if (s.id !== sectionId || !s.pattern) return s;
      const { pattern, ...rest } = s;
      void pattern;
      return rest;
    }),
  };
}

/**
 * A new version of the pattern, from a placed section's current contents. The instance it came
 * from is stamped with the new version; every other instance is now behind, and says so.
 */
export function pushPattern(
  template: Template,
  sectionId: string,
  pattern: Pattern,
): { pattern: Pattern; template: Template } | null {
  const section = template.sections.find((s) => s.id === sectionId);
  if (!section?.pattern || section.pattern.id !== pattern.id) return null;
  const version = pattern.version + 1;
  const next: Pattern = { ...pattern, version, section: asSource(section) };
  const stamped: Template = {
    ...template,
    sections: template.sections.map((s) => (s.id === sectionId ? { ...s, pattern: { id: pattern.id, version } } : s)),
  };
  return { pattern: next, template: stamped };
}

export interface InstanceState {
  pattern: Pattern | null;
  /** The pattern has a newer version than this placement. */
  stale: boolean;
  /** The pattern is not in the folder any more. */
  missing: boolean;
}

/** What a section's marker says against the folder's patterns, or null for a plain section. */
export function instanceOf(section: Section, patterns: Pattern[]): InstanceState | null {
  if (!section.pattern) return null;
  const pattern = patterns.find((p) => p.id === section.pattern!.id) ?? null;
  return { pattern, stale: Boolean(pattern && pattern.version > section.pattern.version), missing: !pattern };
}

/** Every placed section that is behind its pattern. What the badges are drawn from. */
export function staleInstances(template: Template, patterns: Pattern[]): Array<{ sectionId: string; pattern: Pattern }> {
  const out: Array<{ sectionId: string; pattern: Pattern }> = [];
  for (const section of template.sections) {
    const state = instanceOf(section, patterns);
    if (state?.stale && state.pattern) out.push({ sectionId: section.id, pattern: state.pattern });
  }
  return out;
}

/** A pattern file, checked for shape. Anything else throws, so a stray JSON file is a message and not a crash. */
export function parsePattern(raw: unknown): Pattern {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a pattern file.');
  const p = raw as Partial<Pattern>;
  if (typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.version !== 'number' || !p.section || typeof p.section !== 'object') {
    throw new Error('Not a pattern file: it needs an id, a name, a version and a section.');
  }
  return { schema: typeof p.schema === 'number' ? p.schema : SCHEMA_VERSION, id: p.id, name: p.name, version: p.version, section: p.section as Section };
}
