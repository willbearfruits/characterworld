// constants.js — all tunable knobs and palettes.

export const THEME_VOID = {
  BG:      '#05060a',
  INK:     '#eaeaf2',
  HI:      '#9dff7a',
  ACC:     '#5ef2ff',
  WARN:    '#ff5e78',
  DIM:     '#3a3a48',
  EDGE:    '#565668',
  PANEL:   '#0a0c14',
  PANEL2:  '#0e1118',
  ROW:     '#11131c',
  UI:      '#b0b8d0',
  TRACK:   '#c78bff',
  GRAIN:   '#ffc933',
  RETRIG:  '#ff9e3d',
  POS:     '#5ce5c7',
  CURSOR:  '#ffdc4d',
  HOVER:   '#ffffff',
  AMBIENT: '#243a2e',
  PHERO:   '#6bbf92',
  VIO:     '#c78bff',
  PNK:     '#ff74c8',
  SUN:     '#ffc933',
  AQU:     '#5ce5c7',
  ORA:     '#ff9e3d',
  SKY:     '#6bb5ff',
  LIM:     '#c4ff5c',
  RED:     '#ff5e78',
  // Per-voice tints
  VSAMPLE: '#5ef2ff',
  VGRAIN:  '#ffc933',
  VFM:     '#ff74c8',
  VDRUM:   '#ff5e78',
};

// Voice types — each track picks one. The cell semantics shift per voice
// (see pattern.js + scheduler.js for the routing).
export const VOICES = ['SAMPLE', 'GRAIN', 'FM', 'DRUM'];
export const VOICE_COLOR = { SAMPLE: 'VSAMPLE', GRAIN: 'VGRAIN', FM: 'VFM', DRUM: 'VDRUM' };

// Drum voice maps cell.slice (mod 8) to a drum type.
export const DRUM_TYPES = ['KICK', 'SNARE', 'HAT', 'CLAP', 'TOM', 'COW', 'RIM', 'CRSH'];

export const DIVISIONS = [4, 8, 12, 16, 24, 32, 48, 64, 96];
export const LENGTHS = [8, 12, 16, 20, 24, 27, 32, 48, 64, 96, 128, 192, 256];
export const RETRIGS = [1, 2, 3, 4, 5, 6, 8, 12, 16];
export const PROB_TIERS = [100, 90, 75, 50, 25, 12];
export const MICRO_TIERS = [-50, -25, -12, 0, 12, 25, 50];

export const DEFAULTS = {
  bpm: 174,
  swing: 0,

  numTracks: 16,
  pattern: { length: 64 },

  bankSlots: 8,
  defaultSlices: 16,

  satDrive: 0.4,
  masterGain: 0.85,
  limiterThr: -3,
  limiterRatio: 20,

  grainBurst: 6,
  grainDurMs: 45,
  grainPitchSpread: 4,

  fmRatio: 1.5,
  fmIndex: 4,
  fmAtk: 0.005,
  fmRel: 0.18,
  fmBaseFreq: 110,            // A2; cell.slice = semis above this

  maxParticles: 320,

  // UI sizing — applied by ui.js but kept here for grep-ability.
  cellPxMin: 7,
  cellPxMax: 14,
  trackColW: 7,               // glyph cells per pattern track column
  prefix: 4,                  // step-number column
  rightPanelW: 28,            // glyph cells reserved on the right
};

export const CLAMPS = {
  bpm:    [40, 320],
  pitch:  [-48, 48],
  gate:   [5, 200],
  prob:   [0, 100],
  slice:  [0, 63],
  micro:  [-50, 50],
  trkGain:[0, 1.4],
  trkPan: [-1, 1],
  satDrive:[0, 1],
  masterGain:[0, 1.4],
};

export const EMPTY_CELL = Object.freeze({
  active: false,
  slice: 0,
  pitch: 0,
  gate: 80,
  retrig: 1,
  prob: 100,
  micro: 0,
  grain: false,    // generic "accent" toggle — voice-dependent: SAMPLE → grain burst inside slice; GRAIN → wider/denser cloud; FM → 2× modulation index; DRUM → +30% velocity accent
});

export const FIELD_ORDER = ['slice', 'pitch', 'gate', 'retrig', 'prob', 'micro', 'grain'];

// Glyph palette (no images). All printable, monospace-friendly.
export const GLYPHS = {
  cellOff:    '·',
  cellOn:     '■',
  cellGrain:  '◈',
  cellRetrig: '⟫',
  cellAccent: '◆',
  cellHeavy:  '█',
  cellMed:    '▓',
  cellLite:   '░',
  cellShadeL: '░',
  cellShadeM: '▒',
  cellShadeH: '▓',
  playhead:   '▶',
  cursor:     '▮',
  vBar:       '│',
  hBar:       '─',
  corner:     '┼',
  meterFull:  '█',
  meterHalf:  '▌',
  meterEmpty: ' ',
  knobBar:    '█',
  knobEmpty:  '░',
  knobThumb:  '◆',
  arrowU:     '▲',
  arrowD:     '▼',
  arrowL:     '◀',
  arrowR:     '▶',
  star:       '✦',
  diamond:    '◇',
  block:      '█',
  cornerTL:   '┌',
  cornerTR:   '┐',
  cornerBL:   '└',
  cornerBR:   '┘',
  tabHead:    '▌',
  ditto:      '⁞',
  triLeft:    '◀',
  triRight:   '▶',
  triUp:      '▲',
  triDown:    '▼',
};

// Combining marks for zalgo. Layered onto active cells in proportion to
// retrig (above) and grain density (below), with both for accent.
export const ZALGO_ABOVE = [
  '̍','̎','̄','̅','̿','̑','̆','̐','͒','͗','͑','̇','̈','̊','͂','̓','̈́','͊','͋','͌','̃','̂','̌','͐','̀','́','̋','̏','̒','̓','̔','̽','̉','ͣ','ͤ','ͥ','ͦ','ͧ','ͨ','ͩ','ͪ','ͫ','ͬ','ͭ','ͮ','ͯ','̾','͛','͆','̚',
];
export const ZALGO_MIDDLE = [
  '̕','̛','̀','́','͘','̡','̢','̧','̨','̴','̵','̶','͏','͜','͝','͞','͟','͠','͢','̸','̷','͡','҉',
];
export const ZALGO_BELOW = [
  '̖','̗','̘','̙','̜','̝','̞','̟','̠','̤','̥','̦','̩','̪','̫','̬','̭','̮','̯','̰','̱','̲','̳','̹','̺','̻','̼','ͅ','͇','͈','͉','͍','͎','͓','͔','͕','͖','͙','͚','̣',
];

// Particle palettes — pulled by voice & event type.
export const PARTICLE_GLYPHS = {
  hot:     ['●','◉','◎','◍','◆','◈','★','✦','✺','❋'],
  cool:    ['∘','·','◦','‧','◌','᎒','᎕'],
  noise:   ['▓','▒','░','▌','▐','▀','▄','▂','▆'],
  spark:   ['✦','✧','★','☆','✺','✹','✸','+','✱','✲'],
  break:   ['↑','⇡','↟','⇈','⇪','⇧','⇮'],
  drum:    ['◯','○','◌','◍','◎','●','◐','◑','◒','◓'],
  fm:      ['~','∿','〜','〰','≈','∼','◀','▶'],
};

// Decorative chrome for the title / borders. Use as flavor.
export const CHROME = {
  titleL: '⟦',
  titleR: '⟧',
  bullet: '·',
  star:   '✦',
  div:    '┃',
  hr:     '─',
  hr2:    '═',
  hr3:    '━',
  blockT: '▀',
  blockB: '▄',
};
