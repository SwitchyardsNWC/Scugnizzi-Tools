import * as React from 'react';
/** Photograph shown as captured: native ratio, no border, no radius, no caption. Renders a hairline placeholder when src is absent. */
export interface ImageBlockProps extends React.HTMLAttributes<HTMLElement> {
  src?: string;
  alt?: string;
  /** CSS aspect-ratio, e.g. "4 / 3". Omit for native ratio. */
  ratio?: string;
  width?: string | number;
  height?: string | number;
  /** Applies only when a ratio or height is forced. */
  fit?: 'cover' | 'contain';
  /** Placeholder label — what the frame is waiting for ("Room photo"). */
  placeholder?: string;
  /** Second placeholder line — who supplies it, or how it will be used. */
  hint?: string;
}
export function ImageBlock(props: ImageBlockProps): JSX.Element;
/** Gallery grid of frames: reflows at every width instead of squeezing frames below a legible size. */
export interface ImageGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Minimum frame width before the grid drops a column. Default 180. */
  min?: number | string;
  gap?: number | string;
  /** Pin a column count instead of reflowing. */
  columns?: number;
  children?: React.ReactNode;
}
export function ImageGrid(props: ImageGridProps): JSX.Element;
