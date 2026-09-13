import * as React from 'react';
/** Display headline: 62px, line-height 1.0, weight 400. Page titles only. */
export interface HeadlineProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'div';
  children?: React.ReactNode;
}
export function Headline(props: HeadlineProps): JSX.Element;
