import * as React from 'react';
export type DestinationKind = 'page' | 'frame' | 'row' | 'embed' | 'file' | 'spec';
/** Provenance link: glyph + label pointing at where the work lives. Dashed "Not yet linked" state for unlinked items. */
export interface LivesInProps extends React.HTMLAttributes<HTMLElement> {
  kind?: DestinationKind;
  label?: string;
  href?: string;
  unlinked?: boolean;
  /** Unlinked + required renders in amber — unfinished, not broken. */
  required?: boolean;
  onClick?: () => void;
}
export function LivesIn(props: LivesInProps): JSX.Element;
export const KIND_GLYPH: Record<DestinationKind, string>;
export const KIND_LABEL: Record<DestinationKind, string>;
