// Ids and HubSpot field names.
//
// The rule that matters: a field name is generated once, stored on the block, and never derived
// from a label again. Renaming a field in the template orphans whatever the team already typed into
// the old one (learnings 1.10), so a designer editing a label in the inspector must not silently
// rename the field underneath it. `fieldName` exists to be called at creation time and nowhere else.

let counter = 0;

/** Document-local id. Not a HubSpot field name — those are separate and stable for a reason. */
export function newId(prefix = 'n'): string {
  counter += 1;
  return `${prefix}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Deterministic ids, for tests and for the v1 import so a re-import diffs cleanly. */
export function sequentialIds(seed = 0): () => string {
  let n = seed;
  return () => {
    n += 1;
    return `b${n.toString(36).padStart(3, '0')}`;
  };
}

const RESERVED = new Set(['widget_data', 'content', 'module', 'page', 'site_settings', 'subject']);

/** Slug-safe, lowercase, never empty, never reserved (learnings 1.10). */
export function slug(input: string): string {
  const s = String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) return 'field';
  return RESERVED.has(s) ? `${s}_field` : s;
}

/**
 * Allocates a unique field name. Call once, when the field is created, then store the result.
 * `taken` is every name already used in the template, including ones on blocks not currently
 * visible — uniqueness is per exported template, not per section.
 */
export function fieldName(label: string, taken: Set<string>): string {
  const base = slug(label);
  let name = base;
  let i = 2;
  while (taken.has(name)) {
    name = `${base}_${i}`;
    i += 1;
  }
  taken.add(name);
  return name;
}

/**
 * HubSpot's name for the main body: a template with no module called `email_body` gets a warning at upload and
 * cannot be used for blog and RSS emails, which pour the post into the module of that name. So the first rich
 * text field a template gets is `email_body`, and only when that name is already taken does the label decide.
 * Jared, 2026-09-18: "If an email has body text make sure you give it email_body."
 */
export const EMAIL_BODY = 'email_body';

export function bodyFieldName(label: string, taken: Set<string>): string {
  if (!taken.has(EMAIL_BODY)) {
    taken.add(EMAIL_BODY);
    return EMAIL_BODY;
  }
  return fieldName(label, taken);
}
