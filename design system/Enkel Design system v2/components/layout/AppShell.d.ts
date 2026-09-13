import * as React from 'react';
/**
 * Responsive page frame that owns the viewport: rail | [static header / scrolling main], with any right-hand inspector
 * laid over the main as a drawer. Desktop ≥1024: 200px hairline rail, 32px gutter (24px when width="full"), 1440 max.
 * Tablet 768–1023: 160px rail, 24px gutter. Phone <768: TopBar + header + scrolling content + BottomTabs; the drawer becomes a bottom sheet.
 */
export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Force a tier instead of reading window width. */
  tier?: 'auto' | 'phone' | 'tablet' | 'desktop';
  /** Rail contents on tablet/desktop (Wordmark + SidebarNav). */
  rail?: React.ReactNode;
  /** Phone header (TopBar). */
  top?: React.ReactNode;
  /** Phone footer (BottomTabs). */
  tabs?: React.ReactNode;
  /** Static header pinned above the scrolling main on every tier — a ShellHeader, a filter bar, tabs. */
  header?: React.ReactNode;
  /** Right-hand inspector (a Panel). Non-null = open. Overlays the main on desktop/tablet, bottom sheet on phone. */
  drawer?: React.ReactNode;
  /** Drawer width on desktop/tablet. Default 440. */
  drawerWidth?: number | string;
  /** Accessible name for the drawer dialog. */
  drawerTitle?: string;
  /** Escape key / phone scrim tap. Also pass it to the Panel's onClose. */
  onDrawerClose?: () => void;
  /** 'page' caps main at 1440px for reading; 'full' lets tables and schedules run the whole width at a 42px gutter. */
  width?: 'page' | 'full';
  /** 'sunken' tints the scrolling main so paper Cards read as surfaces; rail and header stay paper. Default 'paper'. */
  ground?: 'paper' | 'sunken';
  children?: React.ReactNode;
}
export function AppShell(props: AppShellProps): JSX.Element;
/** Static 56px header for AppShell's `header` slot: kicker + 18px title (+ inline children such as tabs/filters) left, actions right. */
export interface ShellHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  kicker?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}
export function ShellHeader(props: ShellHeaderProps): JSX.Element;
