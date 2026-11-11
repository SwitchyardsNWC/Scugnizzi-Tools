// The properties panel's numbers for what is picked on the freeform canvas: position, size, rotation,
// opacity, and aligning to the page.
//
// Jared asked for the canvas to feel like Figma or Canva; a panel of exact numbers is most of that. A single
// layer shows its own unrotated box, the one its handles work in; a drawing (a group) shows the box around
// its strokes and scales them together. Pure, so the panel only reads and commits what comes back.

import { groupBox, layerBox, scaleLayers, translateLayer, withLayerBox, type Box } from './freeform.ts';
import { boundsOfLayers } from './snap.ts';
import type { FreeformLayer } from './types.ts';

export interface Geometry extends Box {
  /** Degrees, or null for a drawing, which scales but does not turn. */
  rotation: number | null;
  /** 0 to 1. Mixed across a drawing reads as the first stroke's. */
  opacity: number;
  /** Text finds its own height from its words, so its height is shown but not set. */
  heightFixed: boolean;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function opacityOf(l: FreeformLayer): number {
  return typeof l.opacity === 'number' ? l.opacity : 1;
}

export function geometryOf(layers: FreeformLayer[], group: boolean, heights: Record<string, number> = {}): Geometry | null {
  const first = layers[0];
  if (!first) return null;
  const box = group ? groupBox(layers, heights) : layerBox(first, heights[first.id]);
  return {
    x: round(box.x),
    y: round(box.y),
    width: round(box.width),
    height: round(box.height),
    rotation: group ? null : round(first.rotation ?? 0),
    opacity: opacityOf(first),
    heightFixed: !group && first.kind === 'text',
  };
}

/** The picked layers moved and sized to new numbers. Anything left out of `patch` stays as it is. */
export function withGeometry(layers: FreeformLayer[], group: boolean, patch: Partial<Box>, heights: Record<string, number> = {}): FreeformLayer[] {
  const first = layers[0];
  if (!first) return layers;
  const from = group ? groupBox(layers, heights) : layerBox(first, heights[first.id]);
  const to: Box = {
    x: patch.x ?? from.x,
    y: patch.y ?? from.y,
    width: Math.max(1, patch.width ?? from.width),
    height: Math.max(1, patch.height ?? from.height),
  };
  if (group) return scaleLayers(layers, from, to);
  return [withLayerBox(first, to)];
}

/** Turned to an angle, kept between 0 and 360. */
export function withRotation(layer: FreeformLayer, degrees: number): FreeformLayer {
  const a = ((round(degrees) % 360) + 360) % 360;
  if (a === 0) {
    const { rotation: _r, ...rest } = layer;
    void _r;
    return rest as FreeformLayer;
  }
  return { ...layer, rotation: a };
}

/** Every picked layer at one opacity. Full opacity leaves the field off every kind but an image, whose field is required. */
export function withOpacity(layers: FreeformLayer[], value: number): FreeformLayer[] {
  const v = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
  return layers.map((l) => {
    if (l.kind === 'image') return { ...l, opacity: v };
    if (v >= 1) {
      const { opacity: _o, ...rest } = l;
      void _o;
      return rest as FreeformLayer;
    }
    return { ...l, opacity: v };
  });
}

export type AlignEdge = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

/** The picked layers moved together so the box they cover, turned or not, meets an edge or the centre of the page. */
export function alignToPage(layers: FreeformLayer[], page: { width: number; height: number }, edge: AlignEdge, heights: Record<string, number> = {}): FreeformLayer[] {
  const b = boundsOfLayers(layers, heights);
  let dx = 0;
  let dy = 0;
  if (edge === 'left') dx = -b.x;
  else if (edge === 'centre') dx = page.width / 2 - (b.x + b.width / 2);
  else if (edge === 'right') dx = page.width - (b.x + b.width);
  else if (edge === 'top') dy = -b.y;
  else if (edge === 'middle') dy = page.height / 2 - (b.y + b.height / 2);
  else dy = page.height - (b.y + b.height);
  if (!dx && !dy) return layers;
  return layers.map((l) => translateLayer(l, dx, dy));
}
