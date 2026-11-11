// A freeform page as pixels: drawn from the recipe, then printed through its effects.
//
// One function for every place the picture is needed — the canvas's preview of an effect, the
// standalone tool's PNG, Template Studio's Render picture, and the picture handed to the Riso tool —
// so the canvas and the export cannot disagree about what a page with an effect looks like.

import { freeformSvg } from '../compile/freeform.ts';
import { ImageEffects } from '../effects/image.ts';
import { Riso } from '../effects/riso.ts';
import type { DesignSystem } from '../model/design-system.ts';
import { liveSteps } from '../model/effects.ts';
import type { EffectStep, FreeformBlock, FreeformLayer } from '../model/types.ts';
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
  /** False for the plain drawing: no page and no layer effects. */
  effects?: boolean;
  /** The page's steps to run in place of its own: what the Riso tool is handed is the picture up to its step. */
  pageEffects?: EffectStep[];
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

/** An SVG drawing as an image the canvas can draw. */
function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The canvas could not be drawn into a picture.'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser would not give me a canvas to draw on.');
  return ctx;
}

/**
 * A stack of steps on RGBA bytes, in place, top first. Riso goes through the press; the rest through the
 * image effects engine, each run between Riso steps as one float pass. Every step keeps the picture's own transparency but blur, and each is mixed back by its
 * strength, the same rule for both so a stack reads the same whatever is in it.
 */
export function runSteps(data: Uint8ClampedArray, W: number, H: number, steps: EffectStep[] | undefined, unit: number): Uint8ClampedArray {
  // The image effects between two Riso steps run as one float pass: decoded once, encoded once.
  let group: EffectStep[] = [];
  const flush = () => {
    if (group.length) ImageEffects.run(group, data, W, H, unit);
    group = [];
  };
  for (const step of liveSteps(steps)) {
    if (step.effect !== 'riso') {
      group.push(step);
      continue;
    }
    flush();
    const before = data.slice();
    const printed = Riso.render(Riso.prepare(data, W, H), step, step.seed, unit);
    const k = typeof step.strength === 'number' ? Math.max(0, Math.min(1, step.strength)) : 1;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(before[i]! + (printed[i]! - before[i]!) * k);
      data[i + 1] = Math.round(before[i + 1]! + (printed[i + 1]! - before[i + 1]!) * k);
      data[i + 2] = Math.round(before[i + 2]! + (printed[i + 2]! - before[i + 2]!) * k);
      data[i + 3] = before[i + 3]!;
    }
  }
  flush();
  return data;
}

/**
 * The page as pixels. Layers without effects are drawn together, as one SVG, in runs; a layer with effects
 * is drawn alone on a clear sheet, run through its own stack inside its own shape, and laid over what is
 * below it. Then the page's stack runs on all of it.
 */
export async function freeformCanvas(block: FreeformBlock, ds: DesignSystem, options: PictureOptions = {}): Promise<HTMLCanvasElement> {
  const { assets = [], scale = 2, ground = 'rgba(0,0,0,0)', effects = true } = options;
  const pageSteps = options.pageEffects ?? block.effects;
  const W = Math.max(1, Math.round(block.width * scale));
  const H = Math.max(1, Math.round(block.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = context(canvas);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, H);
  const draw = async (target: CanvasRenderingContext2D, part: FreeformBlock) => target.drawImage(await svgImage(await selfContained(freeformSvg(part, ds), assets)), 0, 0, W, H);

  const layered = effects && block.layers.some((l) => liveSteps(l.effects).length > 0);
  if (!layered) {
    await draw(ctx, block);
  } else {
    let run: FreeformLayer[] = [];
    let background: FreeformBlock['background'] = block.background;
    const flush = async () => {
      if (run.length === 0 && background === null) return;
      await draw(ctx, { ...block, background, layers: run });
      run = [];
      background = null;
    };
    for (const layer of block.layers) {
      if (liveSteps(layer.effects).length === 0) {
        run.push(layer);
        continue;
      }
      await flush();
      const sheet = document.createElement('canvas');
      sheet.width = W;
      sheet.height = H;
      const sctx = context(sheet);
      await draw(sctx, { ...block, background: null, layers: [{ ...layer, effects: undefined }] });
      const pixels = sctx.getImageData(0, 0, W, H);
      runSteps(pixels.data, W, H, layer.effects, scale);
      sctx.putImageData(pixels, 0, 0);
      ctx.drawImage(sheet, 0, 0);
    }
    await flush();
  }

  if (effects && liveSteps(pageSteps).length) {
    const pixels = ctx.getImageData(0, 0, W, H);
    runSteps(pixels.data, W, H, pageSteps, scale);
    ctx.putImageData(pixels, 0, 0);
  }
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be encoded.'))), type, quality));
}
