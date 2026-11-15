import { DEFAULTS, PAPERS, SEASONS, PEN_SETS, AREAS, FILLS, OUTLINES, PAPER_COLORS, defaultAreas, defaultPens } from './plot.js';
import { FILL_IC } from './fills.js';
import { SCENES, TIMES } from './scene.js';
import { toSVG } from './export.js';

const $ = (s) => document.querySelector(s);
const KEY = 'linescape.v2';
const clone = (o) => JSON.parse(JSON.stringify(o));
let S = clone(DEFAULTS);
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
const SIMPLE = ['scene', 'fill', 'outline', 'time', 'season', 'detail', 'density', 'seed', 'paper', 'orient'];
if (location.hash.length > 1) { try { const q = new URLSearchParams(location.hash.slice(1)); for (const [k, v] of q) if (k in DEFAULTS && typeof DEFAULTS[k] !== 'object') S[k] = typeof DEFAULTS[k] === 'number' ? +v : typeof DEFAULTS[k] === 'boolean' ? v === '1' : v; if (q.get('areas')) S.areas = JSON.parse(q.get('areas')); } catch (e) {} }
S.areas = { ...defaultAreas(), ...(S.areas || {}) }; if (!Array.isArray(S.pens) || S.pens.length < 4) S.pens = defaultPens(S.penSet || 'classic');
if (!(S.fill in FILLS)) S.fill = 'crosshatch'; delete S.lineStyle; delete S.penMode;

const SCENE_IC = { mountains: '⛰', lake: '≋', forest: '♣', desert: '☼', coast: '⚓', country: '⌂', city: '▥', harbor: '⌒' };
const FILL_KEYS = Object.keys(FILLS);

// ---------- worker pool ----------
const N = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));
const workers = Array.from({ length: N }, () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
const busyW = new Array(N).fill(false), queue = [], pending = new Map(); let seq = 0;
workers.forEach((w, i) => w.onmessage = (e) => { const p = pending.get(e.data.id); pending.delete(e.data.id); busyW[i] = false; pump(); if (!p) return; e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.R); });
function pump() { for (let i = 0; i < N && queue.length; i++) if (!busyW[i]) { const job = queue.shift(); busyW[i] = true; workers[i].postMessage({ id: job.id, opts: job.opts }); } }
function run(opts, priority = false) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); const job = { id, opts: clone(opts) }; priority ? queue.unshift(job) : queue.push(job); pump(); }); }
function dropQueued() { for (const j of queue.splice(0)) { const p = pending.get(j.id); pending.delete(j.id); p && p.reject(new Error('cancelled')); } }

// ---------- controls ----------
const sec = (title, html) => `<div class="sec"><h4>${title}</h4>${html}</div>`;
const fmtAng = (v) => (+v < 0 ? 'auto' : v + '°');
function range(k, label, min, max, step, fmt = (v) => v) { return `<div class="row"><div class="lab"><span>${label}</span><output id="o_${k}" data-fmt="${k}">${fmt(S[k])}</output></div><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"></div>`; }
function select(k, label, opts) { return `<div class="row"><div class="lab"><span>${label}</span></div><select data-k="${k}">${Object.entries(opts).map(([v, l]) => `<option value="${v}" ${String(S[k]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`; }
const FMT = { density: v => (+v).toFixed(2) + '×', fillScale: v => (+v).toFixed(2) + '×', fillAngle: fmtAng, penWidth: v => (+v).toFixed(2), gap: v => (+v).toFixed(2) };
function areaHTML(key) {
  const A = AREAS[key], a = S.areas[key], pen = S.pens[a.pen] || S.pens[0];
  return `<div class="area" data-area="${key}"><div class="ah"><span class="sw" style="background:${pen.color}"></span>${A.label}</div>
  <div class="ag"><select data-af="fill"><option value="global" ${a.fill === 'global' ? 'selected' : ''}>↳ Global (${FILLS[S.fill]})</option>${FILL_KEYS.map(f => `<option value="${f}" ${a.fill === f ? 'selected' : ''}>${FILL_IC[f]} ${FILLS[f]}</option>`).join('')}</select>
  <select data-af="pen">${S.pens.map((p, i) => `<option value="${i}" ${a.pen === i ? 'selected' : ''}>Pen ${i + 1} · ${p.name}</option>`).join('')}</select></div>
  <div class="ag2"><div><label>scale <span data-out="scale">${(+a.scale).toFixed(2)}×</span></label><input type="range" data-af="scale" min="0.4" max="3" step="0.05" value="${a.scale}"></div><div><label>angle <span data-out="angle">${fmtAng(a.angle)}</span></label><input type="range" data-af="angle" min="-15" max="180" step="15" value="${a.angle < 0 ? -15 : a.angle}"></div></div></div>`;
}
function buildPanel() {
  $('#panel').innerHTML =
    sec('SCENE', `<div class="tiles">${Object.entries(SCENES).map(([v, l]) => `<button class="tile ${S.scene === v ? 'on' : ''}" data-set="scene" data-v="${v}"><span class="ic">${SCENE_IC[v]}</span>${l}</button>`).join('')}</div>`) +
    sec('FILL PATTERN (GLOBAL)', `<div class="ftiles">${FILL_KEYS.map(f => `<button class="tile ${S.fill === f ? 'on' : ''}" data-set="fill" data-v="${f}" title="${FILLS[f]}"><span class="ic">${FILL_IC[f]}</span>${FILLS[f].replace(/ \(.*\)/, '').replace('characters', '')}</button>`).join('')}</div>` +
      range('fillScale', 'Pattern scale', 0.4, 3, 0.05, FMT.fillScale) + range('fillAngle', 'Pattern angle (auto = follows the slope)', -15, 180, 15, fmtAng) +
      `<div class="row"><div class="lab"><span>Outlines</span></div><div class="seg">${Object.entries(OUTLINES).map(([v, l]) => `<button class="${S.outline === v ? 'on' : ''}" data-set="outline" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="btnrow"><button id="fillRand">▧ RANDOMIZE FILLS</button><button id="fillReset">RESET FILLS</button></div>`) +
    sec('AREAS — FILL & PEN PER AREA', Object.keys(AREAS).map(areaHTML).join('')) +
    sec('TIME OF DAY', `<div class="seg">${Object.entries(TIMES).map(([v, t]) => `<button class="${S.time === v ? 'on' : ''}" data-set="time" data-v="${v}">${t.label}</button>`).join('')}</div>`) +
    sec('SEASON', `<div class="seg">${Object.entries(SEASONS).map(([v, [l]]) => `<button class="${S.season === v ? 'on' : ''}" data-set="season" data-v="${v}">${l}</button>`).join('')}</div>`) +
    sec('DETAIL & DENSITY', range('detail', 'Detail (elements, layers)', 1, 5, 1) + range('density', 'Line density (tone still applies)', 0.5, 2, 0.05, FMT.density) + `<div class="row"><div class="lab"><span>Seed</span></div><div class="seedrow"><input type="number" data-k="seed" value="${S.seed}"><button id="seedRand">⟳</button></div></div>`) +
    sec('PENS', select('penSet', 'Preset', { '': '— custom —', ...Object.fromEntries(Object.entries(PEN_SETS).map(([k, v]) => [k, v.label])) }) +
      S.pens.map((p, i) => `<div class="penrow"><input type="color" data-pen="${i}" data-pf="color" value="${p.color}"><input type="text" data-pen="${i}" data-pf="name" value="${p.name}" title="Pen ${i + 1} name (used for layer names)"></div>`).join('') +
      select('paperColor', 'Paper colour (preview only)', PAPER_COLORS) + range('penWidth', 'Pen width (mm)', 0.1, 1, 0.05, FMT.penWidth)) +
    sec('PAPER', select('paper', 'Format', Object.fromEntries(Object.entries(PAPERS).map(([k, [w, h]]) => [k, `${k} — ${w}×${h} mm`]))) + `<div class="two">${select('orient', 'Orientation', { landscape: 'Landscape', portrait: 'Portrait' })}<div></div></div>` + range('margin', 'Margin (mm)', 5, 40, 1)) +
    sec('OPTIONS', `<label class="tog"><input type="checkbox" data-k="skyShade" ${S.skyShade ? 'checked' : ''}> Fill the sky</label><label class="tog"><input type="checkbox" data-k="frame" ${S.frame ? 'checked' : ''}> Frame around the drawing</label>` + range('gap', 'Occlusion gap (mm)', 0, 1.5, 0.05, FMT.gap)) +
    sec('PLOTTER', `<div class="two">${range('drawSpeed', 'Draw mm/s', 5, 100, 1)}${range('travelSpeed', 'Travel mm/s', 20, 250, 5)}</div><div class="two"><button id="expSet">EXPORT SETTINGS</button><button id="impSet">IMPORT</button></div><input type="file" id="impFile" accept=".json" hidden>`);
}
const NO_STRIP = new Set(['fill', 'outline']);
function set(k, v, opts = {}) {
  S[k] = typeof DEFAULTS[k] === 'number' ? +v : v;
  if (k === 'penSet' && PEN_SETS[v]) { S.pens = defaultPens(v); S.paperColor = PEN_SETS[v].paper || (S.paperColor === '#111214' ? '#fbfaf5' : S.paperColor); }
  persist();
  if (opts.rebuild !== false) buildPanel();
  if (k === 'penWidth') { drawMain(); return; }
  if (k === 'paperColor' && current) { current.paper = v; drawMain(); buildStrip(); return; }
  if (k === 'drawSpeed' || k === 'travelSpeed' || k === 'frame') { regen(false); return; }
  regen(!NO_STRIP.has(k) || k === 'outline');
}
$('#panel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-set]'); if (b) set(b.dataset.set, b.dataset.v);
  if (e.target.id === 'seedRand') randomize();
  if (e.target.id === 'fillRand') randomizeFills();
  if (e.target.id === 'fillReset') { S.areas = defaultAreas(); S.fill = DEFAULTS.fill; S.fillScale = 1; S.fillAngle = -1; persist(); buildPanel(); regen(true); }
  if (e.target.id === 'expSet') download(`linescape-settings-${S.seed}.json`, JSON.stringify(S, null, 2), 'application/json');
  if (e.target.id === 'impSet') $('#impFile').click();
});
$('#panel').addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.k && el.type === 'range') { const o = $('#o_' + el.dataset.k); if (o) o.textContent = (FMT[el.dataset.k] || (v => v))(el.value); }
  if (el.dataset.af && el.type === 'range') { const box = el.closest('.area'), out = box.querySelector(`[data-out="${el.dataset.af}"]`); out.textContent = el.dataset.af === 'angle' ? fmtAng(el.value) : (+el.value).toFixed(2) + '×'; }
});
$('#panel').addEventListener('change', (e) => {
  const el = e.target, k = el.dataset.k;
  if (el.id === 'impFile') return importSettings(el.files[0]);
  if (el.dataset.af) { const key = el.closest('.area').dataset.area, a = S.areas[key], f = el.dataset.af; a[f] = f === 'fill' ? el.value : +el.value; if (f === 'angle' && a.angle < 0) a.angle = -1; persist(); if (f !== 'scale' && f !== 'angle') buildPanel(); regen(true); return; }
  if (el.dataset.pen) { const p = S.pens[+el.dataset.pen]; p[el.dataset.pf] = el.value; S.penSet = ''; persist(); buildPanel(); regen(true); return; }
  if (!k) return; set(k, el.type === 'checkbox' ? el.checked : el.value, { rebuild: el.type !== 'range' });
});
function importSettings(file) { if (!file) return; file.text().then(t => { const o = JSON.parse(t); for (const k in DEFAULTS) if (k in o) S[k] = o[k]; S.areas = { ...defaultAreas(), ...(S.areas || {}) }; persist(); buildPanel(); regen(true); toast('Settings imported'); }).catch(() => toast('Could not read that file')); }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} const q = new URLSearchParams(); for (const k of SIMPLE) q.set(k, S[k]); q.set('areas', JSON.stringify(S.areas)); history.replaceState(null, '', '#' + q.toString()); }

// ---------- drawing ----------
let current = null, zoom = 100;
function drawResult(cv, R, maxW, maxH, { lw = null, travel = false } = {}) {
  const sc = Math.min(maxW / R.paperW, maxH / R.paperH), dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(R.paperW * sc * dpr); cv.height = Math.round(R.paperH * sc * dpr);
  cv.style.width = Math.round(R.paperW * sc) + 'px'; cv.style.height = Math.round(R.paperH * sc) + 'px';
  const g = cv.getContext('2d'); g.setTransform(sc * dpr, 0, 0, sc * dpr, 0, 0);
  g.fillStyle = R.paper; g.fillRect(0, 0, R.paperW, R.paperH);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = lw ?? Math.max(S.penWidth, 0.6 / (sc * dpr));
  for (const pen of R.pens) { g.strokeStyle = pen.color; g.beginPath(); for (const p of pen.paths) { g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); } g.stroke(); }
  if (travel) { g.strokeStyle = 'rgba(255,60,120,.55)'; g.lineWidth = 0.15; g.setLineDash([0.8, 0.8]); for (const pen of R.pens) { g.beginPath(); let x = 0, y = 0; for (const p of pen.paths) { g.moveTo(x, y); g.lineTo(p[0][0], p[0][1]); [x, y] = p[p.length - 1]; } g.stroke(); } g.setLineDash([]); }
}
function drawMain() { if (!current) return; const mat = $('#mat'), z = zoom / 100; current.paper = S.paperColor; drawResult($('#cv'), current, (mat.clientWidth - 44) * z, (mat.clientHeight - 44) * z, { travel: $('#showTravel').checked }); }
function fmtLen(mm) { return mm > 1000 ? (mm / 1000).toFixed(1) + ' m' : Math.round(mm) + ' mm'; }
function fmtTime(s) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m} min`; }
function showStats(R) {
  const st = R.stats;
  $('#kpis').innerHTML = [[st.paths.toLocaleString(), 'paths'], [fmtLen(st.draw), 'ink length'], [fmtLen(st.travel), 'pen-up travel'], [fmtTime(st.time), 'est. plot time'], [R.pens.length, 'pens / layers'], [`${R.paperW}×${R.paperH}`, 'paper mm'], [st.segs.toLocaleString(), 'segments'], [R.ms + ' ms', 'generation']].map(([b, s]) => `<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join('');
  $('#penTable').innerHTML = st.per.map((p, i) => { const pen = R.pens[i], areas = Object.entries(S.areas).filter(([, a]) => a.pen === pen.index).map(([k]) => AREAS[k].label.split(' ')[0]).join(', '); return `<div class="pen"><span class="sw" style="background:${p.color}"></span><div>${pen.index + 1} · ${p.name}<div class="meta">${p.paths} paths · ${fmtLen(p.draw)} · ${fmtTime(p.time)}<br>${areas}</div></div><button data-pen="${i}">⬇ SVG</button></div>`; }).join('');
  $('#sigSeed').textContent = S.seed;
  $('#sigDesc').textContent = `${SCENES[S.scene]} · ${FILLS[S.fill]} · ${TIMES[S.time].label} · ${SEASONS[S.season][0]}`;
}
$('#penTable').addEventListener('click', (e) => { const b = e.target.closest('[data-pen]'); if (!b || !current) return; const i = +b.dataset.pen, pen = current.pens[i]; download(`${fileBase()}-pen${pen.index + 1}-${pen.name}.svg`, toSVG(current, { onlyPen: i, title: fileBase() })); });

let gen = 0;
async function regen(stripToo = true) {
  const my = ++gen; $('#busy').classList.add('show'); if (stripToo) dropQueued();
  try { const R = await run(S, true); if (my !== gen) return; current = R; drawMain(); showStats(R); }
  catch (err) { if (err.message !== 'cancelled') { console.error(err); toast('Generation failed — see console'); } }
  finally { if (my === gen) $('#busy').classList.remove('show'); }
  if (stripToo) buildStrip(); else markStrip();
}
let stripGen = 0;
function buildStrip() {
  const my = ++stripGen, host = $('#styleStrip');
  host.innerHTML = FILL_KEYS.map(f => `<div class="th ${f === S.fill ? 'on' : ''}" data-fill="${f}"><canvas></canvas><div>${FILL_IC[f]} ${FILLS[f]}</div></div>`).join('');
  for (const el of host.children) {
    const f = el.dataset.fill;
    run({ ...S, fill: f, penWidth: 0.35, areas: Object.fromEntries(Object.entries(S.areas).map(([k, a]) => [k, { ...a, fill: 'global' }])) }).then(R => { if (my !== stripGen) return; R.paper = S.paperColor; drawResult(el.querySelector('canvas'), R, 124, 100, { lw: 0.5 }); }).catch(() => {});
  }
}
function markStrip() { for (const el of $('#styleStrip').children) el.classList.toggle('on', el.dataset.fill === S.fill); }
$('#styleStrip').addEventListener('click', (e) => { const t = e.target.closest('[data-fill]'); if (!t) return; S.fill = t.dataset.fill; if (e.shiftKey) { for (const a of Object.values(S.areas)) a.fill = 'global'; toast(FILLS[S.fill] + ' applied to every area'); } persist(); buildPanel(); regen(false); });

// ---------- actions ----------
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
function randomize() { S.seed = Math.floor(Math.random() * 99999) + 1; persist(); buildPanel(); regen(true); }
function randomizeFills(silent) {
  const nice = FILL_KEYS.filter(f => f !== 'none' && f !== 'ridge');
  S.fill = rnd(nice); S.fillAngle = -1; S.fillScale = 1;
  for (const key of Object.keys(AREAS)) {
    const a = S.areas[key];
    if (key === 'sky') a.fill = rnd(['dashes', 'wave', 'hatch', 'dots', 'spiral', 'contour', 'scribble', 'none', 'ascii', 'flow']);
    else if (key === 'water') a.fill = rnd(['dashes', 'wave', 'zigzag', 'hatch', 'ascii', 'contour', 'scribble', 'dots']);
    else if (key === 'windows') a.fill = rnd(['global', 'hatch', 'crosshatch', 'ascii', 'grid', 'dots']);
    else a.fill = Math.random() < 0.35 ? 'global' : rnd(nice);
    a.angle = Math.random() < 0.6 ? -1 : rnd([0, 15, 30, 45, 60, 90, 120, 135]);
    a.scale = Math.round((0.8 + Math.random() * 0.7) * 20) / 20;
  }
  persist(); buildPanel(); regen(true); if (!silent) toast('New fill recipe: ' + FILLS[S.fill]);
}
function surprise() {
  const pick = (o) => rnd(Object.keys(o));
  S.scene = pick(SCENES); S.time = pick(TIMES); S.season = Math.random() < 0.6 ? 'summer' : pick(SEASONS);
  S.detail = 2 + Math.floor(Math.random() * 3); S.seed = Math.floor(Math.random() * 99999) + 1; randomizeFills(true);
}
$('#btnRand').onclick = randomize; $('#btnSurprise').onclick = surprise; $('#btnFills').onclick = () => randomizeFills();
function fileBase() { return `linescape-${S.scene}-${S.fill}-${S.seed}`; }
function download(name, text, type = 'image/svg+xml') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
$('#btnSvg').onclick = () => { if (current) { download(fileBase() + '.svg', toSVG(current, { title: fileBase() })); toast('SVG saved — ' + current.pens.length + ' pen layer(s), real mm'); } };
$('#btnCopy').onclick = async () => { if (!current) return; try { await navigator.clipboard.writeText(toSVG(current, { title: fileBase() })); toast('SVG copied'); } catch (e) { toast('Clipboard blocked by the browser'); } };
$('#showTravel').onchange = drawMain;
$('#zoom').oninput = (e) => { zoom = +e.target.value; $('#zVal').textContent = zoom + '%'; $('#zFit').classList.toggle('on', zoom === 100); drawMain(); };
$('#zFit').onclick = () => { zoom = 100; $('#zoom').value = 100; $('#zVal').textContent = '100%'; $('#zFit').classList.add('on'); drawMain(); };
window.addEventListener('resize', () => { clearTimeout(window.__rs); window.__rs = setTimeout(drawMain, 120); });
document.addEventListener('keydown', (e) => { if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'r') randomize(); if (e.key === 's') surprise(); if (e.key === 'f') randomizeFills(); });

function showVariations() {
  $('#varModal').classList.add('show'); const host = $('#vgrid'); host.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const seed = Math.floor(Math.random() * 99999) + 1, el = document.createElement('div'); el.className = 'th'; el.innerHTML = `<canvas></canvas><div>seed ${seed} — click to use</div>`; host.appendChild(el);
    el.onclick = () => { S.seed = seed; persist(); buildPanel(); $('#varModal').classList.remove('show'); regen(true); };
    run({ ...S, seed }).then(R => { R.paper = S.paperColor; drawResult(el.querySelector('canvas'), R, el.clientWidth - 8, 400); });
  }
}
$('#btnVar').onclick = showVariations; $('#varMore').onclick = showVariations; $('#varClose').onclick = () => $('#varModal').classList.remove('show');
$('#varModal').addEventListener('click', (e) => { if (e.target.id === 'varModal') e.target.classList.remove('show'); });
let tt; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1800); }

buildPanel(); persist(); regen(true);
window.__linescape = { get state() { return S; }, get result() { return current; }, toSVG, randomizeFills };
