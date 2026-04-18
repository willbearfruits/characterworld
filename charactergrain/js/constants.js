export const THEMES = {
  VOID: [
    ['BG',      '#05060a'],
    ['INK',     '#eaeaf2'],
    ['HI',      '#9dff7a'],
    ['ACC',     '#5ef2ff'],
    ['WARN',    '#ff5e78'],
    ['DIM',     '#565668'],
    ['PANEL',   '#0a0c14'],
    ['UI',      '#b0b8d0'],
    ['AMBIENT', '#243a2e'],
    ['PHERO',   '#6bbf92'],
    ['CURSOR',  '#ffdc4d'],
    ['VIO',     '#c78bff'],
    ['PNK',     '#ff74c8'],
    ['SUN',     '#ffc933'],
    ['AQU',     '#5ce5c7'],
    ['ORA',     '#ff9e3d'],
    ['SKY',     '#6bb5ff'],
    ['LIM',     '#c4ff5c'],
  ],
};

// Section-header palette — cycled across the right panel.
export const SECTION_COLORS = ['HI', 'ACC', 'SUN', 'VIO', 'PNK', 'AQU', 'ORA', 'LIM', 'SKY'];
export const THEME_NAMES = ['VOID'];

export const ALGOS = ['MYCELIUM', 'CANVAS', 'STORMCELL', 'SORT'];

export const PAINT_TIERS = ['ambientLo', 'ambientHi', 'cool', 'warm', 'hot', 'tip'];

// Colors used to visualize grain tiers on the info strip.
export const TIER_COLORS = {
  ambientLo: '#3a4a40',
  ambientHi: '#6b9080',
  cool:      '#5ef2ff',
  warm:      '#ffd66b',
  hot:       '#ff8870',
  tip:       '#9bffb3',
};

// Flat glyph bank. Each entry carries audio modulation alongside the glyph.
// cents: ±pitch microtune (semitones × 100 of modulation when glyphFx = 1)
// pan:   ±stereo offset (up to ±1)
// sharp: 0 = soft attack / 1 = sharp click attack
// tier:  which heat level picks from this entry
export const FLAT_BANK = [
  // ambientLo (indices 0..4)
  { ch: '.', cents:  -5, pan: -0.1, sharp: 0.10, tier: 'ambientLo' },
  { ch: ',', cents:   0, pan:  0.1, sharp: 0.10, tier: 'ambientLo' },
  { ch: "'", cents:   3, pan: -0.2, sharp: 0.20, tier: 'ambientLo' },
  { ch: '`', cents:  -7, pan:  0.2, sharp: 0.20, tier: 'ambientLo' },
  { ch: '´', cents:   7, pan:  0.0, sharp: 0.10, tier: 'ambientLo' },
  // ambientHi (5..10)
  { ch: '·', cents:   0, pan:  0.0, sharp: 0.20, tier: 'ambientHi' },
  { ch: '◦', cents:  -3, pan: -0.15,sharp: 0.30, tier: 'ambientHi' },
  { ch: '◌', cents:   5, pan:  0.15,sharp: 0.30, tier: 'ambientHi' },
  { ch: '∘', cents:  -5, pan:  0.10,sharp: 0.30, tier: 'ambientHi' },
  { ch: '⋅', cents:  10, pan: -0.10,sharp: 0.25, tier: 'ambientHi' },
  { ch: '∙', cents: -10, pan:  0.00,sharp: 0.30, tier: 'ambientHi' },
  // cool (11..15)
  { ch: '~', cents: -20, pan:  0.3, sharp: 0.40, tier: 'cool' },
  { ch: '≈', cents:  20, pan: -0.3, sharp: 0.40, tier: 'cool' },
  { ch: '⌇', cents:   0, pan:  0.4, sharp: 0.50, tier: 'cool' },
  { ch: '∿', cents:  15, pan: -0.4, sharp: 0.50, tier: 'cool' },
  { ch: '⊶', cents: -15, pan:  0.2, sharp: 0.40, tier: 'cool' },
  // warm (16..21)
  { ch: '○', cents:   0, pan:  0.0, sharp: 0.50, tier: 'warm' },
  { ch: '◐', cents:  25, pan:  0.2, sharp: 0.55, tier: 'warm' },
  { ch: '⊙', cents: -25, pan: -0.2, sharp: 0.60, tier: 'warm' },
  { ch: '⊚', cents:  12, pan:  0.1, sharp: 0.60, tier: 'warm' },
  { ch: '◎', cents: -12, pan: -0.1, sharp: 0.55, tier: 'warm' },
  { ch: '⦿', cents:  35, pan:  0.0, sharp: 0.70, tier: 'warm' },
  // hot (22..29)
  { ch: '●', cents:   0, pan:  0.0, sharp: 0.80, tier: 'hot' },
  { ch: '◉', cents:   0, pan:  0.0, sharp: 0.85, tier: 'hot' },
  { ch: '⬤', cents: -15, pan:  0.0, sharp: 0.90, tier: 'hot' },
  { ch: '☢', cents:  40, pan:  0.0, sharp: 1.00, tier: 'hot' },
  { ch: '✺', cents:  25, pan:  0.3, sharp: 0.90, tier: 'hot' },
  { ch: '✦', cents: -40, pan: -0.3, sharp: 0.95, tier: 'hot' },
  { ch: '✸', cents:  50, pan:  0.0, sharp: 1.00, tier: 'hot' },
  { ch: '✹', cents: -50, pan:  0.0, sharp: 1.00, tier: 'hot' },
  // tip (30..35)
  { ch: '◈', cents:   0, pan:  0.0, sharp: 0.80, tier: 'tip' },
  { ch: '◆', cents:  -5, pan:  0.0, sharp: 0.80, tier: 'tip' },
  { ch: '◊', cents:   5, pan:  0.0, sharp: 0.70, tier: 'tip' },
  { ch: '✧', cents: -10, pan:  0.0, sharp: 0.70, tier: 'tip' },
  { ch: '✯', cents:  10, pan:  0.0, sharp: 0.80, tier: 'tip' },
  { ch: '☥', cents:   0, pan:  0.0, sharp: 0.75, tier: 'tip' },
];

export const BANK_RANGES = {
  ambientLo: [0, 5],
  ambientHi: [5, 11],
  cool:      [11, 16],
  warm:      [16, 22],
  hot:       [22, 30],
  tip:       [30, 36],
};

// Combining marks layered on top of hot cells for extra chaos at high heat.
export const ZALGO_MARKS = [
  '\u0300','\u0301','\u0302','\u0303','\u0304','\u0305','\u0306','\u0307',
  '\u0308','\u030a','\u030b','\u030c','\u030d','\u030e','\u0312','\u0313',
  '\u0314','\u033d','\u0346','\u034a','\u034b','\u034c','\u0350','\u0351','\u0352',
];

// Life-like CA rules. B=birth counts for dead cells, S=survival counts for live.
export const CA_RULES = [
  { name: 'B3/S23',    B: [3],         S: [2, 3] },                 // classic Conway
  { name: 'HighLife',  B: [3, 6],      S: [2, 3] },
  { name: 'Maze',      B: [3],         S: [1, 2, 3, 4, 5] },
  { name: 'Mazectric', B: [3],         S: [1, 2, 3, 4] },
  { name: 'Seeds',     B: [2],         S: [] },
  { name: 'LongLife',  B: [3, 4, 5],   S: [5] },
  { name: 'Anneal',    B: [4, 6, 7, 8],S: [3, 5, 6, 7, 8] },
  { name: 'Replicatr', B: [1, 3, 5, 7],S: [1, 3, 5, 7] },
];

export const DEFAULTS = {
  density: 0.45,
  size: 80,
  spread: 0.15,
  pitch: 0,
  gain: 0.55,
  pheroDecay: 0.5,
  bias: 1.0,
  glyphFx: 0.6,
  sat: 0.35,
  wet: 0.2,
  caDens: 0.3,
  caRule: 0,
  stretch: 0.3,
  maxTips: 48,
  regrow: 0.6,
  branchP: 0.18,
  dieP: 0.015,
  pitchRangeSemi: 24,
  pheroDeposit: 0.22,
};

export const CLAMPS = {
  density:    [0, 1],
  size:       [5, 400],
  spread:     [0, 1],
  pitch:      [-36, 36],
  gain:       [0, 1],
  pheroDecay: [0.05, 5],
  bias:       [0, 3],
  glyphFx:    [0, 1],
  sat:        [0, 1],
  wet:        [0, 1],
  caDens:     [0, 1],
  stretch:    [0, 1],
};

export const MENUS = {
  FILE: [
    { id: 'file:load',    label: 'Load audio file…',  key: 'L' },
    { id: 'file:default', label: 'Reset to pink noise', key: '' },
    { id: '---' },
    { id: 'file:recPanel', label: 'Recorder…',           key: 'F8' },
    { id: 'file:recStart', label: 'Record master → WAV', key: 'F9' },
    { id: 'file:recStop',  label: 'Stop record & save',  key: 'F10' },
    { id: '---' },
    { id: 'file:snipSave', label: 'Save snippet (current state)', key: 'F5' },
    { id: 'file:snipClear', label: 'Clear all snippets', key: '' },
  ],
  ALGO: [
    { id: 'algo:0', label: '1 MYCELIUM',   key: '1' },
    { id: 'algo:1', label: '2 CANVAS',     key: '2' },
    { id: 'algo:2', label: '3 STORMCELL',  key: '3' },
    { id: 'algo:3', label: '4 SORT (soon)', key: '4' },
    { id: '---' },
    { id: 'algo:reset',  label: 'Reseed / reset', key: 'R' },
    { id: 'algo:caRule', label: 'Cycle CA rule',  key: 'T' },
    { id: 'algo:caSeed', label: 'Reseed stormcell', key: 'Y' },
    { id: '---' },
    { id: 'algo:canvasClear', label: 'Clear canvas',      key: 'Shift+R' },
    { id: 'algo:canvasRand',  label: 'Randomize canvas',  key: '' },
  ],
  FX: [
    { id: 'fx:pure',   label: 'Pure (glyphFx = 0)', key: '' },
    { id: 'fx:mid',    label: 'Balanced (glyphFx = 0.6)', key: '' },
    { id: 'fx:max',    label: 'Chaos (glyphFx = 1)', key: '' },
    { id: '---' },
    { id: 'fx:dry',    label: 'Dry (wet = 0)',      key: '' },
    { id: 'fx:wetlo',  label: 'Wet low (0.25)',     key: '' },
    { id: 'fx:wethi',  label: 'Wet high (0.8)',     key: '' },
    { id: '---' },
    { id: 'fx:satlo',  label: 'Clean (sat = 0.1)',  key: '' },
    { id: 'fx:sathi',  label: 'Crunch (sat = 0.9)', key: '' },
  ],
  PREFS: [
    { id: 'prefs:src:master',  label: 'Record source: Master (post-gain)', key: '' },
    { id: 'prefs:src:limiter', label: 'Record source: Limiter (pre-gain)', key: '' },
    { id: 'prefs:src:dry',     label: 'Record source: Dry (pre-limiter)',  key: '' },
    { id: '---' },
    { id: 'prefs:out:refresh', label: 'Refresh output devices',            key: '' },
    { id: 'prefs:out:default', label: 'Output: system default',            key: '' },
  ],
  HELP: [
    { id: 'help:keys',  label: 'Keyboard shortcuts…', key: '?' },
    { id: 'help:about', label: 'About charactergrain', key: '' },
  ],
};

export const MENU_NAMES = Object.keys(MENUS);

export const INFO_ROWS = 4;      // grain info strip height
export const SNIPPET_MAX = 6;    // how many snippets to keep
