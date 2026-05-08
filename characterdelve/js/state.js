// characterdelve global state — single mutable object shared by all modules.

import { PLAYER } from './constants.js';

export const state = {
  // viewport
  w: 0, h: 0,
  tilePx: 22,
  fontPx: 18,
  cols: 0, rows: 0,
  camX: 0, camY: 0,            // top-left tile coordinate (float)

  // running
  running: true,
  paused: false,
  frame: 0,
  time: 0,                      // seconds since start
  dt: 0,
  status: '',
  statusUntil: 0,

  // player
  player: {
    x: 0, y: 0,                 // tile coords (float)
    vx: 0, vy: 0,
    facing: 1,
    hp: PLAYER.startHp,
    maxHp: PLAYER.startHp,
    score: 0,
    depth: 1,                    // dungeon level
  },

  // build = installed modules; counts let stacking work
  build: {
    schedulers: [],              // names of scheduler modules
    fx: [],
    source: 'pinkbuf',
    passives: [],                // names of passive modules
    pitchOffset: 0,
    densityBoost: 0,
    speedBoost: 0,
    rangeBoost: 0,
  },

  // world
  chunks: new Map(),             // key "cx,cy" -> Chunk
  pickups: [],                   // [{ x, y, module }]
  enemies: [],                   // [{ x, y, kind, hp, ... }]
  particles: [],                 // visual grain trail glyphs
  recentGrains: [],              // [{ glyph, color, until }]

  // input
  keys: new Set(),
  gamepad: { connected: false, index: -1, btnA: false, btnB: false, btnX: false, btnY: false, btnLB: false, btnRB: false, lastConnected: 0 },

  // audio
  audio: {
    ctx: null,
    master: null,
    saturator: null,
    limiter: null,
    convolver: null,
    wetBus: null,
    sourceBuffer: null,
  },
};

export function setStatus(msg, durSec = 2.5) {
  state.status = msg;
  state.statusUntil = state.time + durSec;
}
