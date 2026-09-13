import * as React from 'react';
export interface BarListItem { key?: string | number; label: React.ReactNode; /** Muted note after the label. */ meta?: React.ReactNode; value: number; /** Data palette index or CSS colour for this row only. */ tone?: number | string; }
/** Ranked horizontal bars — label left, mono value right, 6px bar under both. The replacement for bar charts: sorted, labelled, readable in a column. */
export interface BarListProps extends React.HTMLAttributes<HTMLDivElement> {
  items: BarListItem[];
  /** Scale ceiling; default = the largest value. */
  max?: number;
  /** Data palette index or CSS colour for all bars. Default 1. */
  tone?: number | string;
  format?: (v: number) => string;
  /** Rows become drill targets. */
  onSelect?: (item: BarListItem) => void;
  selectedKey?: string | number;
  showValue?: boolean;
  barHeight?: number;
}
export function BarList(props: BarListProps): JSX.Element;
