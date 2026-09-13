import * as React from 'react';
/** Cell map — one square per bin / day / seat. A cell is coloured by its own `tone`, or by `value` against `max` as intensity of the grid `tone`. Hover peeks label + meta; `onSelect` drills. */
export interface HeatCell { key?: string | number; label: string; meta?: string; value?: number; /** Data palette index 1–6 or CSS colour; overrides value shading. */ tone?: number | string; }
export interface HeatGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cells: HeatCell[];
  /** Cells per row. Default 12. */
  columns?: number;
  /** Max cell size in px; cells shrink to fit the container. Default 22. */
  size?: number;
  gap?: number;
  /** Grid tone for value-shaded cells. Default 1. */
  tone?: number | string;
  max?: number;
  onSelect?: (cell: HeatCell) => void;
  selectedKey?: string | number;
  /** Swatch legend under the grid. */
  legend?: { label: string; tone: number | string }[];
  /** Hover peek per cell. Default true. */
  peek?: boolean;
}
export function HeatGrid(props: HeatGridProps): JSX.Element;
