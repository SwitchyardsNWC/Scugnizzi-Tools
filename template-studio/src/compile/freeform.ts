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

import { canvasTypeOf, colorOf, firstPreset, fontOf, theme, typeOf, type DesignSystem } from '../model/design-system.ts';
import { layerBox } from '../model/freeform.ts';
import { markOf } from '../model/marks.ts';
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
    case 'text':
      return textSvg(layer, ds, mark, surfaceHeight);
    case 'sticky': {
      // A note: a soft offset shadow drawn as a second shape rather than a filter, so the render has
      // nothing to approximate, then the paper, then the words inside a padding.
      const t = typeOf(ds, layer.role);
      const fill = colorOf(ds, layer.fill) ?? '#FFE58A';
      const color = colorOf(ds, layer.color) ?? '#2b2620';
      const pad = 14;
      const style =
        `margin:0; font-family:${fontOf(ds, layer.role)}; font-size:${t.size}px; line-height:${t.lineHeight}%; font-weight:${t.weight}; ` +
        `color:${color}; text-align:left; text-transform:none; letter-spacing:normal; font-style:normal; overflow-wrap:break-word; word-wrap:break-word`;
      const words = esc(layer.text).replace(/\r?\n/g, '<br/>');
      return (
        `<g ${mark}>` +
        `<rect x="${num(layer.x)}" y="${num(layer.y + 3)}" width="${num(layer.width)}" height="${num(layer.height)}" rx="6" fill="#000000" fill-opacity="0.08"/>` +
        `<rect x="${num(layer.x)}" y="${num(layer.y)}" width="${num(layer.width)}" height="${num(layer.height)}" rx="6" fill="${fill}"/>` +
        `<foreignObject x="${num(layer.x + pad)}" y="${num(layer.y + pad)}" width="${num(Math.max(1, layer.width - pad * 2))}" height="${num(Math.max(1, layer.height - pad * 2))}">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="${style}">${words}</div></foreignObject></g>`
      );
    }
    case 'mark': {
      // A stamp: the bundled mark as an SVG of its own inside the layer's box, painted in its colour.
      // The empty rect is what takes the pointer between the mark's strokes on the canvas.
      const m = markOf(layer.mark);
      return (
        `<g ${mark}><rect x="${num(layer.x)}" y="${num(layer.y)}" width="${num(layer.width)}" height="${num(layer.height)}" fill="none" pointer-events="all"/>` +
        `<svg x="${num(layer.x)}" y="${num(layer.y)}" width="${num(layer.width)}" height="${num(layer.height)}" viewBox="${m.viewBox}" preserveAspectRatio="xMidYMid meet" fill="${colorOf(ds, layer.color) ?? ink}">${m.body}</svg></g>`
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

/**
 * A text layer: in its email type role, or in a canvas type style with its effect.
 *
 * Every effect is something a picture carries exactly: a stroke, a shadow or a gradient in CSS
 * inside the `foreignObject`, per-letter transforms for the wobble, an SVG `textPath` for the arc.
 * The wobble's swing and the arc's bend are functions of the letter's index and the style, never of
 * chance, so the same recipe draws the same picture every time.
 */
function textSvg(layer: Extract<FreeformLayer, { kind: 'text' }>, ds: DesignSystem, mark: string, surfaceHeight: number): string {
  const look = layer.look ? canvasTypeOf(ds)[layer.look] : undefined;
  const words = esc(layer.text).replace(/\r?\n/g, '<br/>');
  const height = Math.max(1, surfaceHeight - layer.y);
  const box = (inner: string, style: string) =>
    `<foreignObject ${mark} x="${num(layer.x)}" y="${num(layer.y)}" width="${num(Math.max(1, layer.width))}" height="${num(height)}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="${style}">${inner}</div></foreignObject>`;

  if (!look) {
    const t = typeOf(ds, layer.role);
    const color = colorOf(ds, layer.color) ?? inkOf(ds);
    const style =
      `margin:0; font-family:${fontOf(ds, layer.role)}; font-size:${t.size}px; line-height:${t.lineHeight}%; font-weight:${t.weight}; ` +
      `color:${color}; text-align:${layer.align};${t.uppercase ? ' text-transform:uppercase;' : ''}${t.letterSpacing ? ` letter-spacing:${t.letterSpacing}px;` : ''} ` +
      'overflow-wrap:break-word; word-wrap:break-word';
    return box(words, style);
  }

  const color = colorOf(ds, layer.color) ?? colorOf(ds, look.color) ?? inkOf(ds);
  const font = (look.font && ds.fonts[look.font]) || ds.fontStack;
  const k = Math.max(0, Math.min(100, look.amount)) / 100;
  const base =
    `margin:0; font-family:${font}; font-size:${look.size}px; line-height:${look.lineHeight}%; font-weight:${look.weight};${look.italic ? ' font-style:italic;' : ''} ` +
    `color:${color}; text-align:${layer.align};${look.uppercase ? ' text-transform:uppercase;' : ''}${look.letterSpacing ? ` letter-spacing:${look.letterSpacing}px;` : ''} ` +
    'overflow-wrap:break-word; word-wrap:break-word';

  switch (look.effect) {
    case 'outline': {
      const ec = colorOf(ds, look.effectColor) ?? inkOf(ds);
      return box(words, `${base}; -webkit-text-stroke:${num(1 + k * 5)}px ${ec}`);
    }
    case 'shadow': {
      const ec = colorOf(ds, look.effectColor) ?? '#FFB000';
      const d = num(1 + k * 8);
      return box(words, `${base}; text-shadow:${d}px ${d}px 0 ${ec}`);
    }
    case 'sticker': {
      // A ring of hard shadows reads as a thick border in every engine, where a text stroke drawn
      // outside the letters is not something every engine agrees about.
      const ec = colorOf(ds, look.effectColor) ?? '#ffffff';
      const w = 2 + k * 8;
      const ring = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return `${num(Math.cos(a) * w)}px ${num(Math.sin(a) * w)}px 0 ${ec}`;
      });
      return box(words, `${base}; text-shadow:${[...ring, `0 ${num(w + 3)}px 0 rgba(0,0,0,0.18)`].join(', ')}`);
    }
    case 'highlight': {
      const ec = colorOf(ds, look.effectColor) ?? '#FFE58A';
      const from = Math.round(78 - k * 48);
      return box(
        `<span style="background:linear-gradient(transparent ${from}%, ${ec} ${from}%, ${ec} 94%, transparent 94%); padding:0 0.15em; -webkit-box-decoration-break:clone; box-decoration-break:clone">${words}</span>`,
        base,
      );
    }
    case 'wobble': {
      let i = 0;
      const inner = [...layer.text]
        .map((ch) => {
          if (ch === '\n') return '<br/>';
          if (ch === '\r') return '';
          if (ch === ' ') return ' ';
          const n = i++;
          const turn = Math.sin(n * 1.7 + 0.4) * k * 14;
          const lift = Math.cos(n * 2.3) * k * 5;
          return `<span style="display:inline-block; transform:translateY(${num(lift)}px) rotate(${num(turn)}deg)">${esc(ch)}</span>`;
        })
        .join('');
      return box(inner, base);
    }
    case 'arc': {
      const line = (look.uppercase ? layer.text.toUpperCase() : layer.text).replace(/\s*\r?\n\s*/g, ' ');
      const w = Math.max(1, layer.width);
      const sag = k * w * 0.32;
      const baseline = layer.y + look.size + sag;
      const id = `sy-arc-${esc(layer.id)}-${Math.round(layer.x)}-${Math.round(layer.y)}-${Math.round(w)}`;
      const [offset, anchor] = layer.align === 'left' ? ['0%', 'start'] : layer.align === 'right' ? ['100%', 'end'] : ['50%', 'middle'];
      const d = `M${num(layer.x)} ${num(baseline)} Q${num(layer.x + w / 2)} ${num(baseline - sag * 2)} ${num(layer.x + w)} ${num(baseline)}`;
      return (
        `<g ${mark}><defs><path id="${id}" d="${d}"/></defs>` +
        `<rect x="${num(layer.x)}" y="${num(layer.y)}" width="${num(w)}" height="${num(look.size * 1.3 + sag)}" fill="none" pointer-events="all"/>` +
        `<text font-family="${esc(font)}" font-size="${num(look.size)}" font-weight="${look.weight}"${look.italic ? ' font-style="italic"' : ''}${look.letterSpacing ? ` letter-spacing="${num(look.letterSpacing)}"` : ''} fill="${color}">` +
        `<textPath href="#${id}" startOffset="${offset}" text-anchor="${anchor}">${esc(line)}</textPath></text></g>`
      );
    }
    default:
      return box(words, base);
  }
}

/** A sample of a canvas type style, or of plain heading type, for the chips that pick one. The real renderer on a small page. */
export function canvasTypeSampleSvg(ds: DesignSystem, look: string | null, text = 'Aa'): string {
  const style = look ? canvasTypeOf(ds)[look] : undefined;
  const size = style?.size ?? typeOf(ds, 'h2').size;
  const scale = Math.min(1, 30 / Math.max(1, size));
  const w = 150;
  const h = style?.effect === 'arc' ? 72 : 56;
  const sample: FreeformBlock = {
    id: 'sample',
    type: 'freeform',
    alt: '',
    width: w / scale,
    height: h / scale,
    background: null,
    layers: [{ kind: 'text', id: `sample-${look ?? 'plain'}`, text, role: 'h2', color: null, x: 8 / scale, y: 8 / scale, width: (w - 16) / scale, align: 'left', ...(look ? { look } : {}) }],
    src: '',
    align: 'center',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(w / scale)} ${num(h / scale)}" width="${w}" height="${h}">${freeformLayersSvg(sample, ds)}</svg>`;
}

