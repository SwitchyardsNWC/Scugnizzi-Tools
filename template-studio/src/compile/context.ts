// What a block renderer is handed.
//
// Note what is *not* here: the mode. A block emits one tree and has no idea whether it is being
// previewed or exported (architecture.md §2). If a block ever needs to branch on mode, the fix is a
// `print` node with a fallback or an `if` node, not a flag.

import { colorOf, theme, type DesignSystem } from '../model/design-system.ts';
import type { BoxTokens } from './layout.ts';
import type { Column, Preview } from '../model/types.ts';

export interface BuildContext {
  ds: DesignSystem;

  /** Sample values for the CAN-SPAM variables. Only ever reaches the output as a `print` fallback. */
  preview: Preview;
  /** Rules for the mobile media query, in emission order. */
  mobile: string[];
  /** Rules for the `hs-inline-css` block HubSpot inlines at send (learnings 1.9). */
  inlineCss: string[];
  /**
   * One counter shared across every generated class name, so `sy-rt-2` and `sy-ftag-5` never
   * collide and the numbering is stable for a given document.
   */
  next(prefix: string): string;
  /**
   * Emits a shared block of rules the first time something needs them, and never again.
   *
   * The alternative is emitting every rule the compiler might need into every template, which is
   * how a stylesheet grows until Gmail clips the footer off the email (learnings 2.12). A template
   * with no multi-column row should not carry the rules that stack one.
   */
  once(key: string, emit: () => void): void;
}

export function createContext(ds: DesignSystem, preview: Preview): BuildContext {
  let seq = 0;
  const emitted = new Set<string>();
  return {
    ds,
    preview,
    mobile: [],
    inlineCss: [],
    next(prefix: string) {
      seq += 1;
      return `${prefix}-${seq}`;
    },
    once(key: string, emit: () => void) {
      if (emitted.has(key)) return;
      emitted.add(key);
      emit();
    },
  };
}

type Padded = Pick<Column, 'padTop' | 'padBottom' | 'padLeft' | 'padRight'>;

/**
 * The two side paddings a column actually renders at.
 *
 * The gutter is one decision about the email — sixteen columns each carrying their own 20 is not a
 * design, it is sixteen chances to disagree — so a column follows `pagePadding` unless it has been
 * given a number of its own. `null` is the inspector handing a side back.
 */
export function sidesOf(column: Padded, ds: DesignSystem): { left: number; right: number } {
  return {
    left: typeof column.padLeft === 'number' ? column.padLeft : ds.pagePadding,
    right: typeof column.padRight === 'number' ? column.padRight : ds.pagePadding,
  };
}

/**
 * A content cell's padding, as a CSS shorthand.
 *
 * Vertical comes from the column, because that is a decision about this block; horizontal comes
 * from the page unless this block departs from it.
 *
 * Collapses to v1's three-value form whenever the sides match, which is every block that follows
 * the page — so an email nobody has given custom sides to is byte-identical to the one v1 shipped.
 */
export function paddingOf(column: Padded, ds: DesignSystem): string {
  const { left, right } = sidesOf(column, ds);
  return left === right
    ? `${column.padTop}px ${left}px ${column.padBottom}px`
    : `${column.padTop}px ${right}px ${column.padBottom}px ${left}px`;
}

/**
 * The class a cell needs so its own side padding survives a phone, or null if it has none.
 *
 * The head carries `@media phone { .hs_padded { padding-left:<gutter>px !important } }` — HubSpot's
 * own class, and a rule this project cannot drop (learnings 1.11). `!important` means a column that
 * departs from the gutter would be dragged back to it on every phone in the world, which is where
 * most email is read. So a departing cell gets a class of its own, emitted into the later phone
 * block: same specificity, later in the sheet, so it wins.
 *
 * Named for the numbers rather than for the block, so two blocks that made the same choice share
 * one rule instead of paying for it twice.
 */
export function padClass(column: Padded, ctx: BuildContext): string | null {
  const { left, right } = sidesOf(column, ctx.ds);
  const gut = ctx.ds.pagePadding;
  // The gutter's own phone rule, once, from the first cell that wears the class — rather than in
  // the head for every template, where a footer-only email carried it for nothing. It goes in
  // first, so a departing cell's rule below still comes later in the sheet and wins.
  ctx.once('hs_padded', () =>
    ctx.mobile.push(`.hs_padded { padding-left:${gut}px !important; padding-right:${gut}px !important }`),
  );
  if (left === gut && right === gut) return null;
  const cls = `sy-pad-${left}-${right}`;
  ctx.once(cls, () =>
    ctx.mobile.push(`.${cls} { padding-left:${left}px !important; padding-right:${right}px !important }`),
  );
  return cls;
}

/**
 * The space between the blocks of a column that holds more than one. The column's own number when
 * it has one, otherwise the system's — the same rule as the sides and the gutter.
 */
export function gapOf(column: Pick<Column, 'gap'>, ds: DesignSystem): number {
  return typeof column.gap === 'number' ? Math.max(0, column.gap) : ds.blockGap;
}

/**
 * The box a column asks for, or null when it does not — which is every column by default, and is
 * why an email nobody has drawn a box in is byte-identical to one from before boxes existed.
 *
 * The colour resolves through the palette rather than being stored as a hex, so recolouring the
 * brand moves every box with it (learnings 3.34).
 */
export function boxOf(column: Column, ds: DesignSystem): BoxTokens | null {
  const width = column.borderWidth ?? 0;
  // A fill is a box too: a card with no line around it still needs the wrapper that paints it.
  const fill = colorOf(ds, column.fill ?? null);
  if (width <= 0 && !fill) return null;
  return {
    width,
    color: colorOf(ds, column.borderColor ?? null) ?? theme(ds, 'cream').text,
    radius: column.borderRadius ?? 0,
    pad: column.borderPad ?? 0,
    fill,
  };
}

