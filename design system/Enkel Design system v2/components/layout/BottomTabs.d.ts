import * as React from 'react';
export interface BottomTabItem { id: string; label: string; href?: string; }
/** Phone-tier replacement for SidebarNav: 3–5 equal text tabs, 56px tall, hairline top, active = black text + 2px top rule. Text labels only — no icons. */
export interface BottomTabsProps extends React.HTMLAttributes<HTMLElement> {
  items: BottomTabItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
}
export function BottomTabs(props: BottomTabsProps): JSX.Element;
