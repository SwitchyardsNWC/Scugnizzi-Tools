// The surface's own vocabulary: tools, handles, phases, the view, and what a drag is.

import type { Box } from '../../model/freeform.ts';
import type { FreeformLayer } from '../../model/types.ts';

export type Tool = 'select' | 'hand' | 'sticky' | 'rect' | 'ellipse' | 'line' | 'pen' | 'eraser' | 'text' | 'stamp';
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
/** `start` is the page sitting on the block; `enter` is the flight out; `exit` the flight home. */
export type Phase = 'start' | 'enter' | 'idle' | 'exit';
export type Point = { x: number; y: number };

export interface View {
  x: number;
  y: number;
  z: number;
}

export type Drag =
  | { kind: 'pan'; x: number; y: number; view: View }
  | { kind: 'move'; layers: FreeformLayer[]; x: number; y: number; moved: boolean }
  | { kind: 'resizeMany'; layers: FreeformLayer[]; handle: Handle; box: Box; x: number; y: number }
  | { kind: 'resize'; layer: FreeformLayer; handle: Handle; box: Box; x: number; y: number }
  | { kind: 'endpoint'; layer: FreeformLayer; which: 1 | 2 }
  | { kind: 'rotate'; layer: FreeformLayer; centre: Point }
  | { kind: 'create'; tool: 'rect' | 'ellipse' | 'line'; from: Point; to: Point }
  | { kind: 'pen'; points: number[] }
  | { kind: 'erase'; last: Point; session: string }
  | { kind: 'page'; axis: 'x' | 'y' | 'both'; width: number; height: number; x: number; y: number };
