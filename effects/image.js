// Image effects, as a module every tool can share: adjust, duotone, posterize, halftone, grain, texture,
// blur and vignette.
//
// The filters from image effects/image-effects-editor.html, made pure: pixels and settings in, pixels
// out, no DOM and no canvas. Two things changed on the way. Grain was Math.random and is now seeded, so the
// same recipe makes the same picture every time, which a picture in an email has to. Halftone was drawn
// with canvas paths and is now worked out per pixel, so it runs anywhere and gives the same bytes.
//
// Loaded like effects/riso.js: a plain script that sets one global, `ImageEffects`, so a single-file
// tool can load it with a <script> tag and Template Studio can import it for its side effect
// (template-studio/src/effects/image.ts gives it types).
//
// Every function works in place on RGBA bytes. `unit` is image pixels per page pixel: Freeform draws its
// pictures at 2× and passes 2, so an 8 px halftone screen is 8 px on the page, not 4.

(function (root) {
  'use strict';

  const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  function hexRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(String(hex));
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  }
  const luma = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  /** A repeatable number in [0, 1) for a cell and a seed. */
  function hashCell(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // --- the settings each effect takes, with its defaults ------------------------------------------------

  const DEFAULTS = {
    adjust: { brightness: 0, contrast: 0, saturation: 0 },
    duotone: { shadow: '#1a0533', highlight: '#e8e0d8' },
    posterize: { levels: 4, gamma: 5 },
    halftone: { spacing: 8, angle: 45, shape: 'circle', contrast: 5, ink: '#000000', paper: '#ffffff' },
    grain: { amount: 40, mono: 80, seed: 1 },
    texture: { kind: 'paper', amount: 35, scale: 50, blend: 'multiply' },
    blur: { radius: 3 },
    vignette: { amount: 70, spread: 85 },
  };
  const LABELS = { adjust: 'Adjust', duotone: 'Duotone', posterize: 'Posterize', halftone: 'Halftone', grain: 'Grain', texture: 'Texture', blur: 'Blur', vignette: 'Vignette' };
  const SHAPES = ['circle', 'square', 'diamond', 'line', 'ellipse'];
  const TEXTURES = ['paper', 'canvas', 'fibers', 'concrete', 'crosshatch'];
  const BLENDS = ['multiply', 'overlay', 'screen', 'soft-light'];

  // --- per pixel ----------------------------------------------------------------------------------------

  /** Brightness, contrast and saturation, each -100 to 100; 0 is unchanged. */
  function adjust(d, w, h, p) {
    const b = (p.brightness || 0) * 1.28;
    const C = clamp01(((p.contrast || 0) + 100) / 200) * 510 - 255;
    const f = (259 * (C + 255)) / (255 * (259 - C));
    const s = 1 + (p.saturation || 0) / 100;
    for (let i = 0; i < d.length; i += 4) {
      let r = f * (d[i] + b - 128) + 128;
      let g = f * (d[i + 1] + b - 128) + 128;
      let bl = f * (d[i + 2] + b - 128) + 128;
      const l = r * 0.299 + g * 0.587 + bl * 0.114;
      d[i] = clamp8(l + (r - l) * s);
      d[i + 1] = clamp8(l + (g - l) * s);
      d[i + 2] = clamp8(l + (bl - l) * s);
    }
    return d;
  }

  /** Two colours: the darks become one, the lights the other. As the tool's. */
  function duotone(d, w, h, p) {
    const sh = hexRgb(p.shadow);
    const hi = hexRgb(p.highlight);
    for (let i = 0; i < d.length; i += 4) {
      const t = luma(d, i) / 255;
      d[i] = Math.round(sh[0] + (hi[0] - sh[0]) * t);
      d[i + 1] = Math.round(sh[1] + (hi[1] - sh[1]) * t);
      d[i + 2] = Math.round(sh[2] + (hi[2] - sh[2]) * t);
    }
    return d;
  }

  /** A few flat levels per channel. `gamma` 1 to 10, 5 is linear. As the tool's. */
  function posterize(d, w, h, p) {
    const levels = Math.max(2, Math.round(p.levels));
    const step = 255 / (levels - 1);
    const g = Math.max(0.2, p.gamma / 5);
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) d[i + c] = Math.round(Math.round(Math.pow(d[i + c] / 255, g) * (levels - 1)) * step);
    }
    return d;
  }

  // --- halftone -----------------------------------------------------------------------------------------

  function sampleLuma(src, w, h, x, y) {
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    return (
      luma(src, (y0 * w + x0) * 4) * (1 - fx) * (1 - fy) +
      luma(src, (y0 * w + x1) * 4) * fx * (1 - fy) +
      luma(src, (y1 * w + x0) * 4) * (1 - fx) * fy +
      luma(src, (y1 * w + x1) * 4) * fx * fy
    );
  }

  /**
   * Dots on a turned grid, each as big as the picture is dark at its centre. The tool drew them with paths;
   * here each pixel asks which cell it is in and how far it is from that cell's dot, and the edge is
   * softened by half a pixel, so the result is the same on every machine.
   */
  function halftone(d, w, h, p, unit) {
    const u = unit || 1;
    const s = Math.max(2, p.spacing * u);
    const a = (p.angle * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const cx = w / 2;
    const cy = h / 2;
    const pow = Math.max(0.2, p.contrast / 5);
    const ink = hexRgb(p.ink);
    const paper = hexRgb(p.paper);
    const shape = SHAPES.includes(p.shape) ? p.shape : 'circle';
    const src = d.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rx = x + 0.5 - cx;
        const ry = y + 0.5 - cy;
        // Into the grid's own turned space, to the nearest cell, and back out to find its centre.
        const gx = rx * cos + ry * sin;
        const gy = -rx * sin + ry * cos;
        const gi = Math.round(gx / s);
        const gj = Math.round(gy / s);
        const lx = gx - gi * s;
        const ly = gy - gj * s;
        const sx = gi * s * cos - gj * s * sin + cx;
        const sy = gi * s * sin + gj * s * cos + cy;
        const t = Math.pow(sampleLuma(src, w, h, sx, sy) / 255, pow);
        const r = (1 - t) * s * 0.56;
        let edge;
        if (shape === 'square') edge = r * Math.SQRT1_2 - Math.max(Math.abs(lx), Math.abs(ly));
        else if (shape === 'diamond') edge = (r * 1.3 - (Math.abs(lx) + Math.abs(ly))) * Math.SQRT1_2;
        else if (shape === 'line') edge = r - Math.abs(ly);
        else if (shape === 'ellipse') edge = r - Math.hypot(lx / 1.4, ly / 0.7);
        else edge = r - Math.hypot(lx, ly);
        const k = r <= 0.4 ? 0 : clamp01(edge + 0.5);
        const i = (y * w + x) * 4;
        d[i] = Math.round(paper[0] + (ink[0] - paper[0]) * k);
        d[i + 1] = Math.round(paper[1] + (ink[1] - paper[1]) * k);
        d[i + 2] = Math.round(paper[2] + (ink[2] - paper[2]) * k);
      }
    }
    return d;
  }

  // --- grain --------------------------------------------------------------------------------------------

  /** Film grain, `amount` and `mono` 0 to 100. Seeded, and one grain per page pixel at any `unit`. */
  function grain(d, w, h, p, unit) {
    const u = Math.max(1, Math.round(unit || 1));
    const amount = (p.amount / 100) * 70;
    const mono = clamp01(p.mono / 100);
    const seed = Math.round(p.seed || 1);
    for (let y = 0; y < h; y++) {
      const cy = Math.floor(y / u);
      for (let x = 0; x < w; x++) {
        const cx = Math.floor(x / u);
        const n = (hashCell(cx, cy, seed) - 0.5) * amount;
        const i = (y * w + x) * 4;
        if (mono >= 0.99) {
          d[i] = clamp8(d[i] + n);
          d[i + 1] = clamp8(d[i + 1] + n);
          d[i + 2] = clamp8(d[i + 2] + n);
        } else {
          const nr = (hashCell(cx, cy, seed + 101) - 0.5) * amount;
          const ng = (hashCell(cx, cy, seed + 202) - 0.5) * amount;
          const nb = (hashCell(cx, cy, seed + 303) - 0.5) * amount;
          d[i] = clamp8(d[i] + n * mono + nr * (1 - mono));
          d[i + 1] = clamp8(d[i + 1] + n * mono + ng * (1 - mono));
          d[i + 2] = clamp8(d[i + 2] + n * mono + nb * (1 - mono));
        }
      }
    }
    return d;
  }

  // --- texture ------------------------------------------------------------------------------------------

  function hash2(x, y) {
    return Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
  }
  function smoothNoise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const e = hash2(ix + 1, iy + 1);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + e * ux * uy;
  }
  function fbm(x, y, oct) {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    let tot = 0;
    for (let i = 0; i < oct; i++) {
      v += smoothNoise(x * f, y * f) * amp;
      tot += amp;
      amp *= 0.5;
      f *= 2;
    }
    return v / tot;
  }
  /** One texel of the tool's 256 px tiles, as it computed them. */
  function texPixel(kind, x, y, freq) {
    switch (kind) {
      case 'canvas': {
        const cell = Math.max(2, Math.round(6 / freq));
        const half = Math.floor(cell / 2);
        const xi = x % cell;
        const yi = y % cell;
        const v = yi < half ? (xi < half ? 180 : 130) : xi < half ? 130 : 180;
        return v + (smoothNoise(x * freq * 4, y * freq * 4) - 0.5) * 20;
      }
      case 'fibers':
        return fbm(x * freq * 0.15, y * freq * 3, 3) * 255;
      case 'concrete':
        return (fbm(x * freq * 1.5, y * freq * 1.5, 3) * 0.7 + smoothNoise(x * freq * 5, y * freq * 5) * 0.3) * 255;
      case 'crosshatch': {
        const cell = Math.max(3, Math.round(8 / freq));
        const xi = x % cell;
        const yi = y % cell;
        return yi < 2 || xi < 2 || (x - y + 1024) % cell < 2 ? 80 : 220;
      }
      default:
        return fbm(x * freq, y * freq, 4) * 255;
    }
  }
  function blendOne(c, t, mode) {
    switch (mode) {
      case 'screen':
        return 255 - ((255 - c) * (255 - t)) / 255;
      case 'overlay':
        return c < 128 ? (2 * c * t) / 255 : 255 - (2 * (255 - c) * (255 - t)) / 255;
      case 'soft-light': {
        const cb = c / 255;
        const cs = t / 255;
        const dd = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
        return 255 * (cs <= 0.5 ? cb - (1 - 2 * cs) * cb * (1 - cb) : cb + (2 * cs - 1) * (dd - cb));
      }
      default:
        return (c * t) / 255;
    }
  }
  /** A paper, canvas, fibre, concrete or crosshatch surface laid over the picture. As the tool's. */
  function texture(d, w, h, p, unit) {
    const u = unit || 1;
    const freq = 8 / Math.max(5, p.scale);
    const kind = TEXTURES.includes(p.kind) ? p.kind : 'paper';
    const mode = BLENDS.includes(p.blend) ? p.blend : 'multiply';
    const k = clamp01(p.amount / 100);
    const tile = new Float32Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) tile[y * 256 + x] = clamp8(texPixel(kind, x, y, freq));
    for (let y = 0; y < h; y++) {
      const ty = Math.floor(y / u) & 255;
      for (let x = 0; x < w; x++) {
        const t = tile[ty * 256 + (Math.floor(x / u) & 255)];
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) d[i + c] = clamp8(d[i + c] + (blendOne(d[i + c], t, mode) - d[i + c]) * k);
      }
    }
    return d;
  }

  // --- blur ---------------------------------------------------------------------------------------------

  function boxesFor(sigma) {
    const n = 3;
    const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
    let wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    return [0, 1, 2].map((i) => ((i < m ? wl : wu) - 1) / 2);
  }
  function boxPass(src, dst, w, h, r, horizontal) {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const span = r * 2 + 1;
    for (let line = 0; line < lines; line++) {
      const at = (k) => (horizontal ? line * w + k : k * w + line);
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[at(Math.max(0, Math.min(len - 1, k))) * 4 + c];
        for (let k = 0; k < len; k++) {
          dst[at(k) * 4 + c] = acc / span;
          acc += src[at(Math.min(len - 1, k + r + 1)) * 4 + c] - src[at(Math.max(0, k - r)) * 4 + c];
        }
      }
    }
  }
  /**
   * A gaussian blur of `radius` page pixels, as three box passes. It blurs the edges of a layer too, so the
   * colour is carried premultiplied and a soft edge does not darken.
   */
  function blur(d, w, h, p, unit) {
    const sigma = Math.max(0, p.radius) * (unit || 1);
    if (sigma < 0.3) return d;
    let a = new Float32Array(d.length);
    for (let i = 0; i < d.length; i += 4) {
      const al = d[i + 3] / 255;
      a[i] = d[i] * al;
      a[i + 1] = d[i + 1] * al;
      a[i + 2] = d[i + 2] * al;
      a[i + 3] = d[i + 3];
    }
    let b = new Float32Array(d.length);
    for (const r of boxesFor(sigma)) {
      const rr = Math.max(0, Math.round(r));
      if (!rr) continue;
      boxPass(a, b, w, h, rr, true);
      boxPass(b, a, w, h, rr, false);
    }
    for (let i = 0; i < d.length; i += 4) {
      const al = a[i + 3] / 255;
      d[i + 3] = clamp8(Math.round(a[i + 3]));
      d[i] = al > 0 ? clamp8(Math.round(a[i] / al)) : 0;
      d[i + 1] = al > 0 ? clamp8(Math.round(a[i + 1] / al)) : 0;
      d[i + 2] = al > 0 ? clamp8(Math.round(a[i + 2] / al)) : 0;
    }
    b = null;
    a = null;
    return d;
  }

  // --- vignette -----------------------------------------------------------------------------------------

  /** The corners darkened, `amount` and `spread` 0 to 100. The tool's radial gradient, worked out per pixel. */
  function vignette(d, w, h, p) {
    const amount = clamp01(p.amount / 100);
    const outer = (Math.hypot(w, h) / 2) * Math.max(0.05, p.spread / 100);
    const inner = outer * 0.25;
    const cx = w / 2;
    const cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = clamp01((Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - inner) / (outer - inner));
        const k = 1 - amount * t;
        const i = (y * w + x) * 4;
        d[i] = Math.round(d[i] * k);
        d[i + 1] = Math.round(d[i + 1] * k);
        d[i + 2] = Math.round(d[i + 2] * k);
      }
    }
    return d;
  }

  const RUN = { adjust, duotone, posterize, halftone, grain, texture, blur, vignette };

  /**
   * One step on pixels, in place. `strength` 0 to 1 mixes the result back with what came in. Every effect
   * but blur keeps the picture's own transparency, so an effect on one layer stays inside that layer's shape.
   */
  function apply(step, d, w, h, unit) {
    const run = RUN[step.effect];
    if (!run || step.off) return d;
    const strength = typeof step.strength === 'number' ? clamp01(step.strength) : 1;
    if (strength <= 0) return d;
    const before = d.slice();
    run(d, w, h, { ...DEFAULTS[step.effect], ...step }, unit || 1);
    const keepAlpha = step.effect !== 'blur';
    if (strength < 1 || keepAlpha) {
      for (let i = 0; i < d.length; i += 4) {
        if (strength < 1) {
          d[i] = Math.round(before[i] + (d[i] - before[i]) * strength);
          d[i + 1] = Math.round(before[i + 1] + (d[i + 1] - before[i + 1]) * strength);
          d[i + 2] = Math.round(before[i + 2] + (d[i + 2] - before[i + 2]) * strength);
          if (!keepAlpha) d[i + 3] = Math.round(before[i + 3] + (d[i + 3] - before[i + 3]) * strength);
        }
        if (keepAlpha) d[i + 3] = before[i + 3];
      }
    }
    return d;
  }

  root.ImageEffects = { version: 1, DEFAULTS, LABELS, SHAPES, TEXTURES, BLENDS, apply, adjust, duotone, posterize, halftone, grain, texture, blur, vignette };
})(globalThis);
