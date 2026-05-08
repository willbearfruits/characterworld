// characterdelve constants — glyphs, palettes, item & enemy catalogs.

export const PALETTE = {
  bg:        '#050608',
  void:      '#0c0e14',
  dim:       '#272d3a',
  text:      '#c8ccd2',
  wall:      '#3a4256',
  floor:     '#1a1e28',
  player:    '#ffd066',
  enemy:     '#ff6678',
  pickup:    '#74e0c8',
  hot:       '#ff9c4d',
  cool:      '#7aaeff',
  alert:     '#ff5566',
  hud:       '#888c98',
  ghost:     '#5a4a78',
};

// Glyph alphabets used by procgen for tile decoration.
export const GLYPHS = {
  wall:    '#▓▒░',
  floor:   '·.,˙‧⋅',
  rubble:  '*+°^',
  decay:   '~≈≋',
  void:    ' ',
  player:  '@',
  ghost:   '@',
};

// Items the player can pick up. Each is a "sound module" that plugs into
// the build. type: \scheduler | fx | source | passive.
export const MODULES = {
  // scheduler bumps — change how grains fire on movement
  mycelium:  { type: 'scheduler',  glyph: 'M', desc: 'grains spread on each step',  rarity: 1, color: '#74e0c8' },
  stormcell: { type: 'scheduler',  glyph: 'S', desc: 'grains pulse in clusters',     rarity: 2, color: '#ff9c4d' },
  scan:      { type: 'scheduler',  glyph: '⟿', desc: 'continuous playhead drift',    rarity: 2, color: '#7aaeff' },
  sort:      { type: 'scheduler',  glyph: '↯', desc: 'rearranges grain order',       rarity: 3, color: '#ff6678' },

  // fx — modify the master chain
  saturator: { type: 'fx',         glyph: 'σ', desc: '+saturation',                  rarity: 1, color: '#ff9c4d' },
  reverb:    { type: 'fx',         glyph: 'ρ', desc: '+reverb wet',                  rarity: 1, color: '#74e0c8' },
  delay:     { type: 'fx',         glyph: 'δ', desc: '+feedback delay',              rarity: 2, color: '#ffd066' },
  lowpass:   { type: 'fx',         glyph: 'λ', desc: 'darken master',                rarity: 1, color: '#5a4a78' },

  // source — change the grain buffer character
  pinkbuf:   { type: 'source',     glyph: 'p', desc: 'pink-noise source',            rarity: 1, color: '#c8ccd2' },
  toneburst: { type: 'source',     glyph: 't', desc: 'tonal source',                 rarity: 2, color: '#74e0c8' },
  glitchbuf: { type: 'source',     glyph: 'g', desc: 'glitch buffer',                rarity: 3, color: '#ff5566' },

  // passive — stat tweaks
  speed:     { type: 'passive',    glyph: '»', desc: '+walking speed',               rarity: 1, color: '#ffd066' },
  range:     { type: 'passive',    glyph: '◇', desc: '+grain range on encounter',    rarity: 2, color: '#74e0c8' },
  pitchUp:   { type: 'passive',    glyph: '♯', desc: '+1 octave',                    rarity: 1, color: '#7aaeff' },
  pitchDn:   { type: 'passive',    glyph: '♭', desc: '−1 octave',                    rarity: 1, color: '#ff9c4d' },
  density:   { type: 'passive',    glyph: '※', desc: '+density',                     rarity: 1, color: '#ffd066' },
};

// Procedural enemy templates — each rolls a glyph, a sound character, and HP.
export const ENEMY_KINDS = [
  { name: 'mote',    glyph: '°', hp: 1, speed: 0.6, color: '#ff6678', noteOffset: -7 },
  { name: 'wisp',    glyph: 'ⱷ', hp: 2, speed: 0.4, color: '#7aaeff', noteOffset:  4 },
  { name: 'crawler', glyph: 'ɥ', hp: 3, speed: 0.5, color: '#ff9c4d', noteOffset: -3 },
  { name: 'dirge',   glyph: 'Ϟ', hp: 4, speed: 0.3, color: '#5a4a78', noteOffset: -12 },
  { name: 'siren',   glyph: 'φ', hp: 2, speed: 0.7, color: '#ffd066', noteOffset:  7 },
];

export const TILE_PX = 22;       // baseline glyph cell size in canvas px
export const FONT_PX = 18;       // baseline font size

export const CHUNK = {
  cols: 32,
  rows: 24,
};

// Movement
export const PLAYER = {
  baseSpeed: 6.5,        // tiles per second
  pickupRadius: 0.7,
  encounterRadius: 0.9,
  startHp: 5,
};

// Audio
export const AUDIO = {
  baseGrainDur: 0.18,
  baseGrainGain: 0.5,
  baseDensity: 0.4,
  basePitchSemi: 0,
  reverbSecs: 1.7,
};
