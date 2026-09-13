import * as React from 'react';
/** Body paragraph: 17px, line-height 1.2, 21px below. Light cut for long-form. */
export interface ParagraphProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** Use HelveticaNeue-Light (300). */
  light?: boolean;
  /** Graphite text colour for tertiary copy. */
  muted?: boolean;
  size?: 'body' | 'caption';
  /** Cap line length at 66ch (default true). */
  measure?: boolean;
  children?: React.ReactNode;
}
export function Paragraph(props: ParagraphProps): JSX.Element;
