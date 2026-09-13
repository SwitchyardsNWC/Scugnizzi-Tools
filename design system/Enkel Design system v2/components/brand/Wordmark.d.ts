import * as React from 'react';
/** Lowercase wordmark with trailing underscore. Pinned top-left of every page. */
export interface WordmarkProps extends React.HTMLAttributes<HTMLElement> {
  /** Brand name, rendered lowercase; underscore is appended automatically. */
  name?: string;
  /** Font size in px. 21 for sidebar, 62 for display. */
  size?: 21 | 30 | 62 | number;
  /** Renders as an anchor when set. */
  href?: string;
  as?: keyof JSX.IntrinsicElements;
}
export function Wordmark(props: WordmarkProps): JSX.Element;
