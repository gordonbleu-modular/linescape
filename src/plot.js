// Plotter line renderer: converts the scene graph into stroke-only paths with hidden-line removal.
// Each area type (sky, mountains, water, ...) gets its own fill pattern, scale, angle and pen.
import { Occluder, Field, rng, simplify, clamp, lerp } from './core.js';
import { buildScene } from './scene.js';
import { lum, gradAt } from './color.js';
import { FILLS, Region, fillRegion } from './fills.js';

export { FILLS };
export const PAPERS = { A5: [210, 148], A4: [297, 210], A3: [420, 297], Letter: [279.4, 215.9], Tabloid: [431.8, 279.4], 'Square 30 cm': [300, 300] };
export const SEASONS = { summer: ['Summer', 'natural'], autumn: ['Autumn', 'autumn'], winter: ['Winter', 'winter'] };
export const OUTLINES = { clean: 'Clean', sketch: 'Sketchy', none: 'No outlines' };
export const PAPER_COLORS = { '#fbfaf5': 'White', '#f3ead6': 'Cream', '#d9c3a0': 'Kraft', '#111214': 'Black' };
export const PEN_SETS = {
  ink: { label: 'Black ink', pens: [['Black', '#1b1b1b'], ['Grey', '#6b6b6b'], ['Black 2', '#1b1b1b'], ['Grey 2', '#8a8a8a']] },
  classic: { label: 'Classic 4', pens: [['Black', '#1c1c1a'], ['Green', '#2f6b48'], ['Brick', '#b8452f'], ['Blue', '#2b5c8a']] },
  sepia: { label: 'Sepia & indigo', pens: [['Sepia', '#5b3a24'], ['Olive', '#5d6b2f'], ['Rust', '#9a4a26'], ['Indigo', '#2e3a78']] },
  gel: { label: 'Gel pens on black', pens: [['White', '#f4f1e8'], ['Mint', '#62e3b5'], ['Pink', '#ff7eb6'], ['Cyan', '#5cc8ff']], paper: '#111214' },
  sunset: { label: 'Sunset fineliners', pens: [['Plum', '#4b2a5e'], ['Teal', '#1f7a72'], ['Coral', '#e4664f'], ['Gold', '#d9a12a']] }
};
// Area types: which scene roles they cover, a density multiplier and default fill / pen.
export const AREAS = {
  sky:       { label: 'Sky', roles: ['sky'], mul: 2.6, def: { fill: 'dashes', angle: 0, pen: 3 } },
  celestial: { label: 'Sun, moon & clouds', roles: ['sun', 'moon', 'moonshade', 'star', 'cloud', 'cloudshade'], mul: 1, def: { fill: 'global', angle: -1, pen: 3 } },
  mountains: { label: 'Mountains & rocks', roles: ['mountain', 'mshade', 'snow', 'rock', 'rshade'], mul: 1, def: { fill: 'global', angle: -1, pen: 0 } },
  ground:    { label: 'Hills, fields & ground', roles: ['hill', 'dune', 'dshade', 'sand', 'sandshade', 'field', 'furrow', 'ground', 'road', 'foam', 'foamline'], mul: 1, def: { fill: 'global', angle: -1, pen: 0 } },
  water:     { label: 'Water', roles: ['water', 'reflection', 'ripple', 'glitter'], mul: 1.5, def: { fill: 'dashes', angle: 0, pen: 3 } },
  trees:     { label: 'Trees & plants', roles: ['tree', 'treeshade', 'trunk'], mul: 1, def: { fill: 'global', angle: -1, pen: 1 } },
  buildings: { label: 'Buildings & boats', roles: ['building', 'bshade', 'roof', 'door', 'bridge', 'lamppost', 'lamp', 'sail', 'detail'], mul: 1, def: { fill: 'global', angle: -1, pen: 2 } },
  windows:   { label: 'Windows', roles: ['window', 'lit'], mul: 0.8, def: { fill: 'global', angle: -1, pen: 2 } }
};
const AREA_OF = {}; for (const [a, d] of Object.entries(AREAS)) for (const r of d.roles) AREA_OF[r] = a;
export const defaultAreas = () => Object.fromEntries(Object.entries(AREAS).map(([k, a]) => [k, { fill: a.def.fill, scale: 1, angle: a.def.angle, pen: a.def.pen }]));
export const defaultPens = (set = 'classic') => PEN_SETS[set].pens.map(([name, color]) => ({ name, color }));

const OVERLAY = new Set(['mshade', 'treeshade', 'treelight', 'bshade', 'dshade', 'rshade', 'snow', 'window', 'lit', 'door', 'field', 'furrow', 'reflection', 'ripple', 'glitter', 'cloudshade', 'sandshade']);
const SHADE = new Set(['mshade', 'treeshade', 'bshade', 'dshade', 'rshade', 'cloudshade', 'sandshade']);
const SKIP = new Set(['glow', 'mist', 'treelight']);
const ROW_FILLS = new Set(['hatch', 'crosshatch', 'dashes', 'wave', 'zigzag', 'ridge', 'flow', 'brick', 'grid']);
const TONAL_FILLS = new Set(['ascii', 'dots']);
const ANGLE = { mountain: 52, hill: 14, dune: 8, sand: 4, field: 0, rock: 45, ground: 0, road: 0, tree: 72, trunk: 90, building: 90, roof: 28, door: 90, cloud: 0, sun: 0, moon: 0, water: 0, sky: 0, bridge: 90, sail: 60, foam: 0, window: 45 };

export const DEFAULTS = { scene: 'lake', fill: 'crosshatch', fillScale: 1, fillAngle: -1, outline: 'clean', areas: defaultAreas(), pens: defaultPens(), paperColor: '#fbfaf5',
  season: 'summer', time: 'sunset', detail: 3, density: 1, seed: 2026, paper: 'A4', orient: 'landscape', margin: 15, penSet: 'classic', penWidth: 0.35, skyShade: true, frame: false, gap: 0.35, drawSpeed: 25, travelSpeed: 80 };

function bbox(p) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of p) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } return [a, b, c, d]; }
function inPoly(p, x, y, bb) { if (bb && (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3])) return false; let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const circlePts = (cx, cy, r, n) => { n = n || clamp(Math.round(r * 0.9), 8, 72); const o = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
function clipPred(pts, pred, out, step) {
  let run = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (pred(x, y)) (run || (run = [])).push([x, y]); else if (run) { if (run.length > 1) out.push(run); run = null; }
    }
  }
  if (run && run.length > 1) out.push(run);
}

export function plot(opts) {
  const O = { ...DEFAULTS, ...opts };
  O.areas = { ...defaultAreas(), ...(opts.areas || {}) };
  const pensCfg = (O.pens && O.pens.length >= 4) ? O.pens : defaultPens(O.penSet);
  let [pw, ph] = PAPERS[O.paper] || PAPERS.A4;
  if ((O.orient === 'landscape') !== (pw >= ph)) [pw, ph] = [ph, pw];
  const m = O.margin, dw = pw - 2 * m, dh = ph - 2 * m;
  const W = 1600, H = Math.round(W * dh / dw), k = W / dw; // scene units per mm
  const scene = buildScene({ scene: O.scene, time: O.time, detail: O.detail, seed: O.seed, palette: (SEASONS[O.season] || SEASONS.summer)[1], W, H });
  const r = rng(O.seed * 31 + 7), field = new Field(O.seed + 99);
  const occ = new Occluder(W, H, 1);
  const lightLeft = (scene.sunX || W / 2) < W / 2;
  const buckets = [[], [], [], []];
  const budget = { dots: 90000 };

  const cfgOf = (role) => {
    const aKey = AREA_OF[role] || 'ground', A = AREAS[aKey], a = O.areas[aKey] || A.def;
    const fill = a.fill === 'global' || !a.fill ? O.fill : a.fill;
    const ang = a.angle >= 0 ? a.angle : O.fillAngle >= 0 ? O.fillAngle : null;
    const sc = (O.fillScale || 1) * (a.scale || 1);
    return { aKey, fill, ang, sc, mul: A.mul, pen: clamp(a.pen | 0, 0, 3) };
  };
  const UPRIGHT = new Set(['ascii', 'maze', 'truchet', 'brick', 'grid', 'hilbert', 'dots', 'scribble', 'spiral', 'contour']);
  const angleFor = (cfg, role) => { if (cfg.ang !== null) return cfg.ang * Math.PI / 180; if (UPRIGHT.has(cfg.fill)) return 0; let d = ANGLE[role] ?? 45; if (role === 'mountain' && !lightLeft) d = 180 - d; return d * Math.PI / 180; };
  const sp0Of = (cfg) => 0.85 * k / O.density * cfg.sc * cfg.mul;
  const tone = (it) => Math.pow(clamp((1 - lum(it.col || '#ffffff') - 0.12) / 0.8, 0, 1), 1.1) * 0.9;

  // group items: base + overlays
  const groups = [];
  for (const it of scene.items) {
    if (SKIP.has(it.role) || SKIP.has(it.t)) continue;
    if (OVERLAY.has(it.role) && groups.length && it.t !== 'sky') groups[groups.length - 1].ov.push(it);
    else groups.push({ base: it, ov: [] });
  }
  const shapeOf = (it) => it.t === 'circle' ? circlePts(it.cx, it.cy, it.r) : it.t === 'water' ? [[-30, it.y0], [W + 30, it.y0], [W + 30, it.y1 + 30], [-30, it.y1 + 30]] : it.t === 'sky' ? [[-30, -30], [W + 30, -30], [W + 30, it.y1], [-30, it.y1]] : it.pts;

  function fillLines(it, poly, t, extra = {}) {
    const cfg = cfgOf(it.role); if (cfg.fill === 'none') return [];
    const region = extra.region || new Region(poly, W, H); if (region.empty) return [];
    const sp0 = sp0Of(cfg);
    const lines = fillRegion(cfg.fill, { region, poly, ridge: it.ridge, bottom: it.bottom, t, toneAt: extra.toneAt, sp0, spMax: 14 * k * cfg.sc * cfg.mul, angle: angleFor(cfg, it.role) + (extra.dAngle || 0), r, field, k, W, H, budget, dotR: 0.22 * k * Math.sqrt(cfg.sc) });
    return lines.map(l => ({ pts: l, region }));
  }
  function outlines(it, poly) {
    if (O.outline === 'none') return [];
    const pts = it.ridge ? it.ridge : poly;
    if (O.outline !== 'sketch') return [pts];
    const res = [];
    for (let pass = 0; pass < 2; pass++) { const j = (pass ? 0.5 : 0.25) * k, ph = r() * 100; res.push(pts.map(([x, y]) => [x + field.n(x * 0.02 + ph, y * 0.02) * j, y + field.n(y * 0.02, x * 0.02 + ph) * j])); }
    return res;
  }

  // one group -> strokes [{pen, pts, region?, pred?}]
  function render(g) {
    const it = g.base, S = [], cfg = cfgOf(it.role), pen = cfg.pen;
    const push = (pts, p = pen, region = null) => S.push({ pen: p, pts, region });
    if (it.t === 'sky') {
      if (!O.skyShade) return S;
      const poly = shapeOf(it), y1 = it.y1;
      const toneAt = (x, y) => clamp(1 - lum(gradAt(it.stops, clamp(y / y1, 0, 1))), 0, 1) * 0.85;
      let mean = 0; for (let i = 0; i < 10; i++) mean += toneAt(0, y1 * (i + 0.5) / 10) / 10;
      for (const l of fillLines(it, poly, mean, { toneAt })) push(l.pts, pen, l.region);
      return S;
    }
    if (it.t === 'line') { push(it.pts); return S; }
    if (it.t === 'water') {
      const poly = shapeOf(it), wt = Math.max(tone(it), 0.35);
      const refl = TONAL_FILLS.has(cfg.fill) ? g.ov.filter(o => o.role === 'reflection').map(o => [o.pts, bbox(o.pts), clamp(Math.max(tone(o), wt) + 0.2, 0, 1)]) : [];
      const toneAt = (x, y) => { for (const [p, bb, rt] of refl) if (inPoly(p, x, y, bb)) return rt; return wt * lerp(1.15, 0.6, clamp((y - it.y0) / (it.y1 - it.y0), 0, 1)); };
      for (const l of fillLines(it, poly, wt, { toneAt })) push(l.pts, pen, l.region);
      for (const o of g.ov) {
        const oc = cfgOf(o.role);
        if (o.role === 'reflection') { if (!ROW_FILLS.has(oc.fill)) continue; const rp = o.pts, rt = clamp(Math.max(tone(o), wt) + 0.2, 0, 1); for (const l of fillLines(o, rp, rt, { dAngle: ROW_FILLS.has(oc.fill) ? 0 : 0.3 })) push(l.pts, oc.pen, l.region); }
        else if (o.t === 'line') push(o.pts, oc.pen);
      }
      return S;
    }
    const poly = shapeOf(it);
    if (it.role === 'moonshade') { const moon = groups.find(q => q.base.role === 'moon')?.base; if (moon) { const arc = []; clipPred(circlePts(it.cx, it.cy, it.r), (x, y) => Math.hypot(x - moon.cx, y - moon.cy) < moon.r, arc, 1); arc.forEach(q => push(q)); } return S; }
    if (it.role === 'star') { const s = it.r * 1.6; if (cfg.fill === 'dots') push(circlePts(it.cx, it.cy, Math.max(it.r * 0.8, 0.3 * k), 6)); else { push([[it.cx - s, it.cy], [it.cx + s, it.cy]]); push([[it.cx, it.cy - s], [it.cx, it.cy + s]]); } return S; }
    if (it.role === 'lamp') { push(circlePts(it.cx, it.cy, it.r)); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; push([[it.cx + Math.cos(a) * it.r * 2, it.cy + Math.sin(a) * it.r * 2], [it.cx + Math.cos(a) * it.r * 3.5, it.cy + Math.sin(a) * it.r * 3.5]]); } return S; }
    for (const l of outlines(it, poly)) S.push({ pen, pts: l, keep: true });
    if (it.role === 'sun') {
      for (const l of fillLines(it, poly, 0.4)) push(l.pts, pen, l.region);
      if (scene.P.time === 'day') for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; push([[it.cx + Math.cos(a) * it.r * 1.25, it.cy + Math.sin(a) * it.r * 1.25], [it.cx + Math.cos(a) * it.r * (i % 2 ? 1.5 : 1.8), it.cy + Math.sin(a) * it.r * (i % 2 ? 1.5 : 1.8)]]); }
      return S;
    }
    if (it.role === 'moon') return S;
    const t = it.ridge ? Math.min(tone(it), 0.74) : tone(it);
    const shades = g.ov.filter(o => SHADE.has(o.role) && o.t !== 'line');
    let toneAt;
    if (TONAL_FILLS.has(cfg.fill) && shades.length) { const sh = shades.map(o => { const p = shapeOf(o); return [p, bbox(p), Math.max(tone(o), t + 0.18)]; }); toneAt = (x, y) => { for (const [p, bb, st] of sh) if (inPoly(p, x, y, bb)) return st; return t; }; }
    const baseRegion = new Region(poly, W, H);
    for (const l of fillLines(it, poly, t, { region: baseRegion, toneAt })) push(l.pts, pen, l.region);
    for (const o of g.ov) {
      const op = shapeOf(o), ot = tone(o), oc = cfgOf(o.role);
      if (o.role === 'snow') continue;
      if (o.t === 'line') { if (O.outline !== 'none' || o.role !== 'furrow') push(o.pts, oc.pen); continue; }
      if (SHADE.has(o.role)) { if (ROW_FILLS.has(oc.fill)) for (const l of fillLines(o, op, Math.max(ot, t + 0.15), { dAngle: Math.PI / 3 })) push(l.pts, oc.pen, l.region); continue; }
      if (o.role === 'window' || o.role === 'door') { S.push({ pen: oc.pen, pts: op.concat([op[0]]), keep: true }); for (const l of fillLines(o, op, Math.max(ot, 0.55))) push(l.pts, oc.pen, l.region); continue; }
      if (o.role === 'lit') { S.push({ pen: oc.pen, pts: op.concat([op[0]]), keep: true }); continue; }
      if (o.role === 'field') { if (O.outline !== 'none') push(op.concat([op[0]]), oc.pen); for (const l of fillLines(o, op, ot, { dAngle: r.pick([0, 0.3, -0.3, 1.2]) })) push(l.pts, oc.pen, l.region); continue; }
    }
    // snow erases the base fill (white peaks)
    const snow = g.ov.filter(o => o.role === 'snow').map(o => { const p = shapeOf(o); return [p, bbox(p)]; });
    if (snow.length) for (const s of S) if (!s.keep && s.region === baseRegion) s.pred = (x, y) => !snow.some(([p, bb]) => inPoly(p, x, y, bb));
    return S;
  }

  // front-to-back with hidden line removal
  const gapU = O.gap * k;
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const g = groups[gi];
    for (const s of render(g)) {
      const reg = s.region, extra = s.pred;
      const pred = reg ? (extra ? (x, y) => reg.in(x, y) && occ.open(x, y) && extra(x, y) : (x, y) => reg.in(x, y) && occ.open(x, y)) : (x, y) => occ.open(x, y);
      const pieces = []; clipPred(s.pts, pred, pieces, 1);
      const b = buckets[s.pen] || buckets[0]; for (const p of pieces) b.push(p);
    }
    const it = g.base;
    if (it.t === 'poly') { occ.poly(it.pts); if (gapU > 0.5) stampOutline(occ, it.ridge || it.pts, gapU); }
    else if (it.t === 'circle') occ.poly(circlePts(it.cx, it.cy, it.r + (it.role === 'moonshade' ? 0 : gapU)));
    else if (it.t === 'water') occ.rect(-30, it.y0, W + 30, H + 30);
  }

  // to mm, per pen
  const pens = pensCfg.slice(0, 4).map((p, i) => ({ index: i, name: p.name, color: p.color, paths: [] }));
  for (let i = 0; i < 4; i++) for (const p of buckets[i]) { const q = simplify(p.map(([x, y]) => [m + x / k, m + y / k]), 0.04); if (q.length > 1 && !(q.length === 2 && Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) < 0.15)) pens[i].paths.push(q); }
  if (O.frame) pens[0].paths.push([[m, m], [pw - m, m], [pw - m, ph - m], [m, ph - m], [m, m]]);
  const used = pens.filter(p => p.paths.length);
  for (const pen of used) pen.paths = optimize(pen.paths);
  const stats = computeStats(used, O);
  return { paperW: pw, paperH: ph, margin: m, pens: used, stats, paper: O.paperColor || '#fbfaf5', opts: O };
}

function stampOutline(occ, pts, rad) {
  const R = Math.ceil(rad);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let s = 0; s <= n; s++) {
      const x = Math.round(ax + (bx - ax) * s / n), y = Math.round(ay + (by - ay) * s / n);
      if (x < -R || y < -R || x > occ.W + R || y > occ.H + R) continue;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > rad * rad) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < occ.w && Y < occ.h) occ.g[Y * occ.w + X] = 1; }
    }
  }
}

// ---- path optimisation: merge touching paths, then greedy nearest-neighbour ordering with reversal ----
export function optimize(paths) {
  const key = (p) => Math.round(p[0] * 20) + ',' + Math.round(p[1] * 20);
  // merge
  const ends = new Map(); const add = (k, i) => { let a = ends.get(k); if (!a) ends.set(k, a = []); a.push(i); };
  paths.forEach((p, i) => { add(key(p[0]), i); add(key(p[p.length - 1]), i); });
  const used = new Uint8Array(paths.length), merged = [];
  const take = (k, self) => { const a = ends.get(k); if (!a) return -1; for (const j of a) if (!used[j] && j !== self) return j; return -1; };
  for (let i = 0; i < paths.length; i++) {
    if (used[i]) continue; used[i] = 1; let cur = paths[i].slice();
    for (let guard = 0; guard < 500; guard++) { const j = take(key(cur[cur.length - 1]), i); if (j < 0) break; used[j] = 1; const q = paths[j]; cur = cur.concat(key(q[0]) === key(cur[cur.length - 1]) ? q.slice(1) : q.slice().reverse().slice(1)); }
    for (let guard = 0; guard < 500; guard++) { const j = take(key(cur[0]), i); if (j < 0) break; used[j] = 1; const q = paths[j]; cur = (key(q[q.length - 1]) === key(cur[0]) ? q.slice(0, -1) : q.slice().reverse().slice(0, -1)).concat(cur); }
    merged.push(cur);
  }
  // spatial grid of endpoints
  const C = 6, grid = new Map(), gk = (x, y) => Math.floor(x / C) + ':' + Math.floor(y / C);
  merged.forEach((p, i) => { for (const e of [p[0], p[p.length - 1]]) { const k = gk(e[0], e[1]); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); } });
  const done = new Uint8Array(merged.length), out = []; let cx = 0, cy = 0;
  for (let n = 0; n < merged.length; n++) {
    let best = -1, bd = Infinity, rev = false;
    const gx = Math.floor(cx / C), gy = Math.floor(cy / C);
    for (let ring = 0; ring < 400; ring++) {
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const a = grid.get((gx + dx) + ':' + (gy + dy)); if (!a) continue;
        for (const i of a) { if (done[i]) continue; const p = merged[i]; const d0 = Math.hypot(p[0][0] - cx, p[0][1] - cy), d1 = Math.hypot(p[p.length - 1][0] - cx, p[p.length - 1][1] - cy); if (d0 < bd) { bd = d0; best = i; rev = false; } if (d1 < bd) { bd = d1; best = i; rev = true; } }
      }
      if (best >= 0 && bd < ring * C) break;
    }
    if (best < 0) { for (let i = 0; i < merged.length; i++) if (!done[i]) { best = i; break; } }
    done[best] = 1; const p = rev ? merged[best].slice().reverse() : merged[best];
    out.push(p); [cx, cy] = p[p.length - 1];
  }
  return out;
}

export function computeStats(pens, O) {
  let draw = 0, travel = 0, paths = 0, segs = 0;
  const per = pens.map(pen => {
    let d = 0, tr = 0, x = 0, y = 0;
    for (const p of pen.paths) { tr += Math.hypot(p[0][0] - x, p[0][1] - y); for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); [x, y] = p[p.length - 1]; segs += p.length - 1; }
    draw += d; travel += tr; paths += pen.paths.length;
    const time = d / O.drawSpeed + tr / O.travelSpeed + pen.paths.length * 0.15;
    return { name: pen.name, color: pen.color, paths: pen.paths.length, draw: d, travel: tr, time };
  });
  return { per, draw, travel, paths, segs, time: per.reduce((s, p) => s + p.time, 0) };
}
