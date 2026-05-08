// clipboard.js — copy/cut/paste cell ranges. Selection-aware.
//
// A clipboard payload is a 2D rectangle of cell snapshots:
//   { width: tracks, height: steps, data: [trackCol][stepRow] }
// data[t][s] is either a cloned cell or null (for tracks/steps out of range).

import { state, setStatus } from './state.js';
import { pushHistory } from './history.js';
import { makeCell } from './pattern.js';

let clipboard = null;

export function getClipboard() { return clipboard; }
export function clearClipboard() { clipboard = null; }

export function selectAll() {
  const tracks = state.pattern.tracks;
  if (!tracks.length) return;
  let maxLen = 0;
  for (const t of tracks) if (t.length > maxLen) maxLen = t.length;
  state.selection = {
    trackStart: 0, trackEnd: tracks.length - 1,
    stepStart: 0, stepEnd: maxLen - 1,
  };
  setStatus('selected all (' + tracks.length + '×' + maxLen + ')');
}

export function deselect() {
  if (!state.selection) return;
  state.selection = null;
  setStatus('deselected');
}

export function setSelection(trackStart, stepStart, trackEnd, stepEnd) {
  const ta = Math.min(trackStart, trackEnd);
  const tb = Math.max(trackStart, trackEnd);
  const sa = Math.min(stepStart, stepEnd);
  const sb = Math.max(stepStart, stepEnd);
  state.selection = { trackStart: ta, trackEnd: tb, stepStart: sa, stepEnd: sb };
}

export function copySelection() {
  const sel = state.selection;
  if (!sel) { setStatus('no selection'); return false; }
  const width = sel.trackEnd - sel.trackStart + 1;
  const height = sel.stepEnd - sel.stepStart + 1;
  const data = [];
  for (let dt = 0; dt < width; dt++) {
    const tr = state.pattern.tracks[sel.trackStart + dt];
    const col = [];
    for (let ds = 0; ds < height; ds++) {
      const stepIdx = sel.stepStart + ds;
      const cell = (tr && stepIdx < tr.length) ? tr.cells[stepIdx] : null;
      col.push(cell ? { ...cell } : null);
    }
    data.push(col);
  }
  clipboard = { width, height, data };
  setStatus('copied ' + width + '×' + height);
  return true;
}

export function cutSelection() {
  if (!state.selection) { setStatus('no selection'); return false; }
  if (!copySelection()) return false;
  pushHistory('cut');
  const sel = state.selection;
  for (let dt = 0; dt <= sel.trackEnd - sel.trackStart; dt++) {
    const tr = state.pattern.tracks[sel.trackStart + dt];
    if (!tr) continue;
    for (let ds = 0; ds <= sel.stepEnd - sel.stepStart; ds++) {
      const stepIdx = sel.stepStart + ds;
      if (stepIdx < tr.length) tr.cells[stepIdx] = makeCell();
    }
  }
  return true;
}

export function deleteSelection() {
  if (!state.selection) return false;
  pushHistory('delete');
  const sel = state.selection;
  for (let dt = 0; dt <= sel.trackEnd - sel.trackStart; dt++) {
    const tr = state.pattern.tracks[sel.trackStart + dt];
    if (!tr) continue;
    for (let ds = 0; ds <= sel.stepEnd - sel.stepStart; ds++) {
      const stepIdx = sel.stepStart + ds;
      if (stepIdx < tr.length) tr.cells[stepIdx] = makeCell();
    }
  }
  setStatus('deleted selection');
  return true;
}

export function pasteAt(trackStart, stepStart) {
  if (!clipboard) { setStatus('clipboard empty'); return false; }
  pushHistory('paste');
  for (let dt = 0; dt < clipboard.width; dt++) {
    const tr = state.pattern.tracks[trackStart + dt];
    if (!tr) continue;
    const col = clipboard.data[dt];
    if (!col) continue;
    for (let ds = 0; ds < clipboard.height; ds++) {
      const stepIdx = stepStart + ds;
      if (stepIdx >= tr.length) break;
      const src = col[ds];
      if (!src) continue;
      tr.cells[stepIdx] = { ...src };
    }
  }
  // Move selection to the just-pasted region for visual confirmation.
  state.selection = {
    trackStart,
    trackEnd: Math.min(state.pattern.tracks.length - 1, trackStart + clipboard.width - 1),
    stepStart,
    stepEnd: stepStart + clipboard.height - 1,
  };
  setStatus('pasted ' + clipboard.width + '×' + clipboard.height);
  return true;
}

// Bonus: invert active state across selection — useful for "anti-pattern" composition.
export function invertSelection() {
  if (!state.selection) return false;
  pushHistory('invert');
  const sel = state.selection;
  for (let dt = 0; dt <= sel.trackEnd - sel.trackStart; dt++) {
    const tr = state.pattern.tracks[sel.trackStart + dt];
    if (!tr) continue;
    for (let ds = 0; ds <= sel.stepEnd - sel.stepStart; ds++) {
      const stepIdx = sel.stepStart + ds;
      if (stepIdx < tr.length) tr.cells[stepIdx].active = !tr.cells[stepIdx].active;
    }
  }
  setStatus('inverted selection');
  return true;
}
