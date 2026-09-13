import * as React from 'react';
/** Right-hand inspector: hairline left edge, header (kicker + title + ×), scrolling body, optional footer actions. */
export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  title: React.ReactNode;
  kicker?: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
  width?: number | string;
  children?: React.ReactNode;
}
export function Panel(props: PanelProps): JSX.Element;
export interface PanelSectionProps { title?: React.ReactNode; children?: React.ReactNode; style?: React.CSSProperties; }
export function PanelSection(props: PanelSectionProps): JSX.Element;
export interface FieldProps { label: React.ReactNode; children?: React.ReactNode; }
export function Field(props: FieldProps): JSX.Element;
