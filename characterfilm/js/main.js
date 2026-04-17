import { state, setStatus } from './state.js';
import { MODE_KEY, MODES } from './constants.js';
import * as vid from './video.js';
import * as tl from './timeline.js';
import * as tools from './tools.js';
import * as hist from './history.js';
import * as ex from './export.js';
import { openIo, closeIo, isIoOpen } from './io.js';
import * as ui from './ui.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
ui.setCtx(ctx);

// ---- resize / layout ----
function resize() {
  state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = window.innerWidth, h = window.innerHeight;
  cv.width = w * state.dpr;
  cv.height = h * state.dpr;
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  state.cw = w; state.ch = h;
  state.uiCell = Math.max(10, Math.min(18, Math.floor(Math.min(w, h) / 52)));
}
resize();
window.addEventListener('resize', resize);

// ---- pointer handling ----
function pointerPos(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX ?? (e.touches?.[0]?.clientX ?? 0)) - r.left;
  const y = (e.clientY ?? (e.touches?.[0]?.clientY ?? 0)) - r.top;
  return { x, y };
}

function updatePointer(e) {
  const { x, y } = pointerPos(e);
  state.pointer.x = x; state.pointer.y = y;
  state.pointer.col = Math.floor(x / state.uiCell);
  state.pointer.row = Math.floor(y / state.uiCell);
  // art-coord mapping
  const v = state._viewRect;
  if (v) {
    const ax = Math.floor((x - v.ox) / v.cellW);
    const ay = Math.floor((y - v.oy) / v.cellH);
    if (ax >= 0 && ay >= 0 && ax < v.cols && ay < v.rows) {
      state.pointer.over = 'art';
      state.pointer.artX = ax;
      state.pointer.artY = ay;
    } else {
      state.pointer.over = 'ui';
      state.pointer.artX = -1;
      state.pointer.artY = -1;
    }
  }
}

let lastStroke = null; // { x, y }
let primed = false;

cv.addEventListener('pointermove', (e) => {
  updatePointer(e);
  if (state.pointer.down && state.pointer.over === 'art' && state.viewMode === 'frame' && state.current >= 0) {
    const x = state.pointer.artX, y = state.pointer.artY;
    applyToolStroke(x, y);
    lastStroke = { x, y };
  }
});

cv.addEventListener('pointerdown', (e) => {
  if (isIoOpen()) return;
  updatePointer(e);
  state.pointer.down = true;
  cv.setPointerCapture?.(e.pointerId);

  // UI click path first
  const handled = ui.handleUIClick(state.pointer.col, state.pointer.row, state.pointer.over === 'art');
  if (handled) { state.pointer.down = false; return; }

  // Art-grid interaction (painting / eyedrop / fill)
  if (state.pointer.over !== 'art') { state.pointer.down = false; return; }
  if (state.viewMode !== 'frame' || state.current < 0) {
    // Clicking on the live viewport captures a frame.
    const i = tl.captureFromLive();
    if (i >= 0) { state.current = i; state.viewMode = 'frame'; setStatus('captured frame ' + (i + 1)); }
    state.pointer.down = false;
    return;
  }

  // paint-mode interactions
  const x = state.pointer.artX, y = state.pointer.artY;
  if (state.mode === 'FILL') { tools.floodFillAt(x, y); state.pointer.down = false; return; }
  if (state.mode === 'EYEDROP') { tools.eyedropAt(x, y); state.pointer.down = false; return; }
  tools.beginStroke(state.mode);
  applyToolStroke(x, y);
  lastStroke = { x, y };
});

cv.addEventListener('pointerup', (e) => {
  updatePointer(e);
  state.pointer.down = false;
  lastStroke = null;
  tools.endStroke();
});

cv.addEventListener('pointerleave', () => {
  state.pointer.col = -1; state.pointer.row = -1;
  state.pointer.over = 'none';
  state.pointer.down = false;
  lastStroke = null;
});

function applyToolStroke(x, y) {
  const applyOne = (px, py) => {
    if (state.mode === 'BRUSH') tools.applyBrushAt(px, py);
    else if (state.mode === 'PENCIL') tools.applyPencilAt(px, py);
    else if (state.mode === 'ERASE') tools.applyBrushAt(px, py);
  };
  if (lastStroke) {
    tools.strokeLine(lastStroke.x, lastStroke.y, x, y, applyOne);
  } else {
    applyOne(x, y);
  }
}

// ---- file inputs ----
document.getElementById('filePick').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const kind = e.target.getAttribute('data-kind');
  if (kind === 'image' || f.type.startsWith('image/')) {
    await vid.loadImageFile(f);
  } else {
    await vid.loadVideoFile(f);
  }
  e.target.value = '';
});
document.getElementById('projPick').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  await ex.importJsonFile(f);
  e.target.value = '';
});

// ---- keyboard ----
window.addEventListener('keydown', (e) => {
  if (isIoOpen()) return;
  const k = e.key;
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;

  if (ctrl && !shift && (k === 'z' || k === 'Z')) { e.preventDefault(); hist.undo(); return; }
  if (ctrl && (k === 'y' || k === 'Y' || (shift && (k === 'z' || k === 'Z')))) { e.preventDefault(); hist.redo(); return; }
  if (ctrl && !shift && (k === 's' || k === 'S')) { e.preventDefault(); ex.exportJson(); return; }
  if (ctrl && shift && (k === 's' || k === 'S')) { e.preventDefault(); ex.quickSave(); return; }
  if (ctrl && !shift && (k === 'o' || k === 'O')) { e.preventDefault(); document.getElementById('projPick').click(); return; }
  if (ctrl && shift && (k === 'o' || k === 'O')) { e.preventDefault(); ex.quickLoad(); return; }
  if (ctrl && (k === 'j' || k === 'J')) { e.preventDefault(); tl.duplicateCurrentFrame(); return; }
  if (!ctrl && (k === 'Delete' || k === 'Backspace')) { tl.deleteCurrentFrame(); return; }

  if (k === 'Escape') { state.menuOpen = null; return; }
  if (k === ' ') { e.preventDefault(); tl.togglePlay(); return; }
  if (k === 'r' || k === 'R') { tl.toggleRecord(); return; }
  if (k === 'c' || k === 'C') {
    const i = tl.captureFromLive();
    if (i >= 0) { state.current = i; state.viewMode = 'frame'; setStatus('captured frame ' + (i + 1)); }
    return;
  }
  if (k === 'w' || k === 'W') { vid.startWebcam(); return; }
  if (k === 'Tab') { e.preventDefault(); state.viewMode = state.viewMode === 'live' ? 'frame' : 'live'; if (state.viewMode === 'frame' && state.current < 0 && state.frames.length) state.current = 0; return; }
  if (k === 'ArrowRight') { tl.stepForward(); return; }
  if (k === 'ArrowLeft') { tl.stepBack(); return; }
  if (k === '[') { state.brushSize = Math.max(1, state.brushSize - 1); return; }
  if (k === ']') { state.brushSize = Math.min(8, state.brushSize + 1); return; }
  if (k === '?') { e.preventDefault(); import('./ui.js'); /* help dialog comes via menu */ openHelp(); return; }

  // Tool shortcuts
  const tool = MODE_KEY[k.toLowerCase()];
  if (tool) { state.mode = tool; return; }
});

function openHelp() {
  // Delegate to ui dispatch by firing the help:keys path via openIo directly.
  openIo('Keyboard',
    `<p>
      <kbd>W</kbd> webcam &middot; <kbd>R</kbd> record/stop &middot; <kbd>Space</kbd> play<br>
      <kbd>C</kbd> capture &middot; <kbd>←</kbd>/<kbd>→</kbd> step &middot; <kbd>Tab</kbd> live/frame<br>
      <kbd>B</kbd>/<kbd>P</kbd>/<kbd>E</kbd>/<kbd>F</kbd>/<kbd>I</kbd> tools &middot; <kbd>[</kbd>/<kbd>]</kbd> brush<br>
      <kbd>Ctrl+Z</kbd>/<kbd>Y</kbd> undo/redo<br>
      <kbd>Ctrl+S</kbd> save &middot; <kbd>Ctrl+O</kbd> open<br>
      <kbd>Ctrl+Shift+S/O</kbd> quick save/load<br>
      <kbd>Esc</kbd> close menus
     </p>`,
    'OK', null, null, null);
}

// ---- main loop ----
function frame(now) {
  state.t++;

  // sample the source if in live view or while recording
  const needsLive = state.viewMode === 'live' || state.recording;
  if (needsLive) vid.sampleFrame();

  tl.tickRecord(now);
  tl.tickPlay(now);

  // clear & draw
  ctx.fillStyle = '#030403';
  ctx.fillRect(0, 0, state.cw, state.ch);
  ui.drawUI();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Initialize sensible defaults.
vid.ensureLiveBuffers();
setStatus('press W for webcam, or File → Load video / image');
