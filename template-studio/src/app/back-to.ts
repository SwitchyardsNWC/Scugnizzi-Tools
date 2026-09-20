// Where a tool's back arrow goes.
//
// Three pages send a person into another one — the board opens an email and a frame, Template Studio opens the
// Freeform canvas, the studio library opens a starter — and each needs the arrow to lead back where they came
// from rather than to the tools index. That was two private copies of one idea (Studio kept a boolean, Freeform
// kept a record); this is the one.
//
// Kept for the tab, so a reload does not forget, and read off the address once so a shared link is clean.

export interface Back {
  href: string;
  label: string;
  title: string;
}

const WHERE: Record<string, Back> = {
  board: { href: 'project.html', label: 'Board', title: 'Back to the project board' },
  admin: { href: 'admin.html', label: 'Library', title: 'Back to the studio library' },
  studio: { href: 'index.html', label: 'Studio', title: 'Back to Template Studio' },
};

/**
 * What `?from=` says, or what this tab was told earlier. `file` turns `from=studio` into the email it came from.
 * Returns null when nobody said, which means the arrow goes to the tools.
 */
export function readBack(key: string, from: string | null, file?: string | null): Back | null {
  const named = from ? WHERE[from] : undefined;
  const back = named && from === 'studio' && file ? { ...named, href: `index.html?open=${encodeURIComponent(file)}`, title: `Back to ${file} in Template Studio` } : named;
  try {
    if (back) {
      sessionStorage.setItem(key, JSON.stringify(back));
      return back;
    }
    const kept = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Partial<Back> | null;
    if (kept && typeof kept.href === 'string' && typeof kept.label === 'string' && typeof kept.title === 'string') {
      return { href: kept.href, label: kept.label, title: kept.title };
    }
  } catch {
    // Storage blocked: the arrow knows for this page load only.
    return back ?? null;
  }
  return null;
}
