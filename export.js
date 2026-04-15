// export.js — high-resolution PNG export for Stained Glass Drift
import { composeFromSeed, renderComposition } from './generator.js';

function pad(n, w = 2) { return String(n).padStart(w, '0'); }
function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
         `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function filenameFor(comp) {
  return `stained-glass-${timestamp()}-seed${comp.seed}.png`;
}

// Re-compose at a high logical resolution so cell geometry stays consistent
// with screen ratio, then render to a canvas matching that resolution.
function renderHiRes(comp, targetLongSide = 2560) {
  const ratio = comp.height / comp.width;
  let W, H;
  if (ratio >= 1) { H = targetLongSide; W = Math.round(H / ratio); }
  else { W = targetLongSide; H = Math.round(W * ratio); }

  const hi = composeFromSeed(comp.seed, { ...comp.params, width: W, height: H });
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cctx = c.getContext('2d', { alpha: false });
  renderComposition(cctx, hi, {});
  return c;
}

function canvasToBlob(c) {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png', 0.95);
  });
}

async function downloadBlob(blob, name) {
  // Prefer File System Access API when available (desktop Chrome/Edge).
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      // fall through to anchor download on other errors
    }
  }
  // Anchor download fallback (works on iOS Safari: long-press "Save to Photos").
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function saveCurrent(comp, opts = {}) {
  if (!comp) throw new Error('No composition to save');
  const longSide = opts.longSide || 2560;
  const c = renderHiRes(comp, longSide);
  const blob = await canvasToBlob(c);
  await downloadBlob(blob, filenameFor(comp));
}

// Convenience: return a hi-res data URL (not used by default, but handy).
export function dataUrlHiRes(comp, longSide = 2048) {
  const c = renderHiRes(comp, longSide);
  return c.toDataURL('image/png');
}
