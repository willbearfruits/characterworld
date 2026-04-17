import { state, setStatus } from './state.js';
import { RAMPS, RAMP_NAMES, THEMES, THEME_NAMES, SRC_NONE, SRC_WEBCAM, SRC_VIDEO, SRC_IMAGE } from './constants.js';

const srcVideo = document.getElementById('src');

// Offscreen canvas for sampling video frames down to the character grid.
// Each cell samples one block of video pixels.
const sampleCv = document.createElement('canvas');
const sampleCtx = sampleCv.getContext('2d', { willReadFrequently: true });

let currentStream = null;
let sourceImage = null;    // for SRC_IMAGE

export function stopSource() {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  srcVideo.pause();
  srcVideo.srcObject = null;
  srcVideo.src = '';
  sourceImage = null;
  state.sourceKind = SRC_NONE;
  state.sourceReady = false;
  state.sourceLabel = 'no source';
}

export async function startWebcam() {
  stopSource();
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    srcVideo.srcObject = currentStream;
    await srcVideo.play();
    state.sourceKind = SRC_WEBCAM;
    state.sourceReady = true;
    state.sourceLabel = 'webcam';
    state.viewMode = 'live';
    state.current = -1;
    setStatus('webcam ready');
  } catch (e) {
    setStatus('webcam blocked or unavailable');
  }
}

export async function loadVideoFile(file) {
  stopSource();
  const url = URL.createObjectURL(file);
  srcVideo.src = url;
  srcVideo.loop = true;
  try {
    await srcVideo.play();
    state.sourceKind = SRC_VIDEO;
    state.sourceReady = true;
    state.sourceLabel = 'video: ' + file.name;
    state.viewMode = 'live';
    state.current = -1;
    setStatus('video loaded');
  } catch (e) {
    setStatus('video playback blocked — click to enable');
  }
}

export async function loadImageFile(file) {
  stopSource();
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  sourceImage = img;
  state.sourceKind = SRC_IMAGE;
  state.sourceReady = true;
  state.sourceLabel = 'image: ' + file.name;
  state.viewMode = 'live';
  state.current = -1;
  setStatus('image loaded');
}

// Ensure live.chars/colors/marks arrays match cols*rows.
export function ensureLiveBuffers() {
  const n = state.cols * state.rows;
  if (!state.live.chars || state.live.chars.length !== n) {
    state.live.chars = new Array(n).fill(' ');
    state.live.colors = new Uint8Array(n);
    state.live.marks = new Uint8Array(n);
  }
}

// Source pixel aspect: characters are taller than wide, so sample with a vertical squish.
const CHAR_ASPECT = 0.5; // width/height of a character cell visually

// Sample the current source into the live buffer using current knobs.
export function sampleFrame() {
  ensureLiveBuffers();
  if (!state.sourceReady) {
    // Clear to empty.
    state.live.chars.fill(' ');
    state.live.colors.fill(0);
    state.live.marks.fill(0);
    return;
  }

  const { cols, rows } = state;

  // Set sample canvas to grid dimensions (stretched vertically to compensate for char aspect).
  const sw = cols;
  const sh = Math.max(1, Math.round(rows));
  if (sampleCv.width !== sw || sampleCv.height !== sh) {
    sampleCv.width = sw;
    sampleCv.height = sh;
  }

  // Draw source to fit grid — letterbox to preserve aspect while accounting for char aspect.
  let srcW = 0, srcH = 0, srcEl = null;
  if (state.sourceKind === SRC_IMAGE && sourceImage) {
    srcW = sourceImage.naturalWidth; srcH = sourceImage.naturalHeight; srcEl = sourceImage;
  } else if ((state.sourceKind === SRC_WEBCAM || state.sourceKind === SRC_VIDEO) && srcVideo.readyState >= 2) {
    srcW = srcVideo.videoWidth; srcH = srcVideo.videoHeight; srcEl = srcVideo;
  } else {
    return;
  }
  if (!srcW || !srcH) return;

  // Effective target aspect (grid is cols × rows, but chars are ~2x tall as wide,
  // so effective pixel-aspect target is cols × rows*CHAR_ASPECT mapped to cols × rows sample pixels).
  sampleCtx.fillStyle = '#000';
  sampleCtx.fillRect(0, 0, sw, sh);

  const targetW = sw;
  const targetH = sh;
  // Fit source into target preserving source aspect but compressing Y by CHAR_ASPECT.
  const srcAspectVisual = (srcW / srcH) / CHAR_ASPECT; // how wide source looks after char-aspect correction
  const tgtAspect = targetW / targetH;
  let dw, dh;
  if (srcAspectVisual > tgtAspect) {
    dw = targetW;
    dh = targetW / srcAspectVisual;
  } else {
    dh = targetH;
    dw = targetH * srcAspectVisual;
  }
  const dx = (targetW - dw) / 2;
  const dy = (targetH - dh) / 2;

  try {
    sampleCtx.drawImage(srcEl, 0, 0, srcW, srcH, dx, dy, dw, dh);
  } catch (e) {
    return;
  }

  let data;
  try { data = sampleCtx.getImageData(0, 0, sw, sh).data; }
  catch (e) { return; }

  convertPixelsToChars(data, sw, sh);
}

function convertPixelsToChars(data, sw, sh) {
  const { cols, rows, knobs, live } = state;
  const ramp = RAMPS[RAMP_NAMES[knobs.rampIdx]];
  const rampLen = ramp.length;
  const theme = THEMES[THEME_NAMES[knobs.themeIdx]];
  const bright = knobs.brightness / 100;   // -1..1
  const contrast = (knobs.contrast + 100) / 100; // 0..2
  const gamma = 1 / Math.max(0.05, knobs.gamma);
  const thr = knobs.threshold / 100;
  const inv = knobs.invert;
  const edgeStrength = knobs.edge / 100;
  const colorMode = knobs.colorMode;
  const inkIdx = knobs.inkColor;

  // Precompute a gray buffer to enable edge detect.
  const n = cols * rows;
  const gray = new Float32Array(n);

  // We assume sw === cols, sh === rows.
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    let v = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (inv) v = 1 - v;
    v = (v - 0.5) * contrast + 0.5 + bright;
    if (v < 0) v = 0; else if (v > 1) v = 1;
    v = Math.pow(v, gamma);
    gray[i] = v;
  }

  // Edge detect (simple Sobel luminance, additive).
  let edges = null;
  if (edgeStrength > 0) {
    edges = new Float32Array(n);
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        const tl = gray[i - cols - 1], t = gray[i - cols], tr = gray[i - cols + 1];
        const l = gray[i - 1],                             r = gray[i + 1];
        const bl = gray[i + cols - 1], bt = gray[i + cols], br2 = gray[i + cols + 1];
        const gx = -tl - 2 * l - bl + tr + 2 * r + br2;
        const gy = -tl - 2 * t - tr + bl + 2 * bt + br2;
        const m = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 3);
        edges[i] = m;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    let v = gray[i];
    if (edges) v = Math.min(1, v + edges[i] * edgeStrength);

    if (v < thr) {
      live.chars[i] = ' ';
      live.colors[i] = 0;
      live.marks[i] = 0;
      continue;
    }

    // Pick glyph from ramp based on density.
    let rampPos = Math.floor(v * rampLen);
    if (rampPos >= rampLen) rampPos = rampLen - 1;
    if (rampPos < 0) rampPos = 0;
    const ch = ramp[rampPos];
    live.chars[i] = ch;

    // Color.
    let colIdx = inkIdx;
    if (colorMode === 1) {
      // QUANTIZED — map RGB to nearest palette color.
      const p = i * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      colIdx = nearestPaletteColor(theme, r, g, b);
    } else if (colorMode === 2) {
      // EDGE — edges get highlight, body gets ink.
      if (edges && edges[i] > 0.5) colIdx = 2;  // HI
      else colIdx = inkIdx;
    }
    live.colors[i] = colIdx;
    live.marks[i] = 0;
  }

  live.dirty = false;
}

function nearestPaletteColor(theme, r, g, b) {
  let best = 1, bd = Infinity;
  // Skip BG (index 0) — we want visible chars always have non-BG color.
  for (let k = 1; k < theme.length; k++) {
    const hex = theme[k][1];
    const pr = parseInt(hex.slice(1, 3), 16);
    const pg = parseInt(hex.slice(3, 5), 16);
    const pb = parseInt(hex.slice(5, 7), 16);
    const d = (pr - r) * (pr - r) + (pg - g) * (pg - g) + (pb - b) * (pb - b);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

export function hexOfPalette(idx) {
  const theme = THEMES[THEME_NAMES[state.knobs.themeIdx]];
  if (idx < 0 || idx >= theme.length) return theme[1][1];
  return theme[idx][1];
}
export function nameOfPalette(idx) {
  const theme = THEMES[THEME_NAMES[state.knobs.themeIdx]];
  if (idx < 0 || idx >= theme.length) return '';
  return theme[idx][0];
}
export function paletteSize() {
  return THEMES[THEME_NAMES[state.knobs.themeIdx]].length;
}
