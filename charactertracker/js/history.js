// history.js — atelier-style snapshot history with redo.
//
// Snapshot scope: pattern (tracks + cells) + transport (bpm/swing) + master
// (gain/sat) + cursor + selection. NOT bank (assets) or transient runtime
// state (playing/trackPlay/particles/mouse/layout).
//
// Mutating ops MUST call pushHistory(label) BEFORE mutating. For continuous
// gestures (drag, wheel scrub), push once at the gesture start.

import { state, setStatus } from './state.js';

const HIST_MAX = 64;
const past = [];
const future = [];

export function snapshot(label) {
  return {
    label: label || '',
    bpm: state.bpm,
    swing: state.swing,
    masterGain: state.knobs.masterGain,
    satDrive: state.knobs.satDrive,
    cursor: { ...state.cursor },
    selection: state.selection ? { ...state.selection } : null,
    view: state.view,
    song: cloneSong(state.song),
  };
}

function cloneSong(s) {
  return {
    patterns: s.patterns.map(clonePattern),
    sequence: s.sequence.slice(),
    editIndex: s.editIndex,
    songStep: s.songStep,
    songMode: s.songMode,
    follow: s.follow,
    lastAdvanceAt: 0,
  };
}

function clonePattern(p) {
  return {
    name: p.name,
    bars: p.bars,
    tracks: p.tracks.map(cloneTrack),
  };
}

function cloneTrack(t) {
  return {
    name: t.name,
    voice: t.voice,
    slot: t.slot,
    length: t.length,
    div: t.div,
    gain: t.gain,
    pan: t.pan,
    mute: t.mute,
    solo: t.solo,
    params: { ...t.params },
    cells: t.cells.map((c) => ({ ...c })),
  };
}

// Restore — separated from setMasterGain/setSatDrive to avoid a circular
// import; main.js wires the callback at startup so audio node values follow.
let applyAudio = null;
export function setAudioApplier(fn) { applyAudio = fn; }

export function restore(s) {
  state.bpm = s.bpm;
  state.swing = s.swing;
  state.knobs.masterGain = s.masterGain;
  state.knobs.satDrive = s.satDrive;
  if (applyAudio) applyAudio(s.masterGain, s.satDrive);
  state.cursor = { ...s.cursor };
  state.selection = s.selection ? { ...s.selection } : null;
  if (s.view) state.view = s.view;
  if (s.song) {
    state.song = cloneSong(s.song);
  } else if (s.tracks) {
    // Backwards-compat: older snapshots carried tracks at the top level.
    state.song.patterns[state.song.editIndex].tracks = s.tracks.map(cloneTrack);
  }
  // Resync transport bookkeeping for the new edit pattern's tracks.
  const editPat = state.song.patterns[state.song.editIndex];
  state.trackPlay = editPat.tracks.map(() => ({ stepIndex: 0, nextStepTime: 0 }));
  if (state.cursor.track >= editPat.tracks.length) state.cursor.track = 0;
  const tr = editPat.tracks[state.cursor.track];
  if (tr && state.cursor.step >= tr.length) state.cursor.step = tr.length - 1;
}

export function pushHistory(label) {
  past.push(snapshot(label));
  if (past.length > HIST_MAX) past.shift();
  future.length = 0;
  // Auto-save current state to localStorage as a recovery anchor.
  try { localStorage.setItem('charactertracker.autosave.v2', JSON.stringify(snapshot('autosave'))); }
  catch (_) {}
}

export function undo() {
  if (!past.length) { setStatus('nothing to undo'); return false; }
  future.push(snapshot('redo'));
  if (future.length > HIST_MAX) future.shift();
  const s = past.pop();
  restore(s);
  setStatus('undo: ' + (s.label || ''));
  return true;
}

export function redo() {
  if (!future.length) { setStatus('nothing to redo'); return false; }
  past.push(snapshot('undo'));
  const s = future.pop();
  restore(s);
  setStatus('redo: ' + (s.label || ''));
  return true;
}

export function clearHistory() {
  past.length = 0;
  future.length = 0;
}

export function historyDepth() {
  return { past: past.length, future: future.length };
}

export function tryAutoload() {
  try {
    const raw = localStorage.getItem('charactertracker.autosave.v2');
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || !s.tracks) return false;
    restore(s);
    return true;
  } catch (e) {
    return false;
  }
}
