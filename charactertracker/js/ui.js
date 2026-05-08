// ui.js — drawn UI. fillText only. Builds state.layout each frame for
// input.js hit-tests.

import { state } from './state.js';
import {
  THEME_VOID, GLYPHS, CHROME, DEFAULTS, VOICES, VOICE_COLOR, DRUM_TYPES,
  ZALGO_ABOVE, ZALGO_MIDDLE, ZALGO_BELOW, FIELD_ORDER,
} from './constants.js';
import { playheadFor } from './scheduler.js';
import { buildKnobList, drawKnobs } from './knobs.js';

let cv = null;
let ctx = null;
let w = 0, h = 0;

const COL_W = DEFAULTS.trackColW;       // glyph cells per pattern track column (7)
const PREFIX = DEFAULTS.prefix;         // glyph cells reserved for step number (4)
const RIGHT_W = DEFAULTS.rightPanelW;   // right panel width (28)

export function initUI(canvas) {
  cv = canvas;
  ctx = cv.getContext('2d', { alpha: false });
}

export function resizeUI(canvas, ww, wh, dpr) {
  cv.width = Math.floor(ww * dpr);
  cv.height = Math.floor(wh * dpr);
  cv.style.width = ww + 'px';
  cv.style.height = wh + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  w = ww; h = wh; state.dpr = dpr;

  // Aim for ~145 cols when possible; clamp cell width 7..14 px.
  const targetCols = 150;
  let cellW = Math.floor(ww / targetCols);
  cellW = Math.max(DEFAULTS.cellPxMin, Math.min(DEFAULTS.cellPxMax, cellW));
  const cellH = Math.round(cellW * 1.7);
  state.cellW = cellW;
  state.cellH = cellH;
  state.cols = Math.floor(ww / cellW);
  state.rows = Math.floor(wh / cellH);
}

function T(name) { return THEME_VOID[name] || '#fff'; }

function setFont() {
  ctx.font = (state.cellH - 4) + 'px "Courier New", Courier, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
}

function txt(s, col, row, fg) {
  ctx.fillStyle = fg;
  ctx.fillText(s, col * state.cellW, row * state.cellH);
}

function txtPx(s, x, y, fg) {
  ctx.fillStyle = fg;
  ctx.fillText(s, x, y);
}

function fillCells(col, row, span, hSpan, c) {
  ctx.fillStyle = c;
  ctx.fillRect(col * state.cellW, row * state.cellH, span * state.cellW, hSpan * state.cellH);
}

function strokeCells(col, row, span, hSpan, c) {
  ctx.strokeStyle = c;
  ctx.lineWidth = 1;
  ctx.strokeRect(col * state.cellW + 0.5, row * state.cellH + 0.5,
                 span * state.cellW - 1, hSpan * state.cellH - 1);
}

function pad2(n) {
  const x = n | 0;
  if (x < 0) return '00';
  if (x < 16) return '0' + x.toString(16).toUpperCase();
  if (x < 256) return x.toString(16).toUpperCase();
  return 'FF';
}

function pitchStr(p) {
  const sign = p >= 0 ? '+' : '-';
  const a = Math.min(99, Math.abs(p));
  return sign + (a < 10 ? '0' + a : '' + a);
}

// ──────────────────────────────────────────────────────────────────────────────
// Zalgo — deterministic per-cell so it doesn't flicker between frames.
// ──────────────────────────────────────────────────────────────────────────────

function zalgoFor(cell) {
  if (!cell || !cell.active) return '';
  const seed = (cell.retrig * 31) ^ (cell.slice * 7) ^ (cell.grain ? 113 : 0) ^ (cell.prob * 3) ^ ((cell.pitch + 100) * 5);
  let s = '';
  const above = Math.min(7, Math.max(0, cell.retrig - 1) + (cell.grain ? 4 : 0));
  for (let i = 0; i < above; i++) s += ZALGO_ABOVE[(Math.abs(seed) + i * 17) % ZALGO_ABOVE.length];
  if (cell.grain) {
    const below = Math.min(6, 2 + cell.retrig);
    for (let i = 0; i < below; i++) s += ZALGO_BELOW[(Math.abs(seed) + i * 23) % ZALGO_BELOW.length];
  }
  if (cell.prob < 100) s += ZALGO_MIDDLE[Math.abs(seed) % ZALGO_MIDDLE.length];
  return s;
}

// ──────────────────────────────────────────────────────────────────────────────
// Top-level draw
// ──────────────────────────────────────────────────────────────────────────────

export function drawUI() {
  ctx.fillStyle = T('BG');
  ctx.fillRect(0, 0, w, h);
  setFont();

  // Layout cache reset.
  state.layout = {
    grid: null,
    trackHeaders: [],
    knobs: [],
    bankSlots: [],
    binItems: [],
    songSlots: [],
    songPatterns: [],
    mixerStripes: [],
    scrollV: null,
    scrollH: null,
    waveBox: null,
    transportBox: null,
    viewTabs: [],
  };

  computeScroll();
  drawHeader();
  drawCellDetail();
  drawSeparator(2);

  if (state.view === 'PATTERN') {
    drawTrackHeaders(3);
    drawSeparator(5);
    drawGrid(6);
    drawSelection(6);
    drawScrollbars(6);
  } else if (state.view === 'SONG') {
    drawSongView(3);
  } else if (state.view === 'MIXER') {
    drawMixerView(3);
  }

  drawRightPanel(0);
  drawParticles();
  drawMouseCursor();
  drawStatus();
}

// ──────────────────────────────────────────────────────────────────────────────
// Selection — marching ants on perimeter of the rectangle.
// ──────────────────────────────────────────────────────────────────────────────

function drawSelection(rowStart) {
  const sel = state.selection;
  if (!sel) return;
  const tracks = state.pattern.tracks;
  const visibleTracks = Math.max(1, Math.floor((state.cols - PREFIX - DEFAULTS.rightPanelW - 2) / COL_W));
  const gridEndRow = state.rows - 2;
  const maxRows = gridEndRow - rowStart;

  // Convert selection track range to visible columns.
  const t0v = Math.max(0, sel.trackStart - state.scrollTrack);
  const t1v = Math.min(visibleTracks - 1, sel.trackEnd - state.scrollTrack);
  if (t1v < t0v) return;
  if (sel.trackEnd < state.scrollTrack || sel.trackStart >= state.scrollTrack + visibleTracks) return;

  const s0v = Math.max(0, sel.stepStart - state.scrollStep);
  const s1v = Math.min(maxRows - 1, sel.stepEnd - state.scrollStep);
  if (s1v < s0v) return;
  if (sel.stepEnd < state.scrollStep || sel.stepStart >= state.scrollStep + maxRows) return;

  const x0 = PREFIX + t0v * COL_W;
  const x1 = PREFIX + (t1v + 1) * COL_W - 1;
  const y0 = rowStart + s0v;
  const y1 = rowStart + s1v;

  // Marching-ants frame phase.
  const phase = (performance.now() / 120) | 0;

  ctx.strokeStyle = T('CURSOR');
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -phase;
  ctx.strokeRect(
    x0 * state.cellW + 1,
    y0 * state.cellH + 1,
    (x1 - x0) * state.cellW - 2,
    (y1 - y0 + 1) * state.cellH - 2,
  );
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // Glyph corners + edges so it reads as character-only at heart.
  const cornerColor = T('SUN');
  txt('┏', x0,  y0, cornerColor);
  txt('┓', x1 - 1, y0, cornerColor);
  txt('┗', x0,  y1, cornerColor);
  txt('┛', x1 - 1, y1, cornerColor);
}

function drawSeparator(row) {
  txt(CHROME.hr.repeat(state.cols), 0, row, T('EDGE'));
}

function computeScroll() {
  const visibleTracks = Math.max(1, Math.floor((state.cols - PREFIX - RIGHT_W - 2) / COL_W));
  const numTracks = state.pattern.tracks.length;
  const userScrolling = performance.now() < (state.scrollLockUntil || 0);

  // Keep cursor track visible — but defer to user scroll for the lock window.
  if (!userScrolling) {
    if (state.cursor.track < state.scrollTrack) state.scrollTrack = state.cursor.track;
    if (state.cursor.track >= state.scrollTrack + visibleTracks) {
      state.scrollTrack = state.cursor.track - visibleTracks + 1;
    }
  }
  state.scrollTrack = Math.max(0, Math.min(Math.max(0, numTracks - visibleTracks), state.scrollTrack));

  // Vertical scroll for steps.
  const gridStartRow = 6;
  const gridEndRow = state.rows - 2;
  const visRows = Math.max(1, gridEndRow - gridStartRow);
  const tr = state.pattern.tracks[state.cursor.track];
  if (tr) {
    if (!userScrolling) {
      if (state.cursor.step < state.scrollStep) state.scrollStep = state.cursor.step;
      if (state.cursor.step >= state.scrollStep + visRows) state.scrollStep = state.cursor.step - visRows + 1;
    }
    state.scrollStep = Math.max(0, Math.min(Math.max(0, tr.length - visRows), state.scrollStep));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────────────────────────────────────

function drawHeader() {
  const transport = state.playing ? '▶ PLAY' : '■ STOP';
  // Title — flavor with chrome.
  let col = 1;
  txt(CHROME.titleL + ' ', col, 0, T('EDGE')); col += 2;
  txt('charactertracker', col, 0, T('INK')); col += 'charactertracker'.length + 1;
  txt(CHROME.bullet, col++, 0, T('EDGE')); col++;
  txt('breakcore', col, 0, T('TRACK')); col += 'breakcore'.length + 1;
  txt(CHROME.titleR, col, 0, T('EDGE')); col += 2;

  // Transport box (clickable).
  const transportStart = col;
  txt(transport, col, 0, state.playing ? T('HI') : T('UI'));
  state.layout.transportBox = { x: transportStart, y: 0, w: transport.length };
  col += transport.length + 2;

  txt(CHROME.bullet, col, 0, T('EDGE')); col += 2;
  txt('BPM ' + state.bpm, col, 0, T('SUN')); col += ('BPM ' + state.bpm).length + 2;
  txt(CHROME.bullet, col, 0, T('EDGE')); col += 2;
  txt('MAST ' + state.knobs.masterGain.toFixed(2), col, 0, T('AQU')); col += 10;
  txt(CHROME.bullet, col, 0, T('EDGE')); col += 2;
  txt('SAT ' + state.knobs.satDrive.toFixed(2), col, 0, T('ORA')); col += 10;
  txt(CHROME.bullet, col, 0, T('EDGE')); col += 2;
  // Track count chrome
  const tc = state.pattern.tracks.length + ' tracks';
  txt(tc, col, 0, T('VIO')); col += tc.length + 2;

  // View-mode tabs (PATTERN | SONG | MIXER) — clickable, F2/F3/F4.
  const tabs = ['PATTERN', 'SONG', 'MIXER'];
  let tx = state.cols - 32;
  for (const v of tabs) {
    const active = state.view === v;
    const label = (active ? '▸' : ' ') + v + (active ? '◂' : ' ');
    txt(label, tx, 0, active ? T('HI') : T('EDGE'));
    state.layout.viewTabs.push({ view: v, x: tx, y: 0, w: label.length });
    tx += label.length + 1;
  }
  // Song-mode indicator
  const sm = state.song.songMode ? '⌬ SONG ⌬' : '';
  if (sm) txt(sm, state.cols - 11, 1, T('PNK'));
}

// ──────────────────────────────────────────────────────────────────────────────
// Cell detail line (always shows the cursor cell)
// ──────────────────────────────────────────────────────────────────────────────

function drawCellDetail() {
  const tr = state.pattern.tracks[state.cursor.track];
  const cell = tr ? tr.cells[state.cursor.step] : null;
  if (!tr || !cell) return;
  const slot = state.bank[tr.slot];
  const slotName = slot ? slot.name : '(empty)';
  const slices = slot && slot.slices ? slot.slices.length : 0;

  let col = 1;
  txt('T' + (state.cursor.track + 1) + '/' + pad2(state.cursor.step), col, 1, T('TRACK')); col += 7;
  txt('[' + tr.voice + ']', col, 1, T(VOICE_COLOR[tr.voice] || 'INK')); col += tr.voice.length + 3;
  txt('slot ' + (tr.slot + 1) + ':' + (slotName.length > 14 ? slotName.slice(0, 13) + '…' : slotName), col, 1, T('UI'));
  col += 7 + Math.min(slotName.length, 14) + 1;

  let displaySlice;
  if (tr.voice === 'DRUM') displaySlice = (DRUM_TYPES[(cell.slice | 0) % 8] || '?').slice(0, 4);
  else if (tr.voice === 'FM') displaySlice = pitchStr(cell.slice) + '/A2';
  else displaySlice = pad2(cell.slice) + (slices ? '/' + pad2(slices - 1) : '');

  const fields = [
    ['SLICE',  displaySlice],
    ['PITCH',  pitchStr(cell.pitch)],
    ['GATE',   cell.gate + '%'],
    ['RETRIG', 'x' + cell.retrig],
    ['PROB',   cell.prob + '%'],
    ['MICRO',  (cell.micro >= 0 ? '+' : '') + cell.micro + '%'],
    ['GRAIN',  cell.grain ? 'on' : '·'],
  ];
  for (const [label, val] of fields) {
    const isCur = state.cursor.field === label.toLowerCase();
    const labCol = isCur ? T('HI') : T('UI');
    const valCol = isCur ? T('HI') : T('INK');
    txt(label, col, 1, labCol); col += label.length + 1;
    txt(val,   col, 1, valCol); col += val.length + 2;
  }
  txt(cell.active ? 'ON' : 'off', col, 1, cell.active ? T('LIM') : T('DIM'));
}

// ──────────────────────────────────────────────────────────────────────────────
// Track headers (2 rows, with sub-region hit-test entries)
// ──────────────────────────────────────────────────────────────────────────────

function drawTrackHeaders(row) {
  const tracks = state.pattern.tracks;
  const visibleTracks = Math.max(1, Math.floor((state.cols - PREFIX - RIGHT_W - 2) / COL_W));
  for (let v = 0; v < visibleTracks; v++) {
    const i = v + state.scrollTrack;
    if (i >= tracks.length) break;
    const tr = tracks[i];
    const x = PREFIX + v * COL_W;
    const isCur = (i === state.cursor.track);

    // Mute/Solo + name (row 0)
    const ms = tr.solo ? 'S' : tr.mute ? 'M' : ' ';
    const msColor = tr.solo ? T('SUN') : tr.mute ? T('WARN') : T('EDGE');
    txt(ms, x, row, msColor);
    txt(tr.name, x + 1, row, isCur ? T('HI') : T('TRACK'));
    // hit-test: mute/solo at x..x+1, name at x+1..x+1+name.length
    state.layout.trackHeaders.push({ idx: i, region: 'muteSolo', x, y: row, w: 1, h: 1 });
    state.layout.trackHeaders.push({ idx: i, region: 'name',     x: x + 1, y: row, w: tr.name.length, h: 1 });

    // Voice tag (row 1, left)
    const voice = tr.voice.slice(0, 4);
    txt(voice, x, row + 1, T(VOICE_COLOR[tr.voice] || 'UI'));
    state.layout.trackHeaders.push({ idx: i, region: 'voice', x, y: row + 1, w: voice.length, h: 1 });

    // Slot + len/div (row 1, right side)
    const slot = 's' + (tr.slot + 1);
    txt(slot, x + voice.length + 1, row + 1, T('UI'));
    state.layout.trackHeaders.push({ idx: i, region: 'slot', x: x + voice.length + 1, y: row + 1, w: slot.length, h: 1 });
  }

  // Scroll indicators
  if (state.scrollTrack > 0) txt('◀', PREFIX - 1, row, T('ACC'));
  if (state.scrollTrack + visibleTracks < tracks.length) txt('▶', PREFIX + visibleTracks * COL_W, row, T('ACC'));

  // Length/div line moved into row+1 already; show only one scroll arrow
}

// ──────────────────────────────────────────────────────────────────────────────
// Pattern grid — cells with zalgo, playhead, cursor, hover
// ──────────────────────────────────────────────────────────────────────────────

function drawGrid(rowStart) {
  const tracks = state.pattern.tracks;
  const gridEndRow = state.rows - 2;
  const maxRows = gridEndRow - rowStart;
  if (maxRows <= 0) return;

  const visibleTracks = Math.max(1, Math.floor((state.cols - PREFIX - RIGHT_W - 2) / COL_W));
  const startTrack = state.scrollTrack;
  const startStep = state.scrollStep;

  // Cache layout for hit-testing.
  state.layout.grid = {
    x: PREFIX, y: rowStart,
    w: visibleTracks * COL_W, h: maxRows,
    colW: COL_W,
  };

  // Pattern length ruler (max across tracks).
  let maxLen = 0;
  for (const tr of tracks) if (tr.length > maxLen) maxLen = tr.length;

  for (let r = 0; r < maxRows; r++) {
    const stepIdx = r + startStep;
    if (stepIdx >= maxLen) break;

    // Step number prefix
    const beat = (stepIdx % 4) === 0;
    const beat16 = (stepIdx % 16) === 0;
    const prefixColor = beat16 ? T('HI') : beat ? T('ACC') : T('DIM');
    txt(pad2(stepIdx), 1, rowStart + r, prefixColor);

    // Row stripe at every 4 steps for readability
    if (beat) {
      ctx.fillStyle = T('ROW');
      ctx.fillRect(PREFIX * state.cellW, (rowStart + r) * state.cellH,
                   visibleTracks * COL_W * state.cellW, state.cellH);
    }

    for (let v = 0; v < visibleTracks; v++) {
      const ti = v + startTrack;
      if (ti >= tracks.length) break;
      const tr = tracks[ti];
      const x = PREFIX + v * COL_W;
      const wrap = stepIdx % tr.length;
      const beyondEnd = stepIdx >= tr.length;
      const cell = beyondEnd ? null : tr.cells[wrap];

      // Cursor highlight
      const isCursor = (ti === state.cursor.track && stepIdx === state.cursor.step);
      if (isCursor) {
        fillCells(x, rowStart + r, COL_W - 1, 1, T('PANEL'));
        strokeCells(x, rowStart + r, COL_W - 1, 1, T('CURSOR'));
      }

      // Hover highlight
      const isHover = state.hover.region === 'cell' && state.hover.track === ti && state.hover.step === stepIdx;
      if (isHover && !isCursor) {
        strokeCells(x, rowStart + r, COL_W - 1, 1, T('HOVER'));
      }

      // Playhead
      const ph = playheadFor(ti);
      if (ph >= 0) {
        const phStep = Math.floor(ph) % tr.length;
        if (phStep === wrap && !beyondEnd) {
          ctx.strokeStyle = T('POS');
          ctx.lineWidth = 2;
          ctx.strokeRect(x * state.cellW + 0.5, (rowStart + r) * state.cellH + 0.5,
                         (COL_W - 1) * state.cellW - 1, state.cellH - 1);
        }
      }

      drawCell(x, rowStart + r, tr, cell, beyondEnd);
    }
  }
}

function drawCell(x, row, tr, cell, beyondEnd) {
  if (beyondEnd) {
    txt('· · · ·', x, row, T('EDGE'));
    return;
  }
  if (!cell) {
    txt('·     ', x, row, T('DIM'));
    return;
  }
  if (!cell.active) {
    txt('·     ', x, row, T('DIM'));
    return;
  }

  // Active cell — voice-colored, zalgo on glyph.
  const voiceCol = T(VOICE_COLOR[tr.voice] || 'ACC');
  let glyph;
  if (cell.grain && cell.retrig > 1) glyph = '◈';
  else if (cell.grain) glyph = '◇';
  else if (cell.retrig > 1) glyph = '⟫';
  else glyph = '■';

  const za = zalgoFor(cell);
  const sliceStr = pad2(cell.slice);
  const pitchS = pitchStr(cell.pitch);

  // Draw glyph + zalgo (combining marks attach to previous char) at x,row
  txt(glyph + za, x, row, voiceCol);
  // Slice + pitch following
  const restColor = cell.prob < 100 ? T('SUN') : T('INK');
  txt(sliceStr, x + 1, row, restColor);
  txt(pitchS,   x + 3, row, restColor);
}

// ──────────────────────────────────────────────────────────────────────────────
// Right panel — knobs, bank slots, waveform
// ──────────────────────────────────────────────────────────────────────────────

function drawRightPanel(_ignored) {
  const x = state.cols - RIGHT_W;
  if (x <= PREFIX) return;

  // Background
  ctx.fillStyle = T('PANEL');
  ctx.fillRect(x * state.cellW, 0, RIGHT_W * state.cellW, state.rows * state.cellH);

  let r = 0;
  // Section title bar
  txt(CHROME.blockT.repeat(RIGHT_W - 1), x, r, T('EDGE')); r++;
  txt('▌ KNOBS', x, r++, T('ACC'));
  // Knobs (built fresh each frame so values track state)
  const knobs = buildKnobList();
  r = drawKnobs(txt, x, r, RIGHT_W - 1, knobs, state.layout);
  r++;

  // Bank
  txt(CHROME.blockT.repeat(RIGHT_W - 1), x, r, T('EDGE')); r++;
  txt('▌ BANK', x, r++, T('ACC'));
  const tr = state.pattern.tracks[state.cursor.track];
  for (let i = 0; i < state.bank.length; i++) {
    const slot = state.bank[i];
    const used = !!slot.buffer;
    const inUse = tr && tr.slot === i;
    const isHover = state.hover.region === 'bankSlot' && state.hover.bankSlot === i;
    const glyph = used ? '◉' : '◯';
    const c = inUse ? T('HI') : (used ? T('UI') : T('DIM'));
    let label = slot.name || '(empty)';
    if (label.length > RIGHT_W - 5) label = label.slice(0, RIGHT_W - 6) + '…';
    txt(glyph + (i + 1) + ' ' + label, x, r, isHover ? T('HOVER') : c);
    state.layout.bankSlots.push({ idx: i, x, y: r, w: RIGHT_W - 1 });
    r++;
  }
  r++;

  // Waveform — capped at 5 rows so BIN always has room.
  txt(CHROME.blockT.repeat(RIGHT_W - 1), x, r, T('EDGE')); r++;
  txt('▌ WAVE', x, r++, T('ACC'));
  const slot = tr ? state.bank[tr.slot] : null;
  const waveH = Math.max(3, Math.min(5, state.rows - r - 12));
  if (slot && slot.peaks) {
    drawWaveform(x, r, RIGHT_W - 1, waveH, slot, tr);
  } else {
    txt('(empty — load with L)', x, r, T('DIM'));
  }
  state.layout.waveBox = { x, y: r, w: RIGHT_W - 1, h: waveH };
  r += waveH;

  // Slot info
  if (slot && slot.buffer) {
    const sliceN = slot.slices ? slot.slices.length : 0;
    txt('slices: ' + sliceN + '  dur ' + slot.buffer.duration.toFixed(1) + 's', x, r++, T('UI'));
  }
  r++;

  // BIN section (below WAVE)
  drawBinSection(x, r, RIGHT_W - 1);
}

function drawWaveform(x, y, ww, hh, slot, tr) {
  const peaks = slot.peaks;
  const slices = slot.slices;
  // Background frame
  for (let dy = 0; dy < hh; dy++) {
    txt(' '.repeat(ww), x, y + dy, T('PANEL2'));
  }
  // Bars
  for (let i = 0; i < ww; i++) {
    const v = peaks[Math.floor(i * peaks.length / ww)] || 0;
    const fillRows = Math.max(0, Math.round(v * (hh - 1)));
    for (let j = 0; j < fillRows; j++) {
      const intensity = (j + 1) / fillRows;
      const ch = intensity > 0.66 ? '█' : intensity > 0.33 ? '▓' : '▒';
      txt(ch, x + i, y + hh - 1 - j, T('AQU'));
    }
  }
  // Slice markers
  if (slices) {
    for (let s = 0; s < slices.length; s++) {
      const sx = x + Math.floor(slices[s] * ww);
      for (let dy = 0; dy < hh; dy++) txt('│', sx, y + dy, T('TRACK'));
    }
  }
  // Highlight currently-cursored cell's slice in voice color.
  if (tr && tr.voice !== 'FM' && tr.voice !== 'DRUM') {
    const cell = tr.cells[state.cursor.step];
    if (cell && slices && slices.length > 0) {
      const ci = Math.max(0, Math.min(slices.length - 1, cell.slice | 0));
      const startN = slices[ci];
      const endN = ci + 1 < slices.length ? slices[ci + 1] : 1;
      const sx = x + Math.floor(startN * ww);
      const ex = x + Math.floor(endN * ww);
      for (let i = sx; i < ex; i++) {
        txt('▔', i, y, T(VOICE_COLOR[tr.voice] || 'INK'));
      }
    }
  }
  // Live playhead — fractional position of the latest fired playhead within the
  // buffer is tricky to track precisely, so we use the cursor track's
  // playhead within its slice array as a coarse pointer.
  if (tr && state.playing && slices && slices.length > 0) {
    const ph = playheadFor(state.cursor.track);
    const cell = tr.cells[Math.floor(ph) % tr.length];
    if (cell && cell.active && tr.voice !== 'FM' && tr.voice !== 'DRUM') {
      const ci = Math.max(0, Math.min(slices.length - 1, cell.slice | 0));
      const startN = slices[ci];
      const endN = ci + 1 < slices.length ? slices[ci + 1] : 1;
      const frac = ph - Math.floor(ph);
      const px = x + Math.floor((startN + frac * (endN - startN)) * ww);
      for (let dy = 0; dy < hh; dy++) txt('║', px, y + dy, T('POS'));
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Particles
// ──────────────────────────────────────────────────────────────────────────────

function drawParticles() {
  const arr = state.particles;
  for (const p of arr) {
    const a = 1 - p.age / p.life;
    if (a <= 0) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = p.color;
    ctx.fillText(p.glyph, p.x * state.cellW, p.y * state.cellH);
  }
  ctx.globalAlpha = 1;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mouse cursor (drawn glyph since system cursor is hidden)
// ──────────────────────────────────────────────────────────────────────────────

function drawMouseCursor() {
  if (!state.mouse.inside) return;
  const cx = state.mouse.cx;
  const cy = state.mouse.cy;
  // Inverted block at the cell + small crosshair
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = T('CURSOR');
  ctx.fillRect(cx * state.cellW, cy * state.cellH, state.cellW, state.cellH);
  ctx.globalAlpha = 1;
  txt('+', cx, cy, T('CURSOR'));
}

// ──────────────────────────────────────────────────────────────────────────────
// Status / hint
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// Scrollbars over the pattern grid
// ──────────────────────────────────────────────────────────────────────────────

function drawScrollbars(rowStart) {
  const tracks = state.pattern.tracks;
  const visibleTracks = Math.max(1, Math.floor((state.cols - PREFIX - RIGHT_W - 2) / COL_W));
  const gridEndRow = state.rows - 2;
  const maxRows = gridEndRow - rowStart;
  let maxLen = 0;
  for (const tr of tracks) if (tr.length > maxLen) maxLen = tr.length;

  // Vertical scrollbar — drawn in the gap column between grid and right panel.
  const vx = PREFIX + visibleTracks * COL_W;
  if (vx < state.cols - RIGHT_W) {
    const total = Math.max(1, maxLen);
    const visible = Math.min(maxRows, total);
    const thumbH = Math.max(1, Math.round(maxRows * (visible / total)));
    const trackPos = (state.scrollStep / Math.max(1, (total - visible))) || 0;
    const thumbY = rowStart + Math.round((maxRows - thumbH) * trackPos);
    for (let r = 0; r < maxRows; r++) {
      const inThumb = r + rowStart >= thumbY && r + rowStart < thumbY + thumbH;
      txt(inThumb ? '█' : '│', vx, rowStart + r, inThumb ? T('CURSOR') : T('EDGE'));
    }
    state.layout.scrollV = {
      x: vx, y: rowStart, w: 1, h: maxRows,
      total, visible, thumbY, thumbH,
    };
  }

  // Horizontal scrollbar — top of the grid, only if more tracks than visible.
  if (visibleTracks < tracks.length) {
    const hy = rowStart - 1;                 // sit on the separator row above grid
    const total = tracks.length;
    const visible = visibleTracks;
    const widthCells = visibleTracks * COL_W;
    const thumbW = Math.max(2, Math.round(widthCells * (visible / total)));
    const trackPos = (state.scrollTrack / Math.max(1, (total - visible))) || 0;
    const thumbX = PREFIX + Math.round((widthCells - thumbW) * trackPos);
    for (let c = 0; c < widthCells; c++) {
      const inThumb = PREFIX + c >= thumbX && PREFIX + c < thumbX + thumbW;
      txt(inThumb ? '━' : '─', PREFIX + c, hy, inThumb ? T('CURSOR') : T('EDGE'));
    }
    state.layout.scrollH = {
      x: PREFIX, y: hy, w: widthCells, h: 1,
      total, visible, thumbX, thumbW,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SONG view — pattern list at top, sequence list below.
// Click a pattern in the top list → set editIndex.
// Click a sequence slot → set songStep + editIndex.
// Drag a sequence slot → reorder (mouse-up handler in input.js).
// ──────────────────────────────────────────────────────────────────────────────

function drawSongView(rowStart) {
  const T_PANEL_W = state.cols - RIGHT_W - 2;
  const x0 = 1;
  let r = rowStart;

  txt('▌ PATTERNS  (click select · ctrl+shift+N add new)', x0, r, T('ACC'));
  r++;
  // Pattern list — wrap into rows.
  const patW = 6;                      // "[P01]" sized
  let px = x0;
  for (let i = 0; i < state.song.patterns.length; i++) {
    const p = state.song.patterns[i];
    const isEdit = i === state.song.editIndex;
    const lab = (isEdit ? '▸' : '[') + p.name + (isEdit ? '◂' : ']');
    if (px + lab.length + 1 > T_PANEL_W) { r++; px = x0; }
    txt(lab, px, r, isEdit ? T('HI') : T('TRACK'));
    state.layout.songPatterns.push({ idx: i, x: px, y: r, w: lab.length });
    px += lab.length + 1;
  }
  r += 2;

  txt('▌ SEQUENCE  (click select · drag reorder · - remove · + duplicate-here)', x0, r, T('ACC'));
  r++;
  const slotW = 6;
  px = x0;
  for (let i = 0; i < state.song.sequence.length; i++) {
    const pIdx = state.song.sequence[i];
    const p = state.song.patterns[pIdx];
    const isPlaying = state.song.songMode && state.playing && state.song.songStep === i;
    const isEditSlot = state.song.editIndex === pIdx;
    const lab = (isPlaying ? '▶' : isEditSlot ? '·' : ' ') + (p ? p.name : '???');
    if (px + lab.length + 1 > T_PANEL_W) { r++; px = x0; }
    const c = isPlaying ? T('HI') : (isEditSlot ? T('TRACK') : T('UI'));
    txt(lab, px, r, c);
    state.layout.songSlots.push({ slot: i, patternIdx: pIdx, x: px, y: r, w: lab.length });
    px += lab.length + 1;
  }
  // Add slot + remove slot affordance
  if (px + 2 <= T_PANEL_W) {
    txt('[+]', px, r, T('LIM'));
    state.layout.songSlots.push({ slot: state.song.sequence.length, patternIdx: -1, x: px, y: r, w: 3, action: 'append' });
  }
  r += 2;

  // Status / explainer
  txt('▌ STATUS', x0, r++, T('ACC'));
  txt('songMode: ' + (state.song.songMode ? 'ON  (F5 to toggle)' : 'OFF (F5 to toggle — when ON, transport plays the sequence)'), x0, r++, T('UI'));
  txt('follow:   ' + (state.song.follow ? 'ON' : 'OFF') + ' — when songMode plays, edit-pattern follows playback', x0, r++, T('UI'));
  txt('patterns: ' + state.song.patterns.length + '   sequence: ' + state.song.sequence.length + ' slots', x0, r++, T('UI'));
  txt('current edit pattern: ' + state.pattern.name + '   bars: ' + state.pattern.bars + '   tracks: ' + state.pattern.tracks.length, x0, r++, T('UI'));
}

// ──────────────────────────────────────────────────────────────────────────────
// MIXER view — vertical stripes per track.
// Each stripe shows: name, voice tag, mute/solo, gain bar, pan bar, length/div.
// ──────────────────────────────────────────────────────────────────────────────

function drawMixerView(rowStart) {
  const tracks = state.pattern.tracks;
  const T_PANEL_W = state.cols - RIGHT_W - 2;
  const stripeW = Math.max(5, Math.floor(T_PANEL_W / tracks.length));
  const meterRows = Math.max(8, state.rows - rowStart - 6);
  const meterTop = rowStart + 4;

  for (let i = 0; i < tracks.length; i++) {
    const tr = tracks[i];
    const sx = 1 + i * stripeW;
    const isCur = i === state.cursor.track;

    // Header
    const headerCol = isCur ? T('HI') : T(VOICE_COLOR[tr.voice] || 'TRACK');
    txt(tr.name.slice(0, stripeW - 1), sx, rowStart, headerCol);
    txt(tr.voice.slice(0, stripeW - 1), sx, rowStart + 1, T(VOICE_COLOR[tr.voice] || 'UI'));
    txt((tr.mute ? 'M' : ' ') + (tr.solo ? 'S' : ' '), sx, rowStart + 2, tr.solo ? T('SUN') : tr.mute ? T('WARN') : T('EDGE'));
    txt(tr.length + '/' + tr.div, sx, rowStart + 3, T('DIM'));

    // Vertical gain bar
    const gainPct = tr.gain / 1.4;
    const filled = Math.max(0, Math.min(meterRows, Math.round(gainPct * meterRows)));
    for (let j = 0; j < meterRows; j++) {
      const fromBottom = j;
      const yy = meterTop + meterRows - 1 - fromBottom;
      const lit = fromBottom < filled;
      txt(lit ? '█' : '▒', sx, yy, lit ? T(VOICE_COLOR[tr.voice] || 'AQU') : T('PANEL2'));
    }
    // Gain numeric
    txt(tr.gain.toFixed(2), sx, meterTop + meterRows, T('UI'));
    // Pan indicator below
    const panPos = Math.round((tr.pan + 1) / 2 * (stripeW - 1));
    let panStr = '·'.repeat(stripeW);
    panStr = panStr.substring(0, panPos) + '◆' + panStr.substring(panPos + 1);
    txt(panStr.slice(0, stripeW), sx, meterTop + meterRows + 1, T('PNK'));

    state.layout.mixerStripes.push({ idx: i, x: sx, y: rowStart, w: stripeW, h: meterTop + meterRows + 2 - rowStart });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// BIN panel — added to the right panel below WAVE.
// ──────────────────────────────────────────────────────────────────────────────

function drawBinSection(x, rStart, panelW) {
  let r = rStart;
  txt(CHROME.blockT.repeat(panelW), x, r, T('EDGE')); r++;
  const items = state.bin.items;
  txt('▌ BIN  (' + items.length + ')  ctrl+B add', x, r++, T('ACC'));
  if (!items.length) {
    txt('(empty)', x, r++, T('DIM'));
    return r;
  }
  const visible = Math.min(items.length, 6);
  const startIdx = Math.max(0, Math.min(items.length - visible, state.bin.scroll | 0));
  for (let i = 0; i < visible; i++) {
    const idx = startIdx + i;
    const it = items[idx];
    const isHover = state.hover.region === 'binItem' && state.hover.binItem === idx;
    const isSel = state.bin.selected === idx;
    const c = isHover ? T('HOVER') : isSel ? T('HI') : T('UI');
    let label = (isSel ? '▸' : ' ') + it.name;
    if (label.length > panelW - 2) label = label.slice(0, panelW - 3) + '…';
    txt(label, x, r, c);
    state.layout.binItems.push({ idx, x, y: r, w: panelW - 1 });
    r++;
  }
  if (items.length > visible) {
    txt('… ' + items.length + ' total · scroll wheel', x, r, T('DIM'));
    r++;
  }
  return r;
}

function drawStatus() {
  const sRow = state.rows - 2;
  if (state.status) txt(state.status, 1, sRow, T('POS'));

  // Hint based on hover region
  let hint = '';
  switch (state.hover.region) {
    case 'cell': {
      const tr = state.pattern.tracks[state.hover.track];
      if (tr) hint = '⎵ click toggle · drag paint · right-click clear · wheel ' + state.cursor.field + ' · mid grain';
      break;
    }
    case 'voice':     hint = 'click cycle voice · shift+click reverse'; break;
    case 'slot':      hint = 'click cycle bank slot · shift reverse'; break;
    case 'muteSolo':  hint = 'click mute · shift+click solo'; break;
    case 'lenDiv':    hint = 'click length · shift click div'; break;
    case 'name':      hint = 'click select track'; break;
    case 'bankSlot':  hint = 'click select for current track · shift+click load file'; break;
    case 'wave':      hint = 'click set slice · drag paint slice'; break;
    case 'knob':      hint = 'drag vertical · wheel nudge · right-click reset · shift fine'; break;
    case 'transport': hint = 'click play/pause'; break;
    default:
      hint = 'F1 help · ctrl+Z undo · ctrl+S save · shft+drag select · ctrl+C/X/V copy/cut/paste · click cells · drag knobs';
  }
  txt(hint, 1, sRow + 1, T('DIM'));
}
