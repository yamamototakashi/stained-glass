// app.js — UI glue for Stained Glass Drift
import {
  composeFromSeed, renderComposition,
  PALETTES, randomSeed, seedFromInput,
} from './generator.js';
import { saveCurrent } from './export.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $('art');
const ctx = canvas.getContext('2d', { alpha: false });
const seedPill = $('seedPill');
const veil = $('veil');
const toast = $('toast');

const btnNew = $('newBtn');
const btnPalette = $('paletteBtn');
const btnSurprise = $('surpriseBtn');
const btnFav = $('favBtn');
const btnSave = $('saveBtn');
const btnGallery = $('galleryBtn');
const btnSettings = $('settingsBtn');

const panelSettings = $('settingsPanel');
const panelGallery = $('galleryPanel');
const galleryGrid = $('galleryGrid');
const emptyMsg = $('emptyMsg');
const shimmerInput = $('shimmer');
const paletteRow = $('paletteRow');

// sliders
const sliders = {
  complexity: $('complexity'),
  glow: $('glow'),
  distortion: $('distortion'),
  lead: $('lead'),
  transparency: $('transparency'),
};
const outs = {
  complexity: $('complexityOut'),
  glow: $('glowOut'),
  distortion: $('distortionOut'),
  lead: $('leadOut'),
  transparency: $('transparencyOut'),
};

// ---------- State ----------
const state = {
  seed: randomSeed(),
  params: {
    complexity: 120, glow: 60, distortion: 35, lead: 55, transparency: 62,
    paletteIndex: -1,
  },
  comp: null,
  shimmer: false,
  shimmerRAF: 0,
};

const FAV_KEY = 'sgd.favorites.v1';
const SETTINGS_KEY = 'sgd.settings.v1';

// ---------- Resize ----------
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(320, window.innerWidth);
  const h = Math.max(420, window.innerHeight);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}

// ---------- Render ----------
function composeAndRender() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  // compose at a logical resolution with matching aspect; render pass rescales
  const logicalW = Math.round(canvas.width / dpr);
  const logicalH = Math.round(canvas.height / dpr);
  state.comp = composeFromSeed(state.seed, {
    ...state.params,
    width: logicalW, height: logicalH,
  });
  renderComposition(ctx, state.comp, { shimmerPhase: 0 });
  seedPill.textContent = `seed ${state.comp.seed}`;
  refreshFavButtonState();
  refreshPaletteSelection();
}

let rerenderTimer = 0;
function scheduleRender(fade = true) {
  if (fade) canvas.classList.add('fading');
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => {
    composeAndRender();
    canvas.classList.remove('fading');
  }, fade ? 140 : 0);
}

// ---------- Shimmer (optional gentle motion) ----------
function shimmerLoop(t) {
  if (!state.shimmer) return;
  renderComposition(ctx, state.comp, { shimmerPhase: t * 0.001 });
  state.shimmerRAF = requestAnimationFrame(shimmerLoop);
}
function setShimmer(on) {
  state.shimmer = on;
  cancelAnimationFrame(state.shimmerRAF);
  if (on) state.shimmerRAF = requestAnimationFrame(shimmerLoop);
  else composeAndRender();
  persistSettings();
}

// ---------- Toast ----------
let toastTimer = 0;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// ---------- Panels ----------
function openPanel(panel) {
  panel.hidden = false;
  requestAnimationFrame(() => panel.setAttribute('aria-hidden', 'false'));
}
function closePanel(panel) {
  panel.setAttribute('aria-hidden', 'true');
  setTimeout(() => { panel.hidden = true; }, 280);
}
document.querySelectorAll('[data-close]').forEach((b) => {
  b.addEventListener('click', () => closePanel($(b.dataset.close)));
});

// ---------- Sliders ----------
function syncSliders() {
  for (const k of Object.keys(sliders)) {
    sliders[k].value = state.params[k];
    outs[k].textContent = state.params[k];
  }
}
for (const k of Object.keys(sliders)) {
  sliders[k].addEventListener('input', () => {
    state.params[k] = +sliders[k].value;
    outs[k].textContent = sliders[k].value;
    persistSettings();
    scheduleRender(false);
  });
}

// ---------- Palette chips ----------
function buildPaletteRow() {
  paletteRow.innerHTML = '';
  PALETTES.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'palette-chip';
    btn.setAttribute('role', 'option');
    btn.dataset.index = String(i);
    const sw = document.createElement('span');
    sw.className = 'palette-swatch';
    const sample = p.colors || [
      { h: 220, s: 30, l: 50 }, { h: 30, s: 60, l: 55 }, { h: 140, s: 40, l: 45 },
      { h: 340, s: 50, l: 55 }, { h: 200, s: 50, l: 40 },
    ];
    for (let k = 0; k < 5; k++) {
      const c = sample[k % sample.length];
      const s = document.createElement('span');
      s.style.background = `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
      sw.appendChild(s);
    }
    const label = document.createElement('span');
    label.textContent = p.name;
    btn.append(sw, label);
    btn.addEventListener('click', () => {
      state.params.paletteIndex = i;
      persistSettings();
      scheduleRender(true);
    });
    paletteRow.appendChild(btn);
  });
}
function refreshPaletteSelection() {
  const idx = state.comp ? state.comp.paletteIndex : state.params.paletteIndex;
  paletteRow.querySelectorAll('.palette-chip').forEach((el) => {
    el.setAttribute('aria-selected', String(+el.dataset.index === idx));
  });
}

// ---------- Controls ----------
btnNew.addEventListener('click', () => {
  state.seed = randomSeed();
  scheduleRender(true);
});
btnPalette.addEventListener('click', () => {
  const cur = state.comp ? state.comp.paletteIndex : 0;
  let next = cur;
  if (PALETTES.length > 1) {
    while (next === cur) next = Math.floor(Math.random() * PALETTES.length);
  }
  state.params.paletteIndex = next;
  persistSettings();
  scheduleRender(true);
});
btnSurprise.addEventListener('click', () => {
  state.seed = randomSeed();
  state.params.paletteIndex = Math.floor(Math.random() * PALETTES.length);
  state.params.complexity = 70 + Math.floor(Math.random() * 160);
  state.params.glow = 35 + Math.floor(Math.random() * 55);
  state.params.distortion = 15 + Math.floor(Math.random() * 70);
  state.params.lead = 30 + Math.floor(Math.random() * 55);
  state.params.transparency = 45 + Math.floor(Math.random() * 45);
  syncSliders();
  persistSettings();
  scheduleRender(true);
});
btnSettings.addEventListener('click', () => {
  if (panelSettings.hidden) openPanel(panelSettings); else closePanel(panelSettings);
});
btnGallery.addEventListener('click', () => {
  renderGallery();
  openPanel(panelGallery);
});
btnSave.addEventListener('click', async () => {
  try {
    showToast('Saving…');
    await saveCurrent(state.comp);
    showToast('Saved');
  } catch (e) {
    console.error(e);
    showToast('Save cancelled');
  }
});
btnFav.addEventListener('click', () => {
  toggleFavorite();
});
seedPill.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(String(state.seed));
    showToast(`Copied seed ${state.seed}`);
  } catch {
    showToast(`Seed: ${state.seed}`);
  }
});
shimmerInput.addEventListener('change', () => setShimmer(shimmerInput.checked));

// ---------- Favorites ----------
function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
  catch { return []; }
}
function saveFavorites(list) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch {}
}
function currentFavId() {
  if (!state.comp) return null;
  const p = state.comp.params;
  return `${state.comp.seed}|${state.comp.paletteIndex}|${p.complexity}|${p.glow}|${p.distortion}|${p.lead}|${p.transparency}`;
}
function makeThumbnail(comp, size = 220) {
  const ratio = comp.height / comp.width;
  const w = size, h = Math.round(size * ratio);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  renderComposition(c.getContext('2d'), comp, {});
  return c.toDataURL('image/jpeg', 0.72);
}
function toggleFavorite() {
  if (!state.comp) return;
  const list = loadFavorites();
  const id = currentFavId();
  const idx = list.findIndex((f) => f.id === id);
  if (idx >= 0) {
    list.splice(idx, 1);
    saveFavorites(list);
    btnFav.setAttribute('aria-pressed', 'false');
    showToast('Removed from favorites');
  } else {
    const fav = {
      id,
      seed: state.comp.seed,
      paletteIndex: state.comp.paletteIndex,
      params: { ...state.comp.params },
      thumb: makeThumbnail(state.comp),
      createdAt: Date.now(),
    };
    list.unshift(fav);
    saveFavorites(list.slice(0, 120));
    btnFav.setAttribute('aria-pressed', 'true');
    showToast('Added to favorites');
  }
}
function refreshFavButtonState() {
  const list = loadFavorites();
  const id = currentFavId();
  const active = list.some((f) => f.id === id);
  btnFav.setAttribute('aria-pressed', String(active));
  const heart = btnFav.querySelector('.heart');
  if (heart) heart.textContent = active ? '♥' : '♡';
}
function renderGallery() {
  const list = loadFavorites();
  galleryGrid.innerHTML = '';
  emptyMsg.hidden = list.length > 0;
  for (const fav of list) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.setAttribute('role', 'listitem');
    const img = document.createElement('img');
    img.src = fav.thumb;
    img.alt = `Artwork seed ${fav.seed}`;
    item.appendChild(img);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const label = document.createElement('span');
    label.textContent = `#${fav.seed}`;
    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.textContent = '×';
    rm.setAttribute('aria-label', 'Remove favorite');
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      const all = loadFavorites().filter((f) => f.id !== fav.id);
      saveFavorites(all);
      renderGallery();
      refreshFavButtonState();
    });
    meta.append(label, rm);
    item.appendChild(meta);
    item.addEventListener('click', () => {
      state.seed = fav.seed;
      state.params = { ...state.params, ...fav.params, paletteIndex: fav.paletteIndex };
      syncSliders();
      persistSettings();
      closePanel(panelGallery);
      scheduleRender(true);
    });
    galleryGrid.appendChild(item);
  }
}

// ---------- Settings persistence ----------
function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      params: state.params, shimmer: state.shimmer,
    }));
  } catch {}
}
function restoreSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (v.params) state.params = { ...state.params, ...v.params };
    if (typeof v.shimmer === 'boolean') { state.shimmer = v.shimmer; shimmerInput.checked = v.shimmer; }
  } catch {}
}

// ---------- Deep link via ?seed= ----------
function readURLSeed() {
  const sp = new URLSearchParams(location.search);
  if (sp.has('seed')) {
    const s = seedFromInput(sp.get('seed'));
    if (s) state.seed = s;
  }
}

// ---------- Init ----------
function init() {
  restoreSettings();
  syncSliders();
  buildPaletteRow();
  readURLSeed();
  sizeCanvas();
  composeAndRender();

  window.addEventListener('resize', () => {
    sizeCanvas();
    scheduleRender(false);
  });

  // keyboard quick access (desktop niceties)
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, [contenteditable]')) return;
    if (e.key === ' ' || e.key.toLowerCase() === 'n') { e.preventDefault(); btnNew.click(); }
    else if (e.key.toLowerCase() === 's') { btnSave.click(); }
    else if (e.key.toLowerCase() === 'f') { btnFav.click(); }
    else if (e.key.toLowerCase() === 'p') { btnPalette.click(); }
    else if (e.key.toLowerCase() === 'g') { btnGallery.click(); }
  });
}

document.addEventListener('DOMContentLoaded', init);

// expose for export module
export { state };
