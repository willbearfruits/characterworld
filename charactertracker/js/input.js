// input.js — keyboard + mouse. Mouse-first painting with keyboard shortcuts.
//
// Mouse semantics:
//   left click  on cell        : toggle active. Drag = paint matching first cell's new state.
//   right click on cell        : clear cell (force inactive). Drag = erase.
//   wheel       on cell        : adjust the focused field's value. Shift = ×10.
//   middle-click on cell       : toggle grain (accent) modifier.
//   left click  on knob        : begin drag (vertical = value).
//   wheel       on knob        : nudge value.
//   right click on knob        : reset (categorical: pick default; numeric: midpoint of range).
//   left click  on track header: select track (and cycles muted state if on M/S marker).
//   left click  on voice tag   : cycle voice (shift = reverse).
//   left click  on slot tag    : cycle bank slot (shift = reverse).
//   left click  on len/div tag : cycle length / division.
//   left click  on bank slot   : select bank slot for cursor track.
//   left click  on transport   : play/pause.

import { state, setStatus } from './state.js';
import { CLAMPS, DIVISIONS, LENGTHS, FIELD_ORDER, VOICES } from './constants.js';
import { toggleTransport, stopTransport, panic } from './scheduler.js';
import { audioCtx, setMasterGain, setSatDrive } from './audio.js';
import {
  loadFileToSlot, generateDefaultBufferToSlot,
  setSlotSliceCount, setSlotTransientSlices,
} from './bank.js';
import {
  resizeTrack, clearPattern, randomizePattern, setTrackVoice,
} from './pattern.js';
import { knobAt, applyKnobDrag } from './knobs.js';
import { spawnBurst } from './particles.js';
import { pushHistory, undo, redo } from './history.js';
import {
  selectAll, deselect, copySelection, cutSelection, pasteAt,
  deleteSelection, invertSelection, setSelection, getClipboard,
} from './clipboard.js';
import { downloadProjectFile, openProjectPicker } from './project.js';
import { openHelp, isOpen as isIoOpen } from './io.js';
import { addFilesToBin, openBinPicker, assignBinToSlot, removeBinItem } from './bin.js';
import { songAddPattern, songInsertSequence, songRemoveSequenceSlot } from './pattern.js';

let canvasEl = null;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function curTrack() { return state.pattern.tracks[state.cursor.track]; }
function curCell() {
  const t = curTrack();
  if (!t) return null;
  return t.cells[state.cursor.step % t.length];
}

export function initInput(canvas) {
  canvasEl = canvas;
  initKeyboard();
  initMouse(canvas);

  const fileInput = document.getElementById('audioFile');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const slotIdx = state.bankSelected != null ? state.bankSelected : (curTrack()?.slot ?? 0);
      setStatus('loading ' + f.name + ' → slot ' + (slotIdx + 1));
      const ok = await loadFileToSlot(slotIdx, f);
      setStatus(ok ? 'loaded slot ' + (slotIdx + 1) + ': ' + f.name : 'load failed');
      e.target.value = '';
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Keyboard
// ──────────────────────────────────────────────────────────────────────────────

function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    audioCtx();
    if (handleKey(e)) { e.preventDefault(); e.stopPropagation(); }
  });
}

function handleKey(e) {
  if (isIoOpen()) return false;        // overlay swallows keys
  const tr = curTrack();
  const cell = curCell();
  const k = e.key;

  // ── Ctrl / Meta combos ─────────────────────────────────────────────────
  if (e.ctrlKey || e.metaKey) {
    const lower = k.toLowerCase();
    if (lower === 'z' && !e.shiftKey) { undo(); return true; }
    if ((lower === 'z' && e.shiftKey) || lower === 'y') { redo(); return true; }
    if (lower === 'a') { selectAll(); return true; }
    if (lower === 'd') { deselect(); return true; }
    if (lower === 'c') { copySelection(); return true; }
    if (lower === 'x') { cutSelection(); return true; }
    if (lower === 'v') {
      const cb = getClipboard();
      if (cb) pasteAt(state.cursor.track, state.cursor.step);
      return true;
    }
    if (lower === 'i') { invertSelection(); return true; }
    if (lower === 's') { downloadProjectFile(); return true; }
    if (lower === 'o') { openProjectPicker(); return true; }
    if (lower === 'b') { openBinPicker(); return true; }
    if (lower === 'n' && e.shiftKey) {
      pushHistory('add pattern');
      songAddPattern(state.song);
      setStatus('added pattern P' + (state.song.patterns.length).toString().padStart(2, '0'));
      return true;
    }
    return false;                       // unknown ctrl combo
  }

  if (k === 'F1' || k === '?') { openHelp(); return true; }
  if (k === 'F2') { state.view = 'PATTERN'; setStatus('view: PATTERN'); return true; }
  if (k === 'F3') { state.view = 'SONG';    setStatus('view: SONG');    return true; }
  if (k === 'F4') { state.view = 'MIXER';   setStatus('view: MIXER');   return true; }
  if (k === 'F5') {
    pushHistory('songMode');
    state.song.songMode = !state.song.songMode;
    if (state.playing) state.song.lastAdvanceAt = audioCtx().currentTime;
    setStatus('songMode ' + (state.song.songMode ? 'ON' : 'OFF'));
    return true;
  }

  if (k === 'Delete' || k === 'Backspace') {
    if (state.selection) { deleteSelection(); return true; }
  }

  if (k === 'ArrowUp')    { state.cursor.step = (state.cursor.step - 1 + tr.length) % tr.length; ensureCursorVisible(); return true; }
  if (k === 'ArrowDown')  { state.cursor.step = (state.cursor.step + 1) % tr.length; ensureCursorVisible(); return true; }
  if (k === 'ArrowLeft')  { state.cursor.track = (state.cursor.track - 1 + state.pattern.tracks.length) % state.pattern.tracks.length; clampStep(); ensureTrackVisible(); return true; }
  if (k === 'ArrowRight') { state.cursor.track = (state.cursor.track + 1) % state.pattern.tracks.length; clampStep(); ensureTrackVisible(); return true; }
  if (k === 'Tab')        { cycleField(e.shiftKey ? -1 : 1); return true; }
  if (k === 'Home')       { state.cursor.step = 0; ensureCursorVisible(); return true; }
  if (k === 'End')        { state.cursor.step = tr.length - 1; ensureCursorVisible(); return true; }
  if (k === 'PageUp')     { state.cursor.step = clamp(state.cursor.step - 16, 0, tr.length - 1); ensureCursorVisible(); return true; }
  if (k === 'PageDown')   { state.cursor.step = clamp(state.cursor.step + 16, 0, tr.length - 1); ensureCursorVisible(); return true; }

  if (k === ' ') { if (cell) { pushHistory('toggle'); cell.active = !cell.active; } return true; }
  if (k === 'Enter' || k === 'p' || k === 'P') { toggleTransport(); return true; }
  if (k === 'Escape')                          { stopTransport(); return true; }
  if (k === '/')                                { panic(); setStatus('panic'); return true; }

  // Cell — slice / pitch / retrig / gate / prob / micro / grain
  if (k === '[') { if (cell) { pushHistory('slice'); cell.slice = clamp((cell.slice | 0) - 1, ...CLAMPS.slice); } return true; }
  if (k === ']') { if (cell) { pushHistory('slice'); cell.slice = clamp((cell.slice | 0) + 1, ...CLAMPS.slice); } return true; }
  if (k === '-') { if (cell) { pushHistory('pitch'); cell.pitch = clamp(cell.pitch - (e.shiftKey ? 12 : 1), ...CLAMPS.pitch); } return true; }
  if (k === '=' || k === '+') { if (cell) { pushHistory('pitch'); cell.pitch = clamp(cell.pitch + (e.shiftKey ? 12 : 1), ...CLAMPS.pitch); } return true; }
  if (k === ',') { if (cell) { pushHistory('retrig'); cell.retrig = Math.max(1, cell.retrig - 1); } return true; }
  if (k === '.') { if (cell) { pushHistory('retrig'); cell.retrig = Math.min(16, cell.retrig + 1); } return true; }
  if (k === '<') { if (cell) { pushHistory('gate'); cell.gate = clamp(cell.gate - 5, ...CLAMPS.gate); } return true; }
  if (k === '>') { if (cell) { pushHistory('gate'); cell.gate = clamp(cell.gate + 5, ...CLAMPS.gate); } return true; }
  if (k === ';') { if (cell) { pushHistory('prob'); cell.prob = clamp(cell.prob - 10, ...CLAMPS.prob); } return true; }
  if (k === "'") { if (cell) { pushHistory('prob'); cell.prob = clamp(cell.prob + 10, ...CLAMPS.prob); } return true; }
  if (k === 'q' || k === 'Q') { if (cell) { pushHistory('micro'); cell.micro = clamp(cell.micro - 5, ...CLAMPS.micro); } return true; }
  if (k === 'w' || k === 'W') { if (cell) { pushHistory('micro'); cell.micro = clamp(cell.micro + 5, ...CLAMPS.micro); } return true; }
  if (k === 'g' || k === 'G') { if (cell) { pushHistory('grain'); cell.grain = !cell.grain; } return true; }

  // Track
  if (k === 'm' || k === 'M') { if (tr) { pushHistory('mute'); tr.mute = !tr.mute; } return true; }
  if (k === 's' || k === 'S') { if (tr) { pushHistory('solo'); tr.solo = !tr.solo; } return true; }
  if (k === 'b' || k === 'B') {
    if (tr) {
      pushHistory('slot');
      tr.slot = (tr.slot + (e.shiftKey ? -1 : 1) + state.bank.length) % state.bank.length;
      setStatus('track ' + (state.cursor.track + 1) + ' → slot ' + (tr.slot + 1));
    }
    return true;
  }
  if (k === 'd' || k === 'D') {
    if (tr) {
      pushHistory('div');
      const idx = DIVISIONS.indexOf(tr.div);
      const next = DIVISIONS[(idx + (e.shiftKey ? -1 : 1) + DIVISIONS.length) % DIVISIONS.length];
      tr.div = next;
      setStatus('track ' + (state.cursor.track + 1) + ' div 1/' + next);
    }
    return true;
  }
  if (k === 'v' || k === 'V') {
    if (tr) {
      pushHistory('voice');
      const i = VOICES.indexOf(tr.voice);
      const next = VOICES[(i + (e.shiftKey ? -1 : 1) + VOICES.length) % VOICES.length];
      setTrackVoice(tr, next);
      setStatus('track ' + (state.cursor.track + 1) + ' → ' + next);
    }
    return true;
  }
  if (k === 'l' || k === 'L') {
    if (e.shiftKey) {
      if (tr) {
        pushHistory('length');
        const idx = LENGTHS.indexOf(tr.length);
        const fallback = LENGTHS.findIndex(v => v >= tr.length);
        const base = idx >= 0 ? idx : (fallback >= 0 ? fallback : 0);
        const next = LENGTHS[(base + 1) % LENGTHS.length];
        resizeTrack(tr, next);
        clampStep();
        // Length change invalidates selection (mask size changes).
        state.selection = null;
        setStatus('track ' + (state.cursor.track + 1) + ' length ' + next);
      }
    } else {
      state.bankSelected = tr ? tr.slot : 0;
      document.getElementById('audioFile')?.click();
    }
    return true;
  }

  if (k === 'r' || k === 'R') {
    if (e.shiftKey) {
      pushHistory('randomize');
      const slices = state.pattern.tracks.map(t => state.bank[t.slot]?.slices?.length || 16);
      randomizePattern(state.pattern, slices);
      setStatus('randomized');
    }
    return true;
  }
  if (k === 'c' || k === 'C') {
    if (e.shiftKey) { pushHistory('clear'); clearPattern(state.pattern); setStatus('cleared'); }
    return true;
  }

  if (k === 'z' || k === 'Z') { pushHistory('bpm'); state.bpm = clamp(state.bpm - (e.shiftKey ? 10 : 1), ...CLAMPS.bpm); setStatus('bpm ' + state.bpm); return true; }
  if (k === 'x' || k === 'X') { pushHistory('bpm'); state.bpm = clamp(state.bpm + (e.shiftKey ? 10 : 1), ...CLAMPS.bpm); setStatus('bpm ' + state.bpm); return true; }

  if (k === 'a' || k === 'A') { pushHistory('master'); setMasterGain(clamp(state.knobs.masterGain - 0.05, 0, 1.4)); return true; }
  if (k === 'f' || k === 'F') { pushHistory('master'); setMasterGain(clamp(state.knobs.masterGain + 0.05, 0, 1.4)); return true; }
  if (k === 'e' || k === 'E') { pushHistory('sat'); setSatDrive(clamp(state.knobs.satDrive + (e.shiftKey ? -0.05 : 0.05), 0, 1)); return true; }

  if (k === 'n' || k === 'N') {
    const slot = state.bank[tr.slot];
    if (slot && slot.buffer) {
      const cur = (slot.slices && slot.slices.length) || 16;
      const next = e.shiftKey ? Math.max(1, cur >> 1) : Math.min(64, cur << 1);
      setSlotSliceCount(tr.slot, next);
      setStatus('slot ' + (tr.slot + 1) + ' → ' + next + ' slices');
    }
    return true;
  }
  if (k === 't' || k === 'T') {
    const slot = state.bank[tr.slot];
    if (slot && slot.buffer) {
      setSlotTransientSlices(tr.slot);
      setStatus('slot ' + (tr.slot + 1) + ' → transient slicing (' + slot.slices.length + ')');
    }
    return true;
  }
  if (k === '`') { generateDefaultBufferToSlot(tr.slot); setStatus('slot ' + (tr.slot + 1) + ' → noise'); return true; }

  return false;
}

function cycleField(dir) {
  const i = FIELD_ORDER.indexOf(state.cursor.field);
  state.cursor.field = FIELD_ORDER[(i + dir + FIELD_ORDER.length) % FIELD_ORDER.length];
}
function clampStep() {
  const tr = curTrack();
  if (!tr) return;
  if (state.cursor.step >= tr.length) state.cursor.step = tr.length - 1;
}
function ensureCursorVisible() { /* ui.js handles scroll */ }
function ensureTrackVisible()  { /* ui.js handles horizontal scroll */ }

// ──────────────────────────────────────────────────────────────────────────────
// Mouse
// ──────────────────────────────────────────────────────────────────────────────

function initMouse(canvas) {
  canvas.addEventListener('mousemove', (e) => {
    audioCtx();
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    state.mouse.x = px;
    state.mouse.y = py;
    state.mouse.cx = Math.floor(px / state.cellW);
    state.mouse.cy = Math.floor(py / state.cellH);
    state.mouse.inside = true;
    handleHover();
    handleDragMove(e);
  });
  canvas.addEventListener('mouseleave', () => { state.mouse.inside = false; });

  canvas.addEventListener('mousedown', (e) => {
    audioCtx();
    state.mouse.buttons = e.buttons;
    e.preventDefault();
    onMouseDown(e);
  });
  canvas.addEventListener('mouseup', (e) => {
    state.mouse.buttons = e.buttons;
    onMouseUp(e);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    audioCtx();
    e.preventDefault();
    onWheel(e);
  }, { passive: false });

  // Touch — synthesize mouse events. Single-finger = left click + drag.
  // Two-finger tap = right click. Long-press in cell = middle-click toggle.
  let lastTap = 0;
  let touchStart = 0;
  canvas.addEventListener('touchstart', (e) => {
    audioCtx();
    e.preventDefault();
    if (!e.touches.length) return;
    const t = e.touches[0];
    syntheticPosition(canvas, t);
    handleHover();
    touchStart = performance.now();
    if (e.touches.length === 2) {
      onMouseDown({ button: 2, shiftKey: false, preventDefault(){}, stopPropagation(){} });
    } else {
      onMouseDown({ button: 0, shiftKey: false, preventDefault(){}, stopPropagation(){} });
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!e.touches.length) return;
    syntheticPosition(canvas, e.touches[0]);
    handleHover();
    handleDragMove({ shiftKey: false });
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    onMouseUp({ button: 0 });
    state.mouse.inside = false;
    // Double-tap = play/pause
    const now = performance.now();
    if (now - lastTap < 300) toggleTransport();
    lastTap = now;
  }, { passive: false });
}

function syntheticPosition(canvas, t) {
  const r = canvas.getBoundingClientRect();
  state.mouse.x = t.clientX - r.left;
  state.mouse.y = t.clientY - r.top;
  state.mouse.cx = Math.floor(state.mouse.x / state.cellW);
  state.mouse.cy = Math.floor(state.mouse.y / state.cellH);
  state.mouse.inside = true;
}

function handleHover() {
  const layout = state.layout;
  if (!layout) return;
  state.hover.region = 'none';
  state.hover.track = -1;
  state.hover.step = -1;
  state.hover.knob = null;
  state.hover.bankSlot = -1;
  state.hover.binItem = -1;
  state.hover.songStep = -1;
  state.hover.waveT = -1;
  state.hover.scrollbar = null;

  const cx = state.mouse.cx;
  const cy = state.mouse.cy;

  // View-mode tabs
  if (layout.viewTabs) {
    for (const t of layout.viewTabs) {
      if (cx >= t.x && cx < t.x + t.w && cy === t.y) {
        state.hover.region = 'viewTab';
        state.hover.viewTab = t.view;
        return;
      }
    }
  }

  // Scrollbars
  if (layout.scrollV && cx >= layout.scrollV.x && cx < layout.scrollV.x + layout.scrollV.w
      && cy >= layout.scrollV.y && cy < layout.scrollV.y + layout.scrollV.h) {
    state.hover.region = 'scrollV';
    state.hover.scrollbar = layout.scrollV;
    return;
  }
  if (layout.scrollH && cx >= layout.scrollH.x && cx < layout.scrollH.x + layout.scrollH.w
      && cy >= layout.scrollH.y && cy < layout.scrollH.y + layout.scrollH.h) {
    state.hover.region = 'scrollH';
    state.hover.scrollbar = layout.scrollH;
    return;
  }

  // SONG view hits
  if (layout.songSlots) {
    for (const s of layout.songSlots) {
      if (cx >= s.x && cx < s.x + s.w && cy === s.y) {
        state.hover.region = 'songSlot';
        state.hover.songStep = s.slot;
        state.hover.songSlot = s;
        return;
      }
    }
  }
  if (layout.songPatterns) {
    for (const p of layout.songPatterns) {
      if (cx >= p.x && cx < p.x + p.w && cy === p.y) {
        state.hover.region = 'songPattern';
        state.hover.songPattern = p.idx;
        return;
      }
    }
  }

  // MIXER view stripes
  if (layout.mixerStripes) {
    for (const m of layout.mixerStripes) {
      if (cx >= m.x && cx < m.x + m.w && cy >= m.y && cy < m.y + m.h) {
        state.hover.region = 'mixerStripe';
        state.hover.track = m.idx;
        return;
      }
    }
  }

  // BIN items
  if (layout.binItems) {
    for (const b of layout.binItems) {
      if (cx >= b.x && cx < b.x + b.w && cy === b.y) {
        state.hover.region = 'binItem';
        state.hover.binItem = b.idx;
        return;
      }
    }
  }

  // Knobs
  const k = knobAt(cx, cy, layout);
  if (k) { state.hover.region = 'knob'; state.hover.knob = k; return; }

  // Bank slots
  if (layout.bankSlots) {
    for (const b of layout.bankSlots) {
      if (cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + 1) {
        state.hover.region = 'bankSlot'; state.hover.bankSlot = b.idx; return;
      }
    }
  }

  // Waveform
  if (layout.waveBox && cx >= layout.waveBox.x && cx < layout.waveBox.x + layout.waveBox.w
      && cy >= layout.waveBox.y && cy < layout.waveBox.y + layout.waveBox.h) {
    state.hover.region = 'wave';
    state.hover.waveT = (cx - layout.waveBox.x) / layout.waveBox.w;
    return;
  }

  // Track headers
  if (layout.trackHeaders) {
    for (const th of layout.trackHeaders) {
      if (cx >= th.x && cx < th.x + th.w && cy >= th.y && cy < th.y + th.h) {
        state.hover.region = th.region;        // 'voice' / 'slot' / 'name' / 'muteSolo' / 'lenDiv'
        state.hover.track = th.idx;
        return;
      }
    }
  }

  // Pattern grid
  if (layout.grid) {
    const g = layout.grid;
    if (cx >= g.x && cx < g.x + g.w && cy >= g.y && cy < g.y + g.h) {
      const colInGrid = cx - g.x;
      const rowInGrid = cy - g.y;
      const tIdx = Math.floor(colInGrid / g.colW);
      if (tIdx >= 0 && tIdx < state.pattern.tracks.length - state.scrollTrack) {
        const trackIdx = state.scrollTrack + tIdx;
        const tr = state.pattern.tracks[trackIdx];
        if (tr) {
          const stepIdx = state.scrollStep + rowInGrid;
          if (stepIdx >= 0 && stepIdx < tr.length) {
            state.hover.region = 'cell';
            state.hover.track = trackIdx;
            state.hover.step = stepIdx;
            return;
          }
        }
      }
    }
  }

  // Transport / title
  if (layout.transportBox && cx >= layout.transportBox.x && cx < layout.transportBox.x + layout.transportBox.w && cy === layout.transportBox.y) {
    state.hover.region = 'transport';
    return;
  }
}

function onMouseDown(e) {
  const button = e.button;       // 0 = left, 1 = middle, 2 = right
  const layout = state.layout;
  if (!layout) return;
  const h = state.hover;

  if (h.region === 'viewTab' && button === 0) {
    state.view = h.viewTab;
    setStatus('view: ' + h.viewTab);
    return;
  }

  if (h.region === 'scrollV' && button === 0) {
    state.mouse.drag = { kind: 'scrollV', sb: layout.scrollV };
    return;
  }
  if (h.region === 'scrollH' && button === 0) {
    state.mouse.drag = { kind: 'scrollH', sb: layout.scrollH };
    return;
  }

  if (h.region === 'songSlot' && button === 0) {
    const slot = h.songSlot;
    if (slot && slot.action === 'append') {
      pushHistory('song +');
      songInsertSequence(state.song, state.song.editIndex, state.song.sequence.length);
      return;
    }
    pushHistory('song step');
    state.song.songStep = h.songStep;
    if (state.song.sequence[h.songStep] != null) {
      state.song.editIndex = state.song.sequence[h.songStep];
    }
    return;
  }
  if (h.region === 'songSlot' && button === 2) {
    pushHistory('song -');
    songRemoveSequenceSlot(state.song, h.songStep);
    return;
  }
  if (h.region === 'songPattern' && button === 0) {
    state.song.editIndex = h.songPattern;
    return;
  }

  if (h.region === 'mixerStripe' && button === 0) {
    state.cursor.track = h.track;
    return;
  }

  if (h.region === 'binItem') {
    if (button === 0) {
      const tr = curTrack();
      if (tr) {
        pushHistory('bin assign');
        assignBinToSlot(h.binItem, tr.slot);
        state.bin.selected = h.binItem;
      }
      return;
    }
    if (button === 2) {
      removeBinItem(h.binItem);
      return;
    }
  }

  if (h.region === 'knob') {
    if (button === 2) {
      pushHistory('reset knob');
      const k = h.knob;
      if (k) {
        const mid = k.categorical ? Math.round((k.lo + k.hi) / 2) : (k.lo + k.hi) / 2;
        k.set(mid);
      }
      return;
    }
    pushHistory('knob');
    state.mouse.drag = {
      kind: 'knob',
      id: h.knob.id,
      knob: h.knob,
      startValue: (h.knob.value != null) ? h.knob.value : h.knob.lo,
      startX: state.mouse.x,
      startY: state.mouse.y,
    };
    return;
  }

  if (h.region === 'cell') {
    state.cursor.track = h.track;
    state.cursor.step = h.step;
    const cell = state.pattern.tracks[h.track].cells[h.step];
    // Shift+left-click in pattern starts a rectangular selection.
    if (button === 0 && e.shiftKey) {
      state.mouse.drag = { kind: 'select', anchorTrack: h.track, anchorStep: h.step };
      setSelection(h.track, h.step, h.track, h.step);
      return;
    }
    if (button === 0) {
      pushHistory('paint');
      cell.active = !cell.active;
      state.mouse.drag = { kind: cell.active ? 'paint' : 'erase', value: cell.active };
      spawnAt(h.track, h.step, 1, cell.grain);
    } else if (button === 2) {
      pushHistory('erase');
      cell.active = false;
      state.mouse.drag = { kind: 'erase', value: false };
    } else if (button === 1) {
      pushHistory('grain');
      cell.grain = !cell.grain;
    }
    return;
  }

  if (h.region === 'voice' && button === 0) {
    const tr = state.pattern.tracks[h.track];
    if (!tr) return;
    pushHistory('voice');
    state.cursor.track = h.track;
    const i = VOICES.indexOf(tr.voice);
    const next = VOICES[(i + (e.shiftKey ? -1 : 1) + VOICES.length) % VOICES.length];
    setTrackVoice(tr, next);
    setStatus('track ' + (h.track + 1) + ' → ' + next);
    return;
  }
  if (h.region === 'slot' && button === 0) {
    const tr = state.pattern.tracks[h.track];
    if (!tr) return;
    pushHistory('slot');
    state.cursor.track = h.track;
    tr.slot = (tr.slot + (e.shiftKey ? -1 : 1) + state.bank.length) % state.bank.length;
    setStatus('track ' + (h.track + 1) + ' → slot ' + (tr.slot + 1));
    return;
  }
  if (h.region === 'lenDiv' && button === 0) {
    const tr = state.pattern.tracks[h.track];
    if (!tr) return;
    pushHistory('lenDiv');
    state.cursor.track = h.track;
    if (e.shiftKey) {
      const idx = DIVISIONS.indexOf(tr.div);
      tr.div = DIVISIONS[(idx + 1) % DIVISIONS.length];
    } else {
      const idx = LENGTHS.indexOf(tr.length);
      const next = LENGTHS[(idx >= 0 ? idx + 1 : 1) % LENGTHS.length];
      resizeTrack(tr, next);
      state.selection = null;
    }
    return;
  }
  if (h.region === 'muteSolo' && button === 0) {
    const tr = state.pattern.tracks[h.track];
    if (!tr) return;
    pushHistory(e.shiftKey ? 'solo' : 'mute');
    state.cursor.track = h.track;
    if (e.shiftKey) tr.solo = !tr.solo;
    else tr.mute = !tr.mute;
    return;
  }
  if (h.region === 'name' && button === 0) {
    state.cursor.track = h.track;
    return;
  }

  if (h.region === 'bankSlot' && button === 0) {
    const slotIdx = h.bankSlot;
    const tr = curTrack();
    if (e.shiftKey) {
      // Shift+click bank slot: load file into that slot.
      state.bankSelected = slotIdx;
      document.getElementById('audioFile')?.click();
    } else {
      if (tr) {
        tr.slot = slotIdx;
        state.bankSelected = slotIdx;
        setStatus('track ' + (state.cursor.track + 1) + ' → slot ' + (slotIdx + 1));
      }
    }
    return;
  }

  if (h.region === 'transport' && button === 0) {
    toggleTransport();
    return;
  }

  if (h.region === 'wave' && button === 0) {
    // Click waveform: jump that fraction into a 'preview' fire on current slot.
    // Cheaper alternative: pick the slice that contains the click.
    const tr = curTrack();
    const slot = state.bank[tr.slot];
    if (slot && slot.slices) {
      const t = h.waveT;
      let idx = 0;
      for (let i = 0; i < slot.slices.length - 1; i++) {
        if (t >= slot.slices[i] && t < slot.slices[i + 1]) { idx = i; break; }
      }
      const cell = curCell();
      if (cell) cell.slice = idx;
      setStatus('slice → ' + idx);
    }
    return;
  }
}

function onMouseUp(e) {
  state.mouse.drag = null;
}

function handleDragMove(e) {
  const drag = state.mouse.drag;
  if (!drag) return;
  if (drag.kind === 'paint' || drag.kind === 'erase') {
    if (state.hover.region !== 'cell') return;
    const tr = state.pattern.tracks[state.hover.track];
    if (!tr) return;
    const cell = tr.cells[state.hover.step];
    cell.active = drag.value;
    if (cell.active) spawnAt(state.hover.track, state.hover.step, 1, cell.grain);
    state.cursor.track = state.hover.track;
    state.cursor.step = state.hover.step;
  } else if (drag.kind === 'knob') {
    const dx = state.mouse.x - drag.startX;
    const dy = state.mouse.y - drag.startY;
    applyKnobDrag(drag.knob, drag, dx, dy, e.shiftKey);
  } else if (drag.kind === 'select') {
    if (state.hover.region !== 'cell') return;
    setSelection(drag.anchorTrack, drag.anchorStep, state.hover.track, state.hover.step);
  } else if (drag.kind === 'scrollV') {
    const sb = drag.sb;
    if (!sb) return;
    const py = state.mouse.cy - sb.y;
    const range = Math.max(1, sb.h - sb.thumbH);
    const frac = Math.max(0, Math.min(1, py / Math.max(1, sb.h - 1)));
    state.scrollStep = Math.max(0, Math.min(sb.total - sb.visible, Math.round(frac * (sb.total - sb.visible))));
    state.scrollLockUntil = performance.now() + 1500;
  } else if (drag.kind === 'scrollH') {
    const sb = drag.sb;
    if (!sb) return;
    const px = state.mouse.cx - sb.x;
    const frac = Math.max(0, Math.min(1, px / Math.max(1, sb.w - 1)));
    state.scrollTrack = Math.max(0, Math.min(sb.total - sb.visible, Math.round(frac * (sb.total - sb.visible))));
    state.scrollLockUntil = performance.now() + 1500;
  }
}

function onWheel(e) {
  const layout = state.layout;
  if (!layout) return;
  const h = state.hover;
  const dir = e.deltaY > 0 ? -1 : 1;
  const mag = (e.shiftKey ? 10 : 1) * dir;

  if (h.region === 'knob' && h.knob) {
    const k = h.knob;
    pushHistory('knob wheel');
    const range = (k.hi - k.lo);
    const baseVal = (k.value != null) ? k.value : k.lo;
    let v = baseVal + (range / (k.categorical ? 4 : 40)) * mag;
    if (k.categorical) v = Math.round(v);
    k.set(clamp(v, k.lo, k.hi));
    return;
  }
  if (h.region === 'cell') {
    const tr = state.pattern.tracks[h.track];
    if (!tr) return;
    pushHistory('wheel ' + state.cursor.field);
    const cell = tr.cells[h.step];
    const f = state.cursor.field;
    switch (f) {
      case 'slice':  cell.slice  = clamp(cell.slice + mag, ...CLAMPS.slice); break;
      case 'pitch':  cell.pitch  = clamp(cell.pitch + mag, ...CLAMPS.pitch); break;
      case 'gate':   cell.gate   = clamp(cell.gate + mag * 5, ...CLAMPS.gate); break;
      case 'retrig': cell.retrig = Math.max(1, Math.min(16, cell.retrig + mag)); break;
      case 'prob':   cell.prob   = clamp(cell.prob + mag * 5, ...CLAMPS.prob); break;
      case 'micro':  cell.micro  = clamp(cell.micro + mag * 5, ...CLAMPS.micro); break;
      case 'grain':  if (mag !== 0) cell.grain = !cell.grain; break;
    }
    if (!cell.active) cell.active = true;
    return;
  }
  if (h.region === 'binItem') {
    state.bin.scroll = Math.max(0, Math.min(Math.max(0, state.bin.items.length - 1), (state.bin.scroll | 0) - dir));
    return;
  }
  if (h.region === 'scrollV') {
    state.scrollStep = clamp((state.scrollStep | 0) - dir * (e.shiftKey ? 8 : 2),
                              0, Math.max(0, longestTrackLen() - 1));
    state.scrollLockUntil = performance.now() + 1500;
    return;
  }
  if (h.region === 'scrollH') {
    state.scrollTrack = clamp((state.scrollTrack | 0) - dir,
                              0, Math.max(0, state.pattern.tracks.length - 1));
    state.scrollLockUntil = performance.now() + 1500;
    return;
  }
  // Wheel in empty area: adjust BPM
  pushHistory('bpm wheel');
  state.bpm = clamp(state.bpm + mag * (e.shiftKey ? 5 : 1), ...CLAMPS.bpm);
}

function longestTrackLen() {
  let m = 0;
  for (const t of state.pattern.tracks) if (t.length > m) m = t.length;
  return m;
}

function spawnAt(trackIdx, stepIdx, intensity, accent) {
  const layout = state.layout;
  if (!layout || !layout.grid) return;
  const g = layout.grid;
  const visTrack = trackIdx - state.scrollTrack;
  const visStep = stepIdx - state.scrollStep;
  if (visTrack < 0 || visStep < 0) return;
  const cx = g.x + (visTrack + 0.5) * g.colW;
  const cy = g.y + visStep + 0.5;
  const tr = state.pattern.tracks[trackIdx];
  spawnBurst(cx, cy, tr.voice, intensity, accent);
}
