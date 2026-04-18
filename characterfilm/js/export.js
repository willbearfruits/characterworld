import { state, setStatus } from './state.js';
import { THEMES, THEME_NAMES } from './constants.js';
import { hexOfPalette } from './video.js';
import { currentFrame } from './timeline.js';
import { openIo, closeIo } from './io.js';
import { pushHistory } from './history.js';

const STORAGE_KEY = 'characterfilm_project_v1';

// Convert a per-cell color (palette idx or truecolor sentinel) to a fill style.
function cellFill(frame, i) {
  const c = frame.colors[i];
  if (c === 255 && frame.rgb) {
    const p = i * 3;
    return `rgb(${frame.rgb[p]},${frame.rgb[p + 1]},${frame.rgb[p + 2]})`;
  }
  return hexOfPalette(c || 1);
}

// -------- Render helpers: draw a frame (chars+colors) to an offscreen canvas. --------
// If a target canvas is provided, we draw into it (sized to match). Otherwise a new canvas is returned.
function renderFrameToCanvas(frame, cellPx, target) {
  const { cols, rows, knobs } = state;
  const theme = THEMES[THEME_NAMES[knobs.themeIdx]];
  const bg = theme[0][1];

  const cv = target || document.createElement('canvas');
  cv.width = cols * cellPx;
  cv.height = rows * cellPx * 2;           // chars are ~2x tall as wide
  const ctx = cv.getContext('2d');
  const h = cv.height / rows;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.font = `bold ${Math.floor(h * 1.02)}px "Courier New", Courier, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const ch = frame.chars[i];
      if (ch === ' ' || !ch) continue;
      ctx.fillStyle = cellFill(frame, i);
      ctx.fillText(ch, x * cellPx + cellPx / 2, y * h + 1);
    }
  }
  return cv;
}

// -------- PNG (current frame or live) --------
export async function exportPng() {
  const frame = currentFrame() || state.live;
  if (!frame || !frame.chars) { setStatus('nothing to export'); return; }
  const cv = renderFrameToCanvas(frame, 12);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  triggerDownload(blob, 'characterfilm-frame.png');
  setStatus('png exported');
}

// -------- TXT --------
export function exportTxt() {
  const frame = currentFrame() || state.live;
  if (!frame || !frame.chars) { setStatus('nothing to export'); return; }
  const { cols, rows } = state;
  let out = '';
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      line += frame.chars[y * cols + x] || ' ';
    }
    out += line.replace(/\s+$/, '') + '\n';
  }
  const blob = new Blob([out], { type: 'text/plain' });
  triggerDownload(blob, 'characterfilm-frame.txt');
  setStatus('txt exported');
}

// -------- ANSI (current frame, truecolor) --------
export function exportAnsi() {
  const frame = currentFrame() || state.live;
  if (!frame || !frame.chars) { setStatus('nothing to export'); return; }
  const { cols, rows, knobs } = state;
  const theme = THEMES[THEME_NAMES[knobs.themeIdx]];
  const reset = '\x1b[0m';
  let out = '';
  for (let y = 0; y < rows; y++) {
    let prevCol = -1;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const ch = frame.chars[i] || ' ';
      const c = frame.colors[i] || 1;
      let r, g, b;
      if (c === 255 && frame.rgb) {
        const p = i * 3;
        r = frame.rgb[p]; g = frame.rgb[p + 1]; b = frame.rgb[p + 2];
      } else {
        const hex = theme[Math.min(c, theme.length - 1)][1];
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
      }
      // Each ANSI color sequence flushed per-cell when truecolor; cheap enough for character grids.
      if (c !== prevCol || c === 255) {
        out += `\x1b[38;2;${r};${g};${b}m`;
        prevCol = c;
      }
      out += ch;
    }
    out += reset + '\n';
  }
  const blob = new Blob([out], { type: 'text/plain' });
  triggerDownload(blob, 'characterfilm-frame.ans');
  setStatus('ansi exported');
}

// -------- JSON project --------
export function exportJson() {
  const data = {
    format: 'characterfilm/project',
    version: 1,
    cols: state.cols,
    rows: state.rows,
    fps: state.fps,
    knobs: state.knobs,
    frames: state.frames.map(f => {
      const o = {
        chars: f.chars.join(''),
        colors: Array.from(f.colors),
        marks: Array.from(f.marks),
      };
      if (f.rgb) o.rgb = Array.from(f.rgb);
      return o;
    }),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  triggerDownload(blob, 'characterfilm-project.cwf.json');
  setStatus('project saved');
}

export async function importJsonFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || data.format !== 'characterfilm/project') {
      setStatus('not a characterfilm project');
      return;
    }
    pushHistory('IMPORT PROJECT');
    state.cols = data.cols;
    state.rows = data.rows;
    state.fps = data.fps || 12;
    state.knobs = Object.assign({}, state.knobs, data.knobs || {});
    const n = state.cols * state.rows;
    state.frames = (data.frames || []).map(f => ({
      chars: (f.chars || '').split('').slice(0, n).concat(new Array(Math.max(0, n - (f.chars || '').length)).fill(' ')),
      colors: new Uint8Array(f.colors || new Array(n).fill(0)),
      marks: new Uint8Array(f.marks || new Array(n).fill(0)),
      rgb: f.rgb ? new Uint8Array(f.rgb) : null,
    }));
    state.current = state.frames.length ? 0 : -1;
    state.viewMode = state.frames.length ? 'frame' : 'live';
    state.live.dirty = true;
    setStatus('project loaded — ' + state.frames.length + ' frames');
  } catch (e) {
    setStatus('import failed');
  }
}

// -------- localStorage quick save/load --------
export function quickSave() {
  try {
    const data = {
      format: 'characterfilm/project', version: 1,
      cols: state.cols, rows: state.rows, fps: state.fps, knobs: state.knobs,
      frames: state.frames.map(f => {
        const o = {
          chars: f.chars.join(''),
          colors: Array.from(f.colors),
          marks: Array.from(f.marks),
        };
        if (f.rgb) o.rgb = Array.from(f.rgb);
        return o;
      }),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setStatus('quick saved (' + state.frames.length + ' frames)');
  } catch (e) { setStatus('quick save failed'); }
}
export function quickLoad() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) { setStatus('no quick save'); return; }
    const data = JSON.parse(text);
    pushHistory('QUICK LOAD');
    state.cols = data.cols; state.rows = data.rows; state.fps = data.fps || 12;
    state.knobs = Object.assign({}, state.knobs, data.knobs || {});
    const n = state.cols * state.rows;
    state.frames = (data.frames || []).map(f => ({
      chars: (f.chars || '').split('').slice(0, n).concat(new Array(Math.max(0, n - (f.chars || '').length)).fill(' ')),
      colors: new Uint8Array(f.colors || new Array(n).fill(0)),
      marks: new Uint8Array(f.marks || new Array(n).fill(0)),
      rgb: f.rgb ? new Uint8Array(f.rgb) : null,
    }));
    state.current = state.frames.length ? 0 : -1;
    state.viewMode = state.frames.length ? 'frame' : 'live';
    state.live.dirty = true;
    setStatus('quick loaded');
  } catch (e) { setStatus('quick load failed'); }
}

// -------- GIF (animated, LZW) --------
// Port of the charactershop encoder, trimmed.
class GifWriter {
  constructor(w, h, palette /* Uint8Array of RGB triples */, globalIdx /* 2..8 */) {
    this.w = w; this.h = h;
    this.out = [];
    this.writeHeader(palette, globalIdx);
    // Loop extension (Netscape 2.0, infinite loop)
    this.writeBytes([0x21, 0xff, 0x0b]);
    this.writeStr('NETSCAPE2.0');
    this.writeBytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  }
  writeBytes(a) { for (const b of a) this.out.push(b & 0xff); }
  writeStr(s) { for (let i = 0; i < s.length; i++) this.out.push(s.charCodeAt(i) & 0xff); }
  writeU16(v) { this.out.push(v & 0xff, (v >> 8) & 0xff); }
  writeHeader(palette, bits) {
    this.writeStr('GIF89a');
    this.writeU16(this.w); this.writeU16(this.h);
    const gctSize = bits - 1; // 000..111 means 2..256
    this.out.push(0x80 | (gctSize & 0x07));   // global color table, 8bit res, sorted=0, size
    this.out.push(0); // background index
    this.out.push(0); // pixel aspect
    for (let i = 0; i < palette.length; i++) this.out.push(palette[i]);
  }
  writeFrame(indices, delayCs, paletteBits) {
    // Graphic control extension
    this.writeBytes([0x21, 0xf9, 0x04]);
    this.out.push(0x00);         // packed: disposal 0, no user input, no transparency
    this.writeU16(delayCs);
    this.out.push(0x00);         // transparent index (unused)
    this.out.push(0x00);         // terminator
    // Image descriptor
    this.out.push(0x2c);
    this.writeU16(0); this.writeU16(0);
    this.writeU16(this.w); this.writeU16(this.h);
    this.out.push(0x00);         // no local color table
    const lzwMinCode = Math.max(2, paletteBits);
    this.out.push(lzwMinCode);
    const encoded = lzwEncode(indices, lzwMinCode);
    // Write as sub-blocks of max 255 bytes.
    let pos = 0;
    while (pos < encoded.length) {
      const len = Math.min(255, encoded.length - pos);
      this.out.push(len);
      for (let i = 0; i < len; i++) this.out.push(encoded[pos + i]);
      pos += len;
    }
    this.out.push(0);            // block terminator
  }
  finish() {
    this.out.push(0x3b);
    return new Uint8Array(this.out);
  }
}

function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoi + 1;
  const dict = new Map();
  for (let i = 0; i < clear; i++) dict.set(String.fromCharCode(i), i);

  const bytes = [];
  let buf = 0, bufBits = 0;
  const emit = (code) => {
    buf |= code << bufBits;
    bufBits += codeSize;
    while (bufBits >= 8) {
      bytes.push(buf & 0xff);
      buf >>>= 8;
      bufBits -= 8;
    }
  };

  emit(clear);
  let s = String.fromCharCode(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const c = String.fromCharCode(indices[i]);
    const sc = s + c;
    if (dict.has(sc)) {
      s = sc;
    } else {
      emit(dict.get(s));
      if (nextCode < 4096) {
        dict.set(sc, nextCode++);
        if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
      } else {
        emit(clear);
        codeSize = minCodeSize + 1;
        nextCode = eoi + 1;
        dict.clear();
        for (let k = 0; k < clear; k++) dict.set(String.fromCharCode(k), k);
      }
    }
  }
  emit(dict.get(s));
  emit(eoi);
  if (bufBits > 0) bytes.push(buf & 0xff);
  return bytes;
}

// Build a small palette for the GIF from the active theme.
function buildGifPalette() {
  const theme = THEMES[THEME_NAMES[state.knobs.themeIdx]];
  // Pad to power-of-two count.
  const bits = Math.max(2, Math.ceil(Math.log2(theme.length)));
  const size = 1 << bits;
  const pal = new Uint8Array(size * 3);
  for (let i = 0; i < size; i++) {
    const t = theme[Math.min(i, theme.length - 1)];
    const hex = t[1];
    pal[i * 3 + 0] = parseInt(hex.slice(1, 3), 16);
    pal[i * 3 + 1] = parseInt(hex.slice(3, 5), 16);
    pal[i * 3 + 2] = parseInt(hex.slice(5, 7), 16);
  }
  return { pal, bits };
}

function rasterizeFrame(frame, cellW, cellH, gifBits) {
  const { cols, rows } = state;
  const w = cols * cellW;
  const h = rows * cellH;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  // BG fills at index 0 naturally.
  const theme = THEMES[THEME_NAMES[state.knobs.themeIdx]];
  ctx.fillStyle = theme[0][1];
  ctx.fillRect(0, 0, w, h);
  ctx.font = `bold ${Math.floor(cellH * 1.02)}px "Courier New", Courier, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const ch = frame.chars[i];
      if (!ch || ch === ' ') continue;
      ctx.fillStyle = cellFill(frame, i);
      ctx.fillText(ch, x * cellW + cellW / 2, y * cellH + 1);
    }
  }
  const img = ctx.getImageData(0, 0, w, h).data;
  const indices = new Uint8Array(w * h);
  const paletteSize = 1 << gifBits;
  // Precompute palette RGB for quick lookup.
  const paletteRGB = [];
  for (let k = 0; k < theme.length; k++) {
    const hx = theme[k][1];
    paletteRGB.push([parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)]);
  }
  for (let p = 0; p < w * h; p++) {
    const r = img[p * 4], g = img[p * 4 + 1], b = img[p * 4 + 2];
    let best = 0, bd = Infinity;
    for (let k = 0; k < paletteRGB.length && k < paletteSize; k++) {
      const [pr, pg, pb] = paletteRGB[k];
      const d = (pr - r) * (pr - r) + (pg - g) * (pg - g) + (pb - b) * (pb - b);
      if (d < bd) { bd = d; best = k; }
    }
    indices[p] = best;
  }
  return { indices, w, h };
}

export async function exportGif() {
  if (!state.frames.length) { setStatus('record some frames first'); return; }
  const { pal, bits } = buildGifPalette();
  const cellW = 6, cellH = 12;
  const first = rasterizeFrame(state.frames[0], cellW, cellH, bits);
  const writer = new GifWriter(first.w, first.h, pal, bits);
  const delayCs = Math.max(2, Math.round(100 / Math.max(1, state.fps)));
  writer.writeFrame(first.indices, delayCs, bits);
  for (let i = 1; i < state.frames.length; i++) {
    const r = rasterizeFrame(state.frames[i], cellW, cellH, bits);
    writer.writeFrame(r.indices, delayCs, bits);
    // Keep UI responsive on big clips.
    if (i % 8 === 0) await new Promise(res => setTimeout(res, 0));
  }
  const blob = new Blob([writer.finish()], { type: 'image/gif' });
  triggerDownload(blob, 'characterfilm.gif');
  setStatus('gif exported (' + state.frames.length + ' frames)');
}

// -------- Video (MediaRecorder on an offscreen canvas) --------
// Picks the best-supported mime. Chromium generally exports webm/vp9; Safari does mp4/h264.
function pickVideoMime() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm;codecs=h264',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return { mime: '', ext: 'webm' };
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return { mime: m, ext: m.includes('mp4') ? 'mp4' : 'webm' }; }
    catch (e) { /* keep trying */ }
  }
  return { mime: '', ext: 'webm' };
}

export async function exportVideo() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    setStatus('video export not supported in this browser');
    return;
  }
  if (!state.frames.length) { setStatus('record some frames first'); return; }

  const fps = Math.max(1, Math.min(60, state.fps));
  // Pick a cell size that keeps the output clip roughly 1080p-ish at most.
  const { cols, rows } = state;
  const targetMax = 1920;
  const maxByCol = Math.floor(targetMax / cols);
  const cellPx = Math.max(6, Math.min(18, maxByCol || 12));

  // Build an offscreen canvas sized to full grid at cellPx per cell.
  const cv = document.createElement('canvas');
  // renderFrameToCanvas will set cv.width/height; we just need it ready.
  renderFrameToCanvas(state.frames[0], cellPx, cv);

  const { mime, ext } = pickVideoMime();
  let stream;
  try { stream = cv.captureStream(fps); }
  catch (e) { setStatus('captureStream failed'); return; }

  const opts = mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : {};
  let rec;
  try { rec = new MediaRecorder(stream, opts); }
  catch (e) {
    try { rec = new MediaRecorder(stream); }
    catch (e2) { setStatus('MediaRecorder init failed'); return; }
  }

  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { rec.onstop = res; });

  rec.start();

  const interval = 1000 / fps;
  const track = stream.getVideoTracks && stream.getVideoTracks()[0];
  for (let i = 0; i < state.frames.length; i++) {
    renderFrameToCanvas(state.frames[i], cellPx, cv);
    if (track && track.requestFrame) track.requestFrame();
    setStatus('encoding video ' + (i + 1) + '/' + state.frames.length);
    await new Promise(r => setTimeout(r, interval));
  }
  // Hold the last frame for one full interval so encoders don't truncate it.
  await new Promise(r => setTimeout(r, interval));

  rec.stop();
  await stopped;
  if (track && track.stop) track.stop();

  const blob = new Blob(chunks, { type: mime || 'video/webm' });
  triggerDownload(blob, 'characterfilm.' + ext);
  setStatus('video exported (' + ext + ', ' + state.frames.length + ' frames @ ' + fps + 'fps)');
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}
