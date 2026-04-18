import { state, setStatus } from './state.js';
import { pushHistory } from './history.js';
import { currentFrame } from './timeline.js';

let strokeActive = false;

export function beginStroke(label) {
  if (strokeActive) return;
  pushHistory(label || state.mode);
  strokeActive = true;
}
export function endStroke() { strokeActive = false; }

function idx(x, y) { return y * state.cols + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < state.cols && y < state.rows; }

export function paintCell(x, y, ch, col, isErase) {
  const f = currentFrame();
  if (!f) return;
  if (!inBounds(x, y)) return;
  const i = idx(x, y);
  if (isErase) {
    f.chars[i] = ' ';
    f.colors[i] = 0;
    f.marks[i] = 0;
  } else {
    f.chars[i] = ch;
    f.colors[i] = col;
  }
  // Painted cells use the palette — clear any truecolor sentinel bytes.
  if (f.rgb) {
    f.rgb[i * 3] = 0; f.rgb[i * 3 + 1] = 0; f.rgb[i * 3 + 2] = 0;
  }
}

export function applyBrushAt(x, y) {
  const size = state.brushSize;
  const r = size - 1;
  const erase = state.mode === 'ERASE';
  const ch = state.brushGlyph;
  const col = state.brushColor;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue;
      paintCell(x + dx, y + dy, ch, col, erase);
    }
  }
}

export function applyPencilAt(x, y) {
  paintCell(x, y, state.brushGlyph, state.brushColor, false);
}

export function floodFillAt(x, y) {
  const f = currentFrame();
  if (!f) return;
  if (!inBounds(x, y)) return;
  const i0 = idx(x, y);
  const tgtCh = f.chars[i0];
  const tgtCol = f.colors[i0];
  const newCh = state.brushGlyph;
  const newCol = state.brushColor;
  if (tgtCh === newCh && tgtCol === newCol) return;
  pushHistory('FILL');
  const stack = [[x, y]];
  const visited = new Uint8Array(state.cols * state.rows);
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (!inBounds(cx, cy)) continue;
    const i = idx(cx, cy);
    if (visited[i]) continue;
    visited[i] = 1;
    if (f.chars[i] !== tgtCh || f.colors[i] !== tgtCol) continue;
    f.chars[i] = newCh;
    f.colors[i] = newCol;
    if (f.rgb) { f.rgb[i * 3] = 0; f.rgb[i * 3 + 1] = 0; f.rgb[i * 3 + 2] = 0; }
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

export function eyedropAt(x, y) {
  const f = currentFrame();
  if (!f) return;
  if (!inBounds(x, y)) return;
  const i = idx(x, y);
  if (f.chars[i] !== ' ') {
    state.brushGlyph = f.chars[i];
    const c = f.colors[i];
    // Truecolor cells fall back to INK (palette index 1) for the brush color.
    state.brushColor = c === 255 ? 1 : (c || 1);
    setStatus('picked: ' + state.brushGlyph);
  }
}

// Draw a line of tool-applications between two art-grid points.
export function strokeLine(x0, y0, x1, y1, fn) {
  // Bresenham.
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  const safety = state.cols + state.rows + 8;
  let step = 0;
  while (true) {
    fn(x, y);
    if (x === x1 && y === y1) break;
    if (step++ > safety * 2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
