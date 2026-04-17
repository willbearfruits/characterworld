import { state, setStatus } from './state.js';
import { RAMPS, RAMP_NAMES, THEME_NAMES, MODES, GLYPH_PICKER, COLOR_MODES, SRC_NONE, SRC_WEBCAM } from './constants.js';
import { hexOfPalette, paletteSize, nameOfPalette } from './video.js';
import * as vid from './video.js';
import * as tl from './timeline.js';
import * as hist from './history.js';
import * as ex from './export.js';
import { openIo, closeIo, isIoOpen } from './io.js';

// Colors that are theme-independent (UI chrome).
const UI_BG = '#030403';
const UI_LOW = '#2a3a2a';
const UI_DIM = '#566956';
const UI_MID = '#708a70';
const UI_INK = '#d8f0c0';
const UI_HI = '#fff16a';
const UI_ACC = '#6ab7ff';
const UI_WARM = '#ff8a5c';

let ctx = null;
let buttons = [];

export function setCtx(c) { ctx = c; }

// ---- low-level drawing helpers (UI grid) ----
export function uiText(s, c, r, color, alpha) {
  ctx.globalAlpha = alpha ?? 1;
  ctx.fillStyle = color;
  const { uiCell } = state;
  const fontPx = Math.floor(uiCell * 1.02);
  ctx.font = `bold ${fontPx}px "Courier New", Courier, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(s, c * uiCell, r * uiCell + 1);
  ctx.globalAlpha = 1;
}
export function uiChar(ch, c, r, color, alpha) {
  uiText(ch, c, r, color, alpha);
}

function addButton(id, c, r, w, h) {
  buttons.push({ id, c, r, w, h });
}
export function hitButton(col, row) {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (col >= b.c && col < b.c + b.w && row >= b.r && row < b.r + b.h) return b;
  }
  return null;
}

function drawButton(id, label, c, r, w, active, color) {
  const s = (active ? '▸' : '[') + label + (active ? '◂' : ']');
  const width = Math.max(w, s.length);
  addButton(id, c, r, width, 1);
  uiText(s, c, r, active ? UI_HI : (color || UI_INK), active ? 1 : 0.88);
}

function drawPlain(id, label, c, r, color, alpha) {
  addButton(id, c, r, label.length, 1);
  uiText(label, c, r, color, alpha ?? 0.9);
}

function drawBox(x, y, w, h, color, alpha) {
  for (let c = x + 1; c < x + w - 1; c++) {
    uiChar('─', c, y, color, alpha);
    uiChar('─', c, y + h - 1, color, alpha);
  }
  for (let r = y + 1; r < y + h - 1; r++) {
    uiChar('│', x, r, color, alpha);
    uiChar('│', x + w - 1, r, color, alpha);
  }
  uiChar('┌', x, y, color, alpha);
  uiChar('┐', x + w - 1, y, color, alpha);
  uiChar('└', x, y + h - 1, color, alpha);
  uiChar('┘', x + w - 1, y + h - 1, color, alpha);
}

// ---- layout regions ----
// We compute these each frame from uiCols/uiRows.
export function layout() {
  const uiCols = Math.floor(state.cw / state.uiCell);
  const uiRows = Math.floor(state.ch / state.uiCell);

  // Menu bar: row 0
  // Panel (right side): fixed width
  // Timeline strip: bottom 6 rows
  // Status bar: bottom row
  // Viewport: the rest

  const panelW = 32;
  const menuH = 1;
  const tlH = 6;
  const statusH = 1;

  const viewportLeft = 0;
  const viewportTop = menuH + 1;
  const viewportRight = uiCols - panelW - 1;
  const viewportBottom = uiRows - tlH - statusH - 1;

  return {
    uiCols, uiRows, panelW, menuH, tlH, statusH,
    viewport: { l: viewportLeft, t: viewportTop, r: viewportRight, b: viewportBottom },
    panel:    { l: uiCols - panelW, t: 1, r: uiCols - 1, b: uiRows - tlH - statusH - 1 },
    timeline: { l: 0, t: uiRows - tlH - statusH, r: uiCols - 1, b: uiRows - statusH - 1 },
    status:   { l: 0, t: uiRows - statusH, r: uiCols - 1, b: uiRows - 1 },
  };
}

// ---- menu bar ----
const MENUS = {
  FILE: [
    { id: 'file:new',    label: 'New…',            key: 'Ctrl+N' },
    { id: 'file:open',   label: 'Open project…',   key: 'Ctrl+O' },
    { id: 'file:save',   label: 'Save project…',   key: 'Ctrl+S' },
    { id: 'file:qsave',  label: 'Quick save',      key: 'Ctrl+Shift+S' },
    { id: 'file:qload',  label: 'Quick load',      key: 'Ctrl+Shift+O' },
    { id: '---' },
    { id: 'file:webcam', label: 'Open webcam',     key: 'W' },
    { id: 'file:video',  label: 'Load video…',     key: '' },
    { id: 'file:image',  label: 'Load image…',     key: '' },
    { id: 'file:stop',   label: 'Stop source',     key: '' },
    { id: '---' },
    { id: 'file:png',    label: 'Export PNG',      key: '' },
    { id: 'file:gif',    label: 'Export GIF',      key: '' },
    { id: 'file:txt',    label: 'Export TXT',      key: '' },
    { id: 'file:ansi',   label: 'Export ANSI',     key: '' },
    { id: 'file:json',   label: 'Export JSON',     key: '' },
  ],
  EDIT: [
    { id: 'edit:undo',   label: 'Undo',            key: 'Ctrl+Z' },
    { id: 'edit:redo',   label: 'Redo',            key: 'Ctrl+Y' },
    { id: '---' },
    { id: 'edit:resize', label: 'Resize grid…',    key: '' },
  ],
  FRAME: [
    { id: 'frame:rec',   label: '● Record / Stop', key: 'R' },
    { id: 'frame:play',  label: '▶ Play / Pause',  key: 'Space' },
    { id: 'frame:cap',   label: 'Capture frame',   key: 'C' },
    { id: 'frame:step+', label: 'Step forward',    key: '→' },
    { id: 'frame:step-', label: 'Step back',       key: '←' },
    { id: 'frame:dup',   label: 'Duplicate frame', key: 'Ctrl+J' },
    { id: 'frame:del',   label: 'Delete frame',    key: 'Del' },
    { id: 'frame:clear', label: 'Clear timeline',  key: '' },
    { id: '---' },
    { id: 'frame:view',  label: 'Toggle live/frame', key: 'Tab' },
  ],
  HELP: [
    { id: 'help:keys',   label: 'Keyboard…',       key: '?' },
    { id: 'help:about',  label: 'About',           key: '' },
  ],
};

function drawMenuBar(L) {
  const labels = Object.keys(MENUS);
  let c = 1;
  for (const name of labels) {
    const active = state.menuOpen === name;
    const tag = ' ' + name + ' ';
    addButton('menu:' + name, c, 0, tag.length, 1);
    if (active) {
      ctx.fillStyle = UI_INK;
      ctx.fillRect(c * state.uiCell, 0, tag.length * state.uiCell, state.uiCell);
      uiText(tag, c, 0, UI_BG, 1);
    } else {
      uiText(tag, c, 0, UI_MID, 0.9);
    }
    c += tag.length + 1;
  }
  // source label
  const srcTag = '  ' + state.sourceLabel + '  ';
  uiText(srcTag, c + 2, 0, state.sourceReady ? UI_ACC : UI_DIM, 0.85);
  // recording indicator
  if (state.recording) {
    const blink = Math.floor(state.t / 10) % 2 ? 1 : 0.3;
    uiText(' ● REC ' + state.frames.length, L.uiCols - 18, 0, UI_WARM, blink);
  } else if (state.playing) {
    uiText(' ▶ PLAY ' + (state.current + 1) + '/' + state.frames.length, L.uiCols - 20, 0, UI_ACC, 0.9);
  } else {
    uiText(' ' + state.frames.length + ' frames ', L.uiCols - 14, 0, UI_DIM, 0.8);
  }
}

function drawMenuDropdown(L) {
  if (!state.menuOpen) return;
  const items = MENUS[state.menuOpen];
  if (!items) return;
  const labels = Object.keys(MENUS);
  // find x position of opened menu
  let x = 1;
  for (const name of labels) {
    if (name === state.menuOpen) break;
    x += (' ' + name + ' ').length + 1;
  }
  const maxLabel = Math.max(...items.map(i => i.id === '---' ? 0 : i.label.length));
  const maxKey = Math.max(...items.map(i => i.id === '---' ? 0 : (i.key || '').length));
  const w = maxLabel + maxKey + 4;
  const y = 1;
  // clip x so the dropdown stays within the canvas
  const xAdj = Math.min(x, Math.max(0, L.uiCols - w - 1));
  // opaque background fill for the whole dropdown box (covers viewport/panel drawn earlier)
  ctx.fillStyle = UI_BG;
  ctx.fillRect(xAdj * state.uiCell, y * state.uiCell, w * state.uiCell, (items.length + 1) * state.uiCell);
  drawBox(xAdj, y, w, items.length + 1, UI_DIM, 0.95);
  let yy = y + 1;
  for (const it of items) {
    if (it.id === '---') {
      for (let k = 1; k < w - 1; k++) uiChar('─', xAdj + k, yy, UI_LOW, 0.55);
    } else {
      addButton(it.id, xAdj + 1, yy, w - 2, 1);
      // highlight hovered item
      const hovered = state.pointer.row === yy && state.pointer.col >= xAdj + 1 && state.pointer.col < xAdj + w - 1;
      if (hovered) {
        ctx.fillStyle = UI_LOW;
        ctx.fillRect((xAdj + 1) * state.uiCell, yy * state.uiCell, (w - 2) * state.uiCell, state.uiCell);
      }
      uiText(it.label, xAdj + 2, yy, hovered ? UI_HI : UI_INK, hovered ? 1 : 0.9);
      if (it.key) uiText(it.key, xAdj + w - 2 - it.key.length, yy, UI_DIM, 0.75);
    }
    yy++;
  }
}

// ---- panels ----
function sectionHeader(key, label, x, y, w) {
  const open = state.panelOpen[key];
  addButton('panel:' + key, x, y, w, 1);
  uiText((open ? '▾ ' : '▸ ') + label, x, y, UI_INK, 0.95);
  return y + 1;
}

function meterRow(id, label, val, min, max, x, y, w, color) {
  const pct = (val - min) / (max - min);
  const fill = Math.round(Math.max(0, Math.min(1, pct)) * (w - 12));
  addButton(id + ':-', x, y, 1, 1);
  addButton(id + ':+', x + w - 1, y, 1, 1);
  uiText('-', x, y, UI_MID, 0.8);
  uiText('+', x + w - 1, y, UI_MID, 0.8);
  uiText(label, x + 2, y, UI_MID, 0.85);
  const labelLen = label.length;
  const barStart = x + 2 + labelLen + 1;
  const barW = x + w - 2 - barStart;
  for (let k = 0; k < barW; k++) {
    const ch = k < Math.round(pct * barW) ? '█' : '░';
    uiChar(ch, barStart + k, y, color || UI_ACC, 0.75);
  }
  // value readout on right
  const vs = String(val);
  uiText(vs, x + w - 2 - vs.length, y, UI_INK, 0.95);
}

function drawPanelKnobs(px, py, pw) {
  let y = sectionHeader('knobs', 'SOURCE · CONVERSION', px, py, pw);
  if (!state.panelOpen.knobs) return y + 1;
  const k = state.knobs;

  // Source toggle row
  drawButton('src:webcam', 'WEBCAM', px + 1, y, 10, state.sourceKind === 1);
  drawButton('src:video',  'VIDEO',  px + 12, y, 9, state.sourceKind === 2);
  drawButton('src:image',  'IMAGE',  px + 22, y, 9, state.sourceKind === 3);
  y += 2;

  meterRow('k:brightness', 'BRT', k.brightness, -100, 100, px + 1, y++, pw - 2, UI_INK);
  meterRow('k:contrast',   'CON', k.contrast,   -100, 100, px + 1, y++, pw - 2, UI_INK);
  meterRow('k:gamma',      'GAM', Math.round(k.gamma * 100), 30, 250, px + 1, y++, pw - 2, UI_HI);
  meterRow('k:threshold',  'THR', k.threshold,  0,    100, px + 1, y++, pw - 2, UI_DIM);
  meterRow('k:edge',       'EDG', k.edge,       0,    100, px + 1, y++, pw - 2, UI_ACC);

  // Invert toggle
  drawButton('k:invert', 'INVERT', px + 1, y, 10, k.invert);
  drawButton('k:fps-', 'FPS-', px + 13, y, 6, false);
  uiText(String(state.fps).padStart(2) + 'fps', px + 20, y, UI_INK, 0.95);
  drawButton('k:fps+', 'FPS+', px + 26, y, 5, false);
  y += 2;

  // Ramp selector
  uiText('RAMP', px + 1, y, UI_MID, 0.85);
  const rampName = RAMP_NAMES[k.rampIdx];
  drawButton('k:ramp-', '<', px + 7, y, 3, false);
  uiText(rampName, px + 11, y, UI_HI, 1);
  drawButton('k:ramp+', '>', px + pw - 4, y, 3, false);
  y++;
  // ramp preview
  const rampStr = RAMPS[RAMP_NAMES[k.rampIdx]];
  uiText('     ' + rampStr, px + 1, y, UI_INK, 0.9);
  y += 2;

  // Theme
  uiText('THEME', px + 1, y, UI_MID, 0.85);
  drawButton('k:theme-', '<', px + 7, y, 3, false);
  uiText(THEME_NAMES[k.themeIdx], px + 11, y, UI_HI, 1);
  drawButton('k:theme+', '>', px + pw - 4, y, 3, false);
  y++;
  // Show palette swatches as characters with each color.
  const pcount = paletteSize();
  for (let i = 0; i < pcount && i < pw - 2; i++) {
    const ch = '█';
    const isActive = i === k.inkColor;
    addButton('k:ink:' + i, px + 1 + i, y, 1, 1);
    uiText(ch, px + 1 + i, y, hexOfPalette(i), isActive ? 1 : 0.85);
    if (isActive) uiChar('▾', px + 1 + i, y - 0.001, UI_HI, 0);
  }
  y++;
  // Color mode toggle
  uiText('COLOR', px + 1, y, UI_MID, 0.85);
  COLOR_MODES.forEach((m, i) => {
    drawButton('k:cmode:' + i, m, px + 7 + i * 10, y, 9, k.colorMode === i);
  });
  y += 2;
  return y;
}

function drawPanelTools(px, py, pw) {
  let y = sectionHeader('tools', 'TOOLS · FRAME EDIT', px, py, pw);
  if (!state.panelOpen.tools) return y + 1;
  const viewing = state.viewMode === 'frame' && state.current >= 0;
  let x = px + 1;
  for (const m of MODES) {
    drawButton('mode:' + m.id, m.id[0] + ' ' + m.id, x, y, 9, state.mode === m.id);
    x += 10;
    if (x + 9 > px + pw) { x = px + 1; y++; }
  }
  y += 2;
  // Brush size
  drawButton('brush:-', 'SIZE-', px + 1, y, 7, false);
  uiText(String(state.brushSize).padStart(2), px + 9, y, UI_INK, 0.95);
  drawButton('brush:+', 'SIZE+', px + 12, y, 7, false);
  y += 2;
  if (!viewing) {
    uiText('(select a frame to paint)', px + 1, y++, UI_DIM, 0.7);
  }
  return y + 1;
}

function drawPanelGlyphs(px, py, pw) {
  let y = sectionHeader('glyphs', 'GLYPH · BRUSH', px, py, pw);
  if (!state.panelOpen.glyphs) return y + 1;
  uiText('now: ', px + 1, y, UI_MID, 0.85);
  uiText(state.brushGlyph, px + 6, y, UI_HI, 1);
  y += 1;
  const perRow = pw - 2;
  let x = px + 1;
  for (let i = 0; i < GLYPH_PICKER.length; i++) {
    const g = GLYPH_PICKER[i];
    const active = g === state.brushGlyph;
    addButton('glyph:' + i, x, y, 1, 1);
    uiText(g, x, y, active ? UI_HI : UI_INK, active ? 1 : 0.75);
    x++;
    if (x - px > perRow) { x = px + 1; y++; }
  }
  y += 2;
  return y;
}

function drawPanelPalette(px, py, pw) {
  let y = sectionHeader('palette', 'PAINT COLOR', px, py, pw);
  if (!state.panelOpen.palette) return y + 1;
  const pc = paletteSize();
  for (let i = 0; i < pc; i++) {
    const x = px + 1 + (i % (pw - 2));
    const r = y + Math.floor(i / (pw - 2));
    addButton('pcol:' + i, x, r, 1, 1);
    uiText('█', x, r, hexOfPalette(i), state.brushColor === i ? 1 : 0.8);
  }
  y += Math.ceil(pc / (pw - 2)) + 1;
  return y;
}

function drawPanelHelp(px, py, pw) {
  let y = sectionHeader('help', 'KEYS', px, py, pw);
  if (!state.panelOpen.help) return y + 1;
  const keys = [
    'W  open webcam',
    'R  record / stop',
    'SP play / pause',
    'C  capture frame',
    '←→ step frames',
    'TAB toggle live/frame',
    'B/P/E/F/I pick tool',
    '[ ] brush size',
    'Ctrl+Z/Y undo/redo',
    'Ctrl+S save · Ctrl+O load',
    '? keys · Esc close',
  ];
  for (const k of keys) {
    uiText(k, px + 1, y++, UI_DIM, 0.85);
  }
  return y + 1;
}

function drawPanel(L) {
  const px = L.panel.l, py = L.panel.t, pw = L.panelW;
  // panel backdrop
  ctx.fillStyle = UI_BG;
  ctx.fillRect((px - 1) * state.uiCell, (py - 0.5) * state.uiCell, (pw + 1) * state.uiCell, (L.panel.b - py + 1) * state.uiCell);
  // divider
  for (let r = py; r <= L.panel.b; r++) uiChar('│', px - 1, r, UI_LOW, 0.7);

  let y = py;
  y = drawPanelKnobs(px, y, pw);
  y = drawPanelTools(px, y, pw);
  y = drawPanelGlyphs(px, y, pw);
  y = drawPanelPalette(px, y, pw);
  y = drawPanelHelp(px, y, pw);
}

// ---- viewport: show either live conversion or selected frame ----
function drawViewport(L) {
  const V = L.viewport;
  const vw = V.r - V.l;
  const vh = V.b - V.t;

  // backdrop
  ctx.fillStyle = UI_BG;
  ctx.fillRect(V.l * state.uiCell, V.t * state.uiCell, (vw + 1) * state.uiCell, (vh + 1) * state.uiCell);

  // compute art cell size to fit the viewport.
  const { cols, rows } = state;
  const availW = (vw - 1) * state.uiCell;
  const availH = (vh - 1) * state.uiCell;
  // chars are ~2x taller than wide, so cellW <-> cellH/2 relationship
  const cellH = Math.max(4, Math.floor(Math.min(availW / cols, availH / rows)));
  const cellW = cellH; // we stretch height implicitly with tall font
  const drawW = cellW * cols;
  const drawH = cellH * rows;
  const ox = V.l * state.uiCell + Math.floor((availW - drawW) / 2) + state.uiCell;
  const oy = V.t * state.uiCell + Math.floor((availH - drawH) / 2) + state.uiCell;
  state.artCell = cellH;
  state._artOx = ox;
  state._artOy = oy;

  // frame choice: when in 'live' view or no frames, show live buffer; when frame mode, show that frame. Onion skin not drawn yet.
  let frame;
  if (state.viewMode === 'frame' && state.current >= 0 && state.current < state.frames.length) {
    frame = state.frames[state.current];
  } else {
    frame = state.live;
  }

  // backdrop frame border
  const viewEndR = (ox + drawW) / state.uiCell;
  const viewEndB = (oy + drawH) / state.uiCell;
  // Draw dotted-corner marks around the canvas.
  ctx.font = `bold ${Math.floor(state.uiCell * 1.02)}px "Courier New", Courier, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = UI_DIM;
  ctx.globalAlpha = 0.65;
  // corners — easier to draw by UI coords around the rect
  const cornL = Math.floor(ox / state.uiCell) - 1;
  const cornT = Math.floor(oy / state.uiCell) - 1;
  const cornR = Math.floor((ox + drawW) / state.uiCell);
  const cornB = Math.floor((oy + drawH) / state.uiCell);
  uiChar('┌', cornL, cornT, UI_DIM, 0.7);
  uiChar('┐', cornR, cornT, UI_DIM, 0.7);
  uiChar('└', cornL, cornB, UI_DIM, 0.7);
  uiChar('┘', cornR, cornB, UI_DIM, 0.7);
  ctx.globalAlpha = 1;

  if (!frame || !frame.chars) {
    uiText('no source — press W for webcam', V.l + Math.floor(vw / 2) - 14, V.t + Math.floor(vh / 2), UI_DIM, 0.8);
    // Clickable hint
    addButton('src:webcam', V.l + Math.floor(vw / 2) - 14, V.t + Math.floor(vh / 2), 30, 1);
    return;
  }

  // Render the character grid with art cell size.
  const artFontPx = Math.floor(cellH * 1.02);
  ctx.font = `bold ${artFontPx}px "Courier New", Courier, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';

  // Register per-cell hit-rects for editing (only when in a frame).
  const paintable = state.viewMode === 'frame' && state.current >= 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const ch = frame.chars[i];
      if (ch && ch !== ' ') {
        ctx.fillStyle = hexOfPalette(frame.colors[i] || 1);
        ctx.fillText(ch, ox + x * cellW + cellW / 2, oy + y * cellH + 1);
      }
    }
  }

  // Publish pixel→art mapping for pointer handling.
  state._viewRect = { ox, oy, cellW, cellH, cols, rows };

  // Viewport label
  const label = state.viewMode === 'frame' && state.current >= 0
    ? ` FRAME ${state.current + 1} / ${state.frames.length} `
    : (state.sourceReady ? ' LIVE ' : ' NO SOURCE ');
  uiText(label, cornL + 1, cornT, state.viewMode === 'frame' ? UI_HI : UI_ACC, 0.9);
  const sizeLabel = ` ${cols}×${rows} `;
  uiText(sizeLabel, cornR - sizeLabel.length, cornT, UI_DIM, 0.7);
}

// ---- timeline strip ----
function drawTimeline(L) {
  const T = L.timeline;
  const w = T.r - T.l + 1;
  ctx.fillStyle = UI_BG;
  ctx.fillRect(T.l * state.uiCell, T.t * state.uiCell, w * state.uiCell, (T.b - T.t + 1) * state.uiCell);
  for (let c = T.l; c <= T.r; c++) uiChar('─', c, T.t, UI_LOW, 0.7);

  // controls
  let x = T.l + 1;
  drawButton('tl:rec', state.recording ? '■ STOP' : '● REC', x, T.t + 1, 8, state.recording); x += 10;
  drawButton('tl:play', state.playing ? '‖ PAUSE' : '▶ PLAY', x, T.t + 1, 9, state.playing); x += 11;
  drawButton('tl:cap', '◉ CAPTURE', x, T.t + 1, 11, false); x += 13;
  drawButton('tl:step-', '◂', x, T.t + 1, 3, false); x += 4;
  drawButton('tl:step+', '▸', x, T.t + 1, 3, false); x += 4;
  drawButton('tl:dup',  'DUP', x, T.t + 1, 5, false); x += 6;
  drawButton('tl:del',  'DEL', x, T.t + 1, 5, false); x += 6;
  drawButton('tl:clear', 'CLR', x, T.t + 1, 5, false); x += 6;
  drawButton('tl:live', 'LIVE', x, T.t + 1, 6, state.viewMode === 'live'); x += 7;

  // filmstrip: one char per frame
  const stripY = T.t + 3;
  const stripX = T.l + 1;
  const stripW = T.r - T.l - 1;
  // Scroll to keep current in view.
  const total = state.frames.length;
  let offset = 0;
  if (total > stripW) {
    const half = Math.floor(stripW / 2);
    offset = Math.max(0, Math.min(total - stripW, (state.current < 0 ? 0 : state.current) - half));
  }
  addButton('tl:strip', stripX, stripY, stripW, 1);
  // Register per-frame hit-rects (limit by stripW).
  for (let i = 0; i < stripW; i++) {
    const fi = offset + i;
    if (fi >= total) {
      uiChar('·', stripX + i, stripY, UI_LOW, 0.4);
      continue;
    }
    addButton('tl:frame:' + fi, stripX + i, stripY, 1, 1);
    const isCur = fi === state.current;
    const ch = isCur ? '█' : '▆';
    uiChar(ch, stripX + i, stripY, isCur ? UI_HI : UI_DIM, isCur ? 1 : 0.65);
  }
  // Playhead indicator
  if (state.current >= 0 && state.current < total) {
    const playX = stripX + (state.current - offset);
    if (playX >= stripX && playX < stripX + stripW) {
      uiChar('▼', playX, stripY - 1, UI_HI, 0.9);
    }
  }

  // Scale ticks
  if (total > 0) {
    uiText(`${total} frames · ${state.fps}fps · ${(total / Math.max(1, state.fps)).toFixed(1)}s`, stripX, T.t + 4, UI_DIM, 0.8);
  } else {
    uiText('no frames — press R to record from source, or C to capture', stripX, T.t + 4, UI_DIM, 0.75);
  }
}

function drawStatus(L) {
  const S = L.status;
  const w = S.r - S.l + 1;
  ctx.fillStyle = UI_LOW;
  ctx.fillRect(0, S.t * state.uiCell, state.cw, state.uiCell);
  let msg = state.statusMsg || 'ready';
  // fade after a while
  const age = state.t - state.statusT;
  const alpha = age < 120 ? 1 : (age < 240 ? 1 - (age - 120) / 120 : 0.4);
  uiText(' ' + msg, 0, S.t, UI_INK, alpha);
  // mode indicator
  const right = ` mode:${state.mode}  glyph:${state.brushGlyph}  col:${nameOfPalette(state.brushColor)}  brush:${state.brushSize} `;
  uiText(right, Math.max(20, L.uiCols - right.length - 1), S.t, UI_MID, 0.85);
}

function drawCursor() {
  if (isIoOpen()) return;
  const { col, row, over, x, y } = state.pointer;
  if (col < 0 || row < 0) return;
  const hovered = hitButton(col, row);
  const inArt = over === 'art';
  if (inArt) {
    // Art-grid cursor: render a dim crosshair in art coordinates.
    const v = state._viewRect;
    if (v) {
      ctx.font = `bold ${Math.floor(v.cellH * 1.02)}px "Courier New", Courier, monospace`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      ctx.fillStyle = UI_HI;
      ctx.globalAlpha = 0.9;
      ctx.fillText('◈', v.ox + state.pointer.artX * v.cellW + v.cellW / 2, v.oy + state.pointer.artY * v.cellH + 1);
      ctx.globalAlpha = 1;
    }
  } else {
    const ch = hovered ? '◈' : '·';
    uiText(ch, col, row, hovered ? UI_HI : UI_INK, 0.9);
  }
}

// ---- main draw entry ----
export function drawUI() {
  buttons = [];
  const L = layout();
  drawMenuBar(L);
  drawViewport(L);
  drawPanel(L);
  drawTimeline(L);
  drawStatus(L);
  // Dropdown goes LAST so it sits on top of the viewport/panel/timeline.
  drawMenuDropdown(L);
  drawCursor();
  return L;
}

// ---- click dispatch ----
export function handleUIClick(col, row, art) {
  // close menu on outside-click
  if (state.menuOpen) {
    const b = hitButton(col, row);
    if (!b || (!b.id.startsWith(state.menuOpen.toLowerCase() + ':') && !b.id.startsWith('menu:'))) {
      state.menuOpen = null;
    }
  }
  const b = hitButton(col, row);
  if (!b) return false;
  return dispatch(b.id);
}

function dispatch(id) {
  // menu toggles
  if (id.startsWith('menu:')) {
    const name = id.slice(5);
    state.menuOpen = state.menuOpen === name ? null : name;
    return true;
  }
  // panel section toggles
  if (id.startsWith('panel:')) {
    const k = id.slice(6);
    state.panelOpen[k] = !state.panelOpen[k];
    return true;
  }
  const k = state.knobs;
  // close menu when dispatching a menu item
  const close = () => { state.menuOpen = null; };

  // file menu
  if (id === 'file:new')    { close(); newProjectDialog(); return true; }
  if (id === 'file:open')   { close(); document.getElementById('projPick').click(); return true; }
  if (id === 'file:save')   { close(); ex.exportJson(); return true; }
  if (id === 'file:qsave')  { close(); ex.quickSave(); return true; }
  if (id === 'file:qload')  { close(); ex.quickLoad(); return true; }
  if (id === 'file:webcam' || id === 'src:webcam') { close(); vid.startWebcam(); return true; }
  if (id === 'file:video'  || id === 'src:video')  { close(); document.getElementById('filePick').setAttribute('data-kind', 'video'); document.getElementById('filePick').click(); return true; }
  if (id === 'file:image'  || id === 'src:image')  { close(); document.getElementById('filePick').setAttribute('data-kind', 'image'); document.getElementById('filePick').click(); return true; }
  if (id === 'file:stop')   { close(); vid.stopSource(); return true; }
  if (id === 'file:png')    { close(); ex.exportPng(); return true; }
  if (id === 'file:gif')    { close(); ex.exportGif(); return true; }
  if (id === 'file:txt')    { close(); ex.exportTxt(); return true; }
  if (id === 'file:ansi')   { close(); ex.exportAnsi(); return true; }
  if (id === 'file:json')   { close(); ex.exportJson(); return true; }

  // edit
  if (id === 'edit:undo')   { close(); hist.undo(); return true; }
  if (id === 'edit:redo')   { close(); hist.redo(); return true; }
  if (id === 'edit:resize') { close(); resizeDialog(); return true; }

  // frame
  if (id === 'frame:rec' || id === 'tl:rec')     { close(); tl.toggleRecord(); return true; }
  if (id === 'frame:play' || id === 'tl:play')   { close(); tl.togglePlay(); return true; }
  if (id === 'frame:cap' || id === 'tl:cap')     { close(); const i = tl.captureFromLive(); if (i >= 0) { state.current = i; state.viewMode = 'frame'; setStatus('captured frame ' + (i + 1)); } return true; }
  if (id === 'frame:step+' || id === 'tl:step+') { close(); tl.stepForward(); return true; }
  if (id === 'frame:step-' || id === 'tl:step-') { close(); tl.stepBack(); return true; }
  if (id === 'frame:dup' || id === 'tl:dup')     { close(); tl.duplicateCurrentFrame(); return true; }
  if (id === 'frame:del' || id === 'tl:del')     { close(); tl.deleteCurrentFrame(); return true; }
  if (id === 'frame:clear' || id === 'tl:clear') { close(); tl.clearAllFrames(); return true; }
  if (id === 'frame:view' || id === 'tl:live')   { close(); state.viewMode = state.viewMode === 'live' ? 'frame' : 'live'; if (state.viewMode === 'frame' && state.current < 0 && state.frames.length) state.current = 0; return true; }

  if (id.startsWith('tl:frame:')) { const i = parseInt(id.slice(9), 10); tl.gotoFrame(i); return true; }
  if (id === 'tl:strip') return true;

  // tools
  if (id.startsWith('mode:')) { state.mode = id.slice(5); return true; }
  if (id === 'brush:+') { state.brushSize = Math.min(8, state.brushSize + 1); return true; }
  if (id === 'brush:-') { state.brushSize = Math.max(1, state.brushSize - 1); return true; }

  // knobs
  const bump = (key, d, lo, hi) => { k[key] = Math.max(lo, Math.min(hi, k[key] + d)); state.live.dirty = true; };
  if (id === 'k:brightness:-') { bump('brightness', -5, -100, 100); return true; }
  if (id === 'k:brightness:+') { bump('brightness',  5, -100, 100); return true; }
  if (id === 'k:contrast:-')   { bump('contrast',  -5, -100, 100); return true; }
  if (id === 'k:contrast:+')   { bump('contrast',   5, -100, 100); return true; }
  if (id === 'k:gamma:-')      { k.gamma = Math.max(0.3, k.gamma - 0.1); state.live.dirty = true; return true; }
  if (id === 'k:gamma:+')      { k.gamma = Math.min(2.5, k.gamma + 0.1); state.live.dirty = true; return true; }
  if (id === 'k:threshold:-')  { bump('threshold', -5, 0, 100); return true; }
  if (id === 'k:threshold:+')  { bump('threshold',  5, 0, 100); return true; }
  if (id === 'k:edge:-')       { bump('edge', -5, 0, 100); return true; }
  if (id === 'k:edge:+')       { bump('edge',  5, 0, 100); return true; }
  if (id === 'k:invert')       { k.invert = !k.invert; state.live.dirty = true; return true; }
  if (id === 'k:fps+')         { state.fps = Math.min(60, state.fps + 1); return true; }
  if (id === 'k:fps-')         { state.fps = Math.max(1, state.fps - 1); return true; }
  if (id === 'k:ramp-')        { k.rampIdx = (k.rampIdx - 1 + RAMP_NAMES.length) % RAMP_NAMES.length; state.live.dirty = true; return true; }
  if (id === 'k:ramp+')        { k.rampIdx = (k.rampIdx + 1) % RAMP_NAMES.length; state.live.dirty = true; return true; }
  if (id === 'k:theme-')       { k.themeIdx = (k.themeIdx - 1 + THEME_NAMES.length) % THEME_NAMES.length; state.live.dirty = true; return true; }
  if (id === 'k:theme+')       { k.themeIdx = (k.themeIdx + 1) % THEME_NAMES.length; state.live.dirty = true; return true; }
  if (id.startsWith('k:ink:'))   { k.inkColor = parseInt(id.slice(6), 10); state.live.dirty = true; return true; }
  if (id.startsWith('k:cmode:')) { k.colorMode = parseInt(id.slice(8), 10); state.live.dirty = true; return true; }

  // glyph/color
  if (id.startsWith('glyph:')) { state.brushGlyph = GLYPH_PICKER[parseInt(id.slice(6), 10)]; return true; }
  if (id.startsWith('pcol:'))  { state.brushColor = parseInt(id.slice(5), 10); return true; }

  // help
  if (id === 'help:keys')  { close(); keysDialog(); return true; }
  if (id === 'help:about') { close(); aboutDialog(); return true; }

  return false;
}

// ---- dialogs ----
function newProjectDialog() {
  openIo('New project',
    `<label>columns</label><input id="ioC" type="number" value="${state.cols}" min="16" max="320">
     <label>rows</label><input id="ioR" type="number" value="${state.rows}" min="8" max="200">
     <p>Warning: resets timeline.</p>`,
    'CREATE', () => {
      const c = parseInt(document.getElementById('ioC').value, 10) || state.cols;
      const r = parseInt(document.getElementById('ioR').value, 10) || state.rows;
      tl.clearAllFrames();
      tl.resetGridTo(Math.max(16, Math.min(320, c)), Math.max(8, Math.min(200, r)));
    }, 'CANCEL');
}

function resizeDialog() {
  openIo('Resize grid',
    `<label>columns</label><input id="ioC" type="number" value="${state.cols}" min="16" max="320">
     <label>rows</label><input id="ioR" type="number" value="${state.rows}" min="8" max="200">
     <p>Existing frames will be cleared (size change invalidates their content).</p>`,
    'RESIZE', () => {
      const c = parseInt(document.getElementById('ioC').value, 10) || state.cols;
      const r = parseInt(document.getElementById('ioR').value, 10) || state.rows;
      tl.resetGridTo(Math.max(16, Math.min(320, c)), Math.max(8, Math.min(200, r)));
    }, 'CANCEL');
}

function keysDialog() {
  openIo('Keyboard',
    `<p>
     <kbd>W</kbd> webcam &nbsp; <kbd>R</kbd> record/stop &nbsp; <kbd>Space</kbd> play/pause<br>
     <kbd>C</kbd> capture &nbsp; <kbd>←</kbd>/<kbd>→</kbd> step &nbsp; <kbd>Tab</kbd> live/frame<br>
     <kbd>B</kbd>/<kbd>P</kbd>/<kbd>E</kbd>/<kbd>F</kbd>/<kbd>I</kbd> tools &nbsp; <kbd>[</kbd>/<kbd>]</kbd> brush size<br>
     <kbd>Ctrl+Z</kbd>/<kbd>Ctrl+Y</kbd> undo/redo<br>
     <kbd>Ctrl+S</kbd> save JSON &nbsp; <kbd>Ctrl+O</kbd> open project<br>
     <kbd>Ctrl+Shift+S</kbd> quick save &nbsp; <kbd>Ctrl+Shift+O</kbd> quick load<br>
     <kbd>Ctrl+J</kbd> duplicate frame &nbsp; <kbd>Delete</kbd> delete frame<br>
     <kbd>Esc</kbd> close &middot; <kbd>?</kbd> this
     </p>`,
    'OK', null, null, null);
}
function aboutDialog() {
  openIo('characterfilm',
    `<p>Character-only video editor. Webcam or video → typed glyphs in real time. Record, scrub, paint over frames, export GIF / PNG / ANSI / JSON.</p>
     <p>Part of <a style="color:#6ab7ff" href="../">characterworld</a>. Project law: every visible form is a typed glyph.</p>`,
    'OK', null, null, null);
}

// Expose buttons for pointer handler
export function getButtons() { return buttons; }
