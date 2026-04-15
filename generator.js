// generator.js — Stained Glass Drift core
// Deterministic composition + multi-pass luminous glass renderer.
// Part 1: RNG, noise, palettes, Voronoi, compose. Part 2 (render) below.

// ---------- Seeded RNG ----------
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomSeed() {
  return ((Math.random() * 0x7fffffff) | 0) >>> 0;
}
export function seedFromInput(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return (v | 0) >>> 0;
  let h = 0x811c9dc5;
  const s = String(v);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------- Value noise (fBm) ----------
function makeValueNoise2D(seed) {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
  }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const hash = (xi, yi) => perm[(xi + perm[yi & 255]) & 255] / 255;
  const fade = (t) => t * t * (3 - 2 * t);
  function n2(x, y) {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  return function fbm(x, y, oct = 3) {
    let sum = 0, amp = 0.5, freq = 1, max = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * n2(x * freq, y * freq);
      max += amp; amp *= 0.5; freq *= 2;
    }
    return sum / max;
  };
}

// ---------- Palettes (curated HSL) ----------
export const PALETTES = [
  { name: 'Cathedral', colors: [
    { h: 222, s: 78, l: 30 }, { h: 352, s: 65, l: 40 },
    { h: 158, s: 52, l: 30 }, { h: 42,  s: 72, l: 54 },
    { h: 272, s: 48, l: 40 }, { h: 204, s: 78, l: 46 },
    { h: 14,  s: 60, l: 36 },
  ]},
  { name: 'Pale Ice', colors: [
    { h: 200, s: 22, l: 84 }, { h: 180, s: 28, l: 88 },
    { h: 220, s: 18, l: 78 }, { h: 160, s: 14, l: 90 },
    { h: 212, s: 26, l: 68 }, { h: 240, s: 18, l: 82 },
  ]},
  { name: 'Amber Rose', colors: [
    { h: 30,  s: 78, l: 54 }, { h: 342, s: 62, l: 62 },
    { h: 18,  s: 72, l: 48 }, { h: 356, s: 54, l: 40 },
    { h: 40,  s: 82, l: 64 }, { h: 22,  s: 58, l: 34 },
  ]},
  { name: 'Ocean', colors: [
    { h: 190, s: 68, l: 38 }, { h: 170, s: 58, l: 52 },
    { h: 202, s: 72, l: 30 }, { h: 165, s: 42, l: 68 },
    { h: 212, s: 58, l: 48 }, { h: 182, s: 68, l: 24 },
  ]},
  { name: 'Forest', colors: [
    { h: 140, s: 52, l: 26 }, { h: 90,  s: 38, l: 40 },
    { h: 155, s: 62, l: 20 }, { h: 72,  s: 48, l: 44 },
    { h: 82,  s: 30, l: 30 }, { h: 42,  s: 52, l: 52 },
  ]},
  { name: 'Silver Blue', colors: [
    { h: 220, s: 22, l: 58 }, { h: 212, s: 12, l: 76 },
    { h: 228, s: 16, l: 40 }, { h: 218, s: 26, l: 24 },
    { h: 232, s: 10, l: 80 }, { h: 202, s: 20, l: 54 },
  ]},
  { name: 'Curated', colors: null }, // generated per seed
];

function generateCuratedPalette(rng) {
  const base = rng() * 360;
  const colors = [];
  const count = 6;
  for (let i = 0; i < count; i++) {
    const h = (base + (i - count / 2) * (10 + rng() * 18) + (rng() - 0.5) * 8 + 360) % 360;
    const s = 32 + rng() * 46;
    const l = 26 + (i / count) * 40 + (rng() - 0.5) * 8;
    colors.push({ h, s, l });
  }
  colors.push({ h: (base + 180 + (rng() - 0.5) * 20 + 360) % 360, s: 55 + rng() * 28, l: 50 + (rng() - 0.5) * 8 });
  return colors;
}
function resolvePalette(paletteIndex, rng) {
  const p = PALETTES[paletteIndex];
  return { name: p.name, colors: p.colors || generateCuratedPalette(rng) };
}

// ---------- Polygon / Voronoi ----------
function clipPolyHalfPlane(poly, mx, my, nx, ny) {
  const out = [];
  const n = poly.length;
  if (!n) return out;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const dp = nx * (p.x - mx) + ny * (p.y - my);
    const dq = nx * (q.x - mx) + ny * (q.y - my);
    const inP = dp <= 0, inQ = dq <= 0;
    if (inP) out.push(p);
    if (inP !== inQ) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  return out;
}
function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}
function polygonCentroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    a += f; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sy = 0;
    for (const p of poly) { sx += p.x; sy += p.y; }
    return { x: sx / poly.length, y: sy / poly.length };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}
function polygonBBox(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, diag: Math.hypot(maxX - minX, maxY - minY) };
}
function voronoiCells(sites, W, H) {
  const pad = 60;
  const boundary = [
    { x: -pad, y: -pad }, { x: W + pad, y: -pad },
    { x: W + pad, y: H + pad }, { x: -pad, y: H + pad }
  ];
  const out = [];
  for (let i = 0; i < sites.length; i++) {
    let poly = boundary.slice();
    const a = sites[i];
    for (let j = 0; j < sites.length && poly.length; j++) {
      if (i === j) continue;
      const b = sites[j];
      poly = clipPolyHalfPlane(poly, (a.x + b.x) * 0.5, (a.y + b.y) * 0.5, b.x - a.x, b.y - a.y);
    }
    if (poly.length >= 3) out.push({ site: a, polygon: poly });
  }
  return out;
}
function generateSites(rng, W, H, count) {
  // best-candidate blue-noise
  const sites = [];
  const K = 6;
  for (let i = 0; i < count; i++) {
    let best = null, bestD = -1;
    for (let k = 0; k < K; k++) {
      const x = rng() * W, y = rng() * H;
      let m = Infinity;
      for (const s of sites) {
        const d = (s.x - x) ** 2 + (s.y - y) ** 2;
        if (d < m) m = d;
      }
      if (m > bestD) { bestD = m; best = { x, y }; }
    }
    sites.push(best);
  }
  // a few clustered accents for size variety
  const accents = Math.max(2, Math.floor(count * 0.07));
  for (let i = 0; i < accents; i++) {
    const anchor = sites[(rng() * sites.length) | 0];
    const r = 26 + rng() * 70, a = rng() * Math.PI * 2;
    sites.push({ x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r });
  }
  return sites;
}
function lloydRelax(sites, W, H, iters) {
  let s = sites.slice();
  for (let k = 0; k < iters; k++) {
    const cells = voronoiCells(s, W, H);
    const next = [];
    for (const c of cells) {
      const p = polygonCentroid(c.polygon);
      p.x = Math.max(2, Math.min(W - 2, p.x));
      p.y = Math.max(2, Math.min(H - 2, p.y));
      next.push(p);
    }
    // keep count; if we lost any, reinject
    while (next.length < s.length) next.push(s[next.length]);
    s = next;
  }
  return s;
}

// ---------- Color utils ----------
export function hsl(h, s, l, a = 1) {
  return `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a})`;
}
function mixHSL(a, b, t) {
  let dh = ((b.h - a.h + 540) % 360) - 180;
  return { h: (a.h + dh * t + 360) % 360, s: a.s + (b.s - a.s) * t, l: a.l + (b.l - a.l) * t };
}
function tweak(c, dh = 0, ds = 0, dl = 0) {
  return { h: (c.h + dh + 360) % 360, s: Math.max(0, Math.min(100, c.s + ds)), l: Math.max(0, Math.min(100, c.l + dl)) };
}

// ---------- Compose ----------
export function composeFromSeed(seed, opts = {}) {
  const params = {
    complexity: 120, glow: 60, distortion: 35, lead: 55,
    transparency: 62, paletteIndex: -1,
    width: 1000, height: 1500,
    ...opts,
  };
  const rng = mulberry32(seed);
  const noise = makeValueNoise2D((seed ^ 0x9e3779b9) >>> 0);
  const W = params.width, H = params.height;

  let paletteIndex = params.paletteIndex;
  if (paletteIndex == null || paletteIndex < 0) paletteIndex = Math.floor(rng() * PALETTES.length);
  const palette = resolvePalette(paletteIndex, rng);

  // scale complexity to area so iPhone portrait gets a balanced count
  const count = Math.max(20, Math.floor(params.complexity * (W * H) / (1000 * 1500)));
  const s0 = generateSites(rng, W, H, count);
  const relaxed = lloydRelax(s0, W, H, 2);
  const rawCells = voronoiCells(relaxed, W, H);

  const cells = [];
  for (const rc of rawCells) {
    const area = Math.abs(polygonArea(rc.polygon));
    if (area < 220) continue;
    const centroid = polygonCentroid(rc.polygon);
    const bbox = polygonBBox(rc.polygon);

    const nx = centroid.x / W * 2.2, ny = centroid.y / H * 2.2;
    const nv = noise(nx + 0.7, ny + 1.3, 3);
    const pIdx = Math.max(0, Math.min(palette.colors.length - 1, Math.floor(nv * palette.colors.length)));
    const base = palette.colors[pIdx];
    const sibling = palette.colors[(pIdx + 1) % palette.colors.length];

    const dh = (rng() - 0.5) * 8, ds = (rng() - 0.5) * 8, dl = (rng() - 0.5) * 10;
    const color1 = tweak(base, dh, ds, dl);
    const color2 = tweak(mixHSL(base, sibling, 0.35 + rng() * 0.35), dh, ds - 4, dl - 6);
    const edgeTint = tweak(color1, 0, -10, 22);
    const glossTint = { h: (color1.h + 10) % 360, s: 18, l: 96 };

    const glossAngle = rng() * Math.PI * 2;
    const glossOffset = {
      x: Math.cos(glossAngle) * bbox.diag * 0.22,
      y: Math.sin(glossAngle) * bbox.diag * 0.18 - bbox.diag * 0.12,
    };

    const streakAngle = (rng() * Math.PI) - Math.PI / 2;
    const nStreaks = 2 + Math.floor(rng() * 3);
    const streaks = [];
    for (let s = 0; s < nStreaks; s++) {
      streaks.push({
        offset: (rng() - 0.5) * bbox.diag * 0.7,
        amp: 2 + rng() * 5,
        freq: 0.006 + rng() * 0.018,
        phase: rng() * Math.PI * 2,
        width: 0.6 + rng() * 1.6,
        alpha: 0.06 + rng() * 0.14,
        tint: tweak(color1, 0, -10, 16 + rng() * 16),
      });
    }

    const hotNv = noise(nx * 0.6 + 5, ny * 0.6 + 7, 2);
    const isHotspot = hotNv > 0.72 && rng() > 0.35;
    const hotspotIntensity = isHotspot ? 0.55 + rng() * 0.35 : 0;
    const thickness = 0.8 + noise(nx * 0.8 + 2, ny * 0.8 + 11, 2) * 0.4;

    cells.push({
      polygon: rc.polygon, centroid, bbox, area,
      color1, color2, edgeTint, glossTint,
      glossOffset, gradientAngle: rng() * Math.PI * 2,
      streakAngle, streaks,
      isHotspot, hotspotIntensity, thickness,
    });
  }

  // global caustic hotspots (sunlight passing through)
  const lightSpots = [];
  const nSpots = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < nSpots; i++) {
    lightSpots.push({
      x: rng() * W, y: rng() * H * 0.7,
      r: 140 + rng() * 280,
      tint: tweak(palette.colors[Math.floor(rng() * palette.colors.length)], 0, -10, 24),
      alpha: 0.16 + rng() * 0.18,
    });
  }
  const backlight = {
    x: W * (0.25 + rng() * 0.5),
    y: H * (0.12 + rng() * 0.4),
    r: Math.max(W, H) * (0.75 + rng() * 0.4),
    tint: tweak(palette.colors[0], 0, -20, 30),
  };

  return {
    seed: seed >>> 0, paletteIndex, palette,
    width: W, height: H, cells, lightSpots, backlight, params,
  };
}
