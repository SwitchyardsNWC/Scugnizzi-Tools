import * as React from 'react';
/** Filled slate-iris button — the one place chrome carries chroma. Outline and ghost variants for secondary actions.
 *  Height is built from explicit padding (1 + 11 / 16 / 7 + 1 = 36 at md, 1 + 8 / 14 / 4 + 1 = 28 at sm) so the label's cap height reads optically centred;
 *  the label is one text run and truncates rather than pushing out of a tight column. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** filled = slate iris (--action-primary) with white text; outline = --border-control edge (3:1); ghost = text only */
  variant?: 'filled' | 'outline' | 'ghost';
  /** md = 36px tall, 14px label, 16px side padding; sm = 28px tall, 13px label, 12px */
  size?: 'md' | 'sm';
  /** Trailing tabular figure, 8px off the label ("Show all 38"). Never use it for a second word. */
  count?: React.ReactNode;
  /** Let a long label wrap onto a second line and grow the button instead of truncating. */
  wrap?: boolean;
  children?: React.ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
