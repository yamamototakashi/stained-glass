# Stained Glass Drift

A tiny iPhone-friendly PWA that endlessly generates luminous stained-glass
abstract artworks. One tap regenerates. Save your favorites as high-resolution
PNGs, or keep them in an on-device gallery.

No backend, no frameworks — plain HTML / CSS / JS.

## Files

```
index.html            shell, meta, manifest link, SW register
styles.css            dark immersive UI, glassmorphism controls
generator.js          seeded RNG, noise, palettes, Voronoi, multi-pass render
app.js                UI controller, favorites, settings, shimmer
export.js             high-res PNG re-render + download
manifest.webmanifest  PWA manifest
sw.js                 offline app-shell cache
icons/                192 / 512 / maskable / apple-touch-icon
```

## Run locally

Any static file server will do; the service worker requires `http(s)://` or
`localhost`, not `file://`.

```sh
# Python 3
python3 -m http.server 8080

# or Node
npx serve .
```

Then open `http://localhost:8080/`.

## Deploy

Upload the folder to any static host (GitHub Pages, Netlify, Cloudflare Pages,
Vercel, S3). That's it — there is no build step.

## Install on iPhone

1. Open in Safari on iOS.
2. Tap **Share → Add to Home Screen**.
3. Launch from the home screen icon; it opens full-screen standalone with
   the service worker providing offline support.

## Controls

| Button      | Action                                                  |
|-------------|---------------------------------------------------------|
| **New**     | Generate a new piece from a fresh random seed           |
| **Palette** | Cycle to a different curated palette                    |
| **Surprise**| Randomize seed, palette and every slider                |
| **Favorite**| Save the current piece to your on-device gallery        |
| **Save**    | Export a high-resolution PNG (2560 px long side)        |
| **Favorites**| Open the gallery; tap an item to reopen it             |
| **⚙**       | Complexity / Glow / Distortion / Lead / Transparency    |

Seed pill: tap to copy the current seed. Pass `?seed=12345` in the URL to
open a specific seed.

Keyboard (desktop): `Space`/`N` new · `P` palette · `S` save · `F` favorite ·
`G` gallery.

## How the art is made

- **Seeded generation.** Everything derives from a 32-bit seed via
  `mulberry32`, so every piece is fully reproducible.
- **Voronoi tiling** of random blue-noise sites, relaxed twice with Lloyd's
  algorithm for balanced, organic cells. A few clustered accent sites keep
  the composition from becoming too uniform.
- **Per-cell color** is chosen by sampling a value-noise field at the cell
  centroid, mapping smoothly into the palette so neighbours stay
  harmonious.
- **Rendering passes** (in order):
  1. Backlight radial gradient (warm or palette-tinted)
  2. Soft diagonal light beams (`screen` blend)
  3. Per cell: translucent gradient, radial depth darkening, 2–4 curved
     internal streaks, rare hotspot bloom, inner edge rim, refraction
     flash on one edge, gloss highlight
  4. Global caustic hotspot bursts
  5. Low-res `blur()` bloom composited back with `screen`
  6. Lead came: soft shadow → dark body → top-edge gloss
  7. Faint grain overlay and vignette

## Possible visual upgrades

- Animated light drift (slow backlight panning, streak phase offset)
- True SVG filter-based glass distortion (`feTurbulence` +
  `feDisplacementMap`) behind the canvas
- Web Share API support (`navigator.share` + `canShareFiles`) so iOS users
  can AirDrop / save to Photos directly
- Poster export presets (A3, 4K, square social)
- WebGL / WebGPU renderer for richer refraction and live shimmer
- Procedural rose-window mode (radial wedges + tracery)
- Ambient soundscape that reacts to the palette

## License

Do what you like with it. Attribution appreciated but not required.
