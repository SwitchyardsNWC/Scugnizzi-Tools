// Where a new template can start, and the small conveniences the app keeps in the browser.

import { importV1 } from '../model/import-v1.ts';
import { blankTemplate, cardTemplate } from '../model/starters.ts';
import type { Starter } from './Templates.tsx';
import starterDesign from '../../reference/v1-standard-email.design.json';

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template';
export const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)}KB`;

/** The Switchyards email as it ships: the v1 import, from the fixture the model does not load itself. */
export const standardTemplate = () => importV1(starterDesign as never).template;

/**
 * Where a new template can start.
 *
 * Three, in the order a designer is likely to want them: nothing, the thing that ships, and the
 * other look this project has produced. The standard email is the v1 import and lives here rather
 * than with the other two, because the fixture it reads is a JSON file the model does not load.
 */
export const STARTERS: Starter[] = [
  {
    id: 'blank',
    name: 'Blank',
    summary: 'Just the legal footer — the one block HubSpot will not publish without. Everything else is a drag away.',
    make: blankTemplate,
  },
  {
    id: 'standard',
    name: 'Standard email',
    summary: 'The Switchyards email as it ships: top bar, stripes, hero, copy, buttons and footer, on the brand palette.',
    make: standardTemplate,
  },
  {
    id: 'card',
    name: 'Card email',
    summary: 'A white page, a monospace face, and copy in black-bordered cards — the look of the Phase 0 probe. Its own design system comes with it.',
    make: cardTemplate,
  },
];

/** The last few block kinds added, kept across sessions. A convenience, so it lives in the browser. */
const RECENT_KEY = 'sy-recent-blocks';
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
