// bank.js — shared sample bank. Owns buffer loading, peak precompute, and
// auto-slicing. The audio graph lives in audio.js; bank.js never touches the
// AudioContext beyond `decodeAudioData`.

import { state, setStatus } from './state.js';
import { DEFAULTS } from './constants.js';
import { audioCtx } from './audio.js';

export async function loadFileToSlot(slotIdx, file) {
  const ctx = audioCtx();
  try {
    const buf = await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    putBuffer(slotIdx, audio, file.name);
    return true;
  } catch (e) {
    setStatus('decode failed: ' + (e && e.message ? e.message : e));
    return false;
  }
}

export async function loadURLToSlot(slotIdx, url) {
  const ctx = audioCtx();
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ab = await r.arrayBuffer();
    const audio = await ctx.decodeAudioData(ab.slice(0));
    putBuffer(slotIdx, audio, url.split('/').pop() || url);
    return true;
  } catch (e) {
    setStatus('load failed: ' + url);
    return false;
  }
}

export function generateDefaultBufferToSlot(slotIdx) {
  const ctx = audioCtx();
  const dur = 2.5;
  const buf = ctx.createBuffer(2, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      y = y * 0.97 + w * 0.03;
      d[i] = y * 0.85;
    }
  }
  putBuffer(slotIdx, buf, 'noise');
}

function putBuffer(slotIdx, audio, name) {
  const slot = state.bank[slotIdx];
  slot.buffer = audio;
  slot.name = name;
  slot.peaks = computePeaks(audio, 512);
  slot.slices = autoSlices(audio, DEFAULTS.defaultSlices);
}

// Even slicing — divides the buffer into N equal segments. A future smarter
// pass could detect transients; for the breakcore workflow even slicing
// already gets you most of the way (load Amen → 16 slices ≈ each hit).
export function autoSlices(buffer, n) {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = i / n;
  return arr;
}

// Transient-aware slicing — peak detect across small windows. Returns slice
// start positions (0..1). Useful when even slicing puts hits in the middle of
// a segment instead of at the edge.
export function transientSlices(buffer, maxSlices = 32) {
  const ch = buffer.getChannelData(0);
  const winSize = Math.max(64, Math.floor(buffer.sampleRate * 0.005)); // 5ms
  const nWin = Math.floor(ch.length / winSize);
  const energy = new Float32Array(nWin);
  for (let w = 0; w < nWin; w++) {
    let s = 0;
    const off = w * winSize;
    for (let j = 0; j < winSize; j++) s += ch[off + j] * ch[off + j];
    energy[w] = s / winSize;
  }
  // Adaptive threshold: median * 4
  const sorted = energy.slice().sort();
  const med = sorted[(sorted.length / 2) | 0] || 0.0001;
  const thr = med * 4;
  const slices = [0];
  let cooldown = 0;
  for (let w = 1; w < nWin; w++) {
    if (cooldown > 0) { cooldown--; continue; }
    if (energy[w] > thr && energy[w] > energy[w - 1] * 1.4) {
      slices.push((w * winSize) / ch.length);
      cooldown = 6;
      if (slices.length >= maxSlices) break;
    }
  }
  return new Float32Array(slices);
}

export function setSlotSliceCount(slotIdx, n) {
  const slot = state.bank[slotIdx];
  if (!slot.buffer) return;
  slot.slices = autoSlices(slot.buffer, Math.max(1, Math.min(64, n | 0)));
}

export function setSlotTransientSlices(slotIdx) {
  const slot = state.bank[slotIdx];
  if (!slot.buffer) return;
  slot.slices = transientSlices(slot.buffer);
  if (slot.slices.length < 2) slot.slices = autoSlices(slot.buffer, DEFAULTS.defaultSlices);
}

function computePeaks(buf, n) {
  const ch = buf.getChannelData(0);
  const peaks = new Float32Array(n);
  const step = Math.max(1, Math.floor(ch.length / n));
  for (let i = 0; i < n; i++) {
    let max = 0;
    const s = i * step;
    const e = Math.min(ch.length, s + step);
    for (let j = s; j < e; j++) {
      const v = Math.abs(ch[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

// For UI: which slice does sample-position p (0..1) fall into?
export function sliceAt(slot, p) {
  if (!slot.slices || slot.slices.length === 0) return 0;
  let i = 0;
  for (; i < slot.slices.length - 1; i++) {
    if (p < slot.slices[i + 1]) return i;
  }
  return slot.slices.length - 1;
}

// Bounds [start, end] in normalized 0..1 for a given slice index.
export function sliceBounds(slot, idx) {
  if (!slot.slices || slot.slices.length === 0) return [0, 1];
  const n = slot.slices.length;
  const i = Math.max(0, Math.min(n - 1, idx | 0));
  const start = slot.slices[i];
  const end = i + 1 < n ? slot.slices[i + 1] : 1;
  return [start, end];
}
