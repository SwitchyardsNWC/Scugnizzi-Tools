// HubSpot's stock email modules.
//
// A module is a thing HubSpot renders and the team edits natively, named by path. Two places want
// this list: the image block, which can hand its picker over to `@hubspot/image_email` rather than
// drawing its own (learnings 1.6), and the drag and drop area, where every default module the
// designer places is one of these.
//
// Confidence is carried per entry rather than assumed, for the same reason learnings.md marks every
// finding: two of these paths have never been seen to work, and a template that ships an unverified
// path fails at upload with an error nobody can read. `lint.ts` warns on anything not `verified` or
// `documented`, so the uncertainty reaches the designer instead of the inbox.

/** How much we actually know about a path. Mirrors the convention in docs/learnings.md. */
export type Confidence =
  /** Seen working in a real send. */
  | 'verified'
  /** HubSpot's docs say so and nothing contradicts them. */
  | 'documented'
  /** Believed correct, never proven. Ships with a warning. */
  | 'unverified';

export interface StockModule {
  path: string;
  /** What the designer picks from a list. */
  name: string;
  /** One line, shown under the name. */
  summary: string;
  confidence: Confidence;
}

/**
 * The modules worth offering, in the order a designer is likely to want them.
 *
 * Seeded from docs/learnings.md §1.13, which is the record of what has actually been tried. When a
 * send settles one of the unverified paths, change it here and there in the same commit.
 */
export const STOCK_MODULES: StockModule[] = [
  {
    path: '@hubspot/email_body',
    name: 'Rich text',
    summary: 'Formatted copy. The workhorse, and what most of an email is.',
    confidence: 'documented',
  },
  {
    path: '@hubspot/image_email',
    name: 'Image',
    summary: "HubSpot's own picker, with its link and alignment.",
    confidence: 'verified',
  },
  {
    path: '@hubspot/email_cta',
    name: 'CTA',
    summary: 'A tracked HubSpot CTA, picked from the ones already in the account.',
    confidence: 'documented',
  },
  {
    path: '@hubspot/email_header',
    name: 'Heading',
    summary: 'One line, H1 to H6.',
    confidence: 'documented',
  },
  {
    path: '@hubspot/email_text',
    name: 'Text',
    summary: 'A single line of unformatted text.',
    confidence: 'documented',
  },
  {
    path: '@hubspot/horizontal_spacer',
    name: 'Spacer',
    summary: 'Vertical space the team can size.',
    confidence: 'documented',
  },
  {
    path: '@hubspot/email_social_sharing',
    name: 'Social sharing',
    summary: 'Share-this-email icons. Not the same as links to our own accounts.',
    confidence: 'documented',
  },
  {
    path: '@hubspot/email_subscriptions',
    name: 'Subscription preferences',
    summary: 'The preference centre copy.',
    confidence: 'documented',
  },
  {
    path: '@hubspot/email_simple_subscription',
    name: 'Simple unsubscribe',
    summary: 'Unsubscribe copy on its own.',
    confidence: 'documented',
  },
  {
    path: '@hubspot/email_can_spam',
    name: 'CAN-SPAM footer',
    summary: 'The required footer. The legal block already covers this in our templates.',
    confidence: 'documented',
  },
];

const BY_PATH = new Map(STOCK_MODULES.map((m) => [m.path, m]));

export const stockModule = (path: string): StockModule | undefined => BY_PATH.get(path);

/** The name to show for a path, falling back to the path itself for one typed by hand. */
export const moduleName = (path: string): string => BY_PATH.get(path)?.name ?? path;
