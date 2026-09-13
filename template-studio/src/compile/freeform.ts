// The freeform recipe, drawn: one inline SVG for the canvas.
//
// Pure, so it is tested under Node and so the picture the app rasterises is a function of the
// recipe and the design system and nothing else — the same drawing every time, which is what makes
// "the export creates that image exactly" true (docs/freeform-and-effects.md).
//
// Text is a `foreignObject` carrying the same inline style the heading block emits for the role,
// because SVG text does not wrap and the type roles are the point. Every layer carries
// `data-sy-layer`, which is how the canvas finds one under the pointer; the export never sees this
// markup at all, only the picture.

import { colorOf, firstPreset, fontOf, theme, typeOf, type DesignSystem } from '../model/design-system.ts';
import { layerBox } from '../model/freeform.ts';
import type { FreeformBlock, FreeformLayer } from '../model/types.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => String(Math.round(n * 100) / 100);

/** The ink a layer falls back to when it names no colour: the first preset's text. */
function inkOf(ds: DesignSystem): string {
  return theme(ds, firstPreset(ds)).text;
}

export function freeformSvg(block: FreeformBlock, ds: DesignSystem): string {
  const w = Math.max(1, block.width);
  const h = Math.max(1, block.height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" data-sy-freeform="" width="${num(w)}" height="${num(h)}" viewBox="0 0 ${num(w)} ${num(h)}" ` +
    `style="display:block; max-width:100%; height:auto">${freeformLayersSvg(block, ds)}</svg>`
  );
}

/** The layers alone — the background and every layer, in order — for a surface drawn by somebody else's `<svg>`. */
export function freeformLayersSvg(block: FreeformBlock, ds: DesignSystem): string {
  const w = Math.max(1, block.width);
  const h = Math.max(1, block.height);
  const parts: string[] = [];
  const bg = colorOf(ds, block.background);
  if (bg) parts.push(`<rect x="0" y="0" width="${num(w)}" height="${num(h)}" fill="${bg}"/>`);
  for (const layer of block.layers) parts.push(layerSvg(layer, ds, h));
  return parts.join('');
}

/** A layer's rotation, about the centre of its unrotated box, as an SVG transform attribute. */
function rotationOf(layer: FreeformLayer): string {
  const angle = layer.rotation ?? 0;
  if (!angle) return '';
  const box = layerBox(layer, layer.kind === 'text' ? 24 : undefined);
  return ` transform="rotate(${num(angle)} ${num(box.x + box.width / 2)} ${num(box.y + box.height / 2)})"`;
}

function layerSvg(layer: FreeformLayer, ds: DesignSystem, surfaceHeight: number): string {
  const mark = `data-sy-layer="${esc(layer.id)}"${rotationOf(layer)}`;
  const ink = inkOf(ds);
  switch (layer.kind) {
    case 'text': {
      const t = typeOf(ds, layer.role);
      const color = colorOf(ds, layer.color) ?? ink;
      const style =
        `margin:0; font-family:${fontOf(ds, layer.role)}; font-size:${t.size}px; line-height:${t.lineHeight}%; font-weight:${t.weight}; ` +
        `color:${color}; text-align:${layer.align};${t.uppercase ? ' text-transform:uppercase;' : ''}${t.letterSpacing ? ` letter-spacing:${t.letterSpacing}px;` : ''} ` +
        'overflow-wrap:break-word; word-wrap:break-word';
      const words = esc(layer.text).replace(/\r?\n/g, '<br/>');
      const height = Math.max(1, surfaceHeight - layer.y);
      return (
        `<foreignObject ${mark} x="${num(layer.x)}" y="${num(layer.y)}" width="${num(Math.max(1, layer.width))}" height="${num(height)}">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="${style}">${words}</div></foreignObject>`
      );
    }
    case 'image':
      if (!layer.src.trim()) {
        // Nothing picked yet: a dashed frame at the size it will be, so it can be found and sized.
        return `<rect ${mark} x="${num(layer.x)}" y="${num(layer.y)}" width="${num(layer.width)}" height="${num(layer.height)}" fill="none" stroke="#9aa0a6" stroke-width="2" stroke-dasharray="7 5"/>`;
      }
      return (
        `<image ${mark} href="${esc(layer.src)}" x="${num(layer.x)}" y="${num(layer.y)}" width="${num(layer.width)}" height="${num(layer.height)}" ` +
        `preserveAspectRatio="xMidYMid slice"${layer.opacity < 1 ? ` opacity="${num(layer.opacity)}"` : ''}/>`
      );
    case 'rect':
      return (
        `<rect ${mark} x="${num(layer.x)}" y="${num(layer.y)}" width="${num(layer.width)}" height="${num(layer.height)}"` +
        `${layer.radius ? ` rx="${num(layer.radius)}"` : ''} ${paint(layer.fill, layer.stroke, layer.strokeWidth, ds)}/>`
      );
    case 'ellipse':
      return (
        `<ellipse ${mark} cx="${num(layer.x + layer.width / 2)}" cy="${num(layer.y + layer.height / 2)}" rx="${num(layer.width / 2)}" ry="${num(layer.height / 2)}" ` +
        `${paint(layer.fill, layer.stroke, layer.strokeWidth, ds)}/>`
      );
    case 'line':
      return (
        `<line ${mark} x1="${num(layer.x1)}" y1="${num(layer.y1)}" x2="${num(layer.x2)}" y2="${num(layer.y2)}" ` +
        `stroke="${colorOf(ds, layer.stroke) ?? ink}" stroke-width="${num(layer.strokeWidth)}" stroke-linecap="round"/>`
      );
    case 'path': {
      const pts: string[] = [];
      for (let i = 0; i + 1 < layer.points.length; i += 2) pts.push(`${num(layer.points[i]!)},${num(layer.points[i + 1]!)}`);
      return (
        `<polyline ${mark} points="${pts.join(' ')}" fill="none" stroke="${colorOf(ds, layer.stroke) ?? ink}" ` +
        `stroke-width="${num(layer.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
  }
}

function paint(fill: string | null, stroke: string | null, strokeWidth: number, ds: DesignSystem): string {
  const f = colorOf(ds, fill);
  const s = colorOf(ds, stroke);
  // A shape with neither is invisible, which is never what somebody meant: it gets an outline.
  const strokeColor = s ?? (f ? null : inkOf(ds));
  // `pointer-events="all"`: an unfilled box can be grabbed inside its outline on the canvas, not
  // only on the line. Meaningless in the picture, which has no pointer.
  return `fill="${f ?? 'none'}"${strokeColor ? ` stroke="${strokeColor}" stroke-width="${num(strokeWidth)}"` : ''} pointer-events="all"`;
}
