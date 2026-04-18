import { state, setStatus } from './state.js';
import { RAMPS, RAMP_NAMES, THEMES, THEME_NAMES, SRC_NONE, SRC_WEBCAM, SRC_VIDEO, SRC_IMAGE, MAX_FRAMES, RGB_SENTINEL } from './constants.js';
import { pushHistory } from './history.js';

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

// Seek the <video> element to t seconds and resolve when the frame is ready.
// Falls back after a short timeout so broken codecs don't hang the bake.
function seekTo(t) {
  return new Promise((res) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      srcVideo.removeEventListener('seeked', finish);
      res();
    };
    srcVideo.addEventListener('seeked', finish);
    try { srcVideo.currentTime = t; } catch (e) { finish(); return; }
    setTimeout(finish, 1500);
  });
}

// Import a video file by seeking through it at `fps` and baking each sampled
// frame into state.frames[]. Runs through sampleFrame() so current knobs apply.
// opts: { fps (defaults to state.fps), append (bool), onProgress(doneCount,total) }
export async function bakeVideoToFrames(file, opts = {}) {
  const fps = opts.fps || state.fps;
  const append = !!opts.append;

  stopSource();
  const url = URL.createObjectURL(file);
  srcVideo.src = url;
  srcVideo.loop = false;
  srcVideo.muted = true;
  srcVideo.playsInline = true;
  try {
    await new Promise((res, rej) => {
      const ok = () => { cleanup(); res(); };
      const bad = () => { cleanup(); rej(new Error('video load failed')); };
      const cleanup = () => {
        srcVideo.removeEventListener('loadedmetadata', ok);
        srcVideo.removeEventListener('error', bad);
      };
      srcVideo.addEventListener('loadedmetadata', ok);
      srcVideo.addEventListener('error', bad);
    });
  } catch (e) {
    setStatus('video load failed');
    return 0;
  }

  // Nudge playback once so some codecs populate the first frame.
  try { await srcVideo.play(); srcVideo.pause(); } catch (e) {}

  state.sourceKind = SRC_VIDEO;
  state.sourceReady = true;
  state.sourceLabel = 'video: ' + file.name;

  const dur = isFinite(srcVideo.duration) ? srcVideo.duration : 0;
  if (!dur) {
    setStatus('video has no duration');
    return 0;
  }

  pushHistory(append ? 'APPEND VIDEO' : 'IMPORT VIDEO');
  if (!append) state.frames = [];

  const step = 1 / fps;
  const budget = Math.max(0, MAX_FRAMES - state.frames.length);
  const total = Math.min(budget, Math.max(1, Math.floor(dur / step)));

  for (let i = 0; i < total; i++) {
    const t = Math.min(dur - 0.001, i * step);
    await seekTo(t);
    sampleFrame();
    state.frames.push({
      chars: state.live.chars.slice(),
      colors: new Uint8Array(state.live.colors),
      marks: new Uint8Array(state.live.marks),
      rgb: state.live.rgb ? new Uint8Array(state.live.rgb) : null,
    });
    if ((i & 3) === 0) {
      setStatus('importing ' + (i + 1) + '/' + total + '…');
      await new Promise(r => setTimeout(r, 0));
    }
    if (opts.onProgress) opts.onProgress(i + 1, total);
  }

  srcVideo.pause();
  state.current = append ? (state.current >= 0 ? state.current : state.frames.length - total) : 0;
  state.viewMode = 'frame';
  setStatus('imported ' + total + ' frames @ ' + fps + 'fps');
  return total;
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
// rgb is allocated lazily (only when TRUE color mode is active).
export function ensureLiveBuffers() {
  const n = state.cols * state.rows;
  if (!state.live.chars || state.live.chars.length !== n) {
    state.live.chars = new Array(n).fill(' ');
    state.live.colors = new Uint8Array(n);
    state.live.marks = new Uint8Array(n);
    state.live.rgb = null;
  }
  if (state.knobs.colorMode === 3 && (!state.live.rgb || state.live.rgb.length !== n * 3)) {
    state.live.rgb = new Uint8Array(n * 3);
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

  // In TRUE color mode we also record per-cell RGB sampled from the source.
  const wantRgb = colorMode === 3;
  if (wantRgb && (!live.rgb || live.rgb.length !== n * 3)) {
    live.rgb = new Uint8Array(n * 3);
  }
  const rgb = wantRgb ? live.rgb : null;

  for (let i = 0; i < n; i++) {
    let v = gray[i];
    if (edges) v = Math.min(1, v + edges[i] * edgeStrength);

    if (v < thr) {
      live.chars[i] = ' ';
      live.colors[i] = 0;
      live.marks[i] = 0;
      if (rgb) { rgb[i * 3] = 0; rgb[i * 3 + 1] = 0; rgb[i * 3 + 2] = 0; }
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
    } else if (colorMode === 3) {
      // TRUE — mark the cell as "read from rgb buffer" and store the sampled RGB.
      const p = i * 4;
      // modulate by density so the character glyph carries visible color weight
      const mod = 0.55 + 0.45 * v;
      rgb[i * 3]     = Math.min(255, Math.round(data[p]     * mod));
      rgb[i * 3 + 1] = Math.min(255, Math.round(data[p + 1] * mod));
      rgb[i * 3 + 2] = Math.min(255, Math.round(data[p + 2] * mod));
      colIdx = RGB_SENTINEL;
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
