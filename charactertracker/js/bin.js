// bin.js — sample bin (pool of decoded audio samples). Separate from the
// 8-slot rack used by tracks: the bin can hold many samples that aren't
// currently assigned to any track. Click a bin item → it loads into the
// current track's slot. Drag-into-slot also supported.
//
// Bin items aren't persisted — buffers are heavy and re-decoding on load is
// fast enough. Filenames could be stored for "missing samples" placeholders
// later, but v1 just keeps the in-memory list for the session.

import { state, setStatus } from './state.js';
import { audioCtx } from './audio.js';

export async function addFilesToBin(files) {
  const ctx = audioCtx();
  let added = 0;
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const audio = await ctx.decodeAudioData(buf.slice(0));
      const peaks = computePeaks(audio, 96);
      state.bin.items.push({
        name: f.name,
        buffer: audio,
        peaks,
        durSec: audio.duration,
      });
      added++;
    } catch (e) {
      setStatus('skipped (decode failed): ' + f.name);
    }
  }
  if (added) setStatus('bin: +' + added + ' (' + state.bin.items.length + ' total)');
  return added;
}

export function removeBinItem(idx) {
  if (idx < 0 || idx >= state.bin.items.length) return;
  state.bin.items.splice(idx, 1);
  if (state.bin.selected >= state.bin.items.length) state.bin.selected = state.bin.items.length - 1;
  setStatus('bin: removed');
}

export function clearBin() {
  state.bin.items.length = 0;
  state.bin.selected = -1;
  setStatus('bin: cleared');
}

// Assign a bin item to a bank slot. Reuses the same slot/buffer/peaks/slices
// shape that bank.js produces, with default even slicing.
export function assignBinToSlot(binIdx, slotIdx) {
  if (binIdx < 0 || binIdx >= state.bin.items.length) return false;
  if (slotIdx < 0 || slotIdx >= state.bank.length) return false;
  const item = state.bin.items[binIdx];
  const slot = state.bank[slotIdx];
  slot.buffer = item.buffer;
  slot.name = item.name;
  slot.peaks = computePeaks(item.buffer, 512);    // higher-res for waveform panel
  // Default-slice the assigned sample.
  const n = 16;
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = i / n;
  slot.slices = arr;
  setStatus('slot ' + (slotIdx + 1) + ' ← ' + item.name);
  return true;
}

// Hidden file input for multi-pick. Lazy-built like project.js.
let binInputEl = null;
export function openBinPicker() {
  if (!binInputEl) {
    binInputEl = document.createElement('input');
    binInputEl.type = 'file';
    binInputEl.accept = 'audio/*';
    binInputEl.multiple = true;
    binInputEl.style.display = 'none';
    document.body.appendChild(binInputEl);
    binInputEl.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) await addFilesToBin(files);
      binInputEl.value = '';
    });
  }
  binInputEl.click();
}

function computePeaks(buf, n) {
  const ch = buf.getChannelData(0);
  const peaks = new Float32Array(n);
  const step = Math.max(1, Math.floor(ch.length / n));
  for (let i = 0; i < n; i++) {
    let m = 0;
    const s = i * step;
    const e = Math.min(ch.length, s + step);
    for (let j = s; j < e; j++) {
      const v = Math.abs(ch[j]);
      if (v > m) m = v;
    }
    peaks[i] = m;
  }
  return peaks;
}
