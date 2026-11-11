// Ink bleed, as an effect any picture can take: the press half of text bleed/ink-bleed.html.
//
// Jared: "add the effects from the ink bleed tool into freeform." The tool lays out its own type and inks it;
// here the ink is read from a picture that is already drawn, so the same treatments reach any layer or page:
// ink spreading into the paper, ragged edges, soft edges, worn patches, grit, a rubber stamp's pale interior
// and uneven pressure, a photocopier's stretch and scan drift, smudges dragged through wet ink, and the
// paper's grain, dust, toner speckle and streaks. The calculations are the tool's, with its distances in
// points read as page pixels; the per-letter typewriter strike needs glyphs, so it stays in the tool.
//
// Two ways to read the ink. A layer has transparency, so its shape is the ink and its colours are kept,
// and the ink can spread past the shape. A page is opaque, so its dark parts are the ink, measured against
// its paper (the light end of the picture), and the result is laid back on that paper. Every random number
// comes from the step's seed. A plain script that sets `InkBleed`, like the engines beside it.

(function (root) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  function valueNoise(w, h, cell, rng, linear) {
    const gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    const out = new Float32Array(w * h);
    const ixs = new Int32Array(w);
    const fxs = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const u = x / cell;
      const i = Math.floor(u);
      const f = u - i;
      ixs[x] = i;
      fxs[x] = linear ? f : f * f * (3 - 2 * f);
    }
    for (let y = 0; y < h; y++) {
      const v = y / cell;
      const j = Math.floor(v);
      let f = v - j;
      if (!linear) f = f * f * (3 - 2 * f);
      const r0 = j * gw;
      const r1 = r0 + gw;
      const o = y * w;
      for (let x = 0; x < w; x++) {
        const i = ixs[x];
        const fx = fxs[x];
        const top = g[r0 + i] + (g[r0 + i + 1] - g[r0 + i]) * fx;
        const bot = g[r1 + i] + (g[r1 + i + 1] - g[r1 + i]) * fx;
        out[o + x] = top + (bot - top) * f;
      }
    }
    return out;
  }
  function noise1D(len, cell, rng) {
    const g = new Float32Array(Math.ceil(len / cell) + 2);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    const out = new Float32Array(len);
    for (let x = 0; x < len; x++) {
      const u = x / cell;
      const i = Math.floor(u);
      let f = u - i;
      f = f * f * (3 - 2 * f);
      out[x] = g[i] + (g[i + 1] - g[i]) * f;
    }
    return out;
  }
  const cl = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);
  function boxH(s, d, w, h, r) {
    const ri = Math.floor(r);
    const fr = r - ri;
    const norm = 1 / (2 * ri + 1 + 2 * fr);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let sum = 0;
      for (let k = -ri; k <= ri; k++) sum += s[o + cl(k, w)];
      for (let x = 0; x < w; x++) {
        d[o + x] = (sum + fr * (s[o + cl(x - ri - 1, w)] + s[o + cl(x + ri + 1, w)])) * norm;
        sum += s[o + cl(x + ri + 1, w)] - s[o + cl(x - ri, w)];
      }
    }
  }
  function boxV(s, d, w, h, r) {
    const ri = Math.floor(r);
    const fr = r - ri;
    const norm = 1 / (2 * ri + 1 + 2 * fr);
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
    let src = a;
    const tmp = new Float32Array(a.length);
    let dst = new Float32Array(a.length);
    for (let p = 0; p < passes; p++) {
      boxH(src, tmp, w, h, r);
      boxV(tmp, dst, w, h, r);
      const t = src;
      src = dst;
      dst = t === a ? new Float32Array(a.length) : t;
    }
    return src;
  }
  function normalizeSD(a, targetSD) {
    let mean = 0;
    let sq = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) {
      mean += a[i];
      sq += a[i] * a[i];
    }
    mean /= n;
    const sd = Math.sqrt(Math.max(1e-9, sq / n - mean * mean));
    const sc = targetSD / sd;
    for (let i = 0; i < n; i++) a[i] = clamp01(0.5 + (a[i] - mean) * sc);
    return a;
  }
  /** The tool's noise fields, at `k` image pixels per page pixel. */
  function fields(w, h, seed, k) {
    const n = w * h;
    const c = (v) => Math.max(2, v * k);
    const G = new Float32Array(n);
    const r1 = mulberry32(seed * 1000 + 11);
    for (let i = 0; i < n; i++) G[i] = r1();
    const R = normalizeSD(blurField(G.slice(), w, h, Math.max(0.6, 0.55 * k), 1), 0.26);
    const LA = valueNoise(w, h, c(6), mulberry32(seed * 1000 + 21));
    const LC = valueNoise(w, h, c(14), mulberry32(seed * 1000 + 41));
    const LS = valueNoise(w, h, c(1.6), mulberry32(seed * 1000 + 51));
    return { G, R, LA, LC, LS };
  }

  // --- the ink: bleed, rough, soft, fade, grit --------------------------------------------------------

  function bleedInk(ink, w, h, F, p, k) {
    const n = w * h;
    ink = blurField(ink, w, h, Math.max(0.35, p.spread * k * 0.9), 2);
    const rough = p.rough * 0.75;
    const K = 4;
    for (let i = 0; i < n; i++) {
      const a = ink[i];
      const gate = a * 2.5 < 1 ? a * 2.5 : 1;
      let v = a + rough * (F.R[i] - 0.5) * gate;
      v = (v - 0.5) * K + 0.5;
      ink[i] = clamp01(v);
    }
    if (p.soft * k >= 0.2) ink = blurField(ink, w, h, p.soft * k, 1);
    const fade = p.fade * 0.95;
    const grit = p.grit * 0.85;
    for (let i = 0; i < n; i++) {
      let a = ink[i];
      if (a <= 0) continue;
      const f = (F.LA[i] - 0.3) / 0.7;
      if (f > 0) a *= 1 - fade * Math.pow(f, 1.6);
      const g = F.G[i];
      a *= 1 - grit * g * g;
      ink[i] = a;
    }
    return ink;
  }

  /** Rubber stamp: ink at the rims, blotchy pale interiors, pressure falling off to one side. */
  function stampInk(ink, w, h, F, s, k, seed) {
    const n = w * h;
    const I = blurField(ink, w, h, Math.max(0.6, 0.9 * k), 1);
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    for (let i = 0; i < n; i++)
      if (ink[i] > 0.05) {
        const x = i % w;
        const y = (i - x) / w;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    if (x1 < x0) return;
    const ang = mulberry32(seed * 71 + 1)() * Math.PI * 2;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const ex = Math.max(1, (x1 - x0) / 2);
    const ey = Math.max(1, (y1 - y0) / 2);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    for (let i = 0; i < n; i++) {
      let a = ink[i];
      if (a <= 0) continue;
      const x = i % w;
      const y = (i - x) / w;
      const p = clamp01(((x - cx) * dx / ex + ((y - cy) * dy) / ey) * 0.5 + 0.5);
      a *= 1 - s * 0.55 * p;
      a *= 1 - s * 0.5 * Math.max(0, (F.LC[i] - 0.4) / 0.6);
      const interior = Math.max(0, (I[i] - 0.55) / 0.45);
      const hi = Math.max(0, (F.LS[i] - 0.35) / 0.65);
      a *= 1 - s * 0.85 * interior * hi;
      a *= 1 - s * 0.25 * F.G[i];
      ink[i] = a;
    }
  }

  /**
   * A photocopier's feed: rows resampled at a drifting stretch from the top, shifted sideways by scan jitter,
   * a few thinned into dropout lines, with fine toner banding. Applied to every plane given, row by row alike.
   */
  function photocopy(planes, w, h, p, k, seed) {
    if (p.elong <= 0 && p.jitter <= 0) return planes;
    const rng = mulberry32(seed * 313 + 9);
    const drift = noise1D(h, Math.max(4, 36 * k), rng);
    const bands = noise1D(h, Math.max(2, 3 * k), rng);
    const tone = noise1D(h, Math.max(1.5, 1.2 * k), rng);
    const outs = planes.map(() => new Float32Array(w * h));
    let src = 0;
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(src);
      const fy = src - y0;
      const stretch = 1 + 1.1 * p.elong * (0.5 + drift[y]);
      let shift = p.jitter * ((rng() - 0.5) * 2 * k + (bands[y] - 0.5) * 2 * 2.5 * k);
      if (rng() < 0.02 * p.jitter) shift += (rng() - 0.5) * 10 * k;
      let dens = 1 - 0.35 * p.jitter * Math.max(0, tone[y] - 0.5) * 2;
      if (rng() < 0.012 * p.jitter) dens *= 0.35;
      src += 1 / stretch;
      if (y0 >= h - 1) break;
      const r0 = y0 * w;
      const r1 = (y0 + 1) * w;
      const o = y * w;
      for (let x = 0; x < w; x++) {
        const sx = x - shift;
        const x0 = Math.floor(sx);
        const fx = sx - x0;
        if (x0 < 0 || x0 >= w - 1) continue;
        for (let c = 0; c < planes.length; c++) {
          const s = planes[c];
          const a = s[r0 + x0] + (s[r0 + x0 + 1] - s[r0 + x0]) * fx;
          const b = s[r1 + x0] + (s[r1 + x0 + 1] - s[r1 + x0]) * fx;
          outs[c][o + x] = (a + (b - a) * fy) * (c === 0 ? dens : 1);
        }
      }
    }
    return outs;
  }

  /** Smudges: a thumb dragged across wet ink, wiping strokes thin and pulling a streaky tail out of them. */
  function smudgeInk(ink, w, h, F, S, k, seed) {
    const minDim = Math.min(w, h);
    const src = ink.slice();
    const rng = mulberry32(seed * 977 + 5);
    const cnt = Math.round(S * 7) + 1;
    const NS = 16;
    const unit = 72 * k;
    const zs = Math.min(1, minDim / (unit * 3));
    for (let s = 0; s < cnt; s++) {
      const cx = rng() * w;
      const cy = rng() * h;
      const ang = rng() * Math.PI * 2;
      const rx = (0.4 + rng() * 0.8) * unit * zs * (0.6 + 0.4 * S);
      const ry = rx * (0.3 + rng() * 0.4);
      const len = (0.15 + 0.7 * S) * unit * (0.6 + rng() * 0.8) * zs;
      const strength = (0.6 + 0.4 * rng()) * Math.min(1, 0.35 + S);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const ext = Math.max(rx, ry);
      const x0 = Math.max(0, Math.floor(cx - ext - Math.max(0, dx * len)));
      const x1 = Math.min(w - 1, Math.ceil(cx + ext + Math.max(0, dx * len)));
      const y0 = Math.max(0, Math.floor(cy - ext - Math.max(0, dy * len)));
      const y1 = Math.min(h - 1, Math.ceil(cy + ext + Math.max(0, dy * len)));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          const px = x - cx;
          const py = y - cy;
          const u = px * dx + py * dy;
          const v = -px * dy + py * dx;
          const uu = u > 0 ? Math.max(0, u - len) : u;
          const q = (uu * uu) / (rx * rx) + (v * v) / (ry * ry);
          if (q >= 1) continue;
          const wgt = Math.pow(1 - q, 1.2) * strength * (0.7 + 0.6 * F.LC[i]);
          let m = 0;
          for (let t = 1; t <= NS; t++) {
            const dist = (len * t) / NS;
            const sx = Math.round(x - dx * dist);
            const sy = Math.round(y - dy * dist);
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) break;
            const val = src[sy * w + sx] * (1 - (0.75 * t) / NS);
            if (val > m) m = val;
          }
          m *= 0.35 + 1.3 * F.R[i];
          const wiped = ink[i] * (1 - 0.85 * wgt);
          const tail = Math.min(1, m * wgt * 1.1);
          ink[i] = wiped > tail ? wiped : tail;
        }
    }
  }

  // --- the paper -----------------------------------------------------------------------------------------

  /** Paper wear on an opaque picture: grain, streaks, dust and toner speckle, light paper or dark. */
  function paperWear(d, w, h, p, k, seed, F, dark) {
    const n = w * h;
    let streak = null;
    if (p.streaks > 0) {
      const rng = mulberry32(seed * 419 + 3);
      const s1 = noise1D(w, Math.max(3, 4 * k), rng);
      const s2 = noise1D(w, Math.max(1.5, k), rng);
      streak = new Float32Array(w);
      for (let x = 0; x < w; x++) streak[x] = Math.max(0, (0.7 * s1[x] + 0.3 * s2[x] - 0.55) / 0.45) * 0.14 * p.streaks;
      const lines = Math.round(p.streaks * 3);
      for (let l = 0; l < lines; l++) {
        const x = Math.floor(rng() * w);
        const wd = Math.max(1, Math.round(k * (0.3 + rng())));
        for (let x2 = x; x2 < Math.min(w, x + wd); x2++) streak[x2] += 0.2 * p.streaks;
      }
    }
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const x = i % w;
      const g0 = F.G[i];
      const gr = (g0 - 0.5) * p.grain * 0.14 * 255;
      let f = 1;
      const wear = streak ? streak[x] * (0.7 + 0.6 * g0) : 0;
      if (!dark && wear) f *= 1 - wear;
      d[q] = d[q] * f + gr;
      d[q + 1] = d[q + 1] * f + gr;
      d[q + 2] = d[q + 2] * f + gr * 0.9;
      if (dark && wear) {
        const a = Math.min(1, wear * 1.4);
        d[q] += (190 - d[q]) * a;
        d[q + 1] += (188 - d[q + 1]) * a;
        d[q + 2] += (182 - d[q + 2]) * a;
      }
    }
    // Spots as discs of `r` image pixels, light or dark by the paper.
    const disc = (cx, cy, r, al, col) => {
      const rr = r + 0.5;
      const y0 = Math.max(0, Math.floor(cy - rr));
      const y1 = Math.min(h - 1, Math.ceil(cy + rr));
      const x0 = Math.max(0, Math.floor(cx - rr));
      const x1 = Math.min(w - 1, Math.ceil(cx + rr));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (dd >= rr) continue;
          const a = al * (1 - dd / rr);
          const q = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) d[q + c] += (col[c] - d[q + c]) * a;
        }
    };
    const perArea = n / (72 * k * (72 * k));
    if (p.dust > 0) {
      const r2 = mulberry32(seed * 1000 + 61);
      const cnt = Math.floor(p.dust * perArea * 70);
      for (let s = 0; s < cnt; s++) {
        const cx = r2() * w;
        const cy = r2() * h;
        const rad = ((0.4 + r2() * 1.3) * k * 72) / 150;
        const al = 0.25 + r2() * 0.6;
        const shade = r2();
        const v1 = r2();
        const v2 = r2();
        const col = dark ? (shade < 0.7 ? [200 + v1 * 40, 196 + v2 * 35, 185 + v1 * 30] : [235, 233, 228]) : shade < 0.7 ? [95 + v1 * 40, 60 + v2 * 30, 30 + v1 * 20] : [40, 38, 36];
        disc(cx, cy, rad, al, col);
      }
    }
    if (p.speckle > 0) {
      const rng = mulberry32(seed * 131 + 7);
      const cnt = Math.floor(p.speckle * perArea * 220);
      const sc = dark ? [225, 222, 215] : [30, 28, 26];
      for (let s = 0; s < cnt; s++) disc(rng() * w, rng() * h, ((0.25 + rng() * 0.75) * k * 72) / 150, 0.15 + rng() * 0.7, sc);
    }
  }

  // --- the step --------------------------------------------------------------------------------------

  const DEFAULTS = { spread: 0.6, rough: 0.35, soft: 0.5, fade: 0.25, grit: 0.3, stamp: 0, elong: 0.1, jitter: 0.25, smudge: 0, grain: 0.3, dust: 0.1, speckle: 0.15, streaks: 0.2, seed: 1 };

  /** The light end of an opaque picture: its paper. The 97th percentile of lightness, so a stray white pixel does not set it. */
  function paperOf(d, n) {
    const hist = new Uint32Array(256);
    for (let i = 0, q = 0; i < n; i++, q += 4) hist[Math.round(d[q] * 0.299 + d[q + 1] * 0.587 + d[q + 2] * 0.114)]++;
    let acc = 0;
    let level = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= n * 0.97) {
        level = v;
        break;
      }
    }
    let r = 0;
    let g = 0;
    let b = 0;
    let c = 0;
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const y = Math.round(d[q] * 0.299 + d[q + 1] * 0.587 + d[q + 2] * 0.114);
      if (y >= level - 3) {
        r += d[q];
        g += d[q + 1];
        b += d[q + 2];
        c++;
      }
    }
    return c ? [r / c, g / c, b / c] : [255, 255, 255];
  }

  /**
   * One ink step on RGBA bytes, in place. `unit` is image pixels per page pixel, and a page pixel is read as
   * the tool's point, so the dials mean what they do there.
   */
  function apply(step, d, w, h, unit) {
    const p = { ...DEFAULTS, ...step };
    const k = Math.max(0.5, unit || 1);
    const seed = Math.round(p.seed || 1);
    const n = w * h;
    let opaque = true;
    for (let i = 3; i < d.length; i += 4)
      if (d[i] < 250) {
        opaque = false;
        break;
      }
    const F = fields(w, h, seed, k);
    if (!opaque) {
      // A layer: its shape is the ink, its colours ride along, premultiplied so a spread edge keeps them.
      let ink = new Float32Array(n);
      let pr = new Float32Array(n);
      let pg = new Float32Array(n);
      let pb = new Float32Array(n);
      for (let i = 0, q = 0; i < n; i++, q += 4) {
        const a = d[q + 3] / 255;
        ink[i] = a;
        pr[i] = d[q] * a;
        pg[i] = d[q + 1] * a;
        pb[i] = d[q + 2] * a;
      }
      const spread = Math.max(0.35, p.spread * k * 0.9) + p.soft * k;
      const cov = blurField(ink.slice(), w, h, spread, 2);
      pr = blurField(pr, w, h, spread, 2);
      pg = blurField(pg, w, h, spread, 2);
      pb = blurField(pb, w, h, spread, 2);
      ink = bleedInk(ink, w, h, F, p, k);
      if (p.stamp > 0) stampInk(ink, w, h, F, p.stamp, k, seed);
      let planes = photocopy([ink, cov, pr, pg, pb], w, h, p, k, seed);
      [ink] = planes;
      if (p.smudge > 0) smudgeInk(ink, w, h, F, p.smudge, k, seed);
      const [, cv, rr, gg, bb] = planes;
      for (let i = 0, q = 0; i < n; i++, q += 4) {
        const c = cv[i];
        d[q] = c > 1e-4 ? rr[i] / c : 0;
        d[q + 1] = c > 1e-4 ? gg[i] / c : 0;
        d[q + 2] = c > 1e-4 ? bb[i] / c : 0;
        d[q + 3] = Math.round(clamp01(ink[i]) * 255);
      }
      planes = null;
      return d;
    }
    // A page: its dark parts are the ink against its paper, and the ink's colour is what was there.
    const paper = paperOf(d, n);
    const paperY = paper[0] * 0.299 + paper[1] * 0.587 + paper[2] * 0.114;
    const dark = paperY < 115;
    let ink = new Float32Array(n);
    let pr = new Float32Array(n);
    let pg = new Float32Array(n);
    let pb = new Float32Array(n);
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const y = d[q] * 0.299 + d[q + 1] * 0.587 + d[q + 2] * 0.114;
      const a = dark ? clamp01((y - paperY) / Math.max(8, 255 - paperY)) : clamp01((paperY - y) / Math.max(8, paperY));
      ink[i] = a;
      // The ink's own colour: what it would be at full strength, given how much of the paper shows through.
      const s = Math.max(a, 1e-3);
      const ir = clamp01((paper[0] + (d[q] - paper[0]) / s) / 255) * 255;
      const ig = clamp01((paper[1] + (d[q + 1] - paper[1]) / s) / 255) * 255;
      const ib = clamp01((paper[2] + (d[q + 2] - paper[2]) / s) / 255) * 255;
      pr[i] = ir * a;
      pg[i] = ig * a;
      pb[i] = ib * a;
    }
    const spread = Math.max(0.35, p.spread * k * 0.9) + p.soft * k;
    const cov = blurField(ink.slice(), w, h, spread, 2);
    pr = blurField(pr, w, h, spread, 2);
    pg = blurField(pg, w, h, spread, 2);
    pb = blurField(pb, w, h, spread, 2);
    ink = bleedInk(ink, w, h, F, p, k);
    if (p.stamp > 0) stampInk(ink, w, h, F, p.stamp, k, seed);
    const planes = photocopy([ink, cov, pr, pg, pb], w, h, p, k, seed);
    [ink] = planes;
    if (p.smudge > 0) smudgeInk(ink, w, h, F, p.smudge, k, seed);
    const [, cv, rr, gg, bb] = planes;
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const a = clamp01(ink[i]);
      const c = cv[i];
      const ic = c > 1e-4 ? [rr[i] / c, gg[i] / c, bb[i] / c] : paper;
      d[q] = paper[0] + (ic[0] - paper[0]) * a;
      d[q + 1] = paper[1] + (ic[1] - paper[1]) * a;
      d[q + 2] = paper[2] + (ic[2] - paper[2]) * a;
      d[q + 3] = 255;
    }
    paperWear(d, w, h, p, k, seed, F, dark);
    return d;
  }

  const PRESETS = [
    { name: 'Photocopied', desc: 'soft spread, light copier drift', apply: { spread: 0.6, rough: 0.35, soft: 0.5, fade: 0.25, grit: 0.3, stamp: 0, elong: 0.1, jitter: 0.25, smudge: 0, grain: 0.3, dust: 0.1, speckle: 0.15, streaks: 0.2 } },
    { name: 'Fax transmission', desc: 'hard toner, scan jitter, streaks', apply: { spread: 0.7, rough: 0.65, soft: 0.25, fade: 0.1, grit: 0.5, stamp: 0, elong: 0.3, jitter: 0.7, smudge: 0, grain: 0.35, dust: 0.05, speckle: 0.45, streaks: 0.5 } },
    { name: 'Fresh ribbon', desc: 'clean strike, clean paper', apply: { spread: 0.2, rough: 0.1, soft: 0.15, fade: 0.05, grit: 0.1, stamp: 0, elong: 0, jitter: 0, smudge: 0, grain: 0.15, dust: 0, speckle: 0, streaks: 0 } },
    { name: 'Rubber stamp', desc: 'inked rims, pale blotchy middle, uneven pressure', apply: { spread: 0.5, rough: 0.5, soft: 0.3, fade: 0.2, grit: 0.4, stamp: 0.8, elong: 0, jitter: 0, smudge: 0, grain: 0.2, dust: 0.05, speckle: 0.05, streaks: 0 } },
  ];

  root.InkBleed = { version: 1, DEFAULTS, PRESETS, apply };
})(globalThis);
