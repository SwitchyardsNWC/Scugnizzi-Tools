// Where a new template can start: the starters Template Studio offers on New and on the Welcome screen.
// Moved out of App.tsx as it was (learnings 3.78).

import { importV1 } from '../model/import-v1.ts';
import { blankTemplate, cardTemplate } from '../model/starters.ts';
import { switchyardsShortTemplate, switchyardsTemplate } from '../model/switchyards.ts';
import type { Starter } from './Templates.tsx';
import starterDesign from '../../reference/v1-standard-email.design.json';

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
    id: 'switchyards',
    name: 'Switchyards email',
    summary: 'The Switchyards email system’s standard send: tagline header, lockup, hero, one heading, the copy, one outline button, the sign-off, the masthead footer. Its own design system comes with it.',
    make: switchyardsTemplate,
  },
  {
    id: 'switchyards-short',
    name: 'Switchyards short',
    summary: 'The system’s short send, for one fact: lockup header, hero, heading, one paragraph, the Callout, one solid button, the sign-off, the stub footer.',
    make: switchyardsShortTemplate,
  },
  {
    id: 'standard',
    name: 'Standard email (v1)',
    summary: 'The Switchyards email as it shipped before the system: top bar, stripes, hero, copy, buttons and footer, on the brand palette.',
    make: () => importV1(starterDesign as never).template,
  },
  {
    id: 'card',
    name: 'Card email',
    summary: 'A white page, a monospace face, and copy in black-bordered cards — the look of the Phase 0 probe. Its own design system comes with it.',
    make: cardTemplate,
  },
];
