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
  setStatus('timeline cleared');
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
