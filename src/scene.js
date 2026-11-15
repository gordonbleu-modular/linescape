// Scene engine: builds a style-agnostic scene graph (back-to-front list of shapes with semantic roles).
import { rng, Field, clamp, lerp } from './core.js';
import { mix, mul, darken, lighten, adjust, gradAt } from './color.js';

export const SCENES = {
  mountains: 'Mountain range', lake: 'Alpine lake', forest: 'Misty forest', desert: 'Desert canyon',
  coast: 'Seaside coast', country: 'Countryside village', city: 'City skyline', harbor: 'River city & bridge'
};
export const TIMES = {
  dawn:   { label: 'Dawn',   sky: [[0, '#4a5d9c'], [0.55, '#e7a3b4'], [1, '#ffd9a6']], tint: '#ffd4b8', light: 0.9, haze: 0.62, sun: 'sun', sunCol: '#fff3cf', sunH: 0.1, lit: 0.15, cloud: '#f7c9c4' },
  day:    { label: 'Day',    sky: [[0, '#2f7fd0'], [0.6, '#86c0ec'], [1, '#d8eefb']], tint: '#ffffff', light: 1, haze: 0.55, sun: 'sun', sunCol: '#fffbea', sunH: 0.62, lit: 0, cloud: '#ffffff' },
  sunset: { label: 'Sunset', sky: [[0, '#28306e'], [0.45, '#c9527a'], [0.8, '#fb8f4f'], [1, '#ffcf73']], tint: '#ffa066', light: 0.82, haze: 0.6, sun: 'sun', sunCol: '#ffe08a', sunH: 0.06, lit: 0.35, cloud: '#ff9d86' },
  dusk:   { label: 'Dusk',   sky: [[0, '#111735'], [0.55, '#46356f'], [1, '#c26c7c']], tint: '#9d8cc7', light: 0.55, haze: 0.5, sun: 'none', sunCol: '#ffd0a0', sunH: -0.05, lit: 0.7, cloud: '#7d5d8f', stars: 0.4 },
  night:  { label: 'Night',  sky: [[0, '#04071a'], [0.6, '#0d1940'], [1, '#22385f']], tint: '#6a7fb8', light: 0.36, haze: 0.4, sun: 'moon', sunCol: '#f4f1de', sunH: 0.55, lit: 0.85, cloud: '#26335a', stars: 1 }
};
export const PALETTES = {
  natural: { label: 'Natural', rock: '#7d8090', far: '#6f7fa3', grass: '#6a9a3e', forest: '#2e5e36', forest2: '#3f7a3a', soil: '#8a6a44', sand: '#e6c88f', water: '#3c7fb2', snow: '#f5f8fb', build: ['#d8c4a4', '#a9b2bc', '#b9805f', '#7c8796', '#e2d6c2'], roof: '#a64b33', trunk: '#5a3c26', accent: '#d9534f' },
  pastel:  { label: 'Pastel', rock: '#a59ab8', far: '#a9b8d8', grass: '#a8d4a0', forest: '#6fa894', forest2: '#94c7a5', soil: '#d4b09a', sand: '#f6dfc0', water: '#8fc3dd', snow: '#ffffff', build: ['#f2c6c2', '#c9d7f0', '#f6e3b4', '#cbe7d8', '#e2cdf0'], roof: '#e08f8f', trunk: '#9b7a6a', accent: '#f29fb5' },
  autumn:  { label: 'Autumn', rock: '#7f6e66', far: '#8a7f9a', grass: '#b99a45', forest: '#b4482a', forest2: '#d98c2b', soil: '#7a4f2e', sand: '#e1bf7f', water: '#3f6f8f', snow: '#f4f1ea', build: ['#d7b48c', '#9c6b4e', '#c9a27a', '#6e5848', '#e8d2b0'], roof: '#7e2f1e', trunk: '#4a2f1e', accent: '#e0a030' },
  winter:  { label: 'Winter', rock: '#8a95a8', far: '#9fb0c9', grass: '#eef3f8', forest: '#2c4a50', forest2: '#3b5d5e', soil: '#c9d3dd', sand: '#e9eef3', water: '#5b86a6', snow: '#ffffff', build: ['#c8b8a8', '#9e3b32', '#e8e0d0', '#7a8a9a', '#b28a62'], roof: '#f2f6fa', trunk: '#3d2e26', accent: '#c0392b' },
  vivid:   { label: 'Vivid', rock: '#6c5ce7', far: '#4f7cff', grass: '#26c25f', forest: '#0f8a4a', forest2: '#1fb35a', soil: '#c2702d', sand: '#ffcf5a', water: '#00a6d6', snow: '#ffffff', build: ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#ff9f45'], roof: '#e63946', trunk: '#6b3e1f', accent: '#ff3d7f' },
  mono:    { label: 'Indigo mono', rock: '#5a6488', far: '#8a93b8', grass: '#6d78a3', forest: '#2c3561', forest2: '#3d4877', soil: '#4a5380', sand: '#b8bfdc', water: '#4a5a90', snow: '#eef0fa', build: ['#9aa3c8', '#6c76a3', '#c3c9e3', '#545e8c', '#808ab5'], roof: '#2f3866', trunk: '#262c4d', accent: '#d8dcf0' }
};
export const DEFAULT_PARAMS = { scene: 'lake', style: 'poster', palette: 'natural', time: 'sunset', detail: 3, aspect: 'landscape', seed: 2026 };
export const ASPECTS = { landscape: [1600, 1000], square: [1200, 1200], portrait: [1000, 1400], wide: [1800, 800] };

class Builder {
  constructor(P) {
    this.P = P; this.W = P.W || 1600; this.H = P.H || 1000;
    this.r = rng(P.seed * 9301 + hashScene(P.scene)); this.f = new Field(P.seed * 7 + 13);
    this.T = TIMES[P.time] || TIMES.day; this.pal = PALETTES[P.palette] || PALETTES.natural; this.d = P.detail; this.items = []; this.refl = [];
    this.dk = 0.55 + this.d * 0.15; // detail multiplier
    this.light = this.T.light;
  }
  // atmospheric colouring: base colour lit by time-of-day, fogged toward horizon colour by distance
  c(base, depth = 1, extraHaze = 0) {
    let col = mix(base, mul(base, this.T.tint), 0.55);
    col = darken(col, (1 - this.light) * 0.75);
    const fog = this.fog || gradAt(this.T.sky, 0.92);
    return mix(col, fog, clamp((1 - depth) * this.T.haze + extraHaze, 0, 0.92));
  }
  add(it) { this.items.push(it); if (it.refl) this.refl.push(it); return it; }
  poly(pts, col, role, depth = 1, extra = {}) { return this.add({ t: 'poly', pts, col, role, depth, ...extra }); }
  circle(cx, cy, r, col, role, depth = 1, extra = {}) { return this.add({ t: 'circle', cx, cy, r, col, role, depth, ...extra }); }
  line(pts, col, w, role, depth = 1, extra = {}) { return this.add({ t: 'line', pts, col, w, role, depth, ...extra }); }
  rect(x, y, w, h, col, role, depth = 1, extra = {}) { return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], col, role, depth, extra); }

  ridgePts(y0, amp, kind, k, freq = 1, step = 6) {
    const pts = [], W = this.W, f = this.f;
    for (let x = -30; x <= W + 30; x += step) {
      const u = x / W * freq, o = k * 31.7;
      let h;
      if (kind === 'mount') { const a = f.ridge(u * 2.1 + o, o * 0.3, 2 + this.d); h = Math.min(1, Math.pow(a, 1.7) * 1.2 + f.fbm(u * 6 + o, 3.3, 3) * 0.06); }
      else if (kind === 'hill') h = 0.5 + 0.55 * f.fbm(u * 1.5 + o, o, 3);
      else if (kind === 'dune') { const v = u * 2.6 + o + f.fbm(u + o, 1.1, 2) * 0.7, fr = v - Math.floor(v); h = (fr < 0.72 ? Math.pow(fr / 0.72, 1.6) : Math.pow(1 - (fr - 0.72) / 0.28, 0.8)) * (0.55 + 0.45 * f.fbm(Math.floor(v) * 0.7, o, 1) + 0.25); }
      else if (kind === 'mesa') { const a = 0.5 + 0.6 * f.fbm(u * 2.2 + o, o, 3); h = a > 0.62 ? 1 + f.fbm(u * 20, o, 2) * 0.03 : a > 0.5 ? Math.pow((a - 0.5) / 0.12, 2.2) : f.fbm(u * 8 + o, 2, 2) * 0.05 + 0.04; }
      else h = 0.5 + 0.5 * f.fbm(u * 3 + o, o, 2);
      pts.push([x, y0 - amp * h]);
    }
    return pts;
  }
  yAt(pts, x) { const i = clamp(Math.floor((x - pts[0][0]) / (pts[1][0] - pts[0][0])), 0, pts.length - 2); const a = pts[i], b = pts[i + 1]; return lerp(a[1], b[1], clamp((x - a[0]) / (b[0] - a[0]), 0, 1)); }
  ridgeLayer(pts, bottom, col, role, depth, extra = {}) { return this.poly(pts.concat([[this.W + 30, bottom], [-30, bottom]]), col, role, depth, { ridge: pts, bottom, ...extra }); }
}
function hashScene(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 10000; }

// ---------- sky ----------
function sky(b, horizon) {
  const { T, W, r } = b;
  b.horizon = horizon; b.fog = gradAt(T.sky, 0.93);
  b.add({ t: 'sky', stops: T.sky, y1: horizon, role: 'sky', depth: 0, col: T.sky[T.sky.length - 1][1] });
  if (T.stars) {
    const n = Math.round(160 * T.stars * b.dk);
    for (let i = 0; i < n; i++) { const y = Math.pow(r(), 1.6) * horizon * 0.9; b.circle(r() * W, y, r.range(0.8, 2.3) * (r() < 0.06 ? 1.6 : 1), '#fffbe8', 'star', 0, { op: r.range(0.4, 1) }); }
  }
  const sx = W * r.range(0.18, 0.82);
  b.sunX = sx;
  if (T.sun !== 'none') {
    const sy = horizon - (horizon * 0.9) * T.sunH, sr = T.sun === 'moon' ? r.range(34, 48) : (T.sunH < 0.2 ? r.range(60, 90) : r.range(42, 58));
    b.sun = { x: sx, y: sy, r: sr };
    b.add({ t: 'glow', cx: sx, cy: sy, r: sr * (T.sun === 'moon' ? 4 : 6), col: T.sunCol, role: 'glow', depth: 0, op: T.sun === 'moon' ? 0.25 : 0.55 });
    b.circle(sx, sy, sr, T.sunCol, T.sun, 0, { refl: true });
    if (T.sun === 'moon') { const sc = gradAt(T.sky, sy / horizon); b.circle(sx + sr * 0.42, sy - sr * 0.2, sr * 0.88, sc, 'moonshade', 0); }
  } else b.add({ t: 'glow', cx: sx, cy: horizon, r: W * 0.35, col: T.sunCol, role: 'glow', depth: 0, op: 0.22 });
  // clouds
  const nc = Math.round(r.range(1, 4) * (b.d / 3 + 0.3) * (b.P.time === 'night' ? 0.6 : 1));
  for (let i = 0; i < nc; i++) cloud(b, r.range(-0.05, 1.05) * W, r.range(0.12, 0.62) * horizon, r.range(120, 300));
  if (b.P.time === 'sunset' || b.P.time === 'dawn') for (let i = 0; i < 4; i++) { const y = horizon * r.range(0.55, 0.85), x = r() * W, w = r.range(200, 500); b.poly([[x - w / 2, y], [x - w * 0.3, y - 6], [x + w * 0.4, y - 5], [x + w / 2, y], [x + w * 0.2, y + 4]], b.T.cloud, 'cloud', 0.1, { op: 0.75 }); }
  if (Math.random) void 0;
}
function cloud(b, cx, cy, w) {
  const { r } = b, bumps = [], n = 3 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; bumps.push([cx - w / 2 + w * t + r.range(-10, 10), cy, w / n * r.range(0.6, 1.1) * (1 - Math.abs(t - 0.5) * 0.9) * 1.6]); }
  const pts = [];
  for (let x = cx - w / 2 - 30; x <= cx + w / 2 + 30; x += 4) {
    let y = cy + 1;
    for (const [bx, by, br] of bumps) { const dx = x - bx; if (Math.abs(dx) < br) y = Math.min(y, by - Math.sqrt(br * br - dx * dx) * 0.8); }
    pts.push([x, y]);
  }
  const top = pts.filter(p => p[1] < cy);
  if (top.length < 3) return;
  const col = b.T.cloud, poly = top.concat([[top[top.length - 1][0], cy], [top[0][0], cy]]);
  b.poly(poly, col, 'cloud', 0.15, { op: 0.92 });
  const sh = top.map(([x, y]) => [x, Math.max(y + (cy - y) * 0.55, y)]);
  b.poly(sh.concat([[sh[sh.length - 1][0], cy], [sh[0][0], cy]]), darken(mix(col, b.fog, 0.2), 0.12), 'cloudshade', 0.15, { op: 0.6 });
}

// ---------- terrain helpers ----------
function mountains(b, n, yTop, yBase, opts = {}) {
  const { pal } = b; const layers = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1), depth = 0.05 + t * (opts.maxDepth ?? 0.55);
    const base = lerp(yTop + (yBase - yTop) * 0.6, yBase, t), amp = (yBase - yTop) * lerp(0.62, 0.42, t) * (opts.amp || 1);
    const pts = b.ridgePts(base, amp, opts.kind || 'mount', i + (opts.k || 0), opts.freq || lerp(1, 1.8, t));
    const col = b.c(lerp(0, 1, t) > 0.5 ? pal.rock : pal.far, depth);
    const L = b.ridgeLayer(pts, opts.bottom ?? b.H, col, 'mountain', depth, { refl: opts.refl });
    layers.push(L);
    // light/shadow faces: one shade polygon per slope facing away from the light
    const shade = darken(col, 0.18), lightLeft = (b.sunX || b.W / 2) < b.W / 2, sgn = lightLeft ? -1 : 1;
    if (!opts.kind || opts.kind === 'mount') {
      let run = [];
      const flush = () => {
        if (run.length > 2) {
          const low = run.map(([x, y]) => { const drop = Math.min(base - y, amp * 0.55); return [x + sgn * drop * 0.22, y + Math.max(drop, 0) * 0.75]; });
          if (Math.max(...run.map(p => base - p[1])) > 20) b.poly(run.concat(low.reverse()), shade, 'mshade', depth, { op: 0.55 });
        }
        run = [];
      };
      for (let j = 1; j < pts.length; j++) { const desc = pts[j][1] > pts[j - 1][1]; if (desc === lightLeft) { if (!run.length) run.push(pts[j - 1]); run.push(pts[j]); } else flush(); }
      flush();
    }
    if (opts.snow !== false && (opts.kind || 'mount') === 'mount') {
      const snowLine = base - amp * (b.P.palette === 'winter' ? 0.35 : 0.62);
      const snow = [];
      for (const [x, y] of pts) { const jag = b.f.fbm(x * 0.03, i * 5, 2) * 26; snow.push([x, Math.max(y, Math.min(snowLine + jag, y + (snowLine + jag - y)))]); }
      const runs = []; let cur = [];
      pts.forEach((p, j) => { if (p[1] < snowLine + b.f.fbm(p[0] * 0.03, i * 5, 2) * 26 - 2) cur.push(j); else if (cur.length) { runs.push(cur); cur = []; } });
      if (cur.length) runs.push(cur);
      for (const run of runs) {
        if (run.length < 2) continue;
        const top = run.map(j => pts[j]), bot = run.map(j => [pts[j][0] + (lightLeft ? -1 : 1) * 2, snow[j][1]]).reverse();
        b.poly(top.concat(bot), b.c(pal.snow, depth), 'snow', depth);
      }
    }
  }
  return layers;
}
function hills(b, n, yTop, yBase, colFn, opts = {}) {
  const layers = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1), depth = lerp(opts.d0 ?? 0.3, opts.d1 ?? 0.85, t);
    const base = lerp(yTop, yBase, t), amp = opts.amp ? opts.amp * lerp(1, 0.7, t) : (yBase - yTop) * 0.5;
    const pts = b.ridgePts(base, amp, opts.kind || 'hill', i + 50 + (opts.k || 0), opts.freq || 1.2);
    const L = b.ridgeLayer(pts, opts.bottom ?? b.H, b.c(colFn(i, t), depth), opts.role || 'hill', depth, { refl: opts.refl });
    L.layer = i; layers.push(L);
    if (opts.after) opts.after(L, i, t, depth);
  }
  return layers;
}

// ---------- trees & vegetation ----------
function pine(b, x, y, h, col, depth) {
  const w = h * 0.42, tiers = 4, pts = [[x, y - h]];
  for (let i = 1; i <= tiers; i++) { const t = i / tiers, yy = y - h * 0.12 - (h * 0.88) * (1 - t); pts.push([x + w * 0.5 * t, yy]); if (i < tiers) pts.push([x + w * 0.2 * t, yy - h * 0.02]); }
  const right = pts.slice(1), left = right.map(([px, py]) => [2 * x - px, py]).reverse();
  b.rect(x - h * 0.03, y - h * 0.14, h * 0.06, h * 0.14, darken(col, 0.4), 'trunk', depth);
  b.poly([pts[0], ...right, ...left], col, 'tree', depth, { refl: depth < 0.75 });
  b.poly([pts[0], ...right, [x, y - h * 0.12]], darken(col, 0.22), 'treeshade', depth, { op: 0.8 });
}
function roundTree(b, x, y, h, col, depth) {
  const r = h * 0.36, cy = y - h + r, pts = [], n = 28, bumps = 5 + Math.floor(b.r() * 4), ph = b.r() * 6;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 + 0.08 * Math.sin(a * bumps + ph); pts.push([x + Math.cos(a) * r * 1.05 * k, cy + Math.sin(a) * r * k]); }
  b.rect(x - h * 0.04, cy, h * 0.08, y - cy, b.c(b.pal.trunk, depth), 'trunk', depth);
  b.poly(pts, col, 'tree', depth, { refl: depth < 0.75 });
  const hl = pts.map(([px, py]) => [x - r * 0.18 + (px - x) * 0.62, cy - r * 0.2 + (py - cy) * 0.62]);
  b.poly(hl, lighten(col, 0.13), 'treelight', depth, { op: 0.85 });
}
function palm(b, x, y, h, col, depth) {
  const lean = b.r.range(-0.3, 0.3) * h, trunkL = [], trunkR = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, cx = x + lean * t * t, cy = y - h * t, w = h * 0.035 * (1 - t * 0.4); trunkL.push([cx - w, cy]); trunkR.push([cx + w, cy]); }
  b.poly(trunkL.concat(trunkR.reverse()), b.c(b.pal.trunk, depth), 'trunk', depth);
  const tx = x + lean, ty = y - h;
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.5 + b.r.range(-0.1, 0.1), len = h * b.r.range(0.42, 0.55), top = [], bot = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, px = tx + Math.cos(a) * len * t, py = ty + Math.sin(a) * len * t + t * t * len * 0.55, w = Math.sin(Math.PI * t) * h * 0.05; top.push([px - Math.sin(a) * w, py + Math.cos(a) * w * 0.3 - w]); bot.push([px + Math.sin(a) * w, py + w * 0.6]); }
    b.poly(top.concat(bot.reverse()), k % 2 ? col : darken(col, 0.15), 'tree', depth);
  }
}
function cactus(b, x, y, h, col, depth) {
  const w = h * 0.08, body = [[x - w, y], [x - w, y - h + w], [x - w * 0.7, y - h + w * 0.2], [x, y - h], [x + w * 0.7, y - h + w * 0.2], [x + w, y - h + w], [x + w, y]];
  b.poly(body, col, 'tree', depth);
  for (const s of [-1, 1]) {
    if (b.r() < 0.25) continue;
    const ay = y - h * b.r.range(0.35, 0.55), ah = h * b.r.range(0.2, 0.32), ax = x + s * (w + h * 0.14);
    b.poly([[x + s * w * 0.5, ay], [ax + s * w * 0.8, ay], [ax + s * w * 0.8, ay - ah], [ax, ay - ah - w * 0.6], [ax - s * w * 0.8, ay - ah], [ax - s * w * 0.8, ay - w * 1.4], [x + s * w * 0.5, ay - w * 1.4]], col, 'tree', depth);
  }
  b.poly([[x, y - h], [x + w * 0.7, y - h + w * 0.2], [x + w, y - h + w], [x + w, y], [x + w * 0.2, y]], darken(col, 0.2), 'treeshade', depth, { op: 0.8 });
}
function treesAlong(b, L, count, kinds, depth, sizeRange, colors, band = 30) {
  const list = [];
  for (let i = 0; i < count; i++) { const x = b.r.range(-20, b.W + 20); list.push([x, b.yAt(L.ridge, x) + b.r.range(2, band)]); }
  list.sort((a, c) => a[1] - c[1]);
  for (const [x, y] of list) {
    const k = b.r.pick(kinds), h = b.r.range(...sizeRange), col = b.c(b.r.pick(colors), depth);
    if (k === 'pine') pine(b, x, y, h, col, depth); else if (k === 'round') roundTree(b, x, y, h, col, depth); else if (k === 'palm') palm(b, x, y, h, col, depth); else if (k === 'cactus') cactus(b, x, y, h, col, depth);
  }
}
function house(b, x, y, s, depth, opt = {}) {
  const { pal, r } = b, w = s * r.range(1.1, 1.6), h = s * 0.7, x0 = x - w / 2, wall = b.c(r.pick(pal.build), depth);
  const roofH = s * r.range(0.45, 0.7), over = s * 0.1;
  b.rect(x0, y - h, w, h, wall, 'building', depth, { refl: opt.refl });
  b.rect(x0 + w * 0.62, y - h, w * 0.38, h, darken(wall, 0.15), 'bshade', depth);
  b.poly([[x0 - over, y - h + 1], [x, y - h - roofH], [x0 + w + over, y - h + 1]], b.c(pal.roof, depth), 'roof', depth, { refl: opt.refl });
  if (r() < 0.7) b.rect(x0 + w * 0.68, y - h - roofH * 0.8, s * 0.12, roofH * 0.5, darken(wall, 0.25), 'building', depth);
  b.rect(x - s * 0.1, y - h * 0.55, s * 0.2, h * 0.55, b.c(pal.trunk, depth), 'door', depth);
  const lit = r() < b.T.lit, wc = lit ? '#ffd27a' : b.c('#3d4a5c', depth);
  for (const wx of [x0 + w * 0.18, x0 + w * 0.7]) b.rect(wx, y - h * 0.75, s * 0.17, s * 0.17, wc, lit ? 'lit' : 'window', depth);
}
function water(b, y0, y1, col) {
  const top = mix(b.c(col, 0.4), gradAt(b.T.sky, 0.9), 0.45), bot = b.c(darken(col, 0.15), 0.9);
  b.add({ t: 'water', y0, y1, top, bot, role: 'water', depth: 0.5, col: mix(top, bot, 0.5) });
  // reflections of everything flagged on the far shore
  const H = b.horizon = y0;
  for (const it of b.refl) {
    let pts;
    if (it.t === 'circle') { pts = []; for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; pts.push([it.cx + Math.cos(a) * it.r, it.cy + Math.sin(a) * it.r]); } }
    else pts = it.ridge ? it.ridge.concat([[b.W + 30, H], [-30, H]]) : it.pts;
    const m = pts.map(([x, y]) => [x, clamp(2 * H - y, H, y1)]);
    b.poly(m, mix(it.col, mix(top, bot, 0.4), it.role === 'sun' || it.role === 'moon' ? 0.25 : 0.5), 'reflection', it.depth, { op: it.role === 'sun' || it.role === 'moon' ? 0.55 : 0.6 });
  }
  b.refl = [];
  // ripples + glitter
  const n = Math.round(60 * b.dk);
  for (let i = 0; i < n; i++) { const t = Math.pow(b.r(), 1.4), y = lerp(y0 + 3, y1, t), x = b.r() * b.W, w = lerp(14, 90, t) * b.r.range(0.5, 1.4); b.line([[x - w / 2, y], [x + w / 2, y]], lighten(top, 0.35), lerp(1, 3, t), 'ripple', t, { op: 0.5 }); }
  if (b.sun) for (let i = 0; i < 26 * b.dk; i++) { const t = b.r(), y = lerp(y0 + 4, y1, Math.pow(t, 1.3)), spread = lerp(b.sun.r * 0.6, b.sun.r * 2.2, t), x = b.sun.x + b.r.range(-1, 1) * spread, w = lerp(10, 60, t) * b.r.range(0.4, 1); b.line([[x - w / 2, y], [x + w / 2, y]], lighten(b.T.sunCol, 0.2), lerp(1.5, 4, t), 'glitter', t, { op: 0.8 }); }
}
function boat(b, x, y, s, depth, sail = true) {
  const hull = darken(b.c(b.r.pick(b.pal.build), depth), 0.2);
  b.poly([[x - s, y - s * 0.22], [x + s, y - s * 0.22], [x + s * 0.75, y], [x - s * 0.7, y]], hull, 'building', depth);
  if (sail) { b.line([[x, y - s * 0.22], [x, y - s * 1.7]], darken(hull, 0.3), Math.max(1, s * 0.05), 'detail', depth); b.poly([[x - s * 0.06, y - s * 1.65], [x - s * 0.06, y - s * 0.32], [x - s * 0.85, y - s * 0.32]], b.c('#fbf7ee', depth), 'sail', depth); b.poly([[x + s * 0.06, y - s * 1.5], [x + s * 0.8, y - s * 0.3], [x + s * 0.06, y - s * 0.3]], b.c('#efe7d6', depth), 'sail', depth); }
  b.line([[x - s * 1.2, y + 2], [x + s * 1.2, y + 2]], lighten(b.c(b.pal.water, depth), 0.4), 2, 'ripple', depth, { op: 0.7 });
}
function rock(b, x, y, s, depth) {
  const pts = [], n = 8; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x - s + 2 * s * t, y - Math.sin(Math.PI * t) * s * b.r.range(0.5, 0.9)]); }
  const col = b.c(b.pal.rock, depth); b.poly(pts, col, 'rock', depth); b.poly(pts.slice(n / 2).concat([[x + s * 0.1, y]]), darken(col, 0.2), 'rshade', depth);
}

// ---------- scenes ----------
const BUILD = {
  mountains(b) {
    const H = b.H, W = b.W, hz = H * 0.62; sky(b, hz);
    mountains(b, 2 + Math.round(b.d / 2), H * 0.16, hz + H * 0.04);
    hills(b, 2, hz, H * 0.86, (i) => i ? b.pal.grass : b.pal.forest2, { amp: H * 0.12, after: (L, i, t, depth) => treesAlong(b, L, Math.round((i ? 14 : 40) * b.dk), ['pine'], depth, i ? [70, 130] : [26, 46], [b.pal.forest, b.pal.forest2], i ? 50 : 22) });
    const fg = hills(b, 1, H * 0.95, H * 0.95, () => b.pal.grass, { amp: H * 0.06, k: 9, d0: 1, d1: 1 })[0];
    if (b.r() < 0.8) { const x = W * b.r.range(0.2, 0.8); house(b, x, b.yAt(fg.ridge, x) + 8, 60, 1); }
    for (let i = 0; i < 6 * b.dk; i++) { const x = b.r() * W; rock(b, x, b.yAt(fg.ridge, x) + b.r.range(10, 50), b.r.range(10, 24), 1); }
  },
  lake(b) {
    const H = b.H, W = b.W, hz = H * 0.58; sky(b, hz);
    mountains(b, 2 + Math.round(b.d / 2), H * 0.14, hz, { refl: true, bottom: hz });
    const shore = hills(b, 1, hz + 2, hz + 2, () => b.pal.forest, { amp: H * 0.05, d0: 0.6, d1: 0.6, bottom: hz + 6, refl: true })[0];
    treesAlong(b, shore, Math.round(70 * b.dk), ['pine', 'pine', 'round'], 0.6, [24, 46], [b.pal.forest, b.pal.forest2], 4);
    water(b, hz + 4, H, b.pal.water);
    if (b.r() < 0.7) boat(b, W * b.r.range(0.25, 0.75), hz + H * b.r.range(0.08, 0.18), 22, 0.8, b.r() < 0.6);
    const fg = hills(b, 1, H * 1.02, H * 1.02, () => b.pal.grass, { amp: H * 0.14, k: 4, d0: 1, d1: 1, kind: 'hill', freq: 0.9 })[0];
    treesAlong(b, fg, Math.round(5 * b.dk), ['pine'], 1, [140, 260], [b.pal.forest], 30);
    for (let i = 0; i < 4 * b.dk; i++) { const x = b.r() * W; rock(b, x, b.yAt(fg.ridge, x) + b.r.range(14, 60), b.r.range(12, 26), 1); }
  },
  forest(b) {
    const H = b.H, W = b.W, hz = H * 0.5; sky(b, hz);
    mountains(b, 1, H * 0.22, hz, { snow: b.P.palette === 'winter' });
    const n = 3 + Math.round(b.d / 1.5);
    hills(b, n, hz - H * 0.04, H * 0.92, (i, t) => t > 0.5 ? b.pal.forest2 : b.pal.forest, {
      amp: H * 0.14, d0: 0.15, d1: 0.9,
      after: (L, i, t, depth) => {
        treesAlong(b, L, Math.round(lerp(90, 22, t) * b.dk), b.P.palette === 'autumn' ? ['round', 'round', 'pine'] : ['pine', 'pine', 'round'], depth, [lerp(18, 90, t), lerp(30, 150, t)], [b.pal.forest, b.pal.forest2, adjust(b.pal.forest2, 0.03, 1, 0.05)], lerp(10, 40, t));
        if (i < n - 1) { const y = b.yAt(L.ridge, W / 2) + 20; b.poly([[-30, y - 30], [W * 0.3, y - 45], [W * 0.7, y - 25], [W + 30, y - 40], [W + 30, y + 30], [-30, y + 25]], lighten(b.fog, 0.15), 'mist', depth, { op: 0.35 }); }
      }
    });
  },
  desert(b) {
    const H = b.H, W = b.W, hz = H * 0.6; sky(b, hz);
    const sand = b.pal.sand, red = adjust(mix(b.pal.soil, '#c4613a', 0.5), 0, 1.1, 0.05);
    mountains(b, 2, H * 0.3, hz, { kind: 'mesa', amp: 0.75, freq: 1.3, snow: false, maxDepth: 0.4 });
    b.items.filter(i => i.role === 'mountain').slice(-2).forEach((it, j) => { it.col = b.c(j ? red : mix(red, b.pal.far, 0.5), j ? 0.45 : 0.15); if (j) for (let k = 0; k < 8 * b.dk; k++) { const x = b.r() * W, y0 = b.yAt(it.ridge, x); if (y0 < hz - 30) b.line([[x, y0 + 6], [x + b.r.range(-3, 3), hz]], darken(it.col, 0.15), 3, 'mshade', 0.45, { op: 0.6 }); } });
    const dunes = hills(b, 3, hz + H * 0.02, H * 0.9, (i) => i % 2 ? sand : adjust(sand, -0.02, 1, -0.05), { kind: 'dune', amp: H * 0.12, d0: 0.4, d1: 1, freq: 1.4, role: 'dune' });
    for (const L of dunes) {
      const pts = L.ridge, lightLeft = b.sunX < W / 2; let run = [];
      const flush = () => { if (run.length > 3) { const n = run.length - 1, d = Math.min(Math.abs(run[n][1] - run[0][1]) * 1.4 + 12, 90); const low = run.map(([x, y], j) => [x, y + d * Math.pow(1 - j / n, 0.6) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, j / n + 0.15)))]); b.poly(run.concat(low.reverse()), darken(L.col, 0.16), 'dshade', L.depth, { op: 0.85 }); } run = []; };
      for (let j = 1; j < pts.length; j++) { const desc = pts[j][1] > pts[j - 1][1]; if (desc === lightLeft) { if (!run.length) run.push(pts[j - 1]); run.push(pts[j]); } else flush(); }
      flush();
      treesAlong(b, L, Math.round(3 * b.dk), ['cactus'], L.depth, [lerp(30, 140, L.depth), lerp(50, 200, L.depth)], [mix(b.pal.forest2, '#5d7a3a', 0.4)], 40);
    }
  },
  coast(b) {
    const H = b.H, W = b.W, hz = H * 0.55; sky(b, hz);
    const side = b.r() < 0.5 ? -1 : 1;
    // headland cliffs on one side
    const cl = []; for (let x = 0; x <= W * 0.45; x += 8) { const t = x / (W * 0.45); cl.push([side < 0 ? x : W - x, hz - H * 0.22 * Math.pow(1 - t, 0.6) * (0.85 + 0.15 * b.f.fbm(x * 0.01, 3, 3)) ]); }
    const cliff = cl.concat([[side < 0 ? W * 0.45 : W * 0.55, hz], [side < 0 ? -30 : W + 30, hz]]);
    b.poly(cliff, b.c(b.pal.rock, 0.45), 'mountain', 0.45, { refl: true });
    b.poly(cl.map(([x, y]) => [x, y]).concat(cl.slice().reverse().map(([x, y]) => [x, y + 16])), b.c(b.pal.grass, 0.45), 'hill', 0.45);
    const lx = side < 0 ? W * 0.12 : W * 0.88, ly = cl[Math.round(cl.length * 0.27)][1] + 6;
    const lw = 18, lh = 110;
    b.poly([[lx - lw, ly], [lx - lw * 0.65, ly - lh], [lx + lw * 0.65, ly - lh], [lx + lw, ly]], b.c('#f4efe6', 0.5), 'building', 0.5, { refl: true });
    for (let k = 0; k < 3; k++) { const y = ly - lh * (0.2 + k * 0.28); b.poly([[lx - lw * (1 - 0.35 * (0.2 + k * 0.28)), y], [lx + lw * (1 - 0.35 * (0.2 + k * 0.28)), y], [lx + lw * (1 - 0.35 * (0.32 + k * 0.28)), y - lh * 0.12], [lx - lw * (1 - 0.35 * (0.32 + k * 0.28)), y - lh * 0.12]], b.c(b.pal.accent, 0.5), 'bshade', 0.5); }
    b.rect(lx - lw * 0.6, ly - lh - 22, lw * 1.2, 22, b.T.lit > 0.5 ? '#ffe9a8' : b.c('#3d4a5c', 0.5), b.T.lit > 0.5 ? 'lit' : 'window', 0.5);
    b.poly([[lx - lw * 0.9, ly - lh - 22], [lx, ly - lh - 44], [lx + lw * 0.9, ly - lh - 22]], b.c(b.pal.accent, 0.5), 'roof', 0.5);
    if (b.T.lit > 0.5) b.add({ t: 'glow', cx: lx, cy: ly - lh - 11, r: 120, col: '#ffe9a8', role: 'glow', depth: 0.5, op: 0.5 });
    water(b, hz, H, b.pal.water);
    for (let i = 0; i < 1 + b.d / 2; i++) boat(b, W * b.r.range(0.3, 0.85), hz + H * b.r.range(0.03, 0.15), b.r.range(10, 26), 0.6);
    // beach
    const beach = []; for (let x = -30; x <= W + 30; x += 8) beach.push([x, H * 0.8 + Math.sin(x / W * Math.PI * 1.3 + b.r() * 0.01 + b.P.seed) * H * 0.05 - (x / W) * side * H * 0.06]);
    b.poly(beach.map(([x, y]) => [x, y - 10]).concat([[W + 30, H], [-30, H]]), lighten(b.c(b.pal.water, 0.9), 0.5), 'foam', 0.9, { op: 0.8 });
    const B = b.ridgeLayer(beach, H, b.c(b.pal.sand, 1), 'sand', 1);
    b.ridgeLayer(beach.map(([x, y]) => [x, y + 2]), y2(beach) , b.c(darken(b.pal.sand, 0.12), 1), 'sandshade', 1, { op: 0.6 });
    function y2(p) { return Math.max(...p.map(q => q[1])) + 18; }
    for (let i = 0; i < 3; i++) { const x = b.r() * W; b.line([[x - 60, b.yAt(beach, x) - 5], [x + 60, b.yAt(beach, x) - 5]], '#ffffff', 3, 'foamline', 1, { op: 0.7 }); }
    const kinds = b.P.palette === 'winter' ? ['pine'] : ['palm'];
    treesAlong(b, B, Math.round(2 + b.d * 0.6), kinds, 1, [160, 300], [b.pal.forest2, b.pal.forest], 60);
  },
  country(b) {
    const H = b.H, W = b.W, hz = H * 0.48; sky(b, hz);
    mountains(b, 1, H * 0.25, hz + 10, { snow: true, amp: 0.7 });
    const fieldCols = [b.pal.grass, adjust(b.pal.grass, 0.06, 1, 0.06), mix(b.pal.sand, b.pal.grass, 0.4), adjust(b.pal.grass, -0.04, 0.9, -0.05), mix(b.pal.soil, b.pal.grass, 0.35)];
    const n = 3 + Math.round(b.d / 2);
    hills(b, n, hz - 10, H * 0.94, (i) => fieldCols[i % fieldCols.length], {
      amp: H * 0.09, d0: 0.3, d1: 1, freq: 1,
      after: (L, i, t, depth) => {
        // patchwork field strips following the hill
        let x = -30;
        while (x < b.W + 30) { const w = b.r.range(80, 260) * lerp(0.7, 1.6, t), o1 = b.r.range(6, 20), o2 = o1 + b.r.range(20, 60) * lerp(0.6, 1.5, t); const top = [], bot = []; for (let xx = x; xx <= x + w; xx += 8) { top.push([xx, b.yAt(L.ridge, xx) + o1]); bot.push([xx, b.yAt(L.ridge, xx) + o2]); } if (b.r() < 0.55) { const fc = b.c(b.r.pick(fieldCols), depth); b.poly(top.concat(bot.reverse()), fc, 'field', depth); if (b.r() < 0.5) for (let k = 1; k < 4; k++) { const ln = top.map(([px, py], j) => [px, lerp(py, bot[bot.length - 1 - j][1], k / 4)]); b.line(ln, darken(fc, 0.12), lerp(1, 2.5, t), 'furrow', depth, { op: 0.7 }); } } x += w + b.r.range(0, 40); }
        treesAlong(b, L, Math.round(lerp(10, 5, t) * b.dk), ['round', 'round', 'pine'], depth, [lerp(16, 70, t), lerp(26, 110, t)], [b.pal.forest, b.pal.forest2], 12);
        const nh = Math.round(b.r.range(0, 3) * (b.d / 3)); for (let k = 0; k < nh; k++) { const xx = b.r.range(60, b.W - 60); house(b, xx, b.yAt(L.ridge, xx) + lerp(8, 20, t), lerp(16, 60, t), depth); }
        if (i === Math.floor(n / 2)) { const xx = b.r.range(100, b.W - 100), yy = b.yAt(L.ridge, xx) + 12, s = lerp(16, 60, t); const wc = b.c('#efe6d6', depth); b.rect(xx - s, yy - s * 0.8, s * 1.8, s * 0.8, wc, 'building', depth); b.poly([[xx - s * 1.1, yy - s * 0.8], [xx - s * 0.1, yy - s * 1.3], [xx + s * 0.9, yy - s * 0.8]], b.c(b.pal.roof, depth), 'roof', depth); b.rect(xx - s * 1.0, yy - s * 2.1, s * 0.6, s * 2.1, wc, 'building', depth); b.poly([[xx - s * 1.05, yy - s * 2.1], [xx - s * 0.7, yy - s * 3.2], [xx - s * 0.35, yy - s * 2.1]], b.c(b.pal.roof, depth), 'roof', depth); b.rect(xx - s * 0.8, yy - s * 1.8, s * 0.2, s * 0.3, b.T.lit > 0.5 ? '#ffd27a' : darken(wc, 0.5), 'window', depth); }
      }
    });
  },
  city(b) { city(b, false); },
  harbor(b) { city(b, true); }
};

function city(b, river) {
  const H = b.H, W = b.W, hz = river ? H * 0.66 : H * 0.8; sky(b, hz);
  if (b.r() < 0.6) mountains(b, 1, H * 0.35, hz, { snow: true, amp: 0.6, refl: river, bottom: hz });
  const rows = 2 + Math.round(b.d / 2);
  for (let row = 0; row < rows; row++) {
    const t = rows === 1 ? 1 : row / (rows - 1), depth = lerp(0.15, 0.95, t), base = hz + (river ? 0 : lerp(-6, 0, t));
    let x = b.r.range(-60, 0);
    while (x < W + 40) {
      const w = b.r.range(40, 110) * lerp(0.7, 1.15, t), tall = b.r() < 0.18, h = (tall ? b.r.range(0.45, 0.62) : b.r.range(0.12, 0.38)) * H * lerp(1.05, 0.7, t);
      building(b, x + w / 2, base, w, h, depth, river);
      x += w + b.r.range(-8, 14);
    }
  }
  if (river) {
    water(b, hz, H, b.pal.water);
    // suspension bridge
    const by = hz + H * 0.06, t1 = W * b.r.range(0.18, 0.3), t2 = W * b.r.range(0.7, 0.82), th = H * 0.3, depth = 0.9, bc = b.c(b.r.pick([b.pal.accent, '#8a8f99', '#c0563b']), depth);
    for (const tx of [t1, t2]) { b.rect(tx - 12, by - th, 8, th + H * 0.12, bc, 'bridge', depth); b.rect(tx + 4, by - th, 8, th + H * 0.12, bc, 'bridge', depth); b.rect(tx - 12, by - th + 10, 24, 6, bc, 'bridge', depth); b.rect(tx - 12, by - th * 0.5, 24, 6, bc, 'bridge', depth); }
    const cable = (xa, xb, ya, yb, sag) => { const p = []; for (let k = 0; k <= 30; k++) { const s = k / 30; p.push([lerp(xa, xb, s), lerp(ya, yb, s) + Math.sin(Math.PI * s) * sag]); } return p; };
    const main = cable(t1, t2, by - th, by - th, th * 0.82);
    b.line(main, bc, 4, 'bridge', depth); b.line(cable(-30, t1, by - 12, by - th, -th * 0.1), bc, 4, 'bridge', depth); b.line(cable(t2, W + 30, by - th, by - 12, -th * 0.1), bc, 4, 'bridge', depth);
    for (let k = 1; k < 30; k++) { const [mx, my] = main[k]; b.line([[mx, my], [mx, by]], bc, 1.2, 'bridge', depth, { op: 0.8 }); }
    b.rect(-30, by, W + 60, 12, darken(bc, 0.25), 'bridge', depth);
    b.line([[-30, by + 14], [W + 30, by + 14]], darken(bc, 0.45), 3, 'bridge', depth);
    if (b.T.lit > 0.3) for (let x = 10; x < W; x += 46) { b.add({ t: 'glow', cx: x, cy: by - 4, r: 16, col: '#ffd890', role: 'glow', depth, op: 0.7 }); b.circle(x, by - 4, 2.5, '#fff1c2', 'lamp', depth); }
    // embankment in front
    const emb = []; for (let x = -30; x <= W + 30; x += 10) emb.push([x, H * 0.93 + b.f.fbm(x * 0.004, 7, 2) * 8]);
    b.ridgeLayer(emb, H, b.c('#6d6a66', 1), 'ground', 1);
    for (let x = 40; x < W; x += 180) { b.line([[x, H * 0.93], [x, H * 0.8]], b.c('#2b2b30', 1), 4, 'lamppost', 1); b.line([[x, H * 0.8], [x + 14, H * 0.8]], b.c('#2b2b30', 1), 4, 'lamppost', 1); if (b.T.lit > 0.3) { b.add({ t: 'glow', cx: x + 14, cy: H * 0.805, r: 50, col: '#ffd890', role: 'glow', depth: 1, op: 0.6 }); b.circle(x + 14, H * 0.807, 5, '#fff3c8', 'lamp', 1); } }
  } else {
    const gy = hz;
    b.rect(-30, gy, W + 60, H - gy + 30, b.c('#4f4c4a', 1), 'ground', 1);
    b.rect(-30, gy + (H - gy) * 0.45, W + 60, 4, b.c('#d8d0b0', 1), 'road', 1, { op: 0.7 });
    for (let x = -20; x < W; x += 70) b.rect(x, gy + (H - gy) * 0.45 + 30, 36, 5, b.c('#e8e0c0', 1), 'road', 1, { op: 0.8 });
    for (let x = 60; x < W; x += 220) { b.line([[x, gy + 4], [x, gy - H * 0.13]], b.c('#2b2b30', 1), 4, 'lamppost', 1); if (b.T.lit > 0.3) { b.add({ t: 'glow', cx: x, cy: gy - H * 0.13, r: 46, col: '#ffd890', role: 'glow', depth: 1, op: 0.65 }); b.circle(x, gy - H * 0.13, 6, '#fff3c8', 'lamp', 1); } }
    const st = b.r.range(0, 1); for (let x = 140 + st * 80; x < W; x += 260) roundTree(b, x, gy + 6, H * 0.12, b.c(b.pal.forest2, 1), 1);
  }
}
function building(b, cx, base, w, h, depth, refl) {
  const { r, pal } = b, x0 = cx - w / 2, top = base - h, body = b.c(r.pick(pal.build), depth);
  const kind = r.pick(['grid', 'grid', 'bands', 'stripes', 'glass']);
  b.rect(x0, top, w, h, body, 'building', depth, { refl });
  b.rect(x0 + w * 0.7, top, w * 0.3, h, darken(body, 0.14), 'bshade', depth);
  // crowns
  const crown = r.pick(['flat', 'flat', 'setback', 'antenna', 'spire', 'dome', 'slant']);
  let rt = top;
  if (crown === 'setback' && h > 120) { const sw = w * 0.6, sh = h * 0.15; b.rect(cx - sw / 2, top - sh, sw, sh, body, 'building', depth, { refl }); rt = top - sh; }
  if (crown === 'spire' && h > 150) b.poly([[cx - w * 0.15, rt], [cx, rt - h * 0.28], [cx + w * 0.15, rt]], body, 'building', depth, { refl });
  if (crown === 'antenna') b.line([[cx, rt], [cx, rt - h * 0.18]], darken(body, 0.3), 2.5, 'detail', depth);
  if (crown === 'dome') { const p = []; for (let i = 0; i <= 16; i++) { const a = Math.PI + Math.PI * i / 16; p.push([cx + Math.cos(a) * w * 0.32, rt + Math.sin(a) * w * 0.32]); } b.poly(p, darken(body, 0.08), 'building', depth, { refl }); }
  if (crown === 'slant') b.poly([[x0, top], [x0 + w, top - w * 0.4], [x0 + w, top]], body, 'building', depth, { refl });
  // windows
  if (depth < 0.2) return;
  const lit = b.T.lit, dark = b.c(darken('#33475e', 0.1), depth), glass = mix(gradAt(b.T.sky, 0.6), dark, 0.45);
  if (kind === 'grid' || kind === 'glass') {
    const cols = Math.max(2, Math.round(w / lerp(18, 14, b.d / 5))), rows = Math.max(2, Math.round(h / lerp(22, 15, b.d / 5)));
    const cw = (w - 8) / cols, rh = (h - 10) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const on = r() < lit * 0.55, wx = x0 + 4 + i * cw + cw * 0.18, wy = top + 6 + j * rh + rh * 0.2;
      b.rect(wx, wy, cw * 0.64, rh * 0.55, on ? r.pick(['#ffd47a', '#ffe7a8', '#ffc26b']) : (kind === 'glass' ? glass : dark), on ? 'lit' : 'window', depth);
    }
  } else if (kind === 'bands') {
    for (let y = top + 8; y < base - 8; y += 14) b.rect(x0 + 3, y, w - 6, 5, r() < lit * 0.5 ? '#ffd98a' : glass, r() < lit * 0.5 ? 'lit' : 'window', depth);
  } else {
    for (let x = x0 + 6; x < x0 + w - 6; x += 10) b.rect(x, top + 8, 4, h - 16, r() < lit * 0.4 ? '#ffd98a' : glass, 'window', depth);
  }
}

export function buildScene(P) {
  P = { ...DEFAULT_PARAMS, ...P };
  const b = new Builder(P);
  (BUILD[P.scene] || BUILD.lake)(b);
  return { W: b.W, H: b.H, items: b.items, horizon: b.horizon || b.H * 0.6, sun: b.sun, sunX: b.sunX, P, sky: b.T.sky, time: b.T, pal: b.pal };
}
