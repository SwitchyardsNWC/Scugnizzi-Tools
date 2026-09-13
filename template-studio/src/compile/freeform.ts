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

import { canvasTypeOf, colorOf, firstPreset, fontOf, theme, typeOf, type ColorRef, type DesignSystem } from '../model/design-system.ts';
import { textStyleOf } from '../model/canvas-text.ts';
import { marksPerChar, runsOf } from '../model/rich-text.ts';
import { BRUSHES, layerBox } from '../model/freeform.ts';
import { markOf } from '../model/marks.ts';
import type { Brush, FreeformBlock, FreeformLayer, StyleRange, TextMarks } from '../model/types.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => String(Math.round(n * 100) / 100);
/** The id of the filter every inverted layer points at. Identical wherever it is defined, so two pages on one email can share it. */
const INVERT = 'sy-invert';

/**
 * One run's formatting as inline CSS, for the picture and for the canvas's editor alike. False is a
 * real answer — un-bolded words inside a bold style.
 */
export function marksCss(m: TextMarks, ds: DesignSystem): string {
  const out: string[] = [];
  if (m.bold !== undefined) out.push(`font-weight:${m.bold ? 'bold' : 'normal'}`);
  if (m.italic !== undefined) out.push(`font-style:${m.italic ? 'italic' : 'normal'}`);
  const lines = [m.underline ? 'underline' : '', m.strike ? 'line-through' : ''].filter(Boolean);
  if (lines.length) out.push(`text-decoration:${lines.join(' ')}`);
  if (m.color) out.push(`color:${colorOf(ds, m.color) ?? m.color}`);
  if (m.font && ds.fonts[m.font]) out.push(`font-family:${ds.fonts[m.font]}`);
  if (m.highlight) {
    out.push(`background:linear-gradient(transparent 55%, ${m.highlight} 55%, ${m.highlight} 92%, transparent 92%); -webkit-box-decoration-break:clone; box-decoration-break:clone`);
  }
  return out.join('; ');
}

/** A layer's words as markup: exactly as they always were when nothing is formatted, a span per formatted run when something is. */
function richWords(text: string, styles: StyleRange[] | undefined, ds: DesignSystem): string {
  if (!styles?.length) return esc(text).replace(/\r?\n/g, '<br/>');
  return runsOf(text, styles)
    .map((run) => {
      const inner = esc(run.text).replace(/\r?\n/g, '<br/>');
      const css = marksCss(run.marks, ds);
      return css ? `<span style="${esc(css)}">${inner}</span>` : inner;
    })
    .join('');
}

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
  // One filter for every inverted layer. User-space and huge, because the default region is a share of
  // the element's box, and a straight stroke's box has no height: the filter would draw nothing at all.
  // sRGB, so white inverts to black rather than to a linear-light grey.
  if (block.layers.some((l) => l.invert)) {
    parts.push(
      `<defs><filter id="${INVERT}" filterUnits="userSpaceOnUse" x="-10000" y="-10000" width="20000" height="20000" color-interpolation-filters="sRGB">` +
        '<feColorMatrix type="matrix" values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0"/></filter></defs>',
    );
  }
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
  const mark = `data-sy-layer="${esc(layer.id)}"${rotationOf(layer)}${layer.invert ? ` filter="url(#${INVERT})"` : ''}`;
  const ink = inkOf(ds);
  switch (layer.kind) {
    case 'text':
      return textSvg(layer, ds, mark, surfaceHeight);
    case 'sticky': {
      // A note: a soft offset shadow drawn as a second shape rather than a filter, so the render has
      // nothing to approximate, then the paper, then the words inside a padding.
      const t = textStyleOf(layer, ds);
      const fill = colorOf(ds, layer.fill) ?? '#FFE58A';
      const color = colorOf(ds, layer.color) ?? '#2b2620';
      const pad = 14;
      const style =
        `margin:0; font-family:${t.font}; font-size:${num(t.size)}px; line-height:${t.lineHeight}%; font-weight:${t.weight}; ` +
        `color:${color}; text-align:left; text-transform:none; letter-spacing:normal; font-style:normal; overflow-wrap:break-word; word-wrap:break-word`;
      const words = richWords(layer.text, layer.styles, ds);
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
      // A highlighter left on its default is yellow: in the ink it would read as a thick marker.
      const color = colorOf(ds, layer.stroke) ?? (layer.brush === 'highlighter' ? HIGHLIGHTER : ink);
      if (layer.brush === 'brush') return `<path ${mark} d="${brushOutline(layer.points, layer.strokeWidth)}" fill="${color}"/>`;
      const pts: string[] = [];
      for (let i = 0; i + 1 < layer.points.length; i += 2) pts.push(`${num(layer.points[i]!)},${num(layer.points[i + 1]!)}`);
      const hl = layer.brush === 'highlighter';
      return (
        `<polyline ${mark} points="${pts.join(' ')}" fill="none" stroke="${color}" ` +
        `stroke-width="${num(layer.strokeWidth)}" stroke-linecap="${hl ? 'butt' : 'round'}" stroke-linejoin="round"${hl ? ' stroke-opacity="0.45"' : ''}/>`
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
  const words = richWords(layer.text, layer.styles, ds);
  const height = Math.max(1, surfaceHeight - layer.y);
  const box = (inner: string, style: string) =>
    `<foreignObject ${mark} x="${num(layer.x)}" y="${num(layer.y)}" width="${num(Math.max(1, layer.width))}" height="${num(height)}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="${style}">${inner}</div></foreignObject>`;

  // The style and the layer's own tweaks, resolved once: the canvas's text field reads the same numbers.
  const s = textStyleOf(layer, ds);
  const color = colorOf(ds, layer.color) ?? colorOf(ds, s.color) ?? inkOf(ds);
  const font = s.font;
  const k = Math.max(0, Math.min(100, s.amount)) / 100;
  const base =
    `margin:0; font-family:${font}; font-size:${num(s.size)}px; line-height:${num(s.lineHeight)}%; font-weight:${s.weight};${s.italic ? ' font-style:italic;' : ''} ` +
    `color:${color}; text-align:${layer.align};${s.uppercase ? ' text-transform:uppercase;' : ''}${s.letterSpacing ? ` letter-spacing:${num(s.letterSpacing)}px;` : ''} ` +
    'overflow-wrap:break-word; word-wrap:break-word';

  if (!look) return box(words, base);

  switch (s.effect) {
    case 'outline': {
      const ec = colorOf(ds, s.effectColor) ?? inkOf(ds);
      return box(words, `${base}; -webkit-text-stroke:${num(1 + k * 5)}px ${ec}`);
    }
    case 'shadow': {
      const ec = colorOf(ds, s.effectColor) ?? '#FFB000';
      const d = num(1 + k * 8);
      return box(words, `${base}; text-shadow:${d}px ${d}px 0 ${ec}`);
    }
    case 'sticker': {
      // A ring of hard shadows reads as a thick border in every engine, where a text stroke drawn
      // outside the letters is not something every engine agrees about.
      const ec = colorOf(ds, s.effectColor) ?? '#ffffff';
      const w = 2 + k * 8;
      const ring = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return `${num(Math.cos(a) * w)}px ${num(Math.sin(a) * w)}px 0 ${ec}`;
      });
      return box(words, `${base}; text-shadow:${[...ring, `0 ${num(w + 3)}px 0 rgba(0,0,0,0.18)`].join(', ')}`);
    }
    case 'highlight': {
      const ec = colorOf(ds, s.effectColor) ?? '#FFE58A';
      const from = Math.round(78 - k * 48);
      return box(
        `<span style="background:linear-gradient(transparent ${from}%, ${ec} ${from}%, ${ec} 94%, transparent 94%); padding:0 0.15em; -webkit-box-decoration-break:clone; box-decoration-break:clone">${words}</span>`,
        base,
      );
    }
    case 'wobble': {
      let i = 0;
      let at = 0;
      // Each letter is its own span already, so its formatting simply joins that letter's style.
      const per = layer.styles?.length ? marksPerChar(layer.text.length, layer.styles) : null;
      const inner = [...layer.text]
        .map((ch) => {
          const index = at;
          at += ch.length;
          if (ch === '\n') return '<br/>';
          if (ch === '\r') return '';
          const css = per ? esc(marksCss(per[index] ?? {}, ds)) : '';
          if (ch === ' ') return css ? `<span style="${css}"> </span>` : ' ';
          const n = i++;
          const turn = Math.sin(n * 1.7 + 0.4) * k * 14;
          const lift = Math.cos(n * 2.3) * k * 5;
          return `<span style="display:inline-block; transform:translateY(${num(lift)}px) rotate(${num(turn)}deg)${css ? `; ${css}` : ''}">${esc(ch)}</span>`;
        })
        .join('');
      return box(inner, base);
    }
    case 'arc': {
      const line = (s.uppercase ? layer.text.toUpperCase() : layer.text).replace(/\s*\r?\n\s*/g, ' ');
      const w = Math.max(1, layer.width);
      const sag = k * w * 0.32;
      const baseline = layer.y + s.size + sag;
      const id = `sy-arc-${esc(layer.id)}-${Math.round(layer.x)}-${Math.round(layer.y)}-${Math.round(w)}`;
      const [offset, anchor] = layer.align === 'left' ? ['0%', 'start'] : layer.align === 'right' ? ['100%', 'end'] : ['50%', 'middle'];
      const d = `M${num(layer.x)} ${num(baseline)} Q${num(layer.x + w / 2)} ${num(baseline - sag * 2)} ${num(layer.x + w)} ${num(baseline)}`;
      // SVG text on a path: formatted runs become tspans. A highlight has no SVG equivalent and is left out here.
      const arcWords = layer.styles?.length
        ? runsOf(layer.text, layer.styles)
            .map((run) => {
              const t = esc((s.uppercase ? run.text.toUpperCase() : run.text).replace(/\r?\n/g, ' '));
              const m = run.marks;
              const lines = [m.underline ? 'underline' : '', m.strike ? 'line-through' : ''].filter(Boolean).join(' ');
              const attrs =
                (m.bold !== undefined ? ` font-weight="${m.bold ? 'bold' : 'normal'}"` : '') +
                (m.italic !== undefined ? ` font-style="${m.italic ? 'italic' : 'normal'}"` : '') +
                (lines ? ` text-decoration="${lines}"` : '') +
                (m.color ? ` fill="${colorOf(ds, m.color) ?? m.color}"` : '') +
                (m.font && ds.fonts[m.font] ? ` font-family="${esc(ds.fonts[m.font]!)}"` : '');
              return attrs ? `<tspan${attrs}>${t}</tspan>` : t;
            })
            .join('')
        : esc(line);
      return (
        `<g ${mark}><defs><path id="${id}" d="${d}"/></defs>` +
        `<rect x="${num(layer.x)}" y="${num(layer.y)}" width="${num(w)}" height="${num(s.size * 1.3 + sag)}" fill="none" pointer-events="all"/>` +
        `<text font-family="${esc(font)}" font-size="${num(s.size)}" font-weight="${s.weight}"${s.italic ? ' font-style="italic"' : ''}${s.letterSpacing ? ` letter-spacing="${num(s.letterSpacing)}"` : ''} fill="${color}">` +
        `<textPath href="#${id}" startOffset="${offset}" text-anchor="${anchor}">${arcWords}</textPath></text></g>`
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


/** The default highlighter ink. */
export const HIGHLIGHTER = '#FFD84D';

/**
 * A brush stroke as a filled outline: the line's width swells towards the middle and tapers to a
 * point at both ends, a function of distance along the stroke and nothing else, so the same points
 * draw the same shape every time.
 */
export function brushOutline(points: number[], width: number): string {
  const n = Math.floor(points.length / 2);
  if (n < 2) return '';
  const x = (i: number) => points[i * 2]!;
  const y = (i: number) => points[i * 2 + 1]!;
  const along: number[] = [0];
  for (let i = 1; i < n; i += 1) along.push(along[i - 1]! + Math.hypot(x(i) - x(i - 1), y(i) - y(i - 1)));
  const total = along[n - 1]! || 1;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = x(b) - x(a);
    const dy = y(b) - y(a);
    const d = Math.hypot(dx, dy) || 1;
    const taper = Math.max(0.12, Math.sin(Math.PI * (along[i]! / total)) ** 0.55);
    const h = (width / 2) * taper;
    left.push(`${num(x(i) - (dy / d) * h)} ${num(y(i) + (dx / d) * h)}`);
    right.push(`${num(x(i) + (dy / d) * h)} ${num(y(i) - (dx / d) * h)}`);
  }
  return `M${left.join(' L')} L${right.reverse().join(' L')} Z`;
}

/** A sample squiggle in a pen, for the trays that pick one. The real renderer on a small page. */
export function brushSampleSvg(ds: DesignSystem, brush: Brush, color: ColorRef = null): string {
  const def = BRUSHES.find((b) => b.brush === brush) ?? BRUSHES[1]!;
  const points: number[] = [];
  for (let i = 0; i <= 28; i += 1) {
    const t = i / 28;
    points.push(10 + t * 80, 20 + Math.sin(t * Math.PI * 2) * 8);
  }
  const sample: FreeformBlock = {
    id: 'sample',
    type: 'freeform',
    alt: '',
    width: 100,
    height: 40,
    background: null,
    layers: [{ kind: 'path', id: `sample-${brush}`, points, stroke: color, strokeWidth: Math.min(def.width, 14), brush }],
    src: '',
    align: 'center',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="100" height="40">${freeformLayersSvg(sample, ds)}</svg>`;
}
