import { state } from './state.js';
import {
  THEMES, THEME_NAMES, ALGOS, FLAT_BANK, BANK_RANGES, PAINT_TIERS,
  ZALGO_MARKS, CA_RULES, MENUS, MENU_NAMES, TIER_COLORS, SECTION_COLORS,
} from './constants.js';
import { getAudioInfo, getRecordLevel, audioNow } from './audio.js';

const LAYOUT = {
  menuRows: 1,
  panelCols: 26,
  waveRows: 3,
  infoRows: 4,
  statusRows: 1,
};

let ctx = null;
let cw = 0, ch = 0;
let cell = 14;

export function initUI(canvas) { ctx = canvas.getContext('2d'); }

export function resizeUI(canvas, w, h, dpr) {
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = Math.max(10, Math.min(18, Math.floor(Math.min(w, h) / 48)));
  cw = Math.floor(w / cell);
  ch = Math.floor(h / cell);
  state.cols = Math.max(24, cw - LAYOUT.panelCols);
  state.rows = Math.max(10, ch - LAYOUT.menuRows - LAYOUT.waveRows - LAYOUT.infoRows - LAYOUT.statusRows);
  state.ui.cellPx = cell;
  state.ui.menuRows = LAYOUT.menuRows;
  state.ui.panelCols = LAYOUT.panelCols;
  state.ui.waveRows = LAYOUT.waveRows;
  state.ui.infoRows = LAYOUT.infoRows;
  state.ui.statusRows = LAYOUT.statusRows;
  ctx.font = `bold ${Math.floor(cell * 1.02)}px "Courier New", Courier, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
}

function color(name) {
  const theme = THEMES[THEME_NAMES[state.theme]];
  for (const [n, v] of theme) if (n === name) return v;
  return '#ffffff';
}

function hsl(h, s, l) { return `hsl(${h | 0},${s | 0}%,${l | 0}%)`; }

// Rainbow ramp for heat / intensity — low=cool-blue, high=hot-magenta.
function heatColor(h) {
  const hh = Math.max(0, Math.min(1, h));
  const hue = 210 - hh * 280;     // 210 (blue) → -70 ≡ 290 (magenta)
  const light = 34 + hh * 42;
  return hsl((hue + 360) % 360, 92, light);
}

function putChar(glyph, c, r, col) {
  ctx.fillStyle = col;
  ctx.fillText(glyph, c * cell + cell / 2, r * cell + 1);
}

function putStr(s, c, r, col) {
  for (let i = 0; i < s.length; i++) putChar(s[i], c + i, r, col);
}

function fillRow(c, r, w, col) {
  ctx.fillStyle = col;
  ctx.fillRect(c * cell, r * cell, w * cell, cell);
}

function fillRect(c, r, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(c * cell, r * cell, w * cell, h * cell);
}

// ──────────────────────────────────────────────────────────────────────────────
// Button registry — rebuilt each frame.
// ──────────────────────────────────────────────────────────────────────────────

function addBtn(id, c, r, w, h) {
  state.buttons.push({ id, c, r, w, h });
}

export function hitButton(col, row) {
  for (let i = state.buttons.length - 1; i >= 0; i--) {
    const b = state.buttons[i];
    if (col >= b.c && col < b.c + b.w && row >= b.r && row < b.r + b.h) return b;
  }
  return null;
}

function drawBtn(id, label, c, r, w, active, col) {
  const width = Math.max(w, label.length + 2);
  addBtn(id, c, r, width, 1);
  const bg = active ? color('HI') : color('PANEL');
  const fg = active ? color('BG') : (col || color('INK'));
  fillRect(c, r, width, 1, bg);
  const pad = Math.max(0, Math.floor((width - label.length) / 2));
  putStr(label, c + pad, r, fg);
}

function drawTag(id, s, c, r, col) {
  addBtn(id, c, r, s.length, 1);
  putStr(s, c, r, col);
}

// ──────────────────────────────────────────────────────────────────────────────
// Top-level draw
// ──────────────────────────────────────────────────────────────────────────────

export function drawUI() {
  state.buttons = [];
  _sectionIdx = 0;
  ctx.fillStyle = color('BG');
  ctx.fillRect(0, 0, cw * cell, ch * cell);
  drawMenuBar();
  drawField();
  drawPanel();
  drawWaveform();
  drawInfoStrip();
  drawStatus();
  drawMenuDropdown();
  drawRecorderOverlay();
  drawCursor();
}

// ──────────────────────────────────────────────────────────────────────────────
// Recorder overlay — floating panel with live meter, source, device, controls.
// ──────────────────────────────────────────────────────────────────────────────

let _peakHold = 0;
let _peakHoldAt = 0;
function peakHold(peak) {
  const now = performance.now();
  if (peak >= _peakHold || now - _peakHoldAt > 600) {
    _peakHold = peak;
    _peakHoldAt = now;
  } else {
    _peakHold = Math.max(peak, _peakHold - 0.01);
  }
  return _peakHold;
}

function toDb(v) {
  if (v <= 1e-6) return -120;
  return 20 * Math.log10(v);
}

function drawRecorderOverlay() {
  if (!state.recorderOpen) return;
  const w = Math.min(58, cw - 4);
  const h = 14;
  const x = Math.max(1, Math.floor((cw - w) / 2));
  const y = Math.max(1, Math.floor((ch - h) / 2));

  // Backdrop + frame.
  fillRect(x, y, w, h, color('PANEL'));
  for (let k = 0; k < w; k++) { putChar('─', x + k, y, color('DIM')); putChar('─', x + k, y + h - 1, color('DIM')); }
  for (let k = 0; k < h; k++) { putChar('│', x, y + k, color('DIM')); putChar('│', x + w - 1, y + k, color('DIM')); }
  putChar('┌', x, y, color('DIM'));
  putChar('┐', x + w - 1, y, color('DIM'));
  putChar('└', x, y + h - 1, color('DIM'));
  putChar('┘', x + w - 1, y + h - 1, color('DIM'));

  const title = ' RECORDER ';
  putStr(title, x + Math.floor((w - title.length) / 2), y, state.rec.active ? color('WARN') : color('HI'));

  const iL = x + 2;
  let ry = y + 2;
  const srcLabels = { master: 'Master (post-gain)', limiter: 'Limiter (pre-gain)', dry: 'Dry (pre-limiter)' };
  putStr('source: ', iL, ry, color('UI'));
  putStr(srcLabels[state.prefs.recordSource] || state.prefs.recordSource, iL + 8, ry, color('ACC'));
  ry++;
  putStr('output: ', iL, ry, color('UI'));
  const devLabel = state.prefs.outputDeviceLabel || 'default';
  const maxDev = w - 14;
  const clipped = devLabel.length > maxDev ? devLabel.slice(0, maxDev - 1) + '…' : devLabel;
  putStr(clipped, iL + 8, ry, color('ACC'));
  ry++;
  putStr('format: ', iL, ry, color('UI'));
  putStr(state.rec.mime || '(chosen at record start)', iL + 8, ry, color('DIM'));
  ry += 2;

  // Meter.
  const lvl = getRecordLevel();
  const peak = peakHold(lvl.peak);
  const barW = w - 10;
  const barX = iL;
  const rmsCells = Math.max(0, Math.min(barW, Math.round(lvl.rms * barW * 1.2)));
  const peakCells = Math.max(0, Math.min(barW, Math.round(peak * barW * 1.2)));
  putStr('LEVEL ', iL, ry, color('UI'));
  // RMS bar (green-ish) and peak indicator.
  for (let i = 0; i < barW; i++) {
    const hot = i >= barW - 6;
    let col;
    if (i < rmsCells) col = hot ? color('WARN') : color('HI');
    else col = color('DIM');
    putChar(i < rmsCells ? '█' : '·', barX + i, ry + 1, col);
  }
  // Peak marker.
  if (peakCells > 0 && peakCells <= barW) {
    putChar('▌', barX + Math.min(barW - 1, peakCells - 1), ry + 1, peak > 0.95 ? color('WARN') : color('ACC'));
  }
  const peakDb = toDb(peak).toFixed(1);
  const rmsDb = toDb(lvl.rms).toFixed(1);
  const meterTag = `peak ${peakDb}dB   rms ${rmsDb}dB`;
  putStr(meterTag, iL, ry + 2, color('DIM'));
  ry += 4;

  // Elapsed + status.
  const elapsed = state.rec.active ? Math.max(0, audioNow() - state.rec.startTime) : 0;
  const dot = state.rec.active ? '● ' : '  ';
  const dotCol = state.rec.active ? color('WARN') : color('DIM');
  putChar('●', iL, ry, dotCol);
  void dot;
  const tStr = formatTime(elapsed);
  putStr(state.rec.active ? 'REC  ' : 'idle ', iL + 2, ry, state.rec.active ? color('WARN') : color('UI'));
  putStr(tStr, iL + 8, ry, color('INK'));
  if (state.rec.lastFile && !state.rec.active) {
    const prefix = '  last: ';
    const room = w - 4 - 8 - prefix.length;
    const nm = state.rec.lastFile.length > room ? state.rec.lastFile.slice(0, room - 1) + '…' : state.rec.lastFile;
    putStr(prefix + nm, iL + 8 + tStr.length, ry, color('DIM'));
  }
  ry += 2;

  // Buttons.
  if (state.rec.active) {
    drawBtn('file:recStop', '■ stop & save', iL, ry, 16, true, color('BG'));
  } else {
    drawBtn('file:recStart', '● record', iL, ry, 12, false, color('WARN'));
  }
  drawBtn('recorder:close', '[ close ]', x + w - 12, ry, 10, false, color('INK'));
}

// ──────────────────────────────────────────────────────────────────────────────
// Menu bar
// ──────────────────────────────────────────────────────────────────────────────

function drawMenuBar() {
  fillRow(0, 0, cw, color('PANEL'));
  const brand = 'CHARACTERGRAIN';
  for (let i = 0; i < brand.length; i++) {
    putChar(brand[i], 1 + i, 0, hsl((i * 28 + (performance.now() / 40)) % 360, 90, 65));
  }
  let c = 17;
  const menuCols = ['HI', 'ACC', 'SUN', 'VIO', 'PNK'];
  let mi = 0;
  for (const name of MENU_NAMES) {
    const active = state.menuOpen === name;
    const tag = ' ' + name + ' ';
    if (active) {
      fillRect(c, 0, tag.length, 1, color(menuCols[mi % menuCols.length]));
      addBtn('menu:' + name, c, 0, tag.length, 1);
      putStr(tag, c, 0, color('BG'));
    } else {
      drawTag('menu:' + name, tag, c, 0, color(menuCols[mi % menuCols.length]));
    }
    c += tag.length + 1;
    mi++;
  }
  // Right-aligned status: algo, rule, play state, time
  const rule = CA_RULES[state.knobs.caRule % CA_RULES.length];
  const recTag = state.rec.active ? '● REC ' : '';
  const playTag = state.playing ? '>> PLAY' : '|| PAUSE';
  const t = formatTime(state.playElapsed);
  const right = `${recTag}${playTag}  t:${t}  ALGO:${ALGOS[state.algo]}  RULE:${rule.name} `;
  const cRight = Math.max(c + 2, cw - right.length - 1);
  putStr(right, cRight, 0, state.rec.active ? color('WARN') : color('ACC'));
}

function drawMenuDropdown() {
  if (!state.menuOpen) return;
  const items = MENUS[state.menuOpen];
  if (!items) return;
  // Find x position.
  let x = 17;
  for (const name of MENU_NAMES) {
    if (name === state.menuOpen) break;
    x += (' ' + name + ' ').length + 1;
  }
  const maxLabel = Math.max(...items.map(i => i.id === '---' ? 0 : i.label.length));
  const maxKey = Math.max(...items.map(i => i.id === '---' ? 0 : (i.key || '').length));
  const w = maxLabel + maxKey + 5;
  const y = 1;
  const xAdj = Math.min(x, Math.max(0, cw - w - 1));
  const h = items.length + 2;
  fillRect(xAdj, y, w, h, color('PANEL'));
  // Border.
  for (let k = 0; k < w; k++) { putChar('─', xAdj + k, y, color('DIM')); putChar('─', xAdj + k, y + h - 1, color('DIM')); }
  for (let k = 0; k < h; k++) { putChar('│', xAdj, y + k, color('DIM')); putChar('│', xAdj + w - 1, y + k, color('DIM')); }
  putChar('┌', xAdj, y, color('DIM'));
  putChar('┐', xAdj + w - 1, y, color('DIM'));
  putChar('└', xAdj, y + h - 1, color('DIM'));
  putChar('┘', xAdj + w - 1, y + h - 1, color('DIM'));

  let yy = y + 1;
  for (const it of items) {
    if (it.id === '---') {
      for (let k = 1; k < w - 1; k++) putChar('─', xAdj + k, yy, color('DIM'));
    } else {
      addBtn(it.id, xAdj + 1, yy, w - 2, 1);
      const hovered = state.mouse.uiR === yy && state.mouse.uiC >= xAdj + 1 && state.mouse.uiC < xAdj + w - 1;
      if (hovered) fillRect(xAdj + 1, yy, w - 2, 1, color('AMBIENT'));
      putStr(it.label, xAdj + 2, yy, hovered ? color('HI') : color('INK'));
      if (it.key) putStr(it.key, xAdj + w - 2 - it.key.length, yy, color('DIM'));
    }
    yy++;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Field
// ──────────────────────────────────────────────────────────────────────────────

function drawField() {
  const r0 = LAYOUT.menuRows;
  const heat = state.heat;
  const cellGlyph = state.cellGlyph;
  const cellZalgo = state.cellZalgo;
  const nutrient = state.myc && state.myc.nutrient;
  const pheromone = state.myc && state.myc.pheromone;
  const ca = state.stormcell && state.stormcell.ca;
  const painted = state.canvas && state.canvas.painted;

  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const i = y * state.cols + x;
      const h = heat ? heat[i] : 0;
      const glyphSlot = cellGlyph ? cellGlyph[i] : 0;

      // Precedence: fresh heat glyph > CANVAS painted (dim) > stormcell live > pheromone > nutrient
      if (glyphSlot > 0 && h > 0.02) {
        const entry = FLAT_BANK[glyphSlot - 1];
        const tierCol = TIER_COLORS[entry.tier] || color('INK');
        // Blend: cold cells stay in their tier color; hot cells burn toward the
        // heat-ramp (blue→cyan→yellow→magenta) for a rainbow trail.
        const col = h > 0.12 ? heatColor(h) : tierCol;
        let glyph = entry.ch;
        if (cellZalgo && cellZalgo[i] > 0 && h > 0.3) glyph = entry.ch + ZALGO_MARKS[cellZalgo[i] - 1];
        putChar(glyph, x, r0 + y, col);
      } else if (painted && painted[i]) {
        // CANVAS algo: show painted glyph with its tier color, dimmed.
        const entry = FLAT_BANK[painted[i] - 1];
        const tcol = TIER_COLORS[entry.tier] || color('DIM');
        putChar(entry.ch, x, r0 + y, tcol);
      } else if (ca && ca[i]) {
        putChar('·', x, r0 + y, color('AQU'));
      } else if (pheromone && pheromone[i] > 0.08) {
        const p = pheromone[i];
        const g = p > 0.45 ? '∷' : p > 0.2 ? ':' : '.';
        putChar(g, x, r0 + y, hsl(140, 70, 40 + p * 35));
      } else if (nutrient) {
        const n = nutrient[i];
        if (n > 0.8)      putChar('·', x, r0 + y, color('AMBIENT'));
        else if (n > 0.4) putChar('.', x, r0 + y, color('AMBIENT'));
      }
    }
  }

  // Tip markers.
  const tips = state.myc && state.myc.tips;
  if (tips) {
    for (const t of tips) {
      if (t.cx < 0 || t.cx >= state.cols || t.cy < 0 || t.cy >= state.rows) continue;
      putChar('◈', t.cx, r0 + t.cy, color('ACC'));
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Cursor
// ──────────────────────────────────────────────────────────────────────────────

function drawCursor() {
  const { uiC, uiR, inField, shift, leftDown, rightDown } = state.mouse;
  if (uiC < 0 || uiR < 0 || uiC >= cw || uiR >= ch) return;
  let glyph = '+';
  let col = color('CURSOR');
  if (inField) {
    if (state.algo === 0) {
      glyph = shift ? '✕' : (leftDown ? '◉' : '◈');
    } else if (state.algo === 1) {
      glyph = shift ? '⌫' : (leftDown ? '✦' : '◇');
    } else if (state.algo === 2) {
      glyph = leftDown ? '■' : '□';
    } else {
      glyph = '◇';
    }
    if (rightDown) { glyph = '✱'; col = color('PHERO'); }
  }
  putChar(glyph, uiC, uiR, col);
}

// ──────────────────────────────────────────────────────────────────────────────
// Right panel — everything clickable.
// ──────────────────────────────────────────────────────────────────────────────

function drawPanel() {
  const pc = state.cols;
  const pr = LAYOUT.menuRows;
  const pw = LAYOUT.panelCols;
  const ph = ch - pr - LAYOUT.statusRows;
  fillRect(pc, pr, pw, ph, color('PANEL'));

  let row = pr + 1;
  const K = state.knobs;

  row = sectionHeader('sound', 'SOUND', pc, row);
  if (state.panelOpen.sound) {
    row = clickKnob('density', 'density', K.density, 0, 1, 0.05, pc, row);
    row = clickKnob('size',    'size ms', K.size,    5, 400, 10, pc, row);
    row = clickKnob('spread',  'spread ', K.spread,  0, 1, 0.05, pc, row);
    row = clickKnob('pitch',   'pitch  ', K.pitch, -36, 36, 1, pc, row);
    row = clickKnob('gain',    'gain   ', K.gain,    0, 1, 0.05, pc, row);
  }

  row = sectionHeader('scan', 'SCAN / STRETCH', pc, row);
  if (state.panelOpen.scan) {
    const on = !!(state.scan && state.scan.on);
    drawBtn('scan:toggle', on ? 'SCAN: on (space sweeps)' : 'SCAN: off (random fire)', pc + 1, row++, pw - 2, on, color('VIO'));
    row = clickKnob('stretch', 'stretch', K.stretch, 0, 1, 0.05, pc, row);
    const factor = (1 + K.stretch * 199).toFixed(1);
    putStr('≈ ' + factor + '× slowdown', pc + 1, row++, color('SUN'));
    // Playhead bar (mini).
    const barW = pw - 6;
    const pos = Math.max(0, Math.min(1, state.scan ? state.scan.pos : 0));
    const fill = Math.round(pos * barW);
    let line = '';
    for (let i = 0; i < barW; i++) line += i === fill ? '▼' : '─';
    addBtn('scan:scrubPanel', pc + 1, row, barW, 1);
    for (let i = 0; i < barW; i++) putChar(line[i], pc + 1 + i, row, i === fill ? color('WARN') : color('DIM'));
    row += 2;
  }

  row = sectionHeader('growth', 'GROWTH', pc, row);
  if (state.panelOpen.growth) {
    row = clickKnob('pheroDecay', 'phDecay', K.pheroDecay, 0.05, 5, 0.1, pc, row);
    row = clickKnob('bias',       'bias   ', K.bias, 0, 3, 0.1, pc, row);
  }

  row = sectionHeader('fx', 'FX', pc, row);
  if (state.panelOpen.fx) {
    row = clickKnob('glyphFx', 'glyphFx', K.glyphFx, 0, 1, 0.05, pc, row);
    row = clickKnob('sat',     'sat    ', K.sat,    0, 1, 0.05, pc, row);
    row = clickKnob('wet',     'wet    ', K.wet,    0, 1, 0.05, pc, row);
  }

  if (state.algo === 1) {
    row = sectionHeader('canvas', 'CANVAS PAINT', pc, row);
    if (state.panelOpen.canvas) row = drawPaintPanel(pc, row, pw);
  } else if (state.algo === 2) {
    row = sectionHeader('stormcell', 'STORMCELL', pc, row);
    if (state.panelOpen.stormcell) {
      row = clickKnob('caDens', 'caDens ', K.caDens, 0, 1, 0.05, pc, row);
      const rule = CA_RULES[K.caRule % CA_RULES.length];
      drawBtn('algo:caRule', '< rule: ' + rule.name + ' >', pc + 1, row, pw - 2, false, color('INK'));
      row++;
      drawBtn('algo:caSeed', 'reseed stormcell', pc + 1, row, pw - 2, false, color('INK'));
      row += 2;
    }
  }

  row = sectionHeader('algo', 'ALGO', pc, row);
  if (state.panelOpen.algo) {
    ALGOS.forEach((a, i) => {
      const on = state.algo === i;
      const note = (i === 3) ? ' (soon)' : '';
      drawBtn('algo:' + i, (on ? '> ' : '  ') + (i + 1) + ' ' + a + note, pc + 1, row++, pw - 2, on);
    });
    row++;
    drawBtn('algo:reset', 'reseed (R)', pc + 1, row++, pw - 2, false, color('INK'));
    row++;
  }

  row = sectionHeader('source', 'SOURCE', pc, row);
  if (state.panelOpen.source) {
    const name = state.bufferName || '(none)';
    const maxw = pw - 4;
    const truncated = name.length > maxw ? name.slice(0, maxw - 1) + '…' : name;
    putStr(truncated, pc + 2, row++, color('INK'));
    if (state.buffer) {
      putStr(`${state.buffer.duration.toFixed(2)}s · ${state.buffer.sampleRate}Hz · ${state.buffer.numberOfChannels}ch`, pc + 2, row++, color('DIM'));
    }
    if (state.loading) putStr('▸ loading…', pc + 2, row++, color('WARN'));
    drawBtn('file:load', 'L load file', pc + 1, row++, pw - 2, false, color('INK'));
    row++;
  }

  row = sectionHeader('sample', 'SAMPLER', pc, row);
  if (state.panelOpen.sample) row = drawSamplerPanel(pc, row, pw);

  row = sectionHeader('prefs', 'AUDIO PREFS', pc, row);
  if (state.panelOpen.prefs) row = drawPrefsPanel(pc, row, pw);

  // Snippets list.
  if (state.snippets.length > 0) {
    row = sectionHeader('snippets', 'SNIPPETS', pc, row);
    state.snippets.forEach((s, i) => {
      drawBtn('snip:' + i, s.label, pc + 1, row++, pw - 2, false, color('INK'));
    });
    row++;
  }

  row = sectionHeader('play', 'TRANSPORT', pc, row);
  if (state.panelOpen.play) {
    drawBtn('transport:play', state.playing ? '|| pause (SPACE)' : '>> play (SPACE)', pc + 1, row++, pw - 2, state.playing);
    drawBtn('transport:panic', 'ESC panic', pc + 1, row++, pw - 2, false, color('WARN'));
    drawBtn('file:recPanel',
            state.rec.active ? '● REC · open recorder' : '◉ recorder… (F8)',
            pc + 1, row++, pw - 2, state.rec.active,
            state.rec.active ? color('WARN') : color('INK'));
    drawBtn('file:snipSave', '+ snippet', pc + 1, row++, pw - 2, false, color('INK'));
    if (state.gamepad.connected) putStr('◆ gamepad ok', pc + 2, row++, color('ACC'));
  }
}

let _sectionIdx = 0;
function sectionHeader(key, label, pc, row) {
  const open = state.panelOpen[key];
  const pw = LAYOUT.panelCols;
  addBtn('panel:' + key, pc + 1, row, pw - 2, 1);
  const col = color(SECTION_COLORS[_sectionIdx % SECTION_COLORS.length]);
  _sectionIdx++;
  putStr((open ? '▾ ' : '▸ ') + label, pc + 1, row, col);
  return row + 1;
}

function clickKnob(key, label, v, lo, hi, step, pc, row) {
  const pw = LAYOUT.panelCols;
  const barW = pw - 10;
  const norm = (v - lo) / (hi - lo);
  const fill = Math.max(0, Math.min(barW, Math.round(norm * barW)));
  putStr(label, pc + 1, row, color('UI'));
  addBtn('k:' + key + ':-', pc + 1, row + 1, 3, 1);
  putStr('[-]', pc + 1, row + 1, color('ACC'));
  for (let i = 0; i < barW; i++) {
    const filled = i < fill;
    const col = filled ? hsl((i / Math.max(1, barW)) * 300, 90, 58) : color('DIM');
    putChar(filled ? '█' : '·', pc + 5 + i, row + 1, col);
  }
  addBtn('k:' + key + ':+', pc + pw - 4, row + 1, 3, 1);
  putStr('[+]', pc + pw - 4, row + 1, color('ACC'));
  const display = (typeof v === 'number' && Math.abs(v) < 1000 && v % 1 !== 0) ? v.toFixed(2) : String(v);
  putStr(display, pc + 1, row + 2, color('SUN'));
  return row + 3;
}

function drawPaintPanel(pc, row, pw) {
  putStr('tier:', pc + 1, row, color('UI'));
  let x = pc + 7;
  for (const t of PAINT_TIERS) {
    const active = state.paint.tier === t && state.paint.glyphIdx < 0;
    const lbl = t[0].toUpperCase();
    addBtn('paint:tier:' + t, x, row, 2, 1);
    const col = active ? color('HI') : TIER_COLORS[t];
    putStr(lbl, x, row, col);
    x += 2;
  }
  row++;
  // Glyph picker — a wrapped grid of glyphs clickable to lock.
  const [lo, hi] = BANK_RANGES[state.paint.tier] || [0, FLAT_BANK.length];
  putStr('glyph:', pc + 1, row, color('UI'));
  addBtn('paint:any', pc + 7, row, 5, 1);
  const anyActive = state.paint.glyphIdx < 0;
  putStr('[any]', pc + 7, row, anyActive ? color('HI') : color('DIM'));
  row++;
  let gx = pc + 1;
  for (let i = lo; i < hi; i++) {
    const entry = FLAT_BANK[i];
    addBtn('paint:glyph:' + i, gx, row, 2, 1);
    const active = state.paint.glyphIdx === i;
    putStr(entry.ch, gx, row, active ? color('HI') : TIER_COLORS[entry.tier]);
    gx += 2;
    if (gx + 2 > pc + pw - 1) { gx = pc + 1; row++; }
  }
  row++;
  // Zalgo toggle.
  drawBtn('paint:zalgo', state.paint.zalgo ? 'zalgo ON' : 'zalgo off', pc + 1, row, pw - 2, state.paint.zalgo);
  row++;
  drawBtn('algo:canvasRand', 'randomize', pc + 1, row++, pw - 2, false, color('INK'));
  drawBtn('algo:canvasClear', 'clear canvas', pc + 1, row++, pw - 2, false, color('WARN'));
  putStr('drag: paint · shift: erase', pc + 1, row++, color('DIM'));
  row++;
  return row;
}

function drawSamplerPanel(pc, row, pw) {
  putStr('input:', pc + 1, row++, color('UI'));
  const curLabel = state.prefs.inputDeviceLabel || 'default mic';
  const clipped = curLabel.length > pw - 4 ? curLabel.slice(0, pw - 5) + '…' : curLabel;
  putStr('▸ ' + clipped, pc + 1, row++, color('ACC'));
  drawBtn('input:default', 'default mic', pc + 1, row++, pw - 2, !state.prefs.inputDeviceId);
  drawBtn('input:refresh', '↻ refresh inputs', pc + 1, row++, pw - 2, false, color('INK'));
  const devs = state.prefs.inputDevices || [];
  if (devs.length === 0) {
    putStr('(click refresh, allow mic)', pc + 1, row++, color('DIM'));
  } else {
    for (const d of devs) {
      const room = pw - 6;
      const lbl = (d.label || '').length > room ? (d.label || '').slice(0, room - 1) + '…' : (d.label || '');
      const on = state.prefs.inputDeviceId === d.id;
      drawBtn('input:pick:' + d.id, (on ? '● ' : '○ ') + lbl, pc + 1, row++, pw - 2, on);
    }
  }
  row++;
  // Duration control + sample button.
  const sec = state.prefs.sampleSeconds || 3;
  putStr('length:', pc + 1, row, color('UI'));
  addBtn('sampleSec:-', pc + 9, row, 3, 1);
  putStr('[-]', pc + 9, row, color('ACC'));
  putStr(sec.toFixed(1) + 's', pc + 13, row, color('INK'));
  addBtn('sampleSec:+', pc + pw - 4, row, 3, 1);
  putStr('[+]', pc + pw - 4, row, color('ACC'));
  row++;
  if (state.prefs.sampling) {
    drawBtn('input:cancel', '▣ sampling…', pc + 1, row++, pw - 2, true, color('BG'));
  } else {
    drawBtn('input:sample', '● sample ' + sec.toFixed(1) + 's → buffer', pc + 1, row++, pw - 2, false, color('WARN'));
  }
  row++;
  return row;
}

function drawPrefsPanel(pc, row, pw) {
  putStr('rec source:', pc + 1, row++, color('UI'));
  const src = state.prefs.recordSource;
  const sources = [
    ['master',  'Master (post-gain)'],
    ['limiter', 'Limiter (pre-gain)'],
    ['dry',     'Dry (pre-limiter)'],
  ];
  for (const [k, label] of sources) {
    const on = src === k;
    drawBtn('prefs:src:' + k, (on ? '● ' : '○ ') + label, pc + 1, row++, pw - 2, on);
  }
  row++;
  putStr('output device:', pc + 1, row++, color('UI'));
  const curLabel = state.prefs.outputDeviceLabel || 'default';
  const clipped = curLabel.length > pw - 4 ? curLabel.slice(0, pw - 5) + '…' : curLabel;
  putStr('▸ ' + clipped, pc + 1, row++, color('ACC'));
  drawBtn('prefs:out:default', 'system default', pc + 1, row++, pw - 2, !state.prefs.outputDeviceId);
  drawBtn('prefs:out:refresh', '↻ refresh list', pc + 1, row++, pw - 2, false, color('INK'));
  const devs = state.prefs.outputDevices || [];
  if (devs.length === 0) {
    putStr('(click refresh to list)', pc + 1, row++, color('DIM'));
  } else {
    for (const d of devs) {
      const lbl = (d.label || '').length > pw - 6 ? (d.label || '').slice(0, pw - 7) + '…' : (d.label || '');
      const on = state.prefs.outputDeviceId === d.id;
      drawBtn('prefs:out:pick:' + d.id, (on ? '● ' : '○ ') + lbl, pc + 1, row++, pw - 2, on);
    }
  }
  row++;
  const info = getAudioInfo();
  if (info) {
    putStr(`sr: ${info.sampleRate}Hz`, pc + 1, row++, color('DIM'));
    const baseMs = (info.baseLatency * 1000).toFixed(1);
    const outMs = (info.outputLatency * 1000).toFixed(1);
    putStr(`lat: ${baseMs}/${outMs}ms`, pc + 1, row++, color('DIM'));
    putStr(`ch: ${info.destinationChannels}  state: ${info.state}`, pc + 1, row++, color('DIM'));
  } else {
    putStr('(audio not started — press SPACE)', pc + 1, row++, color('DIM'));
  }
  row++;
  return row;
}

// ──────────────────────────────────────────────────────────────────────────────
// Waveform
// ──────────────────────────────────────────────────────────────────────────────

function drawWaveform() {
  const r0 = LAYOUT.menuRows + state.rows;
  fillRect(0, r0, state.cols, LAYOUT.waveRows, color('PANEL'));
  const peaks = state.bufferPeaks;
  const rowsW = LAYOUT.waveRows;
  if (!peaks) {
    putStr('[no source — press L to load or use default]', 2, r0 + Math.floor(rowsW / 2), color('DIM'));
    return;
  }
  const cols = state.cols;
  const halfH = rowsW / 2;
  const ramp = '▁▂▃▄▅▆▇█';
  for (let x = 0; x < cols; x++) {
    const bucket = Math.floor((x / cols) * peaks.length);
    const amp = peaks[bucket] || 0;
    const cells = Math.max(0, Math.min(rowsW, Math.round(amp * rowsW)));
    const glyphIdx = Math.max(0, Math.min(ramp.length - 1, Math.round(amp * (ramp.length - 1))));
    const g = ramp[glyphIdx];
    // Color: hue sweeps across the buffer; lightness rises with amplitude.
    const hue = (x / cols) * 320;
    const baseL = 38 + amp * 32;
    const col = hsl(hue, 85, baseL);
    for (let i = 0; i < cells; i++) {
      const up = Math.floor(halfH) - 1 - i;
      const dn = Math.floor(halfH) + i;
      if (up >= 0) putChar(g, x, r0 + up, col);
      if (dn < rowsW) putChar(g, x, r0 + dn, col);
    }
  }
  // Duration label.
  if (state.buffer) {
    const d = state.buffer.duration.toFixed(2) + 's';
    putStr(d, state.cols - d.length - 1, r0, color('DIM'));
  }
  // Scan playhead.
  if (state.scan && state.scan.on) {
    const px = Math.max(0, Math.min(cols - 1, Math.floor(state.scan.pos * cols)));
    for (let yy = 0; yy < rowsW; yy++) putChar('│', px, r0 + yy, color('SUN'));
    putChar('▼', px, r0, color('WARN'));
  }
  // Click-to-scrub region registration.
  addBtn('scan:scrub', 0, r0, cols, rowsW);
}

// ──────────────────────────────────────────────────────────────────────────────
// Info strip — last-fired grains (what character, pitch, pan, dur, tier color).
// ──────────────────────────────────────────────────────────────────────────────

function drawInfoStrip() {
  const r0 = LAYOUT.menuRows + state.rows + LAYOUT.waveRows;
  fillRect(0, r0, state.cols, LAYOUT.infoRows, color('PANEL'));
  putStr('GRAIN INFO', 1, r0, color('UI'));
  const last = state.recent[state.recent.length - 1];
  if (last) {
    const col = TIER_COLORS[last.tier] || color('INK');
    putChar(last.ch, 12, r0, col);
    const line = `${last.tier.padEnd(9)}  pitch ${String(last.pitch).padStart(5)}st  pan ${String(last.pan).padStart(5)}  dur ${String(last.dur).padStart(4)}ms  pos ${last.pos.toFixed(2)}  gain ${last.gain}`;
    putStr(line, 14, r0, color('INK'));
  } else {
    putStr('(no grains yet — press SPACE and click the field)', 12, r0, color('DIM'));
  }

  // Row 1: glyph trail of recent grains, colored by tier.
  const trailY = r0 + 1;
  putStr('recent:', 1, trailY, color('UI'));
  const trailX = 9;
  const trailW = state.cols - trailX - 2;
  const recent = state.recent;
  for (let i = 0; i < Math.min(trailW, recent.length); i++) {
    const g = recent[recent.length - 1 - i];
    if (!g) continue;
    const col = TIER_COLORS[g.tier] || color('INK');
    putChar(g.ch, trailX + trailW - 1 - i, trailY, col);
  }

  // Row 2: tier legend (compact).
  const legY = r0 + 2;
  putStr('tiers: ', 1, legY, color('UI'));
  let x = 8;
  const avail = state.cols - x - 2;
  const shortNames = { ambientLo: 'amb-', ambientHi: 'amb+', cool: 'cool', warm: 'warm', hot: 'hot', tip: 'tip' };
  for (const t of PAINT_TIERS) {
    const name = shortNames[t];
    const segLen = 2 + name.length + 1;
    if (x + segLen > state.cols - 1) break;
    putChar('█', x, legY, TIER_COLORS[t]);
    putStr(' ' + name, x + 1, legY, color('DIM'));
    x += segLen;
  }
  if (avail > 40) putStr('  (paint: X cycle · Z zalgo)', x, legY, color('DIM'));

  // Row 3: quick stats.
  const statY = r0 + 3;
  const nTips = (state.myc && state.myc.tips) ? state.myc.tips.length : 0;
  const nLive = state.stormcell ? countAlive(state.stormcell.ca) : 0;
  const nPaint = state.canvas ? countPainted(state.canvas.painted) : 0;
  const fgCount = state.recent.length;
  const stats = `algo:${ALGOS[state.algo].padEnd(9)}  tips:${String(nTips).padStart(3)}  live:${String(nLive).padStart(4)}  painted:${String(nPaint).padStart(4)}  grains:${String(fgCount).padStart(3)}`;
  putStr(stats, 1, statY, color('DIM'));
}

function countAlive(arr) { let c = 0; for (let i = 0; i < arr.length; i++) c += arr[i]; return c; }
function countPainted(arr) { let c = 0; for (let i = 0; i < arr.length; i++) if (arr[i]) c++; return c; }

// ──────────────────────────────────────────────────────────────────────────────
// Status bar
// ──────────────────────────────────────────────────────────────────────────────

function drawStatus() {
  const r = ch - LAYOUT.statusRows;
  fillRow(0, r, cw, color('PANEL'));
  putStr(state.status, 1, r, color('UI'));
  // Right side: pointer position + time + mem.
  const t = formatTime(state.playElapsed);
  const mouseTag = state.mouse.inField ? `[${state.mouse.fx},${state.mouse.fy}]` : '';
  const right = `${mouseTag}  ${t} `;
  putStr(right, cw - right.length - 1, r, color('DIM'));
}

function formatTime(sec) {
  const s = Math.max(0, sec);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.floor((s * 1000) % 1000);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
