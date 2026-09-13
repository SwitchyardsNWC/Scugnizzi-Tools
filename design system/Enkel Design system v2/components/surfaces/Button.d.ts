import * as React from 'react';
/** Filled accent button — the only filled element in the system. Outline and ghost variants for secondary actions.
 *  Height is built from explicit padding (13/11 at md, 8/6 at sm) so the label's cap height reads optically centred;
 *  the label is one text run and truncates rather than pushing out of a tight column. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** filled = #495472 with white text; outline = hairline; ghost = text only */
  variant?: 'filled' | 'outline' | 'ghost';
  /** md = 44px tall, 21px side padding; sm = 34px tall, 10px */
  size?: 'md' | 'sm';
  /** Trailing tabular figure, 10px off the label ("Show all 38"). Never use it for a second word. */
  count?: React.ReactNode;
  /** Let a long label wrap onto a second line and grow the button instead of truncating. */
  wrap?: boolean;
  children?: React.ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
