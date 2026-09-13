import * as React from 'react';
/** Freshness of a live document section: live / stale (changed since you looked) / frozen at a moment. */
export interface FreshnessProps extends React.HTMLAttributes<HTMLSpanElement> {
  state: 'live' | 'stale' | 'frozen';
  /** Relative time, e.g. "2 days ago". */
  when?: string;
  onRefresh?: () => void;
  onFreeze?: () => void;
}
export function Freshness(props: FreshnessProps): JSX.Element;
