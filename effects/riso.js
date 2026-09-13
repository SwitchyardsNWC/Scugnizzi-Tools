// The Riso press, as a module every tool can share.
//
// Lifted out of riso/riso.html without changing a single calculation, so the separator renders
// byte for byte what it rendered before (docs: template-studio/docs/freeform-and-effects.md, phase 1).
// It takes pixels and settings and returns pixels: no DOM, no canvas, no UI. Every random number
// comes from the seed, so the same picture, settings and seed print the same bytes every time.
//
// Loaded two ways, which is why it is a plain script that sets one global rather than an ES module:
// the single-file tools load it with a <script> tag (so they still open from a plain static server),
// and Template Studio imports it for its side effect, typed by src/effects/riso.ts.
//
// `unit` is how many image pixels one of the press's pixels is. The separator runs at 1. Freeform
// draws its pictures at 2× and passes 2, so a 6 px screen is 6 px on the page it is printing, not 3.

(function (root) {
  'use strict';

  const PX_PER_MM = 5.9; // the press runs at a nominal 150 dpi

  // Riso ink swatches (drum colours, approximate sRGB).
  const SWATCHES = [
    ['Black', '#1d1d1b'], ['Fluorescent pink', '#ff48b0'], ['Blue', '#0078bf'], ['Federal blue', '#3d5588'], ['Teal', '#00838a'], ['Green', '#00a95c'], ['Yellow', '#ffe800'], ['Sunflower', '#ffb511'], ['Orange', '#ff6c2f'],
    ['Fluorescent orange', '#ff7477'], ['Red', '#ff665e'], ['Burgundy', '#914e72'], ['Purple', '#765ba7'], ['Brown', '#925f52'], ['Cornflower', '#62a8e5'], ['Aqua', '#5ec8e5'], ['Mint', '#82d8d5'], ['Light grey', '#88898a'],
  ];
  const inkName = (hex) => { const s = SWATCHES.find(([, h]) => h === String(hex).toLowerCase()); return s ? s[0] : hex; };

  const INK_DEFAULT = { color: '#0078bf', source: 'lum', invert: false, density: 1, contrast: 1.15, lift: 0, screen: 'dot', cell: 6, angle: 15, opacity: 1, dx: 0, dy: 0 };

  const PRESETS = [
    { name: 'Pink & blue poster', desc: 'the classic two-drum pass, dot screens at 15° and 75°', apply: {
        inks: [
          { ...INK_DEFAULT, color: '#0078bf', source: 'lum', contrast: 1.25, angle: 15 },
          { ...INK_DEFAULT, color: '#ff48b0', source: 'mids', density: 0.9, contrast: 1.1, angle: 75, dx: 0.4, dy: -0.3 },
        ],
        press: { paper: '#f6f2e8', grain: 0.3, soak: 0.5, spread: 0.25, dither: 0.35, misreg: 1.2 } } },
    { name: 'Tri-colour photo', desc: 'blue, pink and yellow pulled from the RGB channels', apply: {
        inks: [
          { ...INK_DEFAULT, color: '#0078bf', source: 'red', density: 1, contrast: 1.15, cell: 4.5, angle: 15 },
          { ...INK_DEFAULT, color: '#ff48b0', source: 'green', density: 1, contrast: 1.15, cell: 4.5, angle: 75, dx: 0.3, dy: 0.2 },
          { ...INK_DEFAULT, color: '#ffe800', source: 'blue', density: 1.05, contrast: 1.1, cell: 4.5, angle: 0, dx: -0.4, dy: 0.3 },
        ],
        press: { paper: '#ffffff', grain: 0.15, soak: 0.35, spread: 0.2, dither: 0.3, misreg: 0.8 } } },
    { name: 'Zine grain', desc: 'black and fluorescent orange, stochastic screens, kraft paper', apply: {
        inks: [
          { ...INK_DEFAULT, color: '#1d1d1b', source: 'shadows', density: 1, contrast: 1.3, screen: 'grain', opacity: 0.95 },
          { ...INK_DEFAULT, color: '#ff7477', source: 'mids', density: 1.1, contrast: 1.2, screen: 'grain', dx: 0.9, dy: -0.6 },
        ],
        press: { paper: '#e9dcc2', grain: 0.55, soak: 0.7, spread: 0.35, dither: 0.85, misreg: 1.8 } } },
  ];

  // ---------- Seeded noise and blur, lifted from Ink bleed ----------
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function valueNoise(w, h, cell, rng, linear) {
    const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
    const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = rng();
    const out = new Float32Array(w * h);
    const ixs = new Int32Array(w), fxs = new Float32Array(w);
    for (let x = 0; x < w; x++) { const u = x / cell, i = Math.floor(u), f = u - i; ixs[x] = i; fxs[x] = linear ? f : f * f * (3 - 2 * f); }
    for (let y = 0; y < h; y++) {
      const v = y / cell, j = Math.floor(v); let f = v - j; if (!linear) f = f * f * (3 - 2 * f);
      const r0 = j * gw, r1 = r0 + gw, o = y * w;
      for (let x = 0; x < w; x++) {
        const i = ixs[x], fx = fxs[x];
        const a = g[r0 + i], b = g[r0 + i + 1], c = g[r1 + i], d = g[r1 + i + 1];
        const top = a + (b - a) * fx, bot = c + (d - c) * fx;
        out[o + x] = top + (bot - top) * f;
      }
    }
    return out;
  }
  const cl = (i, n) => i < 0 ? 0 : (i >= n ? n - 1 : i);
  function boxH(s, d, w, h, r) {
    const ri = Math.floor(r), fr = r - ri, norm = 1 / (2 * ri + 1 + 2 * fr);
    for (let y = 0; y < h; y++) {
      const o = y * w; let sum = 0;
      for (let k = -ri; k <= ri; k++) sum += s[o + cl(k, w)];
      for (let x = 0; x < w; x++) {
        d[o + x] = (sum + fr * (s[o + cl(x - ri - 1, w)] + s[o + cl(x + ri + 1, w)])) * norm;
        sum += s[o + cl(x + ri + 1, w)] - s[o + cl(x - ri, w)];
      }
    }
  }
  function boxV(s, d, w, h, r) {
    const ri = Math.floor(r), fr = r - ri, norm = 1 / (2 * ri + 1 + 2 * fr);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -ri; k <= ri; k++) sum += s[cl(k, h) * w + x];
      for (let y = 0; y < h; y++) {
        d[y * w + x] = (sum + fr * (s[cl(y - ri - 1, h) * w + x] + s[cl(y + ri + 1, h) * w + x])) * norm;
        sum += s[cl(y + ri + 1, h) * w + x] - s[cl(y - ri, h) * w + x];
      }
    }
  }
  function blurField(a, w, h, r, passes) {
    if (r < 0.2) return a;
    let src = a, tmp = new Float32Array(a.length), dst = new Float32Array(a.length);
    for (let p = 0; p < passes; p++) { boxH(src, tmp, w, h, r); boxV(tmp, dst, w, h, r); const t = src; src = dst; dst = (t === a) ? new Float32Array(a.length) : t; }
    return src;
  }
  const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  // ---------- Source ----------
  /** RGBA pixels, with the luminance and saturation every separation reads. */
  function prepare(data, w, h) {
    const n = w * h, lum = new Float32Array(n), sat = new Float32Array(n);
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const r = data[q] / 255, g = data[q + 1] / 255, b = data[q + 2] / 255;
      lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat[i] = mx > 0 ? (mx - mn) / mx : 0;
    }
    return { w, h, data, lum, sat };
  }

  // ---------- Fields (seeded) ----------
  function fields(w, h, seed, unit) {
    const u = unit || 1;
    const n = w * h, r = mulberry32(seed * 1000 + 7), W = new Float32Array(n); for (let i = 0; i < n; i++) W[i] = r();
    const P = valueNoise(w, h, 3 * u, mulberry32(seed * 1000 + 17)), P2 = valueNoise(w, h, 24 * u, mulberry32(seed * 1000 + 19));
    const B = blurField(W, w, h, 0.8 * u, 1);
    for (let i = 0; i < n; i++) { P[i] = 0.55 * P[i] + 0.45 * P2[i]; }
    return { seed, w, h, unit: u, W, B, P };
  }

  // ---------- Separation ----------
  function densityAt(src, ink, i) {
    const L = src.lum[i]; let d;
    switch (ink.source) {
      case 'lum': d = 1 - L; break;
      case 'shadows': d = 1 - smooth(0.15, 0.55, L); break;
      case 'mids': d = smooth(0.15, 0.45, L) * (1 - smooth(0.55, 0.9, L)); break;
      case 'highlights': d = smooth(0.45, 0.95, L); break;
      case 'red': d = 1 - src.data[i * 4] / 255; break;
      case 'green': d = 1 - src.data[i * 4 + 1] / 255; break;
      case 'blue': d = 1 - src.data[i * 4 + 2] / 255; break;
      case 'sat': d = src.sat[i]; break;
      default: d = 1;
    }
    if (ink.invert) d = 1 - d;
    d = ((d - 0.5) * ink.contrast + 0.5) * ink.density + ink.lift;
    return clamp01(d);
  }
  /** Coverage map for one ink: density run through its screen, then soak and spread. */
  function coverage(src, ink, press, F, unit) {
    const u = unit || 1, w = src.w, h = src.h, n = w * h, P = press, out = new Float32Array(n);
    const D = new Float32Array(n); for (let i = 0; i < n; i++) D[i] = densityAt(src, ink, i);
    if (ink.screen === 'grain') {
      // Stochastic screen: a blurred-noise threshold, blended toward smooth tone by the dither amount.
      for (let i = 0; i < n; i++) { const d = D[i], s = clamp01((d - F.B[i]) * 3 + 0.5); out[i] = d + (s - d) * P.dither; }
    } else {
      const c = Math.max(2, ink.cell) * u, th = ink.angle * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), line = ink.screen === 'line';
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const uu = x * cs + y * sn, v = -x * sn + y * cs;
        const cu = (Math.floor(uu / c) + 0.5) * c, cv = (Math.floor(v / c) + 0.5) * c;
        // Sample the density at the cell centre (mapped back into the image), like a real screen.
        let sx = Math.round(cu * cs - cv * sn), sy = Math.round(cu * sn + cv * cs);
        sx = sx < 0 ? 0 : sx >= w ? w - 1 : sx; sy = sy < 0 ? 0 : sy >= h ? h - 1 : sy;
        const d = D[sy * w + sx]; let cov;
        if (line) { const half = d * c * 0.5, dist = Math.abs(v - cv); cov = clamp01(half - dist + 0.5); }
        else { const r = c * Math.sqrt(d / Math.PI) * 1.05, du = uu - cu, dv = v - cv, dist = Math.sqrt(du * du + dv * dv); cov = clamp01(r - dist + 0.5); }
        out[y * w + x] = cov;
      }
    }
    let res = out;
    if (P.soak > 0) res = blurField(res, w, h, (0.3 + P.soak * 1.6) * u, 1);
    if (P.spread > 0) { const g = 1 - P.spread * 0.55; for (let i = 0; i < n; i++) res[i] = Math.pow(res[i], g); }
    return res;
  }

  // ---------- Print ----------
  /** The print: paper with its grain, then every ink multiplied on in order. RGBA, opaque. */
  function composite(src, inks, press, covs, F, unit) {
    const u = unit || 1, w = src.w, h = src.h, n = w * h, P = press, d = new Uint8ClampedArray(n * 4), paper = hexToRgb(P.paper);
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const g = 1 + (F.W[i] - 0.5) * P.grain * 0.12 + (F.P[i] - 0.5) * P.grain * 0.1;
      d[q] = paper[0] * g; d[q + 1] = paper[1] * g; d[q + 2] = paper[2] * g; d[q + 3] = 255;
    }
    inks.forEach((ink, k) => {
      const cov = covs[k], col = hexToRgb(ink.color), ox = Math.round(ink.dx * PX_PER_MM * u), oy = Math.round(ink.dy * PX_PER_MM * u);
      const mr = 1 - col[0] / 255, mg = 1 - col[1] / 255, mb = 1 - col[2] / 255, op = ink.opacity;
      for (let y = 0; y < h; y++) {
        const sy = y - oy; if (sy < 0 || sy >= h) continue;
        for (let x = 0; x < w; x++) {
          const sx = x - ox; if (sx < 0 || sx >= w) continue;
          const a = cov[sy * w + sx] * op; if (a <= 0.002) continue;
          const q = (y * w + x) * 4;
          d[q] *= 1 - a * mr; d[q + 1] *= 1 - a * mg; d[q + 2] *= 1 - a * mb;   // multiply, like ink on paper
        }
      }
    });
    return d;
  }
  /** One ink as black on white, for the duplicator. RGBA. */
  function separation(cov, w, h) {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, q = 0; i < w * h; i++, q += 4) { const v = 255 * (1 - cov[i]); d[q] = d[q + 1] = d[q + 2] = v; d[q + 3] = 255; }
    return d;
  }
  /** Everything at once: settings `{ inks, press }` on prepared pixels, with a seed. */
  function render(src, settings, seed, unit) {
    const F = fields(src.w, src.h, seed, unit);
    const covs = settings.inks.map((ink) => coverage(src, ink, settings.press, F, unit));
    return composite(src, settings.inks, settings.press, covs, F, unit);
  }
  /** Offsets for every ink after the first, within the misregistration range, chosen by the seed. */
  function misregister(inks, misreg, seed) {
    const r = mulberry32(seed * 77 + inks.length * 13);
    return inks.map((ink, k) => (k === 0 ? { ...ink, dx: 0, dy: 0 } : { ...ink, dx: +((r() - 0.5) * 2 * misreg).toFixed(1), dy: +((r() - 0.5) * 2 * misreg).toFixed(1) }));
  }

  root.RisoEngine = { version: 1, PX_PER_MM, SWATCHES, INK_DEFAULT, PRESETS, inkName, mulberry32, prepare, fields, coverage, composite, separation, render, misregister };
})(globalThis);
