import * as React from 'react';
/** Per-phase progress: 4px hairline bar with "n of m done" and the required-open count. */
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  done: number;
  total: number;
  /** Number of required items still open; 0 shows "Ready to close". */
  required?: number;
  label?: React.ReactNode | false;
  /** Fill colour from the data palette; default ink (moss at 100%). */
  tone?: 'primary' | 'good' | 'warn' | 'bad';
}
export function Progress(props: ProgressProps): JSX.Element;
/** Quiet KPI cell: 24px mono figure, label, optional hint, soft hairline underneath. Wrap cells in KpiStrip. For dashboards prefer Stat (delta + sparkline + drill). */
export interface KpiProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'risk' | 'blocked';
}
export function Kpi(props: KpiProps): JSX.Element;
/** Summary strip for Kpi cells: reflows to fewer columns instead of squeezing, and aligns
 *  value / label / hint on shared rows so a two-line label can't knock its neighbours out of line. */
export interface KpiStripProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pin a column count; omit to reflow on `min`. */
  columns?: number;
  /** Minimum cell width before the strip drops a column. Default 140. */
  min?: number | string;
  children?: React.ReactNode;
}
export function KpiStrip(props: KpiStripProps): JSX.Element;
