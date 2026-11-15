import { plot } from './plot.js';
self.onmessage = (e) => {
  const { id, opts } = e.data;
  try { const t = performance.now(); const R = plot(opts); R.ms = Math.round(performance.now() - t); self.postMessage({ id, R }); }
  catch (err) { self.postMessage({ id, error: String(err && err.stack || err) }); }
};
