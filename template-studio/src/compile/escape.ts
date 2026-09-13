// Escaping. Four different jobs that look similar and are not interchangeable — v1 had all four and
// mixing them up is how a stray quote ends a HubL tag early (learnings 1.10).

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Inside a single-quoted HubL `value='...'`. Newlines end the tag, and a raw apostrophe closes the
 * string, so the apostrophe becomes a typographic one — which is what you want in copy anyway.
 */
export function hublText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/'/g, '’');
}

/** Inside a single-quoted HubL `html='...'`, where the content is markup and must stay markup. */
export function hublHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/'/g, '&#39;');
}

/** Inside a double-quoted HubL parameter such as `label="..."`. */
export function hublAttr(value: unknown): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/"/g, '&quot;');
}

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}
