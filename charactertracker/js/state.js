// state.js — single mutable state object.
// Boundaries:
//   scheduler.js mutates transport + per-track step pointers + spawns particles
//   input.js mutates cursor + cells + tracks via pattern.js helpers
//   ui.js reads only; ui.js writes only state.layout (its own hit-test cache)
//
// `state.pattern` is a GETTER returning the currently-edited pattern in the
// song. All existing call sites (state.pattern.tracks etc.) keep working;
// scheduler.js opts into the *playing* pattern via currentPlayPattern() so
// edit and play can diverge in song mode.

import { DEFAULTS } from './constants.js';
import { makeSong } from './pattern.js';

const _state = {
  cols: 80, rows: 24, cellW: 9, cellH: 16, dpr: 1,

  // View mode toggle: PATTERN (the editor) ↔ SONG (sequence list) ↔ MIXER.
  view: 'PATTERN',

  bpm: DEFAULTS.bpm,
  swing: DEFAULTS.swing,
  playing: false,
  playStartTime: 0,
  trackPlay: [],

  // Song: list of patterns + ordered sequence list. `state.pattern` (below) is
  // a getter that resolves to song.patterns[song.editIndex].
  song: makeSong(),

  cursor: { track: 0, step: 0, field: 'slice' },

  // Pattern-grid scroll. Auto-recenters around cursor only when the user
  // hasn't been manually scrolling — `scrollLockUntil` is bumped when the
  // user uses the wheel so the cursor doesn't yank the view away.
  scrollTrack: 0,
  scrollStep: 0,
  scrollLockUntil: 0,

  bank: Array.from({ length: DEFAULTS.bankSlots }, () => ({
    buffer: null, name: '(empty)', slices: null, peaks: null,
  })),
  bankSelected: 0,

  // Sample bin — flat list of decoded samples available for assigning to
  // bank slots. Persists in-memory only (buffers are heavy; not serialized).
  bin: {
    items: [],     // [{ name, buffer, peaks, durSec }]
    scroll: 0,
    selected: -1,
  },

  knobs: {
    masterGain: DEFAULTS.masterGain,
    satDrive:   DEFAULTS.satDrive,
  },

  mouse: {
    x: 0, y: 0, cx: 0, cy: 0, buttons: 0, inside: false,
    drag: null,
  },
  hover: {
    region: 'none',
    track: -1,
    step: -1,
    knob: null,
    bankSlot: -1,
    binItem: -1,
    songStep: -1,
    waveT: -1,
    scrollbar: null,
  },

  particles: [],

  selection: null,

  status: '',
  statusTime: 0,

  layout: null,
};

// state.pattern → currently-edited pattern. Read-only (we never assign to
// state.pattern; we mutate state.song.editIndex instead).
Object.defineProperty(_state, 'pattern', {
  get() { return _state.song.patterns[_state.song.editIndex] || _state.song.patterns[0]; },
  configurable: true,
});

export const state = _state;

export function setStatus(msg) {
  state.status = msg;
  state.statusTime = performance.now();
}

export function pushParticle(p) {
  if (state.particles.length >= DEFAULTS.maxParticles) state.particles.shift();
  state.particles.push(p);
}

export function currentPlayPattern() {
  const s = _state.song;
  if (s.songMode && s.sequence.length) {
    const idx = s.sequence[s.songStep % s.sequence.length];
    return s.patterns[idx] || s.patterns[0];
  }
  return s.patterns[s.editIndex] || s.patterns[0];
}
