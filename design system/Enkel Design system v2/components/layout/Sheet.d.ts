import * as React from 'react';
/** Bottom sheet — the phone-tier equivalent of the desktop side Panel. Slides from the bottom, 85vh max, hairline top, text "Close" (no ×). Scrim 40% black. */
export interface SheetProps extends React.HTMLAttributes<HTMLElement> {
  open: boolean;
  title?: React.ReactNode;
  onClose?: () => void;
  children?: React.ReactNode;
}
export function Sheet(props: SheetProps): JSX.Element | null;
