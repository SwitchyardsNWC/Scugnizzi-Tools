import * as React from 'react';
export interface DataTableColumn<T = any> { key: string; label: string; width?: string | number; align?: 'left' | 'right'; muted?: boolean; /** Figures: mono face, right-aligned, one line. */ numeric?: boolean; /** Keep on one line and truncate at `width` instead of wrapping. */ nowrap?: boolean; render?: (row: T) => React.ReactNode; }
/** Hairline-row data table: 12px muted column labels, soft row rules, 14px body, mono figures.
 *  Keeps its content width and scrolls the sheet sideways rather than letting columns collide.
 *  `stickyHeader` pins the column labels while the shell scrolls; `pinFirst` keeps the first column in place while the sheet scrolls sideways.
 *  Inline drill-down: pass `expandedKey` (one key or an array) + `renderExpanded(row)` and the row opens in place under a 2px ink marker. */
export interface DataTableProps<T = any> extends React.TableHTMLAttributes<HTMLTableElement> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey?: string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | number;
  /** Row key(s) currently expanded in place. */
  expandedKey?: string | number | Array<string | number>;
  /** Content rendered under an expanded row (the drill-down). */
  renderExpanded?: (row: T) => React.ReactNode;
  emptyText?: string;
  stickyHeader?: boolean;
  pinFirst?: boolean;
  /** Row padding: compact 6px, balanced 9px (default), airy 12px. */
  density?: 'compact' | 'balanced' | 'airy';
  /** Scroll the rows inside the table instead of the page. */
  maxHeight?: number | string;
}
export function DataTable<T = any>(props: DataTableProps<T>): JSX.Element;
