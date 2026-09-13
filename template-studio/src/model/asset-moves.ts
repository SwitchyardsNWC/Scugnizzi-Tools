// Moving a picture between folders without breaking what shows it.
//
// A picture in a project is named by its path under `assets/` wherever it appears: an image block's `src`, a
// freeform layer's `src`, a tool recipe's `output` and `sources`, a card on the board. Dropping `photo.png` into the
// Social media group moves it to `social-media/photo.png`, and every one of those has to say so, or an email quietly
// loses its picture. Pure; src/project/folder.ts moves the file and writes the documents.

const SRC_KEYS = new Set(['src', 'logoSrc']);

/** A document with every `src` that named `from` naming `to`. Only what changes is copied; the rest is shared. */
export function renameSrc<T>(value: T, from: string, to: string): { value: T; changed: boolean } {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      let copy: unknown[] | null = null;
      node.forEach((item, i) => {
        const next = walk(item);
        if (next === item) return;
        copy ??= [...node];
        copy[i] = next;
      });
      return copy ?? node;
    }
    if (node && typeof node === 'object') {
      let copy: Record<string, unknown> | null = null;
      for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
        const next = SRC_KEYS.has(key) && item === from ? to : walk(item);
        if (next === item) continue;
        copy ??= { ...(node as Record<string, unknown>) };
        copy[key] = next;
      }
      return copy ?? node;
    }
    return node;
  };
  const out = walk(value) as T;
  return { value: out, changed: out !== value };
}

/** A tool recipe with `assets/<from>` renamed in its output and sources. */
export function renameInRecipe(raw: unknown, from: string, to: string): { value: unknown; changed: boolean } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: raw, changed: false };
  const recipe = raw as Record<string, unknown>;
  const [a, b] = [`assets/${from}`, `assets/${to}`];
  const output = recipe['output'] === a ? b : recipe['output'];
  const before = Array.isArray(recipe['sources']) ? (recipe['sources'] as unknown[]) : null;
  const sources = before ? before.map((s) => (s === a ? b : s)) : recipe['sources'];
  const changed = output !== recipe['output'] || Boolean(before && before.some((s) => s === a));
  return changed ? { value: { ...recipe, output, sources }, changed: true } : { value: raw, changed: false };
}

/** Where a picture goes: its own file name, into a group's folder, or straight into `assets/` when `folder` is null. */
export const movedPath = (path: string, folder: string | null): string => {
  const name = path.split('/').pop() || path;
  return folder ? `${folder}/${name}` : name;
};

/** `desired`, or `name-2.ext` beside it when another picture already has that path. */
export function freeAssetPath(desired: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  if (!used.has(desired.toLowerCase())) return desired;
  const slash = desired.lastIndexOf('/');
  const dir = desired.slice(0, slash + 1);
  const file = desired.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : '';
  let n = 2;
  while (used.has(`${dir}${stem}-${n}${ext}`.toLowerCase())) n += 1;
  return `${dir}${stem}-${n}${ext}`;
}
