import * as React from 'react';
/** Where a schedule row comes from: warehouse (bin), purchase (vendor) or build (spec page). Distinct from status. */
export interface SourceBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  source: 'warehouse' | 'purchase' | 'build';
  /** Bin, vendor or spec name shown after the badge. */
  detail?: string;
}
export function SourceBadge(props: SourceBadgeProps): JSX.Element;
