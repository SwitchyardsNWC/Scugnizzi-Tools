import * as React from 'react';
/** Paper surface on the sunken page: square, one soft hairline, no shadow. Header = 13px muted title (+ meta) left, actions right.
 *  With `onClick` the card is a drill target: border deepens to ink on hover and a → appears. */
export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  /** 11px uppercase line above the title. */
  kicker?: React.ReactNode;
  /** Muted figure/period after the title, e.g. "Last 30 days". */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  /** Freshness stamp in the footer, e.g. "2 min ago" → "Live · 2 min ago". Dashboards go stale silently; every data card should carry one. */
  updated?: string;
  /** Freshness state for the stamp. Default 'live'. */
  fresh?: 'live' | 'stale' | 'frozen';
  /** Whole-card drill-down. */
  onClick?: () => void;
  /** Inner padding. Default 16. */
  padding?: number;
  children?: React.ReactNode;
}
export function Card(props: CardProps): JSX.Element;
/** Grid of Cards that drops columns instead of squeezing. */
export interface CardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Minimum card width before a column drops. Default 240. */
  min?: number | string;
  /** Pin a column count. */
  columns?: number;
  gap?: number;
  children?: React.ReactNode;
}
export function CardGrid(props: CardGridProps): JSX.Element;
