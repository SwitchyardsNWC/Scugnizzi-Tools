import * as React from 'react';
/** Phone-tier header: 52px, hairline bottom, sticky. Optional text back link on the left, single action on the right. No icons beyond the ← glyph. */
export interface TopBarProps extends React.HTMLAttributes<HTMLElement> {
  title: React.ReactNode;
  /** true for a bare arrow, or a string label ("Projects"). */
  back?: boolean | string;
  onBack?: () => void;
  /** Right-side slot — usually a ghost TextLink or a Button size="sm". */
  action?: React.ReactNode;
}
export function TopBar(props: TopBarProps): JSX.Element;
