// The last few block kinds added, kept across sessions. A convenience, so it lives in the browser.
// Moved out of App.tsx as it was (learnings 3.78).


/** The last few block kinds added, kept across sessions. A convenience, so it lives in the browser. */
export const RECENT_KEY = 'sy-recent-blocks';
export const readRecent = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string').slice(0, 4) : [];
  } catch {
    return [];
  }
};
export const writeRecent = (kinds: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(kinds));
  } catch {
    // Storage blocked; the list simply does not survive the tab.
  }
};
