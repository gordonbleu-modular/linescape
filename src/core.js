// Core geometry + randomness helpers for the plotter engine (all units in mm).

export function rng(seed) {
  // sfc32 seeded through a splitmix-style scrambler
  let s = (seed >>> 0) ^ 0xdeadbeef;
  const mix = () => { s = (s + 0x9e3779b9) | 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
  let a = mix(), b = mix(), c = mix(), d = mix();
  const r = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) r();
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.gauss = () => (r() + r() + r() - 1.5) / 1.5;
  return r;
}

export function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

// Gradient noise using hashed lattice gradients (no permutation table).
export class Field {
  constructor(seed) { this.seed = seed >>> 0; }
  grad(ix, iy) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ this.seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const a = (h >>> 0) / 4294967296 * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  }
  n(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const dot = (ix, iy) => { const g = this.grad(ix, iy); return g[0] * (x - ix) + g[1] * (y - iy); };
    const u = fade(fx), v = fade(fy);
    const a = dot(x0, y0), b = dot(x0 + 1, y0), c = dot(x0, y0 + 1), d = dot(x0 + 1, y0 + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.41;
  }
  fbm(x, y, oct = 5) { let s = 0, amp = 1, tot = 0, f = 1; for (let i = 0; i < oct; i++) { s += amp * this.n(x * f + i * 17.3, y * f - i * 9.1); tot += amp; amp *= 0.5; f *= 2.1; } return s / tot; }
  ridge(x, y, oct = 5) { let s = 0, amp = 1, tot = 0, f = 1; for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(this.n(x * f + i * 3.7, y * f + i * 11.9)); s += amp * v * v; tot += amp; amp *= 0.5; f *= 2.05; } return s / tot; }
}

// Raster occlusion buffer: anything already drawn in front marks cells as taken.
export class Occluder {
  constructor(W, H, res) { this.W = W; this.H = H; this.res = res; this.w = Math.ceil(W * res) + 2; this.h = Math.ceil(H * res) + 2; this.g = new Uint8Array(this.w * this.h); }
  open(x, y) { if (x < 0 || y < 0 || x > this.W || y > this.H) return false; return this.g[Math.floor(y * this.res) * this.w + Math.floor(x * this.res)] === 0; }
  below(fn, xa, xb, bottom, pad = 0) {
    const r = this.res, i0 = Math.max(0, Math.floor(xa * r)), i1 = Math.min(this.w - 1, Math.ceil(xb * r)), jb = Math.min(this.h - 1, Math.ceil(bottom * r));
    for (let i = i0; i <= i1; i++) { const top = fn(i / r) - pad; for (let j = Math.max(0, Math.floor(top * r)); j <= jb; j++) this.g[j * this.w + i] = 1; }
  }
  poly(pts, pad = 0) {
    if (pad > 0) pts = inflate(pts, pad);
    const r = this.res; let lo = Infinity, hi = -Infinity;
    for (const p of pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
    const j0 = Math.max(0, Math.floor(lo * r)), j1 = Math.min(this.h - 1, Math.ceil(hi * r)), xs = [];
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) / r; xs.length = 0;
      for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) { const a = pts[i], b = pts[k]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) { const a = Math.max(0, Math.floor(xs[q] * r)), b = Math.min(this.w - 1, Math.ceil(xs[q + 1] * r)); for (let i = a; i <= b; i++) this.g[j * this.w + i] = 1; }
    }
  }
  rect(x0, y0, x1, y1) { this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); }
  circle(cx, cy, r) { this.poly(circle(cx, cy, r, 40)); }
  freeRect(x0, y0, x1, y1) { for (let y = y0; y <= y1; y += 1 / this.res) for (let x = x0; x <= x1; x += 1 / this.res) if (!this.open(x, y)) return false; return true; }
}

function inflate(pts, d) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  return pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * d, y + dy / l * d]; });
}

export function clip(pts, occ, out, step = 0.25) {
  let run = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (occ.open(x, y)) (run || (run = [])).push([x, y]);
      else if (run) { if (run.length > 1) out.push(run); run = null; }
    }
  }
  if (run && run.length > 1) out.push(run);
}

export function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); const [ax, ay] = pts[a]; const dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = Math.hypot(dx, dy);
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = L < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function circle(cx, cy, r, n = 48, a0 = 0, a1 = Math.PI * 2) { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
export function ellipse(cx, cy, rx, ry, n = 40) { const o = []; for (let i = 0; i <= n; i++) { const a = Math.PI * 2 * i / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; }
export function pathLen(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; }

// Hatch a polygon with parallel lines at angle (radians) and spacing sp; returns list of segments.
export function hatchPoly(poly, sp, angle = 0, jitter = 0, r = Math.random) {
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  const rot = poly.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]);
  let lo = Infinity, hi = -Infinity; for (const p of rot) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
  const segs = [], cb = Math.cos(angle), sb = Math.sin(angle);
  for (let y = lo + sp / 2; y < hi; y += sp) {
    const xs = [];
    for (let i = 0, k = rot.length - 1; i < rot.length; k = i++) { const a = rot[i], b = rot[k]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const yy = y + (jitter ? (r() - 0.5) * jitter : 0);
      const A = [xs[q] * cb - yy * sb, xs[q] * sb + yy * cb], B = [xs[q + 1] * cb - yy * sb, xs[q + 1] * sb + yy * cb];
      segs.push([A, B]);
    }
  }
  return segs;
}
