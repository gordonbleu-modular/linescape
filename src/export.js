// SVG export in real millimetres, one Inkscape layer per pen, stroke-only.
const f = v => (Math.round(v * 100) / 100).toString();
export function pathD(paths) { let d = ''; for (const p of paths) { d += 'M' + f(p[0][0]) + ' ' + f(p[0][1]); for (let i = 1; i < p.length; i++) d += 'L' + f(p[i][0]) + ' ' + f(p[i][1]); } return d; }
export function toSVG(R, { onlyPen = null, background = false, title = '' } = {}) {
  const { paperW: w, paperH: h, pens, opts } = R;
  const layers = pens.map((pen, i) => {
    if (onlyPen !== null && i !== onlyPen) return '';
    // split into several path elements so huge drawings stay editable
    const chunks = []; for (let j = 0; j < pen.paths.length; j += 400) chunks.push(`    <path d="${pathD(pen.paths.slice(j, j + 400))}"/>`);
    return `  <g inkscape:groupmode="layer" inkscape:label="${(pen.index ?? i) + 1} ${pen.name}" id="pen${(pen.index ?? i) + 1}" fill="none" stroke="${pen.color}" stroke-width="${opts.penWidth}" stroke-linecap="round" stroke-linejoin="round">\n${chunks.join('\n')}\n  </g>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">
  <title>${title}</title>
${background ? `  <rect width="${f(w)}" height="${f(h)}" fill="${R.paper}"/>\n` : ''}${layers}
</svg>`;
}
