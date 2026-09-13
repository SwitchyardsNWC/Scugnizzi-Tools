import * as React from 'react';
export type Status = 'done' | 'ontrack' | 'progress' | 'risk' | 'blocked' | 'notstarted' | 'build';
/** One status language at five sizes: badge, dot (tables), bar (progress/phase), chip (calendar cells), card (left rule on a card). */
export interface StatusBadgeProps extends React.HTMLAttributes<HTMLElement> {
  status: Status;
  size?: 'badge' | 'dot' | 'bar' | 'chip' | 'card';
  /** Override the default label. */
  label?: string;
  children?: React.ReactNode;
}
export function StatusBadge(props: StatusBadgeProps): JSX.Element;
export const STATUS_META: Record<Status, { label: string; ink: string; soft: string }>;
