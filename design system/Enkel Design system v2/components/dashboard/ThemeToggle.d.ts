import * as React from 'react';
/** Light / Dark segmented toggle. Sets `data-theme` on <html> (the token sheets switch on it) and persists to localStorage `enkel-theme`; first load follows the OS. */
export interface ThemeToggleProps extends React.HTMLAttributes<HTMLDivElement> { size?: 'sm' | 'md'; }
export function ThemeToggle(props: ThemeToggleProps): JSX.Element;
/** Current theme: stored value, else OS preference. */
export function GetTheme(): 'light' | 'dark';
/** Set and persist a theme. */
export function ApplyTheme(t: 'light' | 'dark'): void;
