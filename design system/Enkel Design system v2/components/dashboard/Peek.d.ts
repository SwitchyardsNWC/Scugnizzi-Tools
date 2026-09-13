import * as React from 'react';
/** Hover peek, click to commit. Wrap a trigger (a name in a table, a Stat); after `delay` ms a 280px ink-bordered card with `content` appears; clicking the trigger still fires its own onClick.
 *  Keyboard focus also opens it; Escape closes. Never the only route to the detail. */
export interface PeekProps extends React.HTMLAttributes<HTMLSpanElement> {
  content: React.ReactNode;
  children: React.ReactNode;
  /** ms before showing. Default 250. */
  delay?: number;
  side?: 'bottom' | 'top' | 'right';
  width?: number;
}
export function Peek(props: PeekProps): JSX.Element;
