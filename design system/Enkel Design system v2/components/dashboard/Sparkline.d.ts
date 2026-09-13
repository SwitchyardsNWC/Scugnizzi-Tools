import * as React from 'react';
/** Axis-less trend for a Stat or table cell: a 1.5px line (last point marked with a square) or a bar row (last bar coloured, the rest track-grey). */
export interface SparklineProps extends React.SVGAttributes<SVGSVGElement> {
  data: number[];
  kind?: 'line' | 'bars';
  /** Pixel height. Default 32. */
  height?: number;
  width?: number | string;
  /** Data palette index 1–6, or a CSS colour. Default 1. */
  tone?: number | string;
  /** Dashed reference line (target, last period). */
  baseline?: number;
  /** Mark the last point. Default true. */
  last?: boolean;
}
export function Sparkline(props: SparklineProps): JSX.Element;
