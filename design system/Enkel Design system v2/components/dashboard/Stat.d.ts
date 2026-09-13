import * as React from 'react';
/** The dashboard figure: 13px label / 28px mono value (+ unit) / Delta + hint / optional Sparkline. `onClick` makes it a drill target (→ on hover). */
export interface StatProps extends React.HTMLAttributes<HTMLElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Muted unit after the figure: "%", "sq ft", "of 24". */
  unit?: React.ReactNode;
  /** Signed change; rendered through Delta. */
  delta?: number;
  /** Delta suffix, e.g. "vs last week". */
  deltaLabel?: React.ReactNode;
  /** Lower is better for this metric. */
  invert?: boolean;
  spark?: number[];
  sparkKind?: 'line' | 'bars';
  /** Data palette index for the spark. Default 1. */
  tone?: number | string;
  /** Muted one-liner in place of / after the delta. */
  hint?: React.ReactNode;
  onClick?: () => void;
  /** 'lg' = 40px value for a hero figure. */
  size?: 'md' | 'lg';
}
export function Stat(props: StatProps): JSX.Element;
/** Row of Stats, each in its own card; reflows by `min` width. */
export interface StatGridProps extends React.HTMLAttributes<HTMLDivElement> { min?: number | string; columns?: number; /** Columns pinned under 768px. Default 2; 0 to disable. */ phoneColumns?: number; gap?: number; children?: React.ReactNode; }
/** Matches `(max-width: 767px)` live. Internal to the dashboard set (lowercase exports are not on the window namespace). */
export function usePhone(max?: number): boolean;
export function StatGrid(props: StatGridProps): JSX.Element;
