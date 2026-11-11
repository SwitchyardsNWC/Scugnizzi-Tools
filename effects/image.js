// Image effects, as one engine every tool shares: adjust, duotone, posterize, halftone, grain, texture,
// blur, vignette and sharpen. Used by image effects/image-effects-editor.html and by Template Studio's
// Freeform canvas, so a look tuned in one is the same picture in the other.
//
// Version 2 (Jared: "update the effects engine to get pro level results"). What makes it so:
//
// - One float pipeline. The picture is decoded once into 32-bit linear light, every step in a stack works
//   there, and it is encoded once at the end. No step rounds to 8 bits for the next, so gradients do not
//   band, and the encode adds a fraction of a level of fixed dither so a smooth sky stays smooth.
// - Light is added and blurred where light adds: blur, exposure, vignette and the halftone's sampling work
//   in linear light, so a blurred edge does not go dark and a vignette darkens like a lens does. Tone
//   decisions (contrast, posterize, grain response, blends) work in perceptual sRGB, where the eye judges.
// - The halftone prints its tones accurately. A dot covers the share of its cell the tone asks for, from
//   a spot function measured once, so the dots merge in the shadows the way a press's do. Each edge is
//   supersampled, each cell's tone is averaged over the cell, and CMYK puts four screens at the classic
//   angles.
// - Everything that looks random is seeded, so the same recipe makes the same bytes on every machine.
//
// A plain script that sets one global, `ImageEffects`, like effects/riso.js beside it: a single-file tool
// loads it with a <script> tag, and Template Studio imports it (template-studio/src/effects/image.ts).
// `unit` is image pixels per page pixel: Freeform draws at 2× and passes 2, so every distance a setting
// names (a screen, a radius, a grain) is the same on the page at any resolution.

(function (root) {
  'use strict';

  // --- colour -------------------------------------------------------------------------------------------

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const S2L = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const LN = 8192;
  const L2S = new Float32Array(LN + 2);
  for (let i = 0; i <= LN + 1; i++) {
    const l = Math.min(1, i / LN);
    L2S[i] = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  }
  /** Linear light to perceptual sRGB, 0 to 1. */
  function enc(l) {
    if (!(l > 0)) return 0;
    if (l >= 1) return 1;
    const x = l * LN;
    const i = x | 0;
    return L2S[i] + (L2S[i + 1] - L2S[i]) * (x - i);
  }
  /** Perceptual sRGB to linear light. */
  function dec(s) {
    if (!(s > 0)) return 0;
    if (s >= 1) return 1;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  function hexRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(String(hex));
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  }
  /** A hex colour in linear light. */
  const hexLin = (hex) => hexRgb(hex).map((v) => S2L[v]);
  const lumaLin = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Oklab, for blending between two colours evenly (Björn Ottosson's).
  function toOklab(r, g, b) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromOklab(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ];
  }

  // --- repeatable randomness -----------------------------------------------------------------------------

  /** A number in [0, 1) for integer coordinates and a seed: the same every time, on every machine. */
  function hash3(x, y, seed) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /** Close to a standard normal: four uniforms summed. */
  const gauss = (x, y, seed) => (hash3(x, y, seed) + hash3(x, y, seed + 7919) + hash3(x, y, seed + 104729) + hash3(x, y, seed + 1299709) - 2) * 1.7320508;
  /** Smooth value noise, 0 to 1, seeded. */
  function vnoise(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash3(ix, iy, seed);
    const b = hash3(ix + 1, iy, seed);
    const c = hash3(ix, iy + 1, seed);
    const d = hash3(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, oct, seed) {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    let tot = 0;
    for (let i = 0; i < oct; i++) {
      v += vnoise(x * f, y * f, seed + i * 31) * amp;
      tot += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return v / tot;
  }

  // --- the float picture ----------------------------------------------------------------------------------

  /** RGBA bytes into planes of linear light, alpha 0 to 1. */
  function decode(d, w, h) {
    const n = w * h;
    const img = { w, h, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), a: new Float32Array(n) };
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      img.r[p] = S2L[d[i]];
      img.g[p] = S2L[d[i + 1]];
      img.b[p] = S2L[d[i + 2]];
      img.a[p] = d[i + 3] / 255;
    }
    return img;
  }
  /**
   * Back to bytes, once. A fraction of a level of fixed dither breaks up banding in smooth gradients; a
   * value that lands on a whole level stays exactly on it, so pixels nothing touched come back unchanged.
   */
  function encode(img, d) {
    const { w, h } = img;
    for (let y = 0, p = 0; y < h; y++) {
      for (let x = 0; x < w; x++, p++) {
        const t = hash3(x, y, 0x5eed);
        const i = p * 4;
        const put = (v) => {
          const near = Math.round(v);
          return Math.abs(v - near) < 0.004 ? near : Math.max(0, Math.min(255, Math.floor(v + t)));
        };
        d[i] = put(enc(img.r[p]) * 255);
        d[i + 1] = put(enc(img.g[p]) * 255);
        d[i + 2] = put(enc(img.b[p]) * 255);
        d[i + 3] = put(clamp01(img.a[p]) * 255);
      }
    }
    return d;
  }
  const clone = (img) => ({ w: img.w, h: img.h, r: img.r.slice(), g: img.g.slice(), b: img.b.slice(), a: img.a.slice() });

  // --- gaussian blur, in linear light ----------------------------------------------------------------------

  function kernel(sigma) {
    const r = Math.max(1, Math.ceil(sigma * 3));
    const k = new Float32Array(r * 2 + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    return k;
  }
  function convolve(src, dst, w, h, k, horizontal) {
    const r = (k.length - 1) / 2;
    if (horizontal) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          let acc = 0;
          for (let j = -r; j <= r; j++) acc += src[row + Math.min(w - 1, Math.max(0, x + j))] * k[j + r];
          dst[row + x] = acc;
        }
      }
    } else {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let acc = 0;
          for (let j = -r; j <= r; j++) acc += src[Math.min(h - 1, Math.max(0, y + j)) * w + x] * k[j + r];
          dst[y * w + x] = acc;
        }
      }
    }
  }
  /** Three box passes, for a large blur: within a few percent of a gaussian at a fraction of the cost. */
  function boxBlur(src, tmp, w, h, sigma) {
    const n = 3;
    const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
    let wl = Math.floor(ideal);
    if (wl % 2 === 0) wl--;
    const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    for (let pass = 0; pass < n; pass++) {
      const r = ((pass < m ? wl : wl + 2) - 1) / 2;
      if (r < 1) continue;
      for (const horizontal of [true, false]) {
        const len = horizontal ? w : h;
        const lines = horizontal ? h : w;
        const span = r * 2 + 1;
        for (let line = 0; line < lines; line++) {
          const at = (k) => (horizontal ? line * w + k : k * w + line);
          let acc = 0;
          for (let k = -r; k <= r; k++) acc += src[at(Math.max(0, Math.min(len - 1, k)))];
          for (let k = 0; k < len; k++) {
            tmp[at(k)] = acc / span;
            acc += src[at(Math.min(len - 1, k + r + 1))] - src[at(Math.max(0, k - r))];
          }
        }
        src.set(tmp);
      }
    }
  }
  /** One plane blurred in place: an exact gaussian up to a σ of 12 image pixels, three boxes past it. */
  function blurPlane(plane, w, h, sigma) {
    if (sigma < 0.25) return plane;
    const tmp = new Float32Array(plane.length);
    if (sigma > 12) {
      boxBlur(plane, tmp, w, h, sigma);
      return plane;
    }
    const k = kernel(sigma);
    convolve(plane, tmp, w, h, k, true);
    convolve(tmp, plane, w, h, k, false);
    return plane;
  }

  // --- the effects ------------------------------------------------------------------------------------------

  const DEFAULTS = {
    adjust: { exposure: 0, brightness: 0, contrast: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0 },
    duotone: { shadow: '#1a0533', highlight: '#e8e0d8', balance: 0 },
    posterize: { levels: 4, gamma: 5, dither: 'none' },
    halftone: { spacing: 8, angle: 45, shape: 'circle', contrast: 5, ink: '#000000', paper: '#ffffff', mode: 'mono', gain: 0 },
    grain: { amount: 40, mono: 80, size: 1, seed: 1 },
    texture: { kind: 'paper', amount: 35, scale: 50, blend: 'multiply', seed: 1 },
    blur: { radius: 3 },
    vignette: { amount: 70, spread: 85, feather: 60, roundness: 0 },
    sharpen: { amount: 80, radius: 1, threshold: 2 },
  };
  const LABELS = { adjust: 'Adjust', duotone: 'Duotone', posterize: 'Posterize', halftone: 'Halftone', grain: 'Grain', texture: 'Texture', blur: 'Blur', vignette: 'Vignette', sharpen: 'Sharpen' };
  const SHAPES = ['circle', 'square', 'diamond', 'line', 'ellipse'];
  const TEXTURES = ['paper', 'canvas', 'fibers', 'concrete', 'crosshatch'];
  const BLENDS = ['multiply', 'overlay', 'soft-light', 'hard-light', 'screen'];
  const DITHERS = ['none', 'ordered', 'diffusion'];

  /**
   * Exposure in stops and white balance in linear light; brightness (a midtone gamma), contrast (an S-curve
   * that holds black and white) and saturation and vibrance in perceptual terms. All but exposure -100 to 100.
   */
  function adjust(img, p) {
    const gain = Math.pow(2, p.exposure || 0);
    const t = (p.temperature || 0) / 100;
    const tn = (p.tint || 0) / 100;
    const wr = gain * (1 + 0.28 * t);
    const wg = gain * (1 - 0.22 * tn);
    const wb = gain * (1 - 0.28 * t);
    // White balance should not change how bright the picture is: renormalise to mid grey's luma.
    const norm = gain / lumaLin(wr, wg, wb);
    const gamma = Math.pow(2, -(p.brightness || 0) / 100);
    const c = 1 + 2 * Math.max(-0.95, (p.contrast || 0) / 100);
    const curve = (s) => {
      s = Math.pow(clamp01(s), gamma);
      return s < 0.5 ? 0.5 * Math.pow(2 * s, c) : 1 - 0.5 * Math.pow(2 - 2 * s, c);
    };
    const sat = 1 + (p.saturation || 0) / 100;
    const vib = (p.vibrance || 0) / 100;
    const toned = gamma !== 1 || c !== 1;
    for (let i = 0; i < img.r.length; i++) {
      let r = img.r[i] * wr * norm;
      let g = img.g[i] * wg * norm;
      let b = img.b[i] * wb * norm;
      if (toned) {
        r = dec(curve(enc(r)));
        g = dec(curve(enc(g)));
        b = dec(curve(enc(b)));
      }
      if (sat !== 1 || vib !== 0) {
        const y = lumaLin(r, g, b);
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const cur = mx > 0 ? (enc(mx) - enc(mn)) / enc(mx) : 0;
        // Vibrance lifts what is dull more than what is already vivid, and leaves skin alone more than saturation does.
        const k = Math.max(0, sat * (1 + vib * (1 - cur)));
        r = y + (r - y) * k;
        g = y + (g - y) * k;
        b = y + (b - y) * k;
      }
      img.r[i] = Math.max(0, r);
      img.g[i] = Math.max(0, g);
      img.b[i] = Math.max(0, b);
    }
  }

  /**
   * Two colours: the darks one, the lights the other, blended through Oklab so the steps between are even
   * and clean. `balance` -100 to 100 moves the midpoint towards the highlight colour or the shadow colour.
   */
  function duotone(img, p) {
    const sh = toOklab(...hexLin(p.shadow));
    const hi = toOklab(...hexLin(p.highlight));
    const g = Math.pow(2, (p.balance || 0) / 100);
    const N = 1024;
    const lut = new Float32Array((N + 1) * 3);
    for (let i = 0; i <= N; i++) {
      const t = Math.pow(i / N, g);
      const rgb = fromOklab(sh[0] + (hi[0] - sh[0]) * t, sh[1] + (hi[1] - sh[1]) * t, sh[2] + (hi[2] - sh[2]) * t);
      lut[i * 3] = rgb[0];
      lut[i * 3 + 1] = rgb[1];
      lut[i * 3 + 2] = rgb[2];
    }
    for (let i = 0; i < img.r.length; i++) {
      const k = Math.round(enc(lumaLin(img.r[i], img.g[i], img.b[i])) * N) * 3;
      img.r[i] = lut[k];
      img.g[i] = lut[k + 1];
      img.b[i] = lut[k + 2];
    }
  }

  const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

  /**
   * A few flat levels per channel, in perceptual steps. `gamma` 1 to 10, 5 is even. Dither `ordered` is a
   * fine Bayer pattern, `diffusion` is Floyd–Steinberg, both in page pixels so they read as print, not noise.
   */
  function posterize(img, p, unit) {
    const L = Math.max(2, Math.round(p.levels)) - 1;
    const g = Math.max(0.2, p.gamma / 5);
    const mode = DITHERS.includes(p.dither) ? p.dither : 'none';
    const { w, h } = img;
    const u = Math.max(1, Math.round(unit || 1));
    for (const plane of [img.r, img.g, img.b]) {
      const v = new Float32Array(plane.length);
      for (let i = 0; i < plane.length; i++) v[i] = Math.pow(enc(plane[i]), g) * L;
      if (mode === 'diffusion') {
        for (let y = 0; y < h; y++) {
          const ltr = y % 2 === 0;
          for (let k = 0; k < w; k++) {
            const x = ltr ? k : w - 1 - k;
            const i = y * w + x;
            const q = Math.max(0, Math.min(L, Math.round(v[i])));
            const e = v[i] - q;
            v[i] = q;
            const dx = ltr ? 1 : -1;
            if (x + dx >= 0 && x + dx < w) v[i + dx] += (e * 7) / 16;
            if (y + 1 < h) {
              if (x - dx >= 0 && x - dx < w) v[i + w - dx] += (e * 3) / 16;
              v[i + w] += (e * 5) / 16;
              if (x + dx >= 0 && x + dx < w) v[i + w + dx] += e / 16;
            }
          }
        }
      } else {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const t = mode === 'ordered' ? (BAYER[(Math.floor(y / u) % 8) * 8 + (Math.floor(x / u) % 8)] + 0.5) / 64 - 0.5 : 0;
            v[i] = Math.max(0, Math.min(L, Math.round(v[i] + t)));
          }
        }
      }
      for (let i = 0; i < plane.length; i++) plane[i] = dec(v[i] / L);
    }
  }

  // Halftone spot functions over a cell's square, x and y in [-1, 1]: lower values take ink first.
  const SPOTS = {
    // Euclidean: round dots in the highlights, a checkerboard at 50%, round holes in the shadows.
    circle: (x, y) => {
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      return ax + ay <= 1 ? ax * ax + ay * ay : 2 - ((1 - ax) * (1 - ax) + (1 - ay) * (1 - ay));
    },
    square: (x, y) => Math.max(Math.abs(x), Math.abs(y)),
    diamond: (x, y) => Math.abs(x) + Math.abs(y),
    line: (x, y) => Math.abs(y),
    ellipse: (x, y) => Math.hypot(x * 0.8, y * 1.25),
  };
  const spotQuantiles = {};
  /** The spot values in order, so a coverage can be turned into the threshold that gives exactly that much ink. */
  function quantiles(shape) {
    if (spotQuantiles[shape]) return spotQuantiles[shape];
    const n = 256;
    const vals = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vals[j * n + i] = SPOTS[shape](((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1);
    vals.sort();
    return (spotQuantiles[shape] = vals);
  }
  const PROCESS = { c: '#00aeef', m: '#ec008c', y: '#fff200', k: '#231f20' };

  /**
   * Halftone. Mono prints one ink on a paper; CMYK separates the picture and prints cyan, magenta, yellow
   * and black screens at 15°, 75°, 0° and 45° (turned together by `angle` − 45). Each dot covers exactly
   * the share of its cell its tone asks for, measured from the spot function, so the tones come out right
   * and the dots join in the shadows. `contrast` 1 to 10 (5 is even) bends the tone first; `gain` 0 to 100
   * spreads the midtones the way ink spreads into paper.
   */
  function halftone(img, p, unit) {
    const { w, h } = img;
    const s = Math.max(2, p.spacing * (unit || 1));
    const shape = SPOTS[p.shape] ? p.shape : 'circle';
    const spot = SPOTS[shape];
    const q = quantiles(shape);
    const pow = Math.max(0.2, p.contrast / 5);
    const gain = clamp01((p.gain || 0) / 100);
    const cmyk = p.mode === 'cmyk';
    const src = clone(img);
    const cx = w / 2;
    const cy = h / 2;
    const N = Math.ceil(Math.hypot(w, h) / 2 / s) + 3;
    const side = N * 2 + 1;
    const paper = hexLin(p.paper);
    const paperY = lumaLin(...paper);
    const inkY = lumaLin(...hexLin(p.ink));
    const base = cmyk ? [15, 75, 0, 45] : [0];
    const turn = cmyk ? p.angle - 45 : p.angle;
    const screens = base.map((a) => {
      const r = ((a + turn) * Math.PI) / 180;
      return { cos: Math.cos(r), sin: Math.sin(r), tones: new Float32Array(side * side).fill(NaN) };
    });
    const sample = (x, y) => {
      const xi = Math.max(0, Math.min(w - 1, Math.round(x)));
      const yi = Math.max(0, Math.min(h - 1, Math.round(y)));
      const i = yi * w + xi;
      return [src.r[i], src.g[i], src.b[i]];
    };
    /** A cell's colour: the average of five points across it, in linear light. */
    const cellColour = (scr, gi, gj) => {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [ox, oy] of [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        const gx = (gi + ox) * s;
        const gy = (gj + oy) * s;
        const c = sample(gx * scr.cos - gy * scr.sin + cx, gx * scr.sin + gy * scr.cos + cy);
        r += c[0];
        g += c[1];
        b += c[2];
      }
      return [r / 5, g / 5, b / 5];
    };
    const coverageOf = (darkness) => {
      let d = clamp01(darkness);
      d = d + gain * d * (1 - d);
      return d;
    };
    /** How much ink a screen wants in a cell, 0 to 1. */
    const cellInk = (scr, k, gi, gj) => {
      const at = (gj + N) * side + (gi + N);
      if (at < 0 || at >= scr.tones.length) return 0;
      let v = scr.tones[at];
      if (v === v) return v;
      const [r, g, b] = cellColour(scr, gi, gj);
      if (!cmyk) {
        // Tone-accurate: the share of ink that, seen from a distance, reflects as much light as the picture
        // did there, between this paper and this ink. `contrast` bends the tone first, in perceptual terms.
        const target = dec(Math.pow(enc(lumaLin(r, g, b)), pow));
        v = coverageOf((paperY - target) / Math.max(1e-4, paperY - inkY));
      }
      else {
        // A simple separation in perceptual terms, with full grey replacement: black carries the neutral part.
        const R = Math.pow(enc(r), pow);
        const G = Math.pow(enc(g), pow);
        const B = Math.pow(enc(b), pow);
        const K = 1 - Math.max(R, G, B);
        const den = 1 - K || 1;
        v = coverageOf([(1 - R - K) / den, (1 - G - K) / den, (1 - B - K) / den, K][k]);
      }
      scr.tones[at] = v;
      return v;
    };
    const threshold = (d) => (d <= 0 ? -Infinity : d >= 1 ? Infinity : q[Math.min(q.length - 1, Math.floor(d * q.length))]);
    const inks = cmyk ? [PROCESS.c, PROCESS.m, PROCESS.y, PROCESS.k].map(hexLin) : [hexLin(p.ink)];
    // Each edge is anti-aliased analytically: a sample's distance from the dot's edge, in pixels, from the
    // spot function's slope there, so an edge is smooth at any screen. Two by two samples a pixel.
    const ss = 2;
    const offs = [];
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) offs.push([(i + 0.5) / ss, (j + 0.5) / ss]);
    const eps = 1e-3;
    /** The pixel width of one sample, in the spot function's units at this place. */
    const px = 2 / s / ss;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        let r = paper[0];
        let g = paper[1];
        let b = paper[2];
        for (let k = 0; k < screens.length; k++) {
          const scr = screens[k];
          let cov = 0;
          for (const [ox, oy] of offs) {
            const rx = x + ox - cx;
            const ry = y + oy - cy;
            const gx = (rx * scr.cos + ry * scr.sin) / s;
            const gy = (-rx * scr.sin + ry * scr.cos) / s;
            const gi = Math.round(gx);
            const gj = Math.round(gy);
            const d = cellInk(scr, k, gi, gj);
            if (d <= 0) continue;
            if (d >= 1) {
              cov++;
              continue;
            }
            const lx = (gx - gi) * 2;
            const ly = (gy - gj) * 2;
            const v = spot(lx, ly);
            const slope = Math.hypot(spot(lx + eps, ly) - v, spot(lx, ly + eps) - v) / eps;
            // A soft edge only inside the cell: at the cell's border the dot meets its neighbour's, and a soft
            // edge there would leak ink the neighbour should be adding. There, and on a spot function's seam,
            // the sample is in or out, which over many samples is exact.
            const width = slope > 0 && slope < 50 ? slope * px : 0;
            const inside = Math.abs(lx) < 1 - px * 2 && Math.abs(ly) < 1 - px * 2;
            const T = threshold(d);
            cov += width > 0 && inside ? clamp01((T - v) / width + 0.5) : v <= T ? 1 : 0;
          }
          cov /= offs.length;
          if (!cov) continue;
          const ink = inks[k];
          if (cmyk) {
            // Inks are transparent and multiply over the paper and each other, as they do on a press.
            r *= 1 - cov + cov * ink[0];
            g *= 1 - cov + cov * ink[1];
            b *= 1 - cov + cov * ink[2];
          } else {
            r += (ink[0] - r) * cov;
            g += (ink[1] - g) * cov;
            b += (ink[2] - b) * cov;
          }
        }
        img.r[o] = r;
        img.g[o] = g;
        img.b[o] = b;
      }
    }
  }

  /**
   * Film grain: gaussian, with clumps `size` page pixels across, strongest in the midtones and gentler in
   * deep shadow and bright highlight, as film's is. `amount` and `mono` 0 to 100. Seeded.
   */
  function grain(img, p, unit) {
    const { w, h } = img;
    const cell = Math.max(0.5, (p.size || 1) * (unit || 1));
    const sigma = (p.amount / 100) * 0.16;
    const mono = clamp01(p.mono / 100);
    const seed = Math.round(p.seed || 1);
    const field = (x, y, sd) => {
      // Gaussian values on a lattice `cell` apart, smoothly interpolated, so the grain has a size.
      const fx = x / cell;
      const fy = y / cell;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const ux = tx * tx * (3 - 2 * tx);
      const uy = ty * ty * (3 - 2 * ty);
      const a = gauss(ix, iy, sd);
      const b = gauss(ix + 1, iy, sd);
      const c = gauss(ix, iy + 1, sd);
      const d = gauss(ix + 1, iy + 1, sd);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const sr = enc(img.r[i]);
        const sg = enc(img.g[i]);
        const sb = enc(img.b[i]);
        const t = 0.299 * sr + 0.587 * sg + 0.114 * sb;
        const resp = sigma * (0.35 + 2.6 * t * (1 - t));
        const n = field(x, y, seed);
        const nr = mono >= 0.999 ? n : n * mono + field(x, y, seed + 11) * (1 - mono);
        const ng = mono >= 0.999 ? n : n * mono + field(x, y, seed + 23) * (1 - mono);
        const nb = mono >= 0.999 ? n : n * mono + field(x, y, seed + 37) * (1 - mono);
        img.r[i] = dec(sr + nr * resp);
        img.g[i] = dec(sg + ng * resp);
        img.b[i] = dec(sb + nb * resp);
      }
    }
  }

  /** One texel of a surface, 0 to 255, at page coordinates, from seeded noise that never repeats. */
  function surface(kind, x, y, freq, seed) {
    switch (kind) {
      case 'canvas': {
        const cell = Math.max(2, 6 / freq);
        const wx = Math.sin((x / cell) * Math.PI);
        const wy = Math.sin((y / cell) * Math.PI);
        const weave = wx * wy > 0 ? 180 : 130;
        return weave + (vnoise(x * freq * 4, y * freq * 4, seed) - 0.5) * 30;
      }
      case 'fibers':
        return fbm(x * freq * 0.15, y * freq * 3, 4, seed) * 255;
      case 'concrete':
        return (fbm(x * freq * 1.5, y * freq * 1.5, 4, seed) * 0.7 + vnoise(x * freq * 6, y * freq * 6, seed + 9) * 0.3) * 255;
      case 'crosshatch': {
        const cell = Math.max(3, 8 / freq);
        const line = (v) => {
          const m = ((v % cell) + cell) % cell;
          return m < 1.4 ? 1 : 0;
        };
        return line(x) || line(y) || line(x - y) ? 80 : 220;
      }
      default:
        return fbm(x * freq, y * freq, 5, seed) * 255;
    }
  }
  function blendOne(c, t, mode) {
    switch (mode) {
      case 'screen':
        return 1 - (1 - c) * (1 - t);
      case 'overlay':
        return c < 0.5 ? 2 * c * t : 1 - 2 * (1 - c) * (1 - t);
      case 'hard-light':
        return t < 0.5 ? 2 * c * t : 1 - 2 * (1 - c) * (1 - t);
      case 'soft-light': {
        const dd = c <= 0.25 ? ((16 * c - 12) * c + 4) * c : Math.sqrt(c);
        return t <= 0.5 ? c - (1 - 2 * t) * c * (1 - c) : c + (2 * t - 1) * (dd - c);
      }
      default:
        return c * t;
    }
  }
  /** Paper, canvas, fibre, concrete or crosshatch laid over the picture, blended as a designer's blend modes do. */
  function texture(img, p, unit) {
    const { w, h } = img;
    const u = unit || 1;
    const freq = 8 / Math.max(5, p.scale);
    const kind = TEXTURES.includes(p.kind) ? p.kind : 'paper';
    const mode = BLENDS.includes(p.blend) ? p.blend : 'multiply';
    const k = clamp01(p.amount / 100);
    const seed = Math.round(p.seed || 1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = clamp01(surface(kind, x / u, y / u, freq, seed) / 255);
        for (const plane of [img.r, img.g, img.b]) {
          const c = enc(plane[i]);
          plane[i] = dec(c + (blendOne(c, t, mode) - c) * k);
        }
      }
    }
  }

  /** A gaussian blur of `radius` page pixels in linear light, premultiplied, so soft edges keep their colour. */
  function blur(img, p, unit) {
    const sigma = Math.max(0, p.radius) * (unit || 1);
    if (sigma < 0.25) return;
    const { w, h, r, g, b, a } = img;
    for (let i = 0; i < a.length; i++) {
      r[i] *= a[i];
      g[i] *= a[i];
      b[i] *= a[i];
    }
    for (const plane of [r, g, b, a]) blurPlane(plane, w, h, sigma);
    for (let i = 0; i < a.length; i++) {
      const al = a[i];
      r[i] = al > 1e-6 ? r[i] / al : 0;
      g[i] = al > 1e-6 ? g[i] / al : 0;
      b[i] = al > 1e-6 ? b[i] / al : 0;
    }
  }

  /**
   * A lens's falloff: darker towards the edges, in stops of exposure, so it darkens like light does.
   * `amount` 0 to 100 (up to 2½ stops), `spread` how far out it starts, `feather` how soft, `roundness`
   * 0 to follow the frame's shape or 100 for a circle.
   */
  function vignette(img, p) {
    const { w, h } = img;
    const k = clamp01(p.amount / 100);
    const round = clamp01((p.roundness || 0) / 100);
    const D = Math.hypot(w, h) / 2;
    const rx = w / 2 + (D - w / 2) * round;
    const ry = h / 2 + (D - h / 2) * round;
    // Distances measured so a corner of the frame is 1, whatever the roundness: `spread` 100 reaches the corners.
    const corner = Math.hypot(w / 2 / rx, h / 2 / ry);
    const edge = Math.max(5, p.spread) / 100;
    const inner = edge * (1 - clamp01((p.feather ?? 60) / 100) * 0.9);
    const cx = w / 2;
    const cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) / corner;
        let f = clamp01((d - inner) / Math.max(1e-6, edge - inner));
        f = f * f * (3 - 2 * f);
        if (!f) continue;
        const m = Math.pow(2, -2.5 * k * f);
        const i = y * w + x;
        img.r[i] *= m;
        img.g[i] *= m;
        img.b[i] *= m;
      }
    }
  }

  /**
   * Unsharp mask on lightness: `amount` 0 to 200 percent, `radius` in page pixels, `threshold` 0 to 50 levels
   * below which detail is left alone, so flat areas and grain do not crunch.
   */
  function sharpen(img, p, unit) {
    const { w, h } = img;
    const n = w * h;
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = enc(lumaLin(img.r[i], img.g[i], img.b[i]));
    const soft = blurPlane(L.slice(), w, h, Math.max(0.3, p.radius) * (unit || 1));
    const amt = Math.max(0, p.amount) / 100;
    const thr = Math.max(0, p.threshold) / 255;
    for (let i = 0; i < n; i++) {
      const detail = L[i] - soft[i];
      const mag = Math.abs(detail);
      if (mag <= thr) continue;
      // Ease in past the threshold rather than snapping on.
      const delta = detail * amt * Math.min(1, (mag - thr) / Math.max(thr, 1 / 255));
      img.r[i] = dec(enc(img.r[i]) + delta);
      img.g[i] = dec(enc(img.g[i]) + delta);
      img.b[i] = dec(enc(img.b[i]) + delta);
    }
  }

  const RUN = { adjust, duotone, posterize, halftone, grain, texture, blur, vignette, sharpen };

  /**
   * A stack of steps on RGBA bytes, in place: decoded once, run in float, encoded once. Steps that are off,
   * or at no strength, are skipped. `strength` 0 to 1 mixes a step's result back with what came in, in
   * linear light. Every step but blur keeps the picture's transparency, so an effect on one layer stays
   * inside that layer's shape. Riso is not run here: callers run it between groups of these.
   */
  function run(steps, d, w, h, unit) {
    const live = (steps || []).filter((s) => RUN[s.effect] && !s.off && !(typeof s.strength === 'number' && s.strength <= 0));
    if (!live.length) return d;
    const img = decode(d, w, h);
    for (const step of live) {
      const strength = typeof step.strength === 'number' ? clamp01(step.strength) : 1;
      const keepAlpha = step.effect !== 'blur';
      const before = strength < 1 || keepAlpha ? clone(img) : null;
      RUN[step.effect](img, { ...DEFAULTS[step.effect], ...step }, unit || 1);
      if (!before) continue;
      for (let i = 0; i < img.r.length; i++) {
        if (strength < 1) {
          img.r[i] = before.r[i] + (img.r[i] - before.r[i]) * strength;
          img.g[i] = before.g[i] + (img.g[i] - before.g[i]) * strength;
          img.b[i] = before.b[i] + (img.b[i] - before.b[i]) * strength;
          if (!keepAlpha) img.a[i] = before.a[i] + (img.a[i] - before.a[i]) * strength;
        }
        if (keepAlpha) img.a[i] = before.a[i];
      }
    }
    return encode(img, d);
  }

  /** One step, in place. The same as a stack of one. */
  const apply = (step, d, w, h, unit) => run([step], d, w, h, unit);

  root.ImageEffects = { version: 2, DEFAULTS, LABELS, SHAPES, TEXTURES, BLENDS, DITHERS, run, apply };
})(globalThis);
