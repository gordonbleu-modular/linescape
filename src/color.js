export const hex2rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgb2hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };
export const mul = (a, b) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v * B[i] / 255)); };
export const lighten = (a, t) => mix(a, '#ffffff', t);
export const darken = (a, t) => mix(a, '#000000', t);
export const lum = a => { const [r, g, b] = hex2rgb(a); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
export function rgb2hsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
export function hsl2rgb([h, s, l]) { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }
export const adjust = (a, dh = 0, ds = 1, dl = 0) => { const [h, s, l] = rgb2hsl(hex2rgb(a)); return rgb2hex(hsl2rgb([(h + dh + 1) % 1, Math.min(1, s * ds), Math.max(0, Math.min(1, l + dl))])); };
export const gradAt = (stops, t) => { if (t <= stops[0][0]) return stops[0][1]; for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return mix(ca, cb, (t - a) / (b - a)); } return stops[stops.length - 1][1]; };
