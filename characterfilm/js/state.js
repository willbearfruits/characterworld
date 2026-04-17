import { DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_FPS, SRC_NONE, RAMP_NAMES, THEME_NAMES } from './constants.js';

// Global mutable app state. Modules import the `state` object and mutate its fields.
export const state = {
  // canvas / layout
  dpr: 1,
  cw: 0, ch: 0,
  uiCell: 14,
  artCell: 14,

  // frame grid
  cols: DEFAULT_COLS,
  rows: DEFAULT_ROWS,

  // source
  sourceKind: SRC_NONE,
  sourceReady: false,
  sourceLabel: 'no source',

  // conversion knobs
  knobs: {
    brightness: 0,      // -100..100
    contrast:   0,      // -100..100
    gamma:      1.0,    // 0.3..2.5
    threshold:  0,      // 0..100 (below = empty)
    invert:     false,
    edge:       0,      // 0..100 edge-highlight strength
    rampIdx:    0,      // index into RAMP_NAMES
    themeIdx:   0,      // index into THEME_NAMES
    colorMode:  0,      // COLOR_MODES index
    inkColor:   1,      // palette index for MONO
    overlayAlpha: 100,  // 0..100 — how much of the conversion shows
  },

  // live converted buffer — what's sampled from source each tick
  live: {
    chars: null,
    colors: null,
    marks: null,
    dirty: true,
  },

  // timeline
  frames: [],           // array of { chars, colors, marks }
  current: -1,          // -1 = live mode, else index into frames
  fps: DEFAULT_FPS,
  playing: false,
  recording: false,
  lastRecordT: 0,
  lastPlayT: 0,

  // view mode for main viewport
  viewMode: 'live',     // 'live' | 'frame'

  // onion skin: draw prev/next frames as ghosts behind the current one
  onion: { enabled: false, range: 1 }, // range = how many frames on each side (1..3)

  // range selection on the timeline (inclusive); null = no selection
  selection: null,

  // tools
  mode: 'BRUSH',
  brushGlyph: '●',
  brushColor: 1,        // palette index
  brushSize: 1,

  // interaction
  pointer: { x: 0, y: 0, col: -1, row: -1, artX: -1, artY: -1, down: false, over: 'none' },
  menuOpen: null,

  // panel state
  panelOpen: { knobs: true, tools: true, glyphs: true, palette: true, export: false, help: false },

  // misc
  t: 0,
  statusMsg: '',
  statusT: 0,
};

export function setStatus(msg) {
  state.statusMsg = msg;
  state.statusT = state.t;
}
