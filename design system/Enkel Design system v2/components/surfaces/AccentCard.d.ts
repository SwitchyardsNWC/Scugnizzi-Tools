import * as React from 'react';
/** Card surface: slate-iris fill with white text (accent) or hairline outline on paper. 21px padding, 0 radius, no shadow. */
export interface AccentCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'accent' | 'outline';
  children?: React.ReactNode;
}
export function AccentCard(props: AccentCardProps): JSX.Element;
