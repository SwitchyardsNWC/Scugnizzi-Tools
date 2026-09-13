import * as React from 'react';
/** Section heading at 30 / 21 / 19px with compressed leading. */
export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** heading = 30px, sm = 21px, sub = 19px */
  level?: 'heading' | 'sm' | 'sub';
  as?: keyof JSX.IntrinsicElements;
  children?: React.ReactNode;
}
export function Heading(props: HeadingProps): JSX.Element;
