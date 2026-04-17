import { state, setStatus } from './state.js';
import { HIST_MAX } from './constants.js';

let history = [];
let future = [];

function cloneFrame(f) {
  if (!f) return null;
  return {
    chars: f.chars.slice(),
    colors: new Uint8Array(f.colors),
    marks: new Uint8Array(f.marks),
  };
}

function snapshot(label) {
  return {
    label,
    cols: state.cols,
    rows: state.rows,
    current: state.current,
    fps: state.fps,
    frames: state.frames.map(cloneFrame),
    knobs: JSON.parse(JSON.stringify(state.knobs)),
  };
}

function restore(s) {
  state.cols = s.cols;
  state.rows = s.rows;
  state.current = Math.min(s.current, s.frames.length - 1);
  state.fps = s.fps;
  state.frames = s.frames.map(cloneFrame);
  state.knobs = JSON.parse(JSON.stringify(s.knobs));
  state.live.dirty = true;
}

export function pushHistory(label) {
  history.push(snapshot(label));
  if (history.length > HIST_MAX) history.shift();
  future.length = 0;
}

export function undo() {
  if (!history.length) { setStatus('nothing to undo'); return; }
  future.push(snapshot('(redo)'));
  restore(history.pop());
  setStatus('undo');
}

export function redo() {
  if (!future.length) { setStatus('nothing to redo'); return; }
  history.push(snapshot('(undo)'));
  restore(future.pop());
  setStatus('redo');
}

export function historyLabels() {
  return history.map(h => h.label);
}
export function historyLength() { return history.length; }
export function futureLength() { return future.length; }
