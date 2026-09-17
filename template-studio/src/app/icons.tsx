import type { JSX } from 'preact';

// The glyphs.
//
// A layer row used to lead with the block's *name in words* — `TOP BAR`, `LEGAL FOOTER` — in a mono
// column beside the content. Two columns of text at similar weight, which is why the tree was hard
// to read: nothing in a row told you what kind of thing it was until you had read it.
//
// A glyph is recognised rather than read. The words did not disappear; they moved to the hover,
// where a label belongs once its shape is doing the work.
//
// All drawn on the same 16-unit box with one stroke weight, because the set has to read as a set:
// a heavier icon in a column of lighter ones looks like a state rather than a type.

type Glyph = (props: { class?: string }) => JSX.Element;

const svg = (children: JSX.Element | JSX.Element[], label: string): Glyph =>
  function Icon({ class: className }: { class?: string }) {
    return (
      <svg
        class={`icon ${className ?? ''}`}
        viewBox="0 0 16 16"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
        role="img"
        aria-label={label}
      >
        {children}
      </svg>
    );
  };

/** Two rules, the top one long: a headline over its first line of copy. */
export const HeadingIcon = svg(
  [<path key="a" d="M2.5 4.5h11" />, <path key="b" d="M2.5 8.5h11" />, <path key="c" d="M2.5 12.5h6" />],
  'Heading',
);

/** Four rules of even weight. Body copy. */
export const TextIcon = svg(
  [
    <path key="a" d="M2.5 3.5h11" />,
    <path key="b" d="M2.5 6.8h11" />,
    <path key="c" d="M2.5 10.1h11" />,
    <path key="d" d="M2.5 13.4h7" />,
  ],
  'Text',
);

/** A frame with a horizon and a sun — the universal picture. */
export const ImageIcon = svg(
  [
    <rect key="a" x="2.2" y="3.2" width="11.6" height="9.6" rx="1.4" />,
    <path key="b" d="M2.4 10.6l3-3 2.6 2.3 2.3-2.1 3.3 3" />,
    <circle key="c" cx="10.4" cy="6.1" r="1" />,
  ],
  'Image',
);

/** A pill. */
export const ButtonIcon = svg([<rect key="a" x="1.8" y="5" width="12.4" height="6" rx="3" />], 'Button');

/** Two panes with a gutter. */
export const ColumnsIcon = svg(
  [
    <rect key="a" x="2.2" y="3.2" width="4.6" height="9.6" rx="1" />,
    <rect key="b" x="9.2" y="3.2" width="4.6" height="9.6" rx="1" />,
  ],
  'Columns',
);

/** Three short rows in one box: several blocks sharing a column. */
export const GroupIcon = svg(
  [
    <rect key="a" x="2.2" y="2.2" width="11.6" height="11.6" rx="1.6" />,
    <path key="b" d="M5 5.6h6" />,
    <path key="c" d="M5 8h6" />,
    <path key="d" d="M5 10.4h3.6" />,
  ],
  'Group',
);

/** A seal: a ring with a mark in it. */
export const BrandIcon = svg([<circle key="a" cx="8" cy="8" r="5.6" />, <path key="b" d="M6 10.2l2-4.4 2 4.4M6.7 8.7h2.6" />], 'Brand mark');

/** A frame with a stroke through it: a surface something was drawn on. */
export const FreeformIcon = svg(
  [<rect key="a" x="2.2" y="2.6" width="11.6" height="10.8" rx="1.4" />, <path key="b" d="M4.6 10.4c1.4-3.6 3.2-4.8 4.6-2.4s2.2 1.6 2.6-.6" />],
  'Freeform',
);

/** Two rules of different weight, which is what the block is. */
export const StripesIcon = svg(
  [<path key="a" d="M1.8 6h12.4" stroke-width="2.2" />, <path key="b" d="M1.8 10.4h12.4" />],
  'Stripes',
);

/** One rule, stopped short of the edges: a line inside the gutter, which is what the block is. */
export const DividerIcon = svg([<path key="a" d="M3.2 8h9.6" stroke-width="1.9" />], 'Divider');

/** Space held open between two edges. */
export const SpacerIcon = svg(
  [
    <path key="a" d="M2 3.4h12" />,
    <path key="b" d="M2 12.6h12" />,
    <path key="c" d="M8 6v4" />,
    <path key="d" d="M6.4 7.4L8 5.8l1.6 1.6" />,
    <path key="e" d="M6.4 8.6L8 10.2l1.6-1.6" />,
  ],
  'Spacer',
);

/** A filled band across the top of a frame. */
export const TopBarIcon = svg(
  [
    <rect key="a" x="2.2" y="3.2" width="11.6" height="9.6" rx="1.4" />,
    <path key="b" d="M2.6 6.1h10.8" stroke-width="2.6" />,
  ],
  'Top bar',
);

/** The same band, at the bottom. */
export const LegalIcon = svg(
  [
    <rect key="a" x="2.2" y="3.2" width="11.6" height="9.6" rx="1.4" />,
    <path key="b" d="M2.6 10.4h10.8" stroke-width="2.6" />,
  ],
  'Legal footer',
);

/**
 * A frame with a dashed interior holding two tiles: a region with a boundary we own and contents
 * we do not. Dashed rather than solid, which is the same language the canvas draws the area in.
 */
export const DndAreaIcon = svg(
  [
    <rect key="a" x="2.2" y="2.4" width="11.6" height="11.2" rx="1.4" stroke-dasharray="2.6 1.9" />,
    <rect key="b" x="4.6" y="5" width="6.8" height="2.3" rx="0.7" />,
    <rect key="c" x="4.6" y="8.8" width="6.8" height="2.3" rx="0.7" />,
  ],
  'Drag and drop area',
);

/** Two frames, one behind the other: the same thing in more than one place. */
export const PatternIcon = svg(
  [
    <rect key="a" x="4.4" y="4.4" width="9.4" height="9.4" rx="1.3" />,
    <path key="b" d="M2.2 11.4V3.6c0-.8.6-1.4 1.4-1.4h7.8" />,
  ],
  'Pattern',
);

export const TemplateIcon = svg(
  [
    <rect key="a" x="2.4" y="2.2" width="11.2" height="11.6" rx="1.4" />,
    <path key="b" d="M2.6 5.6h10.8" />,
    <path key="c" d="M5.2 2.4v11.2" />,
  ],
  'Template',
);

export const BLOCK_ICONS = {
  heading: HeadingIcon,
  richtext: TextIcon,
  image: ImageIcon,
  brand: BrandIcon,
  button: ButtonIcon,
  freeform: FreeformIcon,
  stripes: StripesIcon,
  divider: DividerIcon,
  spacer: SpacerIcon,
  dndarea: DndAreaIcon,
  topbar: TopBarIcon,
  legal: LegalIcon,
} as const;

/**
 * The glyph for anything the palette can hand you — the eight block types and the columns row,
 * which is not a block and so is not in the map above.
 *
 * One function rather than a lookup at each call site, because three places draw the same mark for
 * the same thing: the palette card you pick up, the ghost you carry, and the layer row it lands as.
 * That repetition is the point — it is what makes the three read as one object moving.
 */
export function glyphFor(kind: keyof typeof BLOCK_ICONS | 'columns' | `pattern:${string}`): Glyph {
  if (kind === 'columns') return ColumnsIcon;
  if (kind.startsWith('pattern:')) return PatternIcon;
  return BLOCK_ICONS[kind as keyof typeof BLOCK_ICONS];
}

// --- the rail ----------------------------------------------------------------------------------

// Four parts laid out, not a stack: the stack belongs to Layers, and at 15px the two were the same
// picture with a different number of lines under it.
export const RailBlocks = svg(
  [
    <rect key="a" x="2.4" y="2.4" width="5.1" height="5.1" rx="1.2" />,
    <rect key="b" x="8.5" y="2.4" width="5.1" height="5.1" rx="1.2" />,
    <rect key="c" x="2.4" y="8.5" width="5.1" height="5.1" rx="1.2" />,
    <rect key="d" x="8.5" y="8.5" width="5.1" height="5.1" rx="1.2" />,
  ],
  'Blocks',
);

export const RailTemplates = svg(
  [
    <path key="a" d="M2.2 4.4a1.2 1.2 0 011.2-1.2h2.6l1.3 1.6h5.5a1.2 1.2 0 011.2 1.2v5.6a1.2 1.2 0 01-1.2 1.2H3.4a1.2 1.2 0 01-1.2-1.2z" />,
  ],
  'Templates',
);

export const RailLayers = svg(
  [
    <path key="a" d="M8 2.4L14 5.6 8 8.8 2 5.6z" />,
    <path key="b" d="M2.6 8.8L8 11.6l5.4-2.8" />,
    <path key="c" d="M2.6 11.4L8 14.2l5.4-2.8" />,
  ],
  'Layers',
);

export const RailAssets = svg(
  [
    <rect key="a" x="2.2" y="2.8" width="11.6" height="10.4" rx="1.4" />,
    <path key="b" d="M2.4 10.8l3.2-3.2 2.8 2.5 2.2-2 3 2.7" />,
    <circle key="c" cx="10.6" cy="5.9" r="1.05" />,
  ],
  'Assets',
);

// Half a disc filled. The appearance glyph everywhere, and the only one in the set that carries a
// fill — which is the point: the design tab is a different kind of destination from the four above
// it, and the rail says so twice, here and in where it sits.
export const RailDesign = svg(
  [
    <circle key="a" cx="8" cy="8" r="5.6" />,
    <path key="b" d="M8 2.4a5.6 5.6 0 010 11.2z" fill="currentColor" stroke="none" />,
  ],
  'Design',
);

/** A chain, for a value that is following a token rather than holding one of its own. */
export const LinkedIcon = svg(
  [
    <path key="a" d="M6.6 9.4a2.6 2.6 0 010-3.7l2.1-2.1a2.6 2.6 0 013.7 3.7l-1 1" />,
    <path key="b" d="M9.4 6.6a2.6 2.6 0 010 3.7l-2.1 2.1a2.6 2.6 0 01-3.7-3.7l1-1" />,
  ],
  'Following the page',
);

// --- the canvas ---------------------------------------------------------------------------------

/** A screen on a stand. */
export const DesktopIcon = svg(
  [
    <rect key="a" x="1.8" y="2.6" width="12.4" height="8.6" rx="1.3" />,
    <path key="b" d="M6.2 13.6h3.6" />,
    <path key="c" d="M8 11.2v2.4" />,
  ],
  'Desktop',
);

/** A handset. */
export const PhoneIcon = svg(
  [
    <rect key="a" x="4.4" y="1.6" width="7.2" height="12.8" rx="1.7" />,
    <path key="b" d="M7.1 12.2h1.8" />,
  ],
  'Phone',
);

/** An envelope, for the inbox the email is read in rather than the screen it is read on. */
export const InboxIcon = svg(
  [
    <rect key="a" x="1.8" y="3.4" width="12.4" height="9.2" rx="1.3" />,
    <path key="b" d="M2.2 4.6L8 8.8l5.8-4.2" />,
  ],
  'Inbox',
);

/** A crescent: the dark override. */
export const MoonIcon = svg([<path key="a" d="M13.2 9.6A5.4 5.4 0 0 1 6.4 2.8a5.4 5.4 0 1 0 6.8 6.8z" />], 'Dark override');
/** An eye: the email with every control out of the way. */
export const EyeIcon = svg(
  [<path key="a" d="M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8s-2.3 4.2-6.2 4.2S1.8 8 1.8 8z" />, <circle key="b" cx="8" cy="8" r="2.1" />],
  'Preview',
);

/** A fork: the branches an optional field creates, one of which the canvas is showing. */
export const BranchIcon = svg(
  [
    <circle key="a" cx="4.2" cy="3.6" r="1.5" />,
    <circle key="b" cx="4.2" cy="12.4" r="1.5" />,
    <circle key="c" cx="11.8" cy="6" r="1.5" />,
    <path key="d" d="M4.2 5.1v5.8" />,
    <path key="e" d="M11.8 7.5c0 2.4-2.2 2.6-4.6 3.2-1.3.3-2.4.7-3 1.7" />,
  ],
  'Preview state',
);

/** Two sheets, one behind the other. */
export const CopyIcon = svg(
  [
    <rect key="a" x="5.4" y="1.9" width="8.4" height="8.4" rx="1.4" />,
    <path key="b" d="M10.6 12.6a1.4 1.4 0 01-1.4 1.4H3.6a1.4 1.4 0 01-1.4-1.4V6.9a1.4 1.4 0 011.4-1.4" />,
  ],
  'Copy',
);

/** A tick, for the moment after. */
export const TickIcon = svg([<path key="a" d="M3 8.4l3.4 3.3L13 4.9" />], 'Copied');

// --- the mail client ----------------------------------------------------------------------------
//
// The row of grey glyphs above an open message. They are inert — this is a picture of a client, not
// a client — and they are here because the shape of that row is most of what makes the view
// recognisable at a glance. Drawn on the same 16-box as everything else, at the same weight.

export const MailBack = svg([<path key="a" d="M13 8H3.4" />, <path key="b" d="M7 4.2L3.2 8l3.8 3.8" />], 'Back');

export const MailArchive = svg(
  [
    <rect key="a" x="2.2" y="3.2" width="11.6" height="3" rx="0.9" />,
    <path key="b" d="M3.4 6.4v5.1a1 1 0 001 1h7.2a1 1 0 001-1V6.4" />,
    <path key="c" d="M6.5 9h3" />,
  ],
  'Archive',
);

export const MailTrash = svg(
  [
    <path key="a" d="M2.8 4.4h10.4" />,
    <path key="b" d="M5.2 4.4V3.2a1 1 0 011-1h3.6a1 1 0 011 1v1.2" />,
    <path key="c" d="M4.2 4.4l.7 8.1a1 1 0 001 .9h4.2a1 1 0 001-.9l.7-8.1" />,
  ],
  'Delete',
);

export const MailStar = svg(
  [<path key="a" d="M8 2.4l1.75 3.6 3.95.56-2.85 2.8.67 3.94L8 11.44 4.48 13.3l.67-3.94L2.3 6.56l3.95-.56z" />],
  'Star',
);

export const MailReply = svg(
  [<path key="a" d="M6.2 4L2.6 7.6 6.2 11.2" />, <path key="b" d="M2.9 7.6h5.9a4.3 4.3 0 014.3 4.3v0.5" />],
  'Reply',
);

export const MailMore = svg(
  [
    <circle key="a" cx="8" cy="3.2" r="1.15" fill="currentColor" stroke="none" />,
    <circle key="b" cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />,
    <circle key="c" cx="8" cy="12.8" r="1.15" fill="currentColor" stroke="none" />,
  ],
  'More',
);

/** The little caret beside "to me". */
export const MailCaret = svg([<path key="a" d="M4.4 6.4L8 10l3.6-3.6" />], '');

export const MailCompose = svg([<path key="a" d="M8 3.4v9.2" />, <path key="b" d="M3.4 8h9.2" />], 'Compose');

export const MailInbox = svg(
  [
    <path key="a" d="M2.4 9.2L4.1 3.6a1 1 0 01.95-.7h5.9a1 1 0 01.95.7l1.7 5.6" />,
    <path key="b" d="M2.4 9.2h3.1l.8 1.7h3.4l.8-1.7h3.1v2.9a1 1 0 01-1 1H3.4a1 1 0 01-1-1z" />,
  ],
  'Inbox',
);

export const MailClock = svg(
  [<circle key="a" cx="8" cy="8" r="5.6" />, <path key="b" d="M8 4.9V8.2l2.2 1.4" />],
  'Snoozed',
);

export const MailSend = svg([<path key="a" d="M13.6 2.6L2.4 6.9l4.3 1.9 1.9 4.3z" />], 'Sent');

export const MailDraft = svg(
  [
    <path key="a" d="M4 2.6h4.6l3.4 3.4v7.4a1 1 0 01-1 1H4a1 1 0 01-1-1V3.6a1 1 0 011-1z" />,
    <path key="b" d="M8.4 2.8v3.4h3.4" />,
  ],
  'Drafts',
);
