import * as React from 'react';
/** Exclusive pick between 2–5 short options (period, view, group-by). Active segment is filled ink. Same heights as Button (36 / 28). */
export interface SegmentedProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: Array<string | { value: string; label: React.ReactNode }>;
  value: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}
export function Segmented(props: SegmentedProps): JSX.Element;
