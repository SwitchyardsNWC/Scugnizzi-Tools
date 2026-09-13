import * as React from 'react';
/** Period-over-period change: mono figure with a square glyph (▲ ▼ ■). Green when good, brick when bad, graphite when flat.
 *  Sign decides good/bad unless `invert` (lower is better: costs, open tickets) or an explicit `tone`. */
export interface DeltaProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Signed number; default rendering is "+4.2%". */
  value: number | string;
  /** Custom formatter for the figure, e.g. n => (n>0?'+':'')+n+' pts'. */
  format?: (n: number) => string;
  /** Lower is better. */
  invert?: boolean;
  tone?: 'good' | 'bad' | 'flat';
  /** Muted sans suffix, e.g. "vs last month". */
  label?: React.ReactNode;
  size?: 'sm' | 'md';
}
export function Delta(props: DeltaProps): JSX.Element;
/** Mono tabular figure for inline numbers and table cells. */
export interface NumProps extends React.HTMLAttributes<HTMLSpanElement> { size?: number | string; muted?: boolean; children?: React.ReactNode; }
export function Num(props: NumProps): JSX.Element;
