import * as React from 'react';
/** 1px hairline — the system's primary organising device. */
export interface DividerProps extends React.HTMLAttributes<HTMLHRElement> {
  /** ink = #000, charcoal = #2c2222, muted = #b2b4b1 */
  tone?: 'ink' | 'charcoal' | 'muted';
  vertical?: boolean;
}
export function Divider(props: DividerProps): JSX.Element;
