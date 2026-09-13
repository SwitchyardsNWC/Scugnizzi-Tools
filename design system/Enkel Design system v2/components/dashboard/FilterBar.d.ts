import * as React from 'react';
/** Toolbar row between header and content: filter controls left (Segmented, Select, FilterChip, TextInput), a muted summary count and actions right. Wraps on narrow widths. */
export interface FilterBarProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  /** Muted tabular text such as "24 clubs · updated 2 min ago". */
  summary?: React.ReactNode;
  /** Right-hand actions (Button, ThemeToggle). */
  trailing?: React.ReactNode;
}
export function FilterBar(props: FilterBarProps): JSX.Element;
/** Removable active-filter token: "Club: Ponce City ×". */
export interface FilterChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  label?: React.ReactNode;
  value: React.ReactNode;
  onRemove?: () => void;
}
export function FilterChip(props: FilterChipProps): JSX.Element;
