import { state } from './state.js';
import { DEFAULTS, FLAT_BANK, BANK_RANGES, ZALGO_MARKS, CA_RULES } from './constants.js';
import { fireGrain } from './audio.js';

function idx(x, y) { return y * state.cols + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < state.cols && y < state.rows; }
function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

function ensureSharedGrid() {
  const n = state.cols * state.rows;
  if (!state.heat || state.heat.length !== n) state.heat = new Float32Array(n);
  if (!state.cellGlyph || state.cellGlyph.length !== n) state.cellGlyph = new Int16Array(n);
  if (!state.cellZalgo || state.cellZalgo.length !== n) state.cellZalgo = new Int8Array(n);
}

export function pickGlyphIdx(tier) {
  const [lo, hi] = BANK_RANGES[tier] || [0, FLAT_BANK.length];
  return lo + ((Math.random() * (hi - lo)) | 0);
}

function tierForHeat(h) {
  if (h > 0.75) return 'hot';
  if (h > 0.45) return 'warm';
  if (h > 0.18) return 'cool';
  if (h > 0.05) return 'ambientHi';
  return 'ambientLo';
}

function stampGlyph(i, tier, allowZalgo) {
  const bankIdx = pickGlyphIdx(tier);
  state.cellGlyph[i] = bankIdx + 1;
  if (allowZalgo && Math.random() < 0.55) {
    state.cellZalgo[i] = 1 + ((Math.random() * ZALGO_MARKS.length) | 0);
  } else {
    state.cellZalgo[i] = 0;
  }
  return bankIdx;
}

function fireFromCell(x, y, bankIdx, gainScale, posBias) {
  const { size, spread, pitch, glyphFx, wet } = state.knobs;
  const entry = FLAT_BANK[bankIdx] || FLAT_BANK[0];
  const pitchSpan = DEFAULTS.pitchRangeSemi;
  let posNorm;
  if (state.scan && state.scan.on) {
    // Scan mode: every grain fires from the slow-moving playhead with tiny
    // jitter (scaled down so content stays recognizable even at high spread).
    const jit = (Math.random() - 0.5) * spread * 0.05;
    posNorm = clamp01(state.scan.pos + jit);
  } else {
    const jitter = (Math.random() - 0.5) * spread;
    posNorm = clamp01((posBias != null ? posBias : (x / Math.max(1, state.cols - 1))) + jitter);
  }
  const vy = (state.rows > 1) ? (y - (state.rows - 1) / 2) / ((state.rows - 1) / 2) : 0;
  const pitchSemi = pitch - vy * pitchSpan;
  const dur = size * (0.6 + Math.random() * 0.8);
  const g = gainScale;
  const cents = entry.cents * glyphFx;
  const finalPan = Math.max(-1, Math.min(1, entry.pan * glyphFx + (Math.random() - 0.5) * 0.2));
  const finalSharp = 0.4 * (1 - glyphFx) + entry.sharp * glyphFx;
  fireGrain(posNorm, pitchSemi, dur, g, finalPan, cents, finalSharp, wet, bankIdx);
}

// ──────────────────────────────────────────────────────────────────────────────
// Mycelium
// ──────────────────────────────────────────────────────────────────────────────

export function initMycelium() {
  ensureSharedGrid();
  const n = state.cols * state.rows;
  const nutrient = new Float32Array(n);
  const pheromone = new Float32Array(n);
  nutrient.fill(1);
  const tips = [];
  for (let i = 0; i < 4; i++) {
    tips.push({
      cx: Math.floor(state.cols / 2) + ((Math.random() - 0.5) * 6 | 0),
      cy: Math.floor(state.rows / 2) + ((Math.random() - 0.5) * 2 | 0),
      energy: 1,
      accum: 0,
    });
  }
  state.myc = { nutrient, pheromone, tips };
  state.stormcell = null;
  state.canvas = null;
  state.heat.fill(0);
  state.cellGlyph.fill(0);
  state.cellZalgo.fill(0);
}

function neighborScores(cx, cy) {
  const { nutrient, pheromone } = state.myc;
  const bias = state.knobs.bias;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const out = [];
  let sum = 0;
  for (const [dx, dy] of dirs) {
    const nx = cx + dx, ny = cy + dy;
    if (!inBounds(nx, ny)) { out.push({ dx, dy, w: 0 }); continue; }
    const i = idx(nx, ny);
    const w = Math.max(0.01, nutrient[i] + pheromone[i] * bias);
    sum += w;
    out.push({ dx, dy, w });
  }
  return { out, sum };
}

export function tickMycelium(dt) {
  ensureSharedGrid();
  if (!state.myc || state.myc.nutrient.length !== state.cols * state.rows) initMycelium();
  const { nutrient, pheromone, tips } = state.myc;
  const n = nutrient.length;

  const regrow = DEFAULTS.regrow * dt;
  const phDecay = Math.exp(-dt * state.knobs.pheroDecay);
  const heatDecay = Math.exp(-dt * 3.5);
  for (let i = 0; i < n; i++) {
    nutrient[i] = Math.min(1, nutrient[i] + regrow);
    pheromone[i] *= phDecay;
    state.heat[i] *= heatDecay;
  }

  const { density } = state.knobs;
  const perTipRate = 2 + density * 22;

  for (let t = tips.length - 1; t >= 0; t--) {
    const tip = tips[t];
    if (!inBounds(tip.cx, tip.cy)) { tips.splice(t, 1); continue; }
    const i = idx(tip.cx, tip.cy);
    const nu = nutrient[i];
    tip.accum += perTipRate * dt * (0.2 + 0.8 * nu);

    while (tip.accum >= 1) {
      tip.accum -= 1;
      const heatHere = state.heat[i];
      const tier = tierForHeat(Math.max(heatHere, 0.5));
      let bankIdx;
      if (state.cellGlyph[i] === 0 || Math.random() < 0.35) {
        bankIdx = stampGlyph(i, tier, heatHere > 0.65);
      } else {
        bankIdx = state.cellGlyph[i] - 1;
      }
      fireFromCell(tip.cx, tip.cy, bankIdx, 0.35 * (0.55 + 0.45 * nu));
      state.heat[i] = Math.min(1, state.heat[i] + 0.55);
      nutrient[i] = Math.max(0, nutrient[i] - 0.12);
      pheromone[i] = Math.min(1, pheromone[i] + DEFAULTS.pheroDeposit);
    }

    if (Math.random() < DEFAULTS.branchP * (0.3 + density)) {
      const { out, sum } = neighborScores(tip.cx, tip.cy);
      if (sum > 0 && tips.length < DEFAULTS.maxTips) {
        let r = Math.random() * sum;
        for (const d of out) {
          r -= d.w;
          if (r <= 0) {
            const nx = tip.cx + d.dx, ny = tip.cy + d.dy;
            tips.push({ cx: nx, cy: ny, energy: Math.max(0.3, tip.energy * 0.85), accum: 0 });
            break;
          }
        }
      }
    }

    tip.energy -= dt * 0.25 * (1 - nu);
    if (tip.energy <= 0 || Math.random() < DEFAULTS.dieP) {
      tips.splice(t, 1);
    }
  }

  if (tips.length === 0) {
    for (let i = 0; i < 3; i++) {
      tips.push({
        cx: (Math.random() * state.cols) | 0,
        cy: (Math.random() * state.rows) | 0,
        energy: 1,
        accum: 0,
      });
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CANVAS — grains live as a painted field of glyphs. Hover reveals them:
// mouse motion through a cell with a painted glyph fires that glyph. Empty
// cells are silent. Paint by left-dragging; erase with shift. Use the paint
// tier panel to pick which glyph tier lands where you draw.
// ──────────────────────────────────────────────────────────────────────────────

export function initCanvas() {
  ensureSharedGrid();
  const n = state.cols * state.rows;
  const painted = new Int16Array(n);   // 0 = empty, else bank idx + 1
  const accum = new Float32Array(n);   // per-cell cooldown accum so a parked mouse doesn't machine-gun
  state.canvas = { painted, accum };
  state.myc = null;
  state.stormcell = null;
  state.heat.fill(0);
  state.cellGlyph.fill(0);
  state.cellZalgo.fill(0);
}

export function clearCanvas() {
  if (!state.canvas) initCanvas();
  state.canvas.painted.fill(0);
  state.canvas.accum.fill(0);
  state.heat.fill(0);
  state.cellGlyph.fill(0);
  state.cellZalgo.fill(0);
}

export function randomizeCanvas() {
  if (!state.canvas) initCanvas();
  const { painted } = state.canvas;
  const tiers = ['ambientLo', 'ambientHi', 'cool', 'warm', 'hot', 'tip'];
  for (let i = 0; i < painted.length; i++) {
    if (Math.random() < 0.4) {
      const tier = tiers[(Math.random() * tiers.length) | 0];
      const idx = pickGlyphIdx(tier);
      painted[i] = idx + 1;
      state.cellGlyph[i] = idx + 1;
      if (tier === 'hot' && Math.random() < 0.5) {
        state.cellZalgo[i] = 1 + ((Math.random() * ZALGO_MARKS.length) | 0);
      }
    } else {
      painted[i] = 0;
    }
  }
}

export function paintCellAt(cx, cy, tier, erase) {
  if (!state.canvas) initCanvas();
  if (!inBounds(cx, cy)) return;
  const i = idx(cx, cy);
  if (erase) {
    state.canvas.painted[i] = 0;
    state.cellGlyph[i] = 0;
    state.cellZalgo[i] = 0;
    return;
  }
  const bankIdx = state.paint.glyphIdx >= 0 ? state.paint.glyphIdx : pickGlyphIdx(tier || state.paint.tier);
  state.canvas.painted[i] = bankIdx + 1;
  state.cellGlyph[i] = bankIdx + 1;
  if (state.paint.zalgo) {
    state.cellZalgo[i] = 1 + ((Math.random() * ZALGO_MARKS.length) | 0);
  } else {
    state.cellZalgo[i] = 0;
  }
}

// Called by input on mouse motion — bresenham between prev and current field
// cell so fast sweeps don't miss any painted grains.
function bresenhamCells(x0, y0, x1, y1, fn) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  const safety = dx + dy + 2;
  for (let k = 0; k < safety; k++) {
    fn(x, y);
    if (x === x1 && y === y1) return;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
}

export function canvasHoverFire() {
  if (state.algo !== 1 || !state.canvas) return;
  const m = state.mouse;
  if (!m.inField) return;
  const cur = [m.fx, m.fy];
  const prev = (m.prevFx >= 0 && m.prevFy >= 0) ? [m.prevFx, m.prevFy] : cur;
  const { painted, accum } = state.canvas;
  const fire = (x, y) => {
    if (!inBounds(x, y)) return;
    const i = idx(x, y);
    if (!painted[i]) return;
    if (accum[i] > 0) return;      // cooldown — prevents re-trigger within a short window
    accum[i] = 0.08;               // 80ms cooldown
    const bankIdx = painted[i] - 1;
    fireFromCell(x, y, bankIdx, 0.55);
    state.heat[i] = Math.min(1, state.heat[i] + 0.6);
  };
  bresenhamCells(prev[0], prev[1], cur[0], cur[1], fire);
}

export function tickCanvas(dt) {
  ensureSharedGrid();
  if (!state.canvas || state.canvas.painted.length !== state.cols * state.rows) initCanvas();
  const heatDecay = Math.exp(-dt * 2.5);
  const { accum, painted } = state.canvas;
  for (let i = 0; i < state.heat.length; i++) {
    state.heat[i] *= heatDecay;
    if (accum[i] > 0) accum[i] = Math.max(0, accum[i] - dt);
  }
  const dens = state.knobs.density;
  const seq = state.canvasSeq;

  // Sequencer: step through painted cells in grid order at density-driven rate.
  if (seq && seq.on && painted.length > 0) {
    const rate = Math.max(1, dens * 40 * (seq.rateMul || 1));   // steps/sec
    seq.accum += dt * rate;
    let steps = 0;
    while (seq.accum >= 1 && steps < 32) {
      seq.accum -= 1; steps++;
      const N = painted.length;
      let found = -1;
      for (let k = 0; k < N; k++) {
        const i = (seq.pos + k) % N;
        if (painted[i]) { found = i; break; }
      }
      if (found < 0) break;   // nothing painted
      const x = found % state.cols, y = (found / state.cols) | 0;
      fireFromCell(x, y, painted[found] - 1, 0.45);
      state.heat[found] = Math.min(1, state.heat[found] + 0.5);
      seq.pos = (found + 1) % N;
    }
  } else {
    // Ambient breathing when sequencer is off — density retriggers random painted cells.
    const ambientHz = dens * 8;
    if (ambientHz > 0 && painted.length > 0) {
      const expect = ambientHz * dt;
      if (Math.random() < expect) {
        const N = painted.length;
        const start = (Math.random() * N) | 0;
        for (let k = 0; k < N; k++) {
          const i = (start + k) % N;
          if (painted[i]) {
            const x = i % state.cols, y = (i / state.cols) | 0;
            fireFromCell(x, y, painted[i] - 1, 0.25);
            state.heat[i] = Math.min(1, state.heat[i] + 0.3);
            break;
          }
        }
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Stormcell
// ──────────────────────────────────────────────────────────────────────────────

export function initStormcell() {
  ensureSharedGrid();
  const n = state.cols * state.rows;
  const ca = new Uint8Array(n);
  const caNext = new Uint8Array(n);
  const dens = state.knobs.caDens;
  for (let i = 0; i < n; i++) ca[i] = Math.random() < dens ? 1 : 0;
  state.stormcell = { ca, caNext, accum: 0 };
  state.myc = null;
  state.canvas = null;
  state.heat.fill(0);
  state.cellGlyph.fill(0);
  state.cellZalgo.fill(0);
}

export function reseedStormcell() {
  if (!state.stormcell) { initStormcell(); return; }
  const { ca } = state.stormcell;
  const dens = state.knobs.caDens;
  for (let i = 0; i < ca.length; i++) ca[i] = Math.random() < dens ? 1 : 0;
}

function neighborCount(ca, x, y) {
  const W = state.cols, H = state.rows;
  let c = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = (x + dx + W) % W;
      const ny = (y + dy + H) % H;
      c += ca[ny * W + nx];
    }
  }
  return c;
}

function stepCA(rule) {
  const { ca, caNext } = state.stormcell;
  const W = state.cols, H = state.rows;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const alive = ca[i];
      const nc = neighborCount(ca, x, y);
      let next = 0;
      if (alive) next = rule.S.indexOf(nc) >= 0 ? 1 : 0;
      else       next = rule.B.indexOf(nc) >= 0 ? 1 : 0;
      caNext[i] = next;
    }
  }
  ca.set(caNext);
}

function fireLiveCells() {
  const { ca } = state.stormcell;
  const { density } = state.knobs;
  const W = state.cols, H = state.rows;
  const budget = 5 + density * 80;
  let fired = 0;
  const n = ca.length;
  const start = (Math.random() * n) | 0;
  for (let k = 0; k < n && fired < budget; k++) {
    const i = (start + k) % n;
    if (!ca[i]) continue;
    const x = i % W, y = (i / W) | 0;
    const nc = neighborCount(ca, x, y);
    const tier = nc >= 6 ? 'hot' : nc >= 4 ? 'warm' : nc >= 2 ? 'cool' : 'ambientHi';
    let bankIdx;
    if (state.cellGlyph[i] === 0 || Math.random() < 0.25) bankIdx = stampGlyph(i, tier, nc >= 6);
    else bankIdx = state.cellGlyph[i] - 1;
    fireFromCell(x, y, bankIdx, 0.28 + 0.1 * (nc / 8));
    state.heat[i] = Math.min(1, state.heat[i] + 0.4);
    fired++;
  }
}

export function tickStormcell(dt) {
  ensureSharedGrid();
  if (!state.stormcell || state.stormcell.ca.length !== state.cols * state.rows) initStormcell();
  const heatDecay = Math.exp(-dt * 3.0);
  for (let i = 0; i < state.heat.length; i++) state.heat[i] *= heatDecay;

  const rule = CA_RULES[state.knobs.caRule % CA_RULES.length];
  const stepHz = 3 + state.knobs.density * 14;
  state.stormcell.accum += dt * stepHz;
  while (state.stormcell.accum >= 1) {
    state.stormcell.accum -= 1;
    stepCA(rule);
    fireLiveCells();
  }
}

export function tickSort(dt) { ensureSharedGrid(); }

// Advance the scan playhead. Stretch = 0 → 1× realtime, stretch = 1 → ~200×
// slow, PaulStretch-territory drone. Call from main tick when playing.
export function advanceScan(dt) {
  if (!state.scan || !state.scan.on) return;
  if (!state.buffer) return;
  const stretch = state.knobs.stretch == null ? 0.3 : state.knobs.stretch;
  const factor = 1 + stretch * 199;  // 1..200
  state.scan.pos += dt / (Math.max(0.1, state.buffer.duration) * factor);
  if (state.scan.pos >= 1) state.scan.pos -= 1;
  if (state.scan.pos < 0) state.scan.pos += 1;
}

export function tickScheduler(dt) {
  if (state.algo === 0) tickMycelium(dt);
  else if (state.algo === 1) tickCanvas(dt);
  else if (state.algo === 2) tickStormcell(dt);
  else if (state.algo === 3) tickSort(dt);
}

export function seedTipAt(cx, cy) {
  if (state.algo !== 0) return;
  if (!state.myc) initMycelium();
  if (!inBounds(cx, cy)) return;
  if (state.myc.tips.length >= DEFAULTS.maxTips) state.myc.tips.shift();
  state.myc.tips.push({ cx, cy, energy: 1, accum: 0 });
}

export function clearTipsNear(cx, cy, radius) {
  if (!state.myc) return;
  const r2 = radius * radius;
  state.myc.tips = state.myc.tips.filter(t => {
    const dx = t.cx - cx, dy = t.cy - cy;
    return (dx * dx + dy * dy) > r2;
  });
}

export function paintNutrientAt(cx, cy, strength) {
  if (!state.myc || !inBounds(cx, cy)) return;
  const { nutrient } = state.myc;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const i = idx(nx, ny);
      const falloff = (dx === 0 && dy === 0) ? 1 : 0.5;
      nutrient[i] = Math.min(1, nutrient[i] + strength * falloff);
    }
  }
}

export function toggleCellAt(cx, cy) {
  if (state.algo !== 2) return;
  if (!state.stormcell) initStormcell();
  if (!inBounds(cx, cy)) return;
  const i = idx(cx, cy);
  state.stormcell.ca[i] = state.stormcell.ca[i] ? 0 : 1;
}

export function resetForAlgo() {
  if (state.algo === 0) initMycelium();
  else if (state.algo === 1) initCanvas();
  else if (state.algo === 2) initStormcell();
  else ensureSharedGrid();
}
