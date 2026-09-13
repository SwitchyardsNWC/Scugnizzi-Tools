import * as React from 'react';
/** Deliberate empty state: dashed hairline, what goes here, the one action that fills it. */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  what: React.ReactNode;
  action?: React.ReactNode;
  /** CSS aspect-ratio for image/embed slots. */
  ratio?: string;
  compact?: boolean;
}
export function EmptyState(props: EmptyStateProps): JSX.Element;
