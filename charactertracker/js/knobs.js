// knobs.js — drawn glyph knobs in the right panel.
//
// Each knob has: id, label, get/set callbacks, value range (min/max), and
// a position+size in glyph cells. The panel draws them and ui.js + input.js
// hit-test against the panel's knob list (state.layout.knobs).

import { state } from './state.js';
import { THEME_VOID, GLYPHS, CLAMPS, DIVISIONS, LENGTHS, VOICES, VOICE_COLOR } from './constants.js';
import { setMasterGain, setSatDrive } from './audio.js';
import { setTrackVoice } from './pattern.js';

// Knob descriptor — produced fresh each frame by buildKnobList(). Stable ids
// so input.js can identify the dragged knob across frames.
export function buildKnobList() {
  const knobs = [];
  // Master section
  knobs.push(masterKnob('bpm',  'BPM',   state.bpm, CLAMPS.bpm[0], CLAMPS.bpm[1], (v) => state.bpm = clamp(v|0, CLAMPS.bpm[0], CLAMPS.bpm[1]), v => '' + (v|0)));
  knobs.push(masterKnob('mast', 'MAST',  state.knobs.masterGain, 0, 1.4, (v) => setMasterGain(clamp(v, 0, 1.4)), v => v.toFixed(2)));
  knobs.push(masterKnob('sat',  'SAT',   state.knobs.satDrive,   0, 1,   (v) => setSatDrive(clamp(v, 0, 1)), v => v.toFixed(2)));
  knobs.push(masterKnob('swing','SWING', state.swing, -50, 50, (v) => state.swing = clamp(v|0, -50, 50), v => (v >= 0 ? '+' : '') + (v|0)));

  // Track-section knobs for the cursor's track
  const tr = state.pattern.tracks[state.cursor.track];
  if (tr) {
    knobs.push(trackKnob(
      tr, 'voice', 'VOICE',
      () => VOICES.indexOf(tr.voice),
      0, VOICES.length - 1,
      (v) => setTrackVoice(tr, VOICES[clamp(v | 0, 0, VOICES.length - 1)]),
      (v) => VOICES[clamp(v | 0, 0, VOICES.length - 1)],
      true,
    ));
    knobs.push(trackKnob(tr, 'gain',  'GAIN',  () => tr.gain, 0, 1.4, (v) => tr.gain = clamp(v, 0, 1.4), v => v.toFixed(2)));
    knobs.push(trackKnob(tr, 'pan',   'PAN',   () => tr.pan,  -1, 1,  (v) => tr.pan = clamp(v, -1, 1), v => (v >= 0 ? '+' : '') + v.toFixed(2)));
    knobs.push(trackKnob(tr, 'len',   'LEN',   () => tr.length, LENGTHS[0], LENGTHS[LENGTHS.length-1], (v) => snapLen(tr, v), v => v + ''));
    knobs.push(trackKnob(tr, 'div',   'DIV',   () => tr.div, DIVISIONS[0], DIVISIONS[DIVISIONS.length-1], (v) => snapDiv(tr, v), v => '1/' + v));
    knobs.push(trackKnob(tr, 'slot',  'SLOT',  () => tr.slot, 0, state.bank.length - 1, (v) => tr.slot = clamp(v|0, 0, state.bank.length-1), v => '#' + ((v|0)+1)));
    if (tr.voice === 'GRAIN') {
      knobs.push(trackKnob(tr, 'gdens', 'GDENS', () => tr.params.density || 6, 1, 32, (v) => tr.params.density = clamp(v|0, 1, 32), v => (v|0)+''));
      knobs.push(trackKnob(tr, 'gms',   'GMS',   () => tr.params.grainMs || 45, 5, 200, (v) => tr.params.grainMs = clamp(v|0, 5, 200), v => (v|0)+'ms'));
      knobs.push(trackKnob(tr, 'gspd',  'GSPRD', () => tr.params.spread || 6, 0, 24, (v) => tr.params.spread = clamp(v, 0, 24), v => v.toFixed(1)));
    } else if (tr.voice === 'FM') {
      knobs.push(trackKnob(tr, 'ratio', 'RATIO', () => tr.params.ratio || 1.5, 0.25, 8, (v) => tr.params.ratio = clamp(v, 0.25, 8), v => v.toFixed(2)));
      knobs.push(trackKnob(tr, 'index', 'INDEX', () => tr.params.index || 4, 0, 16, (v) => tr.params.index = clamp(v, 0, 16), v => v.toFixed(1)));
      knobs.push(trackKnob(tr, 'fatk',  'ATK',   () => tr.params.atk || 0.005, 0.001, 0.2, (v) => tr.params.atk = clamp(v, 0.001, 0.2), v => (v*1000|0)+'ms'));
      knobs.push(trackKnob(tr, 'frel',  'REL',   () => tr.params.rel || 0.18, 0.01, 1, (v) => tr.params.rel = clamp(v, 0.01, 1), v => (v*1000|0)+'ms'));
    }
  }
  return knobs;
}

function masterKnob(id, label, value, lo, hi, set, fmt) {
  return { id, scope: 'master', label, value, lo, hi, set, fmt };
}
function trackKnob(track, id, label, getV, lo, hi, set, fmt, categorical) {
  return { id: 'trk:' + id, scope: 'track', label, value: getV(), lo, hi, set, fmt, categorical: !!categorical };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function snapLen(tr, v) {
  let best = LENGTHS[0], bestD = Infinity;
  for (const L of LENGTHS) {
    const d = Math.abs(L - v);
    if (d < bestD) { bestD = d; best = L; }
  }
  if (tr.length !== best) {
    if (best > tr.cells.length) {
      while (tr.cells.length < best) tr.cells.push({ active:false, slice:0, pitch:0, gate:80, retrig:1, prob:100, micro:0, grain:false });
    } else {
      tr.cells.length = best;
    }
    tr.length = best;
  }
}
function snapDiv(tr, v) {
  let best = DIVISIONS[0], bestD = Infinity;
  for (const D of DIVISIONS) {
    const d = Math.abs(D - v);
    if (d < bestD) { bestD = d; best = D; }
  }
  tr.div = best;
}

// ──────────────────────────────────────────────────────────────────────────────
// Drawing
// ──────────────────────────────────────────────────────────────────────────────

// Each knob is laid out in a 6-col × 3-row block:
//   row0: label
//   row1: bar (5 cells of █/░ + 1 thumb glyph at the value position)
//   row2: value text

const KNOB_W = 7;
const KNOB_H = 3;

export function knobBlockSize() { return { w: KNOB_W, h: KNOB_H }; }

export function drawKnobs(drawTxt, panelX, panelY, panelW, knobs, layoutOut) {
  // Lay knobs in a single column down the panel, two-up if the panel is wide.
  const perRow = Math.max(1, Math.floor(panelW / KNOB_W));
  layoutOut.knobs = [];
  for (let i = 0; i < knobs.length; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = panelX + col * KNOB_W;
    const y = panelY + row * KNOB_H;
    drawKnob(drawTxt, x, y, knobs[i]);
    layoutOut.knobs.push({
      id: knobs[i].id, scope: knobs[i].scope,
      x, y, w: KNOB_W - 1, h: KNOB_H,
      lo: knobs[i].lo, hi: knobs[i].hi,
      set: knobs[i].set,
      categorical: knobs[i].categorical,
      value: knobs[i].value,
      label: knobs[i].label,
    });
  }
  return panelY + Math.ceil(knobs.length / perRow) * KNOB_H;
}

function drawKnob(drawTxt, x, y, k) {
  const T = THEME_VOID;
  const isHover = state.hover.region === 'knob' && state.hover.knob && state.hover.knob.id === k.id;
  const isDrag = state.mouse.drag && state.mouse.drag.kind === 'knob' && state.mouse.drag.id === k.id;

  const labelColor = isDrag ? T.HI : isHover ? T.HOVER : (k.scope === 'master' ? T.ACC : T.TRACK);
  drawTxt(k.label, x, y, labelColor);

  const span = KNOB_W - 1;             // columns for the bar
  const norm = (k.value - k.lo) / Math.max(0.0001, (k.hi - k.lo));
  const filled = Math.max(0, Math.min(span, Math.round(norm * span)));

  let bar = '';
  for (let i = 0; i < span; i++) {
    if (i < filled) bar += GLYPHS.knobBar;
    else if (i === filled) bar += GLYPHS.knobThumb;
    else bar += GLYPHS.knobEmpty;
  }
  const barColor = isDrag ? T.HI : (k.scope === 'master' ? T.AQU : T.GRAIN);
  drawTxt(bar, x, y + 1, barColor);

  const rawVal = k.fmt ? k.fmt(k.value) : k.value;
  const valStr = String(rawVal == null ? '' : rawVal);
  drawTxt(valStr.slice(0, span), x, y + 2, isDrag ? T.HI : T.UI);
}

export function knobAt(cx, cy, layout) {
  if (!layout || !layout.knobs) return null;
  for (const k of layout.knobs) {
    if (cx >= k.x && cx < k.x + k.w && cy >= k.y && cy < k.y + k.h) return k;
  }
  return null;
}

// Drag updater: dy is positive when the user drags down. We map vertical pixel
// drag to a normalized value change (slow), with horizontal also accepted as
// a fine adjust (faster). Range = (hi-lo) per ~120px of drag.
export function applyKnobDrag(k, drag, dxPx, dyPx, shift) {
  const range = (k.hi - k.lo);
  // Vertical: up = increase. Horizontal: right = increase.
  const pxPerRange = shift ? 480 : 160;
  const delta = (-dyPx + dxPx * 0.5) / pxPerRange * range;
  let v = drag.startValue + delta;
  if (k.categorical) v = Math.round(v);
  k.set(clamp(v, k.lo, k.hi));
}
