import { state, setStatus } from './state.js';
import { MAX_FRAMES } from './constants.js';
import { ensureLiveBuffers } from './video.js';
import { pushHistory } from './history.js';

export function makeBlankFrame() {
  const n = state.cols * state.rows;
  return {
    chars: new Array(n).fill(' '),
    colors: new Uint8Array(n),
    marks: new Uint8Array(n),
  };
}

export function currentFrame() {
  if (state.current < 0 || state.current >= state.frames.length) return null;
  return state.frames[state.current];
}

export function captureFromLive() {
  ensureLiveBuffers();
  if (state.frames.length >= MAX_FRAMES) {
    setStatus('max frames reached (' + MAX_FRAMES + ')');
    return -1;
  }
  pushHistory('CAPTURE');
  const frame = {
    chars: state.live.chars.slice(),
    colors: new Uint8Array(state.live.colors),
    marks: new Uint8Array(state.live.marks),
    rgb: state.live.rgb ? new Uint8Array(state.live.rgb) : null,
  };
  state.frames.push(frame);
  const idx = state.frames.length - 1;
  // Stay in live mode while recording; only jump when user stops recording.
  return idx;
}

export function toggleRecord() {
  if (state.recording) {
    state.recording = false;
    if (state.frames.length > 0) {
      state.current = state.frames.length - 1;
      state.viewMode = 'frame';
    }
    setStatus('stopped — ' + state.frames.length + ' frames');
  } else {
    state.recording = true;
    state.playing = false;
    state.lastRecordT = performance.now();
    state.viewMode = 'live';
    state.current = -1;
    setStatus('recording at ' + state.fps + ' fps');
  }
}

export function tickRecord(now) {
  if (!state.recording) return;
  const interval = 1000 / Math.max(1, state.fps);
  if (now - state.lastRecordT >= interval) {
    state.lastRecordT = now;
    captureFromLive();
    if (state.frames.length >= MAX_FRAMES) toggleRecord();
  }
}

export function togglePlay() {
  if (!state.frames.length) { setStatus('no frames to play'); return; }
  state.playing = !state.playing;
  if (state.playing) {
    state.recording = false;
    state.viewMode = 'frame';
    if (state.current < 0) state.current = 0;
    state.lastPlayT = performance.now();
    setStatus('play');
  } else {
    setStatus('pause');
  }
}

export function tickPlay(now) {
  if (!state.playing || !state.frames.length) return;
  const interval = 1000 / Math.max(1, state.fps);
  if (now - state.lastPlayT >= interval) {
    state.lastPlayT = now;
    state.current = (state.current + 1) % state.frames.length;
  }
}

export function gotoFrame(i) {
  if (!state.frames.length) return;
  const idx = ((i % state.frames.length) + state.frames.length) % state.frames.length;
  state.current = idx;
  state.viewMode = 'frame';
  state.playing = false;
}

export function stepForward() {
  if (!state.frames.length) return;
  state.current = Math.min(state.frames.length - 1, (state.current < 0 ? 0 : state.current + 1));
  state.viewMode = 'frame';
  state.playing = false;
}
export function stepBack() {
  if (!state.frames.length) return;
  state.current = Math.max(0, (state.current < 0 ? 0 : state.current - 1));
  state.viewMode = 'frame';
  state.playing = false;
}

export function deleteCurrentFrame() {
  if (state.current < 0 || state.current >= state.frames.length) return;
  pushHistory('DEL FRAME');
  state.frames.splice(state.current, 1);
  if (state.frames.length === 0) {
    state.current = -1;
    state.viewMode = 'live';
  } else {
    state.current = Math.min(state.current, state.frames.length - 1);
  }
  setStatus('frame deleted');
}

export function duplicateCurrentFrame() {
  if (state.current < 0 || state.current >= state.frames.length) return;
  pushHistory('DUP FRAME');
  const src = state.frames[state.current];
  const copy = {
    chars: src.chars.slice(),
    colors: new Uint8Array(src.colors),
    marks: new Uint8Array(src.marks),
    rgb: src.rgb ? new Uint8Array(src.rgb) : null,
  };
  state.frames.splice(state.current + 1, 0, copy);
  state.current += 1;
  setStatus('duplicated');
}

export function clearAllFrames() {
  pushHistory('CLEAR ALL');
  state.frames = [];
  state.current = -1;
  state.viewMode = 'live';
  state.recording = false;
  state.playing = false;
  state.selection = null;
  setStatus('timeline cleared');
}

// Return {a, b} normalized inclusive range from state.selection, clamped.
// If there's no selection, returns the single current frame (or null).
export function normalizedSelection() {
  if (state.selection) {
    let { start, end } = state.selection;
    start = Math.max(0, Math.min(state.frames.length - 1, start));
    end   = Math.max(0, Math.min(state.frames.length - 1, end));
    const a = Math.min(start, end), b = Math.max(start, end);
    return { a, b };
  }
  if (state.current >= 0 && state.current < state.frames.length) {
    return { a: state.current, b: state.current };
  }
  return null;
}

export function clearSelection() { state.selection = null; }

export function selectAll() {
  if (!state.frames.length) return;
  state.selection = { start: 0, end: state.frames.length - 1 };
}

export function extendSelectionTo(i) {
  if (!state.frames.length) return;
  const anchor = state.selection ? state.selection.start : (state.current < 0 ? 0 : state.current);
  state.selection = { start: anchor, end: Math.max(0, Math.min(state.frames.length - 1, i)) };
  state.current = i;
  state.viewMode = 'frame';
  state.playing = false;
}

export function deleteRange() {
  const r = normalizedSelection();
  if (!r) return;
  pushHistory('DEL RANGE');
  state.frames.splice(r.a, r.b - r.a + 1);
  state.selection = null;
  if (state.frames.length === 0) {
    state.current = -1;
    state.viewMode = 'live';
  } else {
    state.current = Math.min(r.a, state.frames.length - 1);
  }
  setStatus('deleted ' + (r.b - r.a + 1) + ' frame(s)');
}

export function duplicateRange() {
  const r = normalizedSelection();
  if (!r) return;
  const copies = [];
  for (let i = r.a; i <= r.b; i++) {
    const src = state.frames[i];
    copies.push({
      chars: src.chars.slice(),
      colors: new Uint8Array(src.colors),
      marks: new Uint8Array(src.marks),
      rgb: src.rgb ? new Uint8Array(src.rgb) : null,
    });
  }
  if (state.frames.length + copies.length > MAX_FRAMES) {
    setStatus('would exceed max frames (' + MAX_FRAMES + ')');
    return;
  }
  pushHistory('DUP RANGE');
  state.frames.splice(r.b + 1, 0, ...copies);
  state.selection = { start: r.b + 1, end: r.b + copies.length };
  state.current = r.b + copies.length;
  setStatus('duplicated ' + copies.length + ' frame(s)');
}

export function reverseRange() {
  const r = normalizedSelection();
  if (!r || r.a === r.b) return;
  pushHistory('REV RANGE');
  const chunk = state.frames.slice(r.a, r.b + 1).reverse();
  for (let i = 0; i < chunk.length; i++) state.frames[r.a + i] = chunk[i];
  setStatus('reversed ' + chunk.length + ' frame(s)');
}

export function shiftCurrent(dir) {
  if (state.current < 0 || state.current >= state.frames.length) return;
  const i = state.current, j = i + dir;
  if (j < 0 || j >= state.frames.length) return;
  pushHistory('SHIFT FRAME');
  const tmp = state.frames[i];
  state.frames[i] = state.frames[j];
  state.frames[j] = tmp;
  state.current = j;
  if (state.selection) state.selection = null; // simpler
}

export function toggleOnion() {
  state.onion.enabled = !state.onion.enabled;
  setStatus('onion skin ' + (state.onion.enabled ? 'on' : 'off') + ' (range ±' + state.onion.range + ')');
}

export function bumpOnionRange(d) {
  state.onion.range = Math.max(1, Math.min(3, state.onion.range + d));
  if (state.onion.enabled) setStatus('onion range ±' + state.onion.range);
}

export function resetGridTo(cols, rows) {
  pushHistory('RESIZE GRID');
  state.cols = cols;
  state.rows = rows;
  state.live.chars = null; // force reallocation
  ensureLiveBuffers();
  // Reallocate frames (content lost — warn via status).
  const n = cols * rows;
  state.frames = state.frames.map(() => ({
    chars: new Array(n).fill(' '),
    colors: new Uint8Array(n),
    marks: new Uint8Array(n),
  }));
  setStatus('grid ' + cols + '×' + rows + ' — frames cleared');
}
