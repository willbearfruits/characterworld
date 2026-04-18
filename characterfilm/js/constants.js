// Density ramps: darkest → brightest. Empty cells stay as ' '.
export const RAMPS = {
  MINIMAL:  ' .:-=+*#%@',
  BLOCKS:   ' ░▒▓█',
  DOTS:     ' ·•∘○◍●',
  DENSE:    " .,:;i1tfLCG08@",
  GLITCH:   " ·:¦†§¶▓█",
  BOX:      ' ┄┈─┼╋█',
  HATCH:    ' ╱╲╳▚▞▜▟█',
  BINARY:   ' 01',
  NUMERIC:  ' 12345678',
  ASCII:    " `.',:;!iltrsfLGJ0O8#@",
};
export const RAMP_NAMES = Object.keys(RAMPS);

// Palettes — indexed. Entry 0 is always background (rendered as no-char).
export const THEMES = {
  VOID: [
    ['BG',    '#030403'],
    ['INK',   '#d8f0c0'],
    ['HI',    '#fff16a'],
    ['ACC',   '#6ab7ff'],
    ['WARM',  '#ff8a5c'],
    ['COOL',  '#6eeac0'],
    ['DIM',   '#566956'],
    ['LOW',   '#2a3a2a'],
  ],
  PAPER: [
    ['BG',    '#f3ead4'],
    ['INK',   '#1a1410'],
    ['HI',    '#d1361b'],
    ['ACC',   '#264080'],
    ['WARM',  '#b5651d'],
    ['COOL',  '#3a7a50'],
    ['DIM',   '#7a6f56'],
    ['LOW',   '#bfb090'],
  ],
  BRUISE: [
    ['BG',    '#090216'],
    ['INK',   '#dcd3f5'],
    ['HI',    '#ff6ae0'],
    ['ACC',   '#6affd3'],
    ['WARM',  '#ffb36a'],
    ['COOL',  '#6a8aff'],
    ['DIM',   '#5a4a80'],
    ['LOW',   '#2a1a50'],
  ],
  MONO: [
    ['BG',    '#000000'],
    ['INK',   '#ffffff'],
    ['HI',    '#cccccc'],
    ['ACC',   '#888888'],
    ['WARM',  '#aaaaaa'],
    ['COOL',  '#666666'],
    ['DIM',   '#444444'],
    ['LOW',   '#222222'],
  ],
};
export const THEME_NAMES = Object.keys(THEMES);

// Tool modes for per-frame editing.
export const MODES = [
  { id: 'BRUSH',   key: 'b', glyph: '●' },
  { id: 'PENCIL',  key: 'p', glyph: '·' },
  { id: 'ERASE',   key: 'e', glyph: '◌' },
  { id: 'FILL',    key: 'f', glyph: '▣' },
  { id: 'EYEDROP', key: 'i', glyph: '◉' },
];
export const MODE_KEY = Object.fromEntries(MODES.map(m => [m.key, m.id]));

export const COLOR_MODES = ['MONO', 'QUANTIZED', 'EDGE', 'TRUE'];

// Sentinel palette index that means "read color from frame.rgb[i*3..i*3+2] instead of the theme palette".
// Chosen as 255 because theme palettes are never longer than 16 entries in practice.
export const RGB_SENTINEL = 255;

// Glyph set for the brush picker (not the ramp — tools use this).
export const GLYPH_PICKER = [
  '●','◯','◉','◌','◍','◆','◇','◢','◣','◤','◥',
  '▓','▒','░','█','▀','▄','▌','▐',
  '┼','╳','╋','╬','┃','━','┏','┓','┗','┛',
  '·','∘','○','•','◦','⋮','⋯','⋰','⋱',
  '†','‡','§','¶','¦','|','/','\\','*','+','-','=',
];

// Source kinds.
export const SRC_NONE = 0, SRC_WEBCAM = 1, SRC_VIDEO = 2, SRC_IMAGE = 3;

export const MAX_FRAMES = 600;       // hard cap (~20s @ 30fps)
export const DEFAULT_FPS = 12;
export const DEFAULT_COLS = 120;
export const DEFAULT_ROWS = 60;
export const HIST_MAX = 64;

// Grid-size presets. Character cells render ~2x taller than wide, so a ~2:1 cols:rows
// ratio feels square on screen. Pick a larger preset for a smaller font / finer resolution.
export const GRID_PRESETS = [
  { label: 'XS',  cols: 60,  rows: 30  },
  { label: 'S',   cols: 100, rows: 50  },
  { label: 'M',   cols: 160, rows: 80  },
  { label: 'L',   cols: 240, rows: 120 },
  { label: 'XL',  cols: 320, rows: 160 },
];
