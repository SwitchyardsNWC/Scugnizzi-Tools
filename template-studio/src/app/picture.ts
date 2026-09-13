// A freeform page as pixels: drawn from the recipe, then printed through its effects.
//
// One function for every place the picture is needed — the canvas's preview of an effect, the
// standalone tool's PNG, Template Studio's Render picture, and the picture handed to the Riso tool —
// so the canvas and the export cannot disagree about what a page with an effect looks like.

import { freeformSvg } from '../compile/freeform.ts';
import { Riso } from '../effects/riso.ts';
import type { DesignSystem } from '../model/design-system.ts';
import type { FreeformBlock } from '../model/types.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { withLocalAssets } from './local-assets.ts';

export interface PictureOptions {
  assets?: AssetFile[];
  /** Image pixels per page pixel. The export's 2× is the default, and effects are tuned at it. */
  scale?: number;
  /**
   * What the page sits on. An effect needs an opaque ground: a separation reads transparent pixels
   * as black and would flood them with ink.
   */
  ground?: string;
  /** False for the plain drawing, as handed to the Riso tool to be printed there. */
  effects?: boolean;
}

async function dataUrlOf(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The picture could not be read.'));
    reader.readAsDataURL(blob);
  });
}

/** An SVG drawn as an image may not fetch anything, so every local picture in it goes in as a data URL. */
async function selfContained(svg: string, assets: AssetFile[]): Promise<string> {
  let out = withLocalAssets(svg, assets);
  const urls = new Set([...out.matchAll(/href="(blob:[^"]+)"/g)].map((m) => m[1]!));
  for (const url of urls) {
    try {
      out = out.split(`href="${url}"`).join(`href="${await dataUrlOf(url)}"`);
    } catch {
      // A picture that cannot be read is left out of the drawing rather than failing all of it.
    }
  }
  return out;
}

export async function freeformCanvas(block: FreeformBlock, ds: DesignSystem, options: PictureOptions = {}): Promise<HTMLCanvasElement> {
  const { assets = [], scale = 2, ground = 'rgba(0,0,0,0)', effects = true } = options;
  const W = Math.max(1, Math.round(block.width * scale));
  const H = Math.max(1, Math.round(block.height * scale));
  const svg = await selfContained(freeformSvg(block, ds), assets);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The canvas could not be drawn into a picture.'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser would not give me a canvas to draw on.');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(image, 0, 0, W, H);
  if (effects) {
    for (const step of block.effects ?? []) {
      if (step.effect !== 'riso') continue;
      const pixels = ctx.getImageData(0, 0, W, H).data;
      const printed = Riso.render(Riso.prepare(pixels, W, H), step, step.seed, scale);
      ctx.putImageData(new ImageData(printed, W, H), 0, 0);
    }
  }
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be encoded.'))), type, quality));
}
