import * as React from 'react';
/** Two clocks: "Sep 12 · in 8 days". Solid square = project due, hollow square = phase due. Overdue relative text in brick. */
export interface DateStampProps extends React.HTMLAttributes<HTMLSpanElement> {
  date: string | Date;
  /** Reference "now" for stable demos. */
  now?: string | Date;
  clock?: 'project' | 'phase';
  showRelative?: boolean;
}
export function DateStamp(props: DateStampProps): JSX.Element;
export function relativeDays(d: string | Date, now?: Date): string;
