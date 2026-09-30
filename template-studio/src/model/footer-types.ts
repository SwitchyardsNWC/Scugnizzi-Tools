// The footer's types, as data: what each is called and what it is for. Its own file so the catalog can name a
// footer by its type without importing the model that rebuilds one (model/footer.ts), which imports the catalog.

import type { LegalBlock, LegalLayout } from './types.ts';

export interface FooterType {
  id: LegalLayout;
  name: string;
  summary: string;
}

/** In the order they are offered. The masthead leads because it is what a dropped footer starts as. */
export const FOOTER_TYPES: FooterType[] = [
  {
    id: 'masthead',
    name: 'Masthead',
    summary: 'The default, centred like a dateline: seals between hairlines, name and address, the notice, then the © mark and the legal links. Closes with the red band.',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    summary: 'Two columns: identity on the left, an index of links on the right, each on its own hairline. For a text-heavy email with links worth repeating.',
  },
  {
    id: 'stub',
    name: 'Stub',
    summary: 'One row, seals left and legal right, then one typed line. For short operational sends, with the lockup header.',
  },
  {
    id: 'letterhead',
    name: 'Letterhead',
    summary: 'The letterhead’s foot, on cream: a hairline, the address and the notice, a hairline, the legal links in red and the © mark, then the rule.',
  },
  {
    id: 'classic',
    name: 'Classic',
    summary: 'The footer as it always was: company, address and the two links on the band, with no rules and no seals.',
  },
];

export const DEFAULT_FOOTER: LegalLayout = 'masthead';

export const footerTypeOf = (block: LegalBlock): LegalLayout => block.layout ?? 'classic';
export const footerTypeName = (type: LegalLayout): string => FOOTER_TYPES.find((t) => t.id === type)?.name ?? 'Classic';
