// Fill-pattern library: every pattern returns stroke polylines (scene units) for one region.
// The caller clips them to the region mask + occlusion buffer, so patterns may overshoot the shape.
import { simplify, clamp, lerp } from './core.js';
import { glyph, RAMP } from './font.js';

export const FILLS = {
  none: 'None (outline only)', hatch: 'Hatch', crosshatch: 'Crosshatch', dashes: 'Broken lines', wave: 'Wave lines', zigzag: 'Zigzag',
  ridge: 'Ridge lines (Joy Division)', contour: 'Concentric contours', spiral: 'Spiral', dots: 'Stipple dots', ascii: 'ASCII characters',
  maze: 'Labyrinth', truchet: 'Truchet tiles', brick: 'Brick', grid: 'Grid', scribble: 'Scribble', hilbert: 'Hilbert curve', flow: 'Flow field', wire: 'Wireframe'
};
export const FILL_IC = { none: '○', hatch: '▤', crosshatch: '▦', dashes: '┅', wave: '∿', zigzag: '⩘', ridge: '≈', contour: '◎', spiral: '@', dots: '⁘', ascii: '#', maze: '▞', truchet: '◜', brick: '▥', grid: '▦', scribble: '૭', hilbert: '⌇', flow: '≋', wire: '△' };

// Raster mask of a polygon (1 cell = 1 scene unit), clamped to the page.
export class Region {
  constructor(poly, W, H) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    this.x0 = Math.max(0, Math.floor(x0)); this.y0 = Math.max(0, Math.floor(y0)); this.x1 = Math.min(W, Math.ceil(x1)); this.y1 = Math.min(H, Math.ceil(y1));
    this.w = this.x1 - this.x0 + 1; this.h = this.y1 - this.y0 + 1; this.poly = poly;
    this.empty = this.w <= 1 || this.h <= 1;
    if (this.empty) return;
    const m = this.m = new Uint8Array(this.w * this.h), xs = [];
    for (let j = 0; j < this.h; j++) {
      const y = this.y0 + j + 0.5; xs.length = 0;
      for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) { const a = poly[i], b = poly[k]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) { const a = Math.max(0, Math.round(xs[q] - this.x0)), b = Math.min(this.w - 1, Math.round(xs[q + 1] - this.x0)); for (let i = a; i <= b; i++) m[j * this.w + i] = 1; }
    }
  }
  in(x, y) { if (this.empty) return false; const i = Math.floor(x - this.x0), j = Math.floor(y - this.y0); return i >= 0 && j >= 0 && i < this.w && j < this.h && this.m[j * this.w + i] === 1; }
  centroid() { let sx = 0, sy = 0, n = 0; for (let j = 0; j < this.h; j += 3) for (let i = 0; i < this.w; i += 3) if (this.m[j * this.w + i]) { sx += i; sy += j; n++; } return n ? [this.x0 + sx / n, this.y0 + sy / n] : [(this.x0 + this.x1) / 2, (this.y0 + this.y1) / 2]; }
}

// Local rotated frame covering the region's bbox.
function frame(R, a) {
  const cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2, c = Math.cos(a), s = Math.sin(a);
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const [x, y] of [[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1]]) { const dx = x - cx, dy = y - cy, u = dx * c + dy * s, v = -dx * s + dy * c; u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
  const W = (p) => [cx + p[0] * c - p[1] * s, cy + p[0] * s + p[1] * c];
  return { u0, v0, u1, v1, W, map: (line) => line.map(W) };
}
const circ = (x, y, r, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; o.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return o; };

// tone (0 light .. 1 dark) -> spacing
const spacingOf = (c, t, mul = 1) => clamp(c.sp0 * mul / Math.pow(Math.max(t, 0.02), 1.25), c.sp0 * 0.7, c.spMax);
const toneHere = (c, x, y) => c.toneAt ? c.toneAt(x, y) : c.t;

function rows(c, ang, mul, make) {
  const F = frame(c.region, ang), out = [];
  let v = F.v0 + c.r() * spacingOf(c, c.t, mul) * 0.5, i = 0;
  while (v < F.v1 && i < 5000) {
    const mid = F.W([(F.u0 + F.u1) / 2, v]), t = toneHere(c, mid[0], mid[1]);
    if (t >= c.tMin) for (const l of make(F, v, t, i)) out.push(F.map(l));
    v += spacingOf(c, Math.max(t, c.tMin), mul); i++;
  }
  return out;
}
const P = {
  hatch: (c) => rows(c, c.angle, 1, (F, v) => [[[F.u0, v], [F.u1, v]]]),
  crosshatch: (c) => { const a = rows(c, c.angle, 1.15, (F, v) => [[[F.u0, v], [F.u1, v]]]); const b = rows(c, c.angle + Math.PI / 2, 1.15, (F, v) => [[[F.u0, v], [F.u1, v]]]); const d = c.t > 0.75 ? rows(c, c.angle + Math.PI / 4, 1.6, (F, v) => [[[F.u0, v], [F.u1, v]]]) : []; return a.concat(b, d); },
  dashes: (c) => rows(c, c.angle, 1, (F, v, t) => { const o = []; let u = F.u0 - c.r() * 20; while (u < F.u1) { const len = c.r.range(4, 30) * c.k * lerp(0.5, 1.2, t), gap = c.r.range(1.5, 10) * c.k * (1.2 - t); o.push([[u, v], [u + len, v]]); u += len + gap; } return o; }),
  wave: (c) => { const sp = spacingOf(c, c.t), A = sp * 0.38, L = Math.max(sp * 3.2, 6 * c.k); return rows(c, c.angle, 1, (F, v, t, i) => { const l = []; for (let u = F.u0; u <= F.u1 + L / 8; u += L / 16) l.push([u, v + A * Math.sin((u / L + i * 0.17) * Math.PI * 2)]); return [l]; }); },
  zigzag: (c) => { const sp = spacingOf(c, c.t), A = sp * 0.42, L = Math.max(sp * 1.6, 3 * c.k); return rows(c, c.angle, 1, (F, v) => { const l = []; let k = 0; for (let u = F.u0; u <= F.u1 + L; u += L / 2, k++) l.push([u, v + (k % 2 ? A : -A)]); return [l]; }); },
  dots: (c) => {
    const F = frame(c.region, c.angle), out = [], rad = c.dotR;
    const sp = spacingOf(c, c.t, 0.6);
    for (let v = F.v0; v < F.v1; v += sp) for (let u = F.u0 + ((v / sp) % 2) * sp / 2; u < F.u1; u += sp) {
      if (c.budget.dots <= 0) return out;
      const [x, y] = F.W([u + c.r.range(-0.35, 0.35) * sp, v + c.r.range(-0.35, 0.35) * sp]);
      if (!c.region.in(x, y)) continue;
      const t = toneHere(c, x, y); if (c.toneAt && c.r() > t / Math.max(c.t, 0.05)) continue;
      out.push(circ(x, y, rad, 6)); c.budget.dots--;
    }
    return out;
  },
  ascii: (c) => {
    const F = frame(c.region, c.angle), out = [], cw = clamp(c.sp0 * 2.6, 1.8 * c.k, 20 * c.k), ch = cw * 1.25;
    for (let v = F.v0; v < F.v1; v += ch) for (let u = F.u0; u < F.u1; u += cw) {
      const [x, y] = F.W([u + cw / 2, v + ch / 2]); if (!c.region.in(x, y)) continue;
      const t = toneHere(c, x, y); if (t < c.tMin) continue;
      const idx = clamp(Math.round(t * (RAMP.length - 1) + c.r.range(-1.6, 1.6)), 0, RAMP.length - 1);
      for (const s of glyph(RAMP[idx], u + cw * 0.08, v + ch * 0.08, cw * 0.84, ch * 0.84)) out.push(F.map(s));
    }
    return out;
  },
  maze: (c) => {
    const F = frame(c.region, c.angle); let cell = Math.max(spacingOf(c, c.t, 1.5), 1.6 * c.k);
    let cols = Math.ceil((F.u1 - F.u0) / cell), rws = Math.ceil((F.v1 - F.v0) / cell);
    while (cols * rws > 40000) { cell *= 1.3; cols = Math.ceil((F.u1 - F.u0) / cell); rws = Math.ceil((F.v1 - F.v0) / cell); }
    const N = cols * rws, act = new Uint8Array(N), vis = new Uint8Array(N), right = new Uint8Array(N).fill(1), down = new Uint8Array(N).fill(1);
    for (let j = 0; j < rws; j++) for (let i = 0; i < cols; i++) { const [x, y] = F.W([F.u0 + (i + 0.5) * cell, F.v0 + (j + 0.5) * cell]); act[j * cols + i] = c.region.in(x, y) ? 1 : 0; }
    const st = [];
    for (let s = 0; s < N; s++) {
      if (!act[s] || vis[s]) continue; vis[s] = 1; st.push(s);
      while (st.length) {
        const cur = st[st.length - 1], i = cur % cols, j = (cur / cols) | 0, nb = [];
        if (i > 0 && act[cur - 1] && !vis[cur - 1]) nb.push(cur - 1); if (i < cols - 1 && act[cur + 1] && !vis[cur + 1]) nb.push(cur + 1);
        if (j > 0 && act[cur - cols] && !vis[cur - cols]) nb.push(cur - cols); if (j < rws - 1 && act[cur + cols] && !vis[cur + cols]) nb.push(cur + cols);
        if (!nb.length) { st.pop(); continue; }
        const n = nb[Math.floor(c.r() * nb.length)];
        if (n === cur + 1) right[cur] = 0; else if (n === cur - 1) right[n] = 0; else if (n === cur + cols) down[cur] = 0; else down[n] = 0;
        vis[n] = 1; st.push(n);
      }
    }
    const out = [], X = (i) => F.u0 + i * cell, Y = (j) => F.v0 + j * cell;
    for (let j = 0; j < rws; j++) { let start = -1; for (let i = 0; i <= cols; i++) { const s = j * cols + i, wall = i < cols && act[s] && (down[s] || (j + 1 < rws && !act[s + cols])); if (wall && start < 0) start = i; if (!wall && start >= 0) { out.push(F.map([[X(start), Y(j + 1)], [X(i), Y(j + 1)]])); start = -1; } } }
    for (let i = 0; i < cols; i++) { let start = -1; for (let j = 0; j <= rws; j++) { const s = j * cols + i, wall = j < rws && act[s] && (right[s] || (i + 1 < cols && !act[s + 1])); if (wall && start < 0) start = j; if (!wall && start >= 0) { out.push(F.map([[X(i + 1), Y(start)], [X(i + 1), Y(j)]])); start = -1; } } }
    return out;
  },
  truchet: (c) => {
    const F = frame(c.region, c.angle), out = [], cell = Math.max(spacingOf(c, c.t, 2.2), 2.2 * c.k), arc = (cx, cy, a0) => { const o = []; for (let k = 0; k <= 8; k++) { const a = a0 + k / 8 * Math.PI / 2; o.push([cx + Math.cos(a) * cell / 2, cy + Math.sin(a) * cell / 2]); } return o; };
    for (let v = F.v0; v < F.v1; v += cell) for (let u = F.u0; u < F.u1; u += cell) {
      const [x, y] = F.W([u + cell / 2, v + cell / 2]); if (!c.region.in(x, y) && !c.region.in(...F.W([u, v]))) continue;
      if (c.r() < 0.5) { out.push(F.map(arc(u, v, 0)), F.map(arc(u + cell, v + cell, Math.PI))); } else { out.push(F.map(arc(u + cell, v, Math.PI / 2)), F.map(arc(u, v + cell, -Math.PI / 2))); }
      if (c.t > 0.65) out.push(F.map(circ(u + cell / 2, v + cell / 2, cell * 0.12, 8).map(p => p)).slice(0));
    }
    return out;
  },
  brick: (c) => { const h = Math.max(spacingOf(c, c.t, 1.5), 1.2 * c.k), w = h * 2.2, F = frame(c.region, c.angle), out = []; let row = 0; for (let v = F.v0; v < F.v1; v += h, row++) { out.push(F.map([[F.u0, v], [F.u1, v]])); for (let u = F.u0 + (row % 2) * w / 2; u < F.u1; u += w) out.push(F.map([[u, v], [u, v + h]])); } return out; },
  grid: (c) => { const s = Math.max(spacingOf(c, c.t, 1.3), 1 * c.k), F = frame(c.region, c.angle), out = []; for (let v = F.v0; v < F.v1; v += s) out.push(F.map([[F.u0, v], [F.u1, v]])); for (let u = F.u0; u < F.u1; u += s) out.push(F.map([[u, F.v0], [u, F.v1]])); return out; },
  scribble: (c) => {
    const F = frame(c.region, c.angle), out = [], sp = spacingOf(c, c.t, 1.4), R = sp * 0.85; let row = 0;
    for (let v = F.v0; v < F.v1 + R; v += sp, row++) {
      const l = []; const dir = row % 2 ? -1 : 1; let th = c.r() * 6;
      for (let s = 0, u = dir > 0 ? F.u0 - R : F.u1 + R; dir > 0 ? u < F.u1 + R : u > F.u0 - R; s++) { const rr = R * (0.75 + 0.4 * c.field.n(u * 0.02, v * 0.02 + row)); l.push([u + Math.cos(th) * rr, v + Math.sin(th) * rr]); th += 0.55 * dir; u += dir * R * 0.16; }
      out.push(F.map(l));
    }
    return out;
  },
  hilbert: (c) => {
    const F = frame(c.region, c.angle); const size = Math.max(F.u1 - F.u0, F.v1 - F.v0); let cell = Math.max(spacingOf(c, c.t, 1.1), 1 * c.k);
    let n = clamp(Math.ceil(Math.log2(size / cell)), 1, 8); const N = 1 << n; cell = size / N;
    const pts = [];
    for (let d = 0; d < N * N; d++) { let rx, ry, t = d, x = 0, y = 0; for (let s = 1; s < N; s *= 2) { rx = 1 & (t / 2); ry = 1 & (t ^ rx); if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const tmp = x; x = y; y = tmp; } x += s * rx; y += s * ry; t = Math.floor(t / 4); } pts.push([F.u0 + (x + 0.5) * cell, F.v0 + (y + 0.5) * cell]); }
    return [F.map(pts)];
  },
  contour: (c) => {
    const R = c.region, cs = 2, gw = Math.ceil(R.w / cs) + 2, gh = Math.ceil(R.h / cs) + 2, D = new Float32Array(gw * gh), INF = 1e9;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const x = R.x0 + (i - 1) * cs + cs / 2, y = R.y0 + (j - 1) * cs + cs / 2; const edge = i === 0 || j === 0 || i === gw - 1 || j === gh - 1; const inside = R.in(x, y); const onPage = x > 1 && y > 1 && x < c.W - 1 && y < c.H - 1; D[j * gw + i] = inside ? INF : (edge && !onPage ? INF : 0); }
    // treat page-border cells as "inside" so contours only follow real shape edges
    const a = 1, b = 1.414;
    for (let j = 1; j < gh; j++) for (let i = 1; i < gw - 1; i++) { const k = j * gw + i; D[k] = Math.min(D[k], D[k - 1] + a, D[k - gw] + a, D[k - gw - 1] + b, D[k - gw + 1] + b); }
    for (let j = gh - 2; j >= 0; j--) for (let i = gw - 2; i > 0; i--) { const k = j * gw + i; D[k] = Math.min(D[k], D[k + 1] + a, D[k + gw] + a, D[k + gw + 1] + b, D[k + gw - 1] + b); }
    let mx = 0; for (let k = 0; k < D.length; k++) if (D[k] < INF / 2 && D[k] > mx) mx = D[k]; for (let k = 0; k < D.length; k++) if (D[k] >= INF / 2) D[k] = mx + 1;
    const sp = spacingOf(c, c.t) / cs, out = [];
    const P2 = (i, j) => [R.x0 + (i - 1) * cs + cs / 2, R.y0 + (j - 1) * cs + cs / 2];
    for (let lv = sp * 0.6; lv < mx && out.length < 60000; lv += sp) {
      for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
        const v0 = D[j * gw + i], v1 = D[j * gw + i + 1], v2 = D[(j + 1) * gw + i + 1], v3 = D[(j + 1) * gw + i];
        const idx = (v0 > lv) | ((v1 > lv) << 1) | ((v2 > lv) << 2) | ((v3 > lv) << 3); if (idx === 0 || idx === 15) continue;
        const e = (pa, pb, va, vb) => { const t = (lv - va) / (vb - va); return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]; };
        const p0 = P2(i, j), p1 = P2(i + 1, j), p2 = P2(i + 1, j + 1), p3 = P2(i, j + 1);
        const T = () => e(p0, p1, v0, v1), Rr = () => e(p1, p2, v1, v2), B = () => e(p3, p2, v3, v2), L = () => e(p0, p3, v0, v3);
        const segs = { 1: [[L, T]], 2: [[T, Rr]], 3: [[L, Rr]], 4: [[Rr, B]], 5: [[L, T], [Rr, B]], 6: [[T, B]], 7: [[L, B]], 8: [[B, L]], 9: [[B, T]], 10: [[T, Rr], [B, L]], 11: [[B, Rr]], 12: [[Rr, L]], 13: [[Rr, T]], 14: [[T, L]] }[idx];
        for (const [f, g] of segs) out.push([f(), g()]);
      }
    }
    return out;
  },
  spiral: (c) => {
    const R = c.region, [cx, cy] = R.centroid(), sp = spacingOf(c, c.t), Rmax = Math.max(...[[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
    const l = []; let th = 0; while (true) { const r = sp * th / (Math.PI * 2); if (r > Rmax) break; l.push([cx + Math.cos(th + c.angle) * r, cy + Math.sin(th + c.angle) * r]); th += Math.min(0.5, 2 / Math.max(r, 1)); if (l.length > 200000) break; }
    return [l];
  },
  ridge: (c) => {
    if (!c.ridge) return P.hatch({ ...c, angle: 0 });
    const out = [], sp = spacingOf(c, c.t, 0.9), top = Math.min(...c.ridge.map(p => p[1])), maxOff = Math.min(c.bottom - top, c.H);
    for (let off = sp * 0.8, i = 0; off < maxOff && i < 400; off += sp * (1 + i * 0.03), i++) out.push(c.ridge.map(([x, y]) => [x, Math.min(y + off, c.bottom)]));
    return out;
  },
  flow: (c) => {
    const R = c.region, out = [], sp = spacingOf(c, c.t, 1.25), L = 7 * c.k, st = 0.8 * c.k;
    for (let y = R.y0 + c.r() * sp; y < R.y1; y += sp) for (let x = R.x0 + c.r() * sp; x < R.x1; x += sp) {
      const sx = x + c.r.range(-0.4, 0.4) * sp, sy = y + c.r.range(-0.4, 0.4) * sp; if (!R.in(sx, sy)) continue;
      const line = [[sx, sy]]; let px = sx, py = sy; const n = Math.round(L / st * c.r.range(0.5, 1));
      for (let s = 0; s < n; s++) { const a = c.angle + c.field.fbm(px * 0.004, py * 0.004, 3) * 2.4; px += Math.cos(a) * st; py += Math.sin(a) * st; if (!R.in(px, py)) break; line.push([px, py]); }
      if (line.length > 2) out.push(line);
    }
    return out;
  },
  wire: (c) => {
    const out = [];
    if (c.ridge) {
      const sp = spacingOf(c, c.t, 2.2), rws = [], yAt = (x) => { const p = c.ridge, dx = p[1][0] - p[0][0], i = clamp(Math.floor((x - p[0][0]) / dx), 0, p.length - 2); return lerp(p[i][1], p[i + 1][1], clamp((x - p[i][0]) / dx, 0, 1)); };
      const top = Math.min(...c.ridge.map(p => p[1])), maxOff = Math.min(c.bottom - top, c.H);
      for (let off = 0, i = 0; off < maxOff && i < 60; off += sp * (1 + i * 0.12), i++) { const row = [], dx = sp * 1.6; for (let x = -30 + (i % 2) * dx / 2; x <= c.W + 30; x += dx * c.r.range(0.8, 1.2)) row.push([x, Math.min(yAt(x) + off + (off ? c.r.range(-0.25, 0.25) * sp : 0), c.bottom)]); rws.push(row); }
      for (let i = 1; i < rws.length; i++) { out.push(rws[i]); const A = rws[i - 1], B = rws[i]; let a = 0, b = 0; const zig = []; while (a < A.length && b < B.length) { zig.push(A[a], B[b]); if (A[a][0] < B[b][0]) a++; else b++; } if (zig.length > 1) out.push(zig); }
      return out;
    }
    const poly = c.poly, R = c.region, area = R.w * R.h; const s = simplify(poly, Math.max(2, Math.sqrt(area) * 0.08));
    if (area > 900 && s.length > 3) { const [cx, cy] = R.centroid(); for (let i = 0; i < s.length - 1; i += (c.t > 0.5 ? 1 : 2)) out.push([[cx, cy], s[i]]); }
    // add a sparse triangle lattice inside big regions so they read as faceted
    if (area > 40000) { const sp = spacingOf(c, c.t, 4); const F = frame(R, c.angle); for (let v = F.v0; v < F.v1; v += sp) { out.push(F.map([[F.u0, v], [F.u1, v]])); } for (let u = F.u0 - (F.v1 - F.v0); u < F.u1; u += sp * 1.15) out.push(F.map([[u, F.v0], [u + (F.v1 - F.v0) * 0.577, F.v1]])); }
    return out;
  },
  none: () => []
};

export function fillRegion(type, c) { const f = P[type] || P.hatch; return f({ tMin: 0.08, ...c }); }
