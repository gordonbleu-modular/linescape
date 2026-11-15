# LINESCAPE: a LandGraph remix

Generative, figurative line art for pen plotters. It produces strokes only, with no fills, gradients, filters or raster.

## How it works
1. `src/scene.js` builds a scene graph from a seed: scene type, time of day, season and detail decide the shapes (ridges, trees, buildings, water, sky). Each shape has a depth, a role and a tone.
2. `src/plot.js` turns that graph into line art. It works from the front of the scene to the back and fills each area with its own pattern (see Fill patterns below). Strokes are clipped against a raster occlusion buffer, which removes hidden lines. A small gap is kept around foreground outlines.
3. Paths are converted to mm and simplified. Touching segments are merged, and the paths are ordered nearest-neighbour (reversing where that helps) to cut pen-up travel.
4. `src/export.js` writes the SVG at real mm sizes. Each pen gets its own Inkscape layer, and you can also export one SVG per pen.

## Run
    npm install
    npm run dev        # http://localhost:5173
    npm run build      # static build in dist/
    npm run preview    # serve dist/ on http://localhost:4173

Netlify: build command `npm run build`, publish directory `dist` (already set in netlify.toml).
Keys: R = new seed, S = surprise me, F = randomize fills.

## Deploy to GitHub Pages

1. Push this repo to GitHub (branch `main`).
2. In the repo go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The workflow `.github/workflows/deploy.yml` builds the app and publishes `dist` on every push to `main`
   (or run it manually from the Actions tab). The site will be at `https://<user>.github.io/<repo>/`.

## Fill patterns
`src/fills.js` contains 19 stroke-only fill patterns: none, hatch, crosshatch, broken lines, wave, zigzag,
ridge lines (Joy Division), concentric contours (distance field + marching squares), spiral, stipple dots,
ASCII characters (single-stroke glyphs from `src/font.js`, picked from a tone ramp), labyrinth (DFS maze clipped
to the shape), Truchet tiles, brick, grid, scribble, Hilbert curve, flow field and wireframe.

Pick a **global** pattern, then override it per **area type** (sky, sun/moon/clouds, mountains, hills & ground,
water, trees, buildings, windows) with its own pattern, scale, angle and pen. Each pen becomes its own
Inkscape layer in the exported SVG. Tone (colour, time of day, distance haze) still controls density.
Every pattern is clipped to its shape's mask and to the hidden-line buffer.
