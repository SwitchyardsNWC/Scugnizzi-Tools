// The board and the library take the suite's theme, as Template Studio and Freeform do: one pick, kept in this
// browser under the key every tool reads (app/theme.ts), made from the Canvas menu's Theme row or any other tool's
// switch. Light, dark, or nothing stored and the system decides. project.css flips its palette on that.
//
// This adds the browser's own colour to it: the address bar and the installed app's title bar take the colour of the
// bar across the top of the page (Enkel's --surface-paper), and follow when the pick or the system changes.

import { startTheme } from '../app/theme.ts';

const PAPER = { light: '#ffffff', dark: '#151515' } as const;

/** Applies the stored pick and keeps the browser's theme colour with it. Call once, before the first render. */
export function startPageTheme(): void {
  startTheme();
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => {
    const pick = root.getAttribute('data-theme');
    const dark = pick === 'dark' || (pick !== 'light' && system.matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? PAPER.dark : PAPER.light);
  };
  sync();
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  system.addEventListener('change', sync);
}
