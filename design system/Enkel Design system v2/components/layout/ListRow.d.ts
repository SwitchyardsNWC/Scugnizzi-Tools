import * as React from 'react';
/** Touch list row — the phone-tier stand-in for a DataTable row. 56px min, hairline bottom, primary 17px + optional 15px secondary, right-aligned tabular meta, › chevron when tappable. */
export interface ListRowProps extends React.HTMLAttributes<HTMLElement> {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  /** Right-aligned value: a count, date, or StatusBadge. */
  meta?: React.ReactNode;
  /** Replaces the default › chevron. */
  trailing?: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
}
export function ListRow(props: ListRowProps): JSX.Element;
