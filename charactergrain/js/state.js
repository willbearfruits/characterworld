import { DEFAULTS } from './constants.js';

export const state = {
  cols: 80,
  rows: 24,
  theme: 0,
  algo: 0,
  playing: false,
  playStartTime: 0,    // AudioContext.currentTime at last play start
  playElapsed: 0,

  buffer: null,
  bufferName: '(none)',
  bufferPeaks: null,
  loading: false,

  knobs: {
    density:    DEFAULTS.density,
    size:       DEFAULTS.size,
    spread:     DEFAULTS.spread,
    pitch:      DEFAULTS.pitch,
    gain:       DEFAULTS.gain,
    pheroDecay: DEFAULTS.pheroDecay,
    bias:       DEFAULTS.bias,
    glyphFx:    DEFAULTS.glyphFx,
    sat:        DEFAULTS.sat,
    wet:        DEFAULTS.wet,
    caDens:     DEFAULTS.caDens,
    caRule:     DEFAULTS.caRule,
    stretch:    DEFAULTS.stretch,
  },

  // PaulStretch-ish scan mode: grain positions slaved to a slow-moving playhead
  // instead of random / x-derived positions. Lets you "listen through" a sample.
  scan: { on: false, pos: 0 },

  myc: null,
  stormcell: null,
  canvas: null,       // CANVAS algo: { painted: Int16Array, accum: Float32Array }

  heat: null,
  cellGlyph: null,
  cellZalgo: null,

  mouse: {
    uiC: -1, uiR: -1,
    fx: -1, fy: -1,
    prevFx: -1, prevFy: -1,
    inField: false,
    leftDown: false,
    rightDown: false,
    shift: false,
    x: 0, y: 0,
  },

  ui: { cellPx: 14, menuRows: 1, panelCols: 26, waveRows: 3, infoRows: 4, statusRows: 1 },

  // Compact / touch layout. Set during resizeUI; desktop stays false.
  compact: false,
  compactApplied: false,

  // Drawn-UI button registry, rebuilt each frame.
  buttons: [],
  menuOpen: null,
  panelOpen: { sound: true, scan: true, growth: true, fx: true, canvas: true, stormcell: true, algo: true, source: true, sample: true, prefs: false, play: true },
  panelScroll: 0,

  // Paint-tool state for CANVAS algo.
  paint: { tier: 'warm', glyphIdx: -1, zalgo: false },

  // CANVAS sequencer — when on, painted cells fire in grid order at a rate
  // derived from density * rateMul. Independent of hover firing.
  canvasSeq: { on: false, pos: 0, accum: 0, rateMul: 1 },

  // Last N grains for the info strip (ring buffer).
  recent: [],
  recentMax: 24,

  // Master-out recorder.
  rec: { active: false, mediaRec: null, chunks: [], mime: '', startTime: 0, lastFile: '' },

  // Recorder overlay open/closed.
  recorderOpen: false,

  // Audio preferences.
  prefs: {
    recordSource: 'master',   // 'master' | 'limiter' | 'dry'
    outputDeviceId: '',       // '' = default
    outputDeviceLabel: 'default',
    outputDevices: [],        // populated lazily
    inputDeviceId: '',        // '' = default mic
    inputDeviceLabel: 'default mic',
    inputDevices: [],
    sampleSeconds: 3,
    sampling: false,
  },

  // User-saved snippets (presets).
  snippets: [],

  gamepad: { connected: false, index: -1, btnA: false, btnB: false, btnX: false, btnY: false, btnLB: false, btnRB: false },

  status: 'press SPACE to play · click menu or knobs · L load · ESC panic',
};

export function setStatus(s) { state.status = s; }

export function pushRecent(info) {
  state.recent.push(info);
  if (state.recent.length > state.recentMax) state.recent.shift();
}
