import * as React from 'react';
/** Ghost text link: fossil by default, black on hover, no underline. */
export interface TextLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Append a " →" glyph. */
  arrow?: boolean;
  children?: React.ReactNode;
}
export function TextLink(props: TextLinkProps): JSX.Element;
