import * as React from 'react';
/** The product says no on purpose. A colleague pointing at the missing thing: plain title, the items in the way, one fix action. Never a disabled button. */
export interface RefusalProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  /** gate = brick rules (cannot close / cannot mark done); short = amber (warehouse shortfall) */
  tone?: 'gate' | 'short';
  action?: React.ReactNode;
  children?: React.ReactNode;
}
export function Refusal(props: RefusalProps): JSX.Element;
