import * as React from 'react';
/** 0-radius hairline chip for status and medium. Monochrome only. Intentional addition. */
export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'outline' | 'muted' | 'filled';
  children?: React.ReactNode;
}
export function Tag(props: TagProps): JSX.Element;
