import * as React from 'react';
export interface SidebarNavItem { id: string; label: string; href?: string; }
/** Vertical section index for the left rail: 17px text, 10px gap, fossil inactive / black active. No icons, no bullets. */
export interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: SidebarNavItem[];
  activeId?: string;
  /** Called with the item id; prevents navigation when supplied. */
  onSelect?: (id: string) => void;
}
export function SidebarNav(props: SidebarNavProps): JSX.Element;
