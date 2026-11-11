// Light, dark, or whatever the system says: one pick for Template Studio and the Freeform app.
//
// Jared: "Light and dark mode, please." The colours are tokens in app.css; this only sets
// `data-theme` on the root, which those tokens read. System is no attribute at all, so the media
// query decides. Kept in this browser, and every open tab hears a change through the storage event.

import { useEffect, useState } from 'preact/hooks';

export type ThemePick = 'system' | 'light' | 'dark';
export const THEME_PICKS: readonly ThemePick[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'scuggnizzi.theme';

const EVENT = 'scuggnizzi-theme';

export function readTheme(): ThemePick {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pick: ThemePick, root: HTMLElement = document.documentElement): void {
  if (pick === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pick);
}

export function writeTheme(pick: ThemePick): void {
  try {
    if (pick === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pick);
  } catch {
    // Storage blocked: the pick still holds for this page.
  }
  applyTheme(pick);
  window.dispatchEvent(new Event(EVENT));
}

/** Applies the stored pick now and follows changes from other tabs. Call once, before the first render. */
export function startTheme(): void {
  applyTheme(readTheme());
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY || event.key === null) {
      applyTheme(readTheme());
      window.dispatchEvent(new Event(EVENT));
    }
  });
}

export function useTheme(): [ThemePick, (pick: ThemePick) => void] {
  const [pick, setPick] = useState<ThemePick>(readTheme);
  useEffect(() => {
    const on = () => setPick(readTheme());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [pick, writeTheme];
}
