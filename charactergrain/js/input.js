import { state, setStatus } from './state.js';
import { CLAMPS, ALGOS, CA_RULES, PAINT_TIERS, SNIPPET_MAX } from './constants.js';
import {
  audioCtx, loadAudioFile, panicStop, setMasterGain, setSatDrive,
  startRecording, stopRecording, generateDefaultBuffer,
  setRecordSource, refreshOutputDevices, setOutputDevice,
  listInputDevices, sampleFromInput,
} from './audio.js';
import { hitButton } from './ui.js';
import {
  reseedStormcell, resetForAlgo, clearCanvas, randomizeCanvas, paintCellAt, canvasHoverFire,
  seedTipAt, clearTipsNear, paintNutrientAt, toggleCellAt,
} from './grains.js';

let audioFileInput = null;

export function initInput() {
  audioFileInput = document.getElementById('audioFile');
  audioFileInput.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setStatus('loading ' + f.name + '…');
    try {
      await loadAudioFile(f);
      setStatus('loaded: ' + f.name);
    } catch (err) {
      setStatus('load failed: ' + (err && err.message || err));
    }
    audioFileInput.value = '';
  });

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('gamepadconnected', (e) => {
    state.gamepad.connected = true;
    state.gamepad.index = e.gamepad.index;
    setStatus('gamepad connected: ' + e.gamepad.id);
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (state.gamepad.index === e.gamepad.index) {
      state.gamepad.connected = false;
      state.gamepad.index = -1;
      setStatus('gamepad disconnected');
    }
  });

  initPointer();
}

// ──────────────────────────────────────────────────────────────────────────────
// Pointer — UI buttons first, then field interactions by algo.
// ──────────────────────────────────────────────────────────────────────────────

function updatePointer(e) {
  const cv = document.getElementById('cv');
  const rect = cv.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  state.mouse.x = x; state.mouse.y = y;
  const cellPx = state.ui.cellPx || 14;
  state.mouse.uiC = Math.floor(x / cellPx);
  state.mouse.uiR = Math.floor(y / cellPx);
  state.mouse.prevFx = state.mouse.fx;
  state.mouse.prevFy = state.mouse.fy;
  state.mouse.fx = state.mouse.uiC;
  state.mouse.fy = state.mouse.uiR - state.ui.menuRows;
  state.mouse.inField =
    state.mouse.fx >= 0 && state.mouse.fx < state.cols &&
    state.mouse.fy >= 0 && state.mouse.fy < state.rows;
  state.mouse.shift = !!e.shiftKey;
}

function initPointer() {
  const cv = document.getElementById('cv');

  cv.addEventListener('pointermove', (e) => {
    updatePointer(e);
    if (state.recorderOpen || state.menuOpen) return;
    if (state.mouse.leftDown && state.mouse.inField) {
      if (state.algo === 1) {
        paintCellAt(state.mouse.fx, state.mouse.fy, state.paint.tier, state.mouse.shift);
      }
    }
    if (state.mouse.rightDown && state.mouse.inField && state.algo === 0) {
      paintNutrientAt(state.mouse.fx, state.mouse.fy, 0.3);
    }
    if (state.playing && state.algo === 1 && state.mouse.inField) {
      canvasHoverFire();
    }
  });

  cv.addEventListener('pointerdown', (e) => {
    updatePointer(e);
    cv.setPointerCapture?.(e.pointerId);
    if (e.button === 0) state.mouse.leftDown = true;
    else if (e.button === 2) state.mouse.rightDown = true;

    // UI buttons first.
    const b = hitButton(state.mouse.uiC, state.mouse.uiR);
    if (b) {
      // Close menu if clicking outside this menu's items.
      if (state.menuOpen && !b.id.startsWith('menu:')) {
        const prefix = state.menuOpen.toLowerCase() + ':';
        if (!b.id.startsWith(prefix)) state.menuOpen = null;
      }
      dispatch(b.id, e);
      return;
    }
    // Outside click closes menu / overlay.
    if (state.menuOpen) { state.menuOpen = null; return; }
    if (state.recorderOpen) { state.recorderOpen = false; return; }

    // Field interaction.
    if (!state.mouse.inField) return;
    if (e.button === 0) {
      if (state.algo === 0) {
        if (e.shiftKey) clearTipsNear(state.mouse.fx, state.mouse.fy, 4);
        else seedTipAt(state.mouse.fx, state.mouse.fy);
      } else if (state.algo === 1) {
        paintCellAt(state.mouse.fx, state.mouse.fy, state.paint.tier, e.shiftKey);
      } else if (state.algo === 2) {
        toggleCellAt(state.mouse.fx, state.mouse.fy);
      }
    } else if (e.button === 2) {
      if (state.algo === 0) paintNutrientAt(state.mouse.fx, state.mouse.fy, 0.4);
    }
  });

  cv.addEventListener('pointerup', (e) => {
    if (e.button === 0) state.mouse.leftDown = false;
    if (e.button === 2) state.mouse.rightDown = false;
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerleave', () => {
    state.mouse.inField = false;
    state.mouse.leftDown = false;
    state.mouse.rightDown = false;
    state.mouse.prevFx = -1;
    state.mouse.prevFy = -1;
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? +1 : -1;
    bump('size', dir * 10);
  }, { passive: false });
}

// ──────────────────────────────────────────────────────────────────────────────
// Button dispatch.
// ──────────────────────────────────────────────────────────────────────────────

function dispatch(id, e) {
  // Menu toggles.
  if (id.startsWith('menu:')) {
    const name = id.slice(5);
    state.menuOpen = state.menuOpen === name ? null : name;
    return;
  }
  if (id.startsWith('panel:')) {
    const k = id.slice(6);
    state.panelOpen[k] = !state.panelOpen[k];
    return;
  }

  const close = () => { state.menuOpen = null; };

  // Knob ± buttons.
  if (id.startsWith('k:')) {
    const [, key, op] = id.split(':');
    const stepMap = {
      density: 0.05, size: 10, spread: 0.05, pitch: 1, gain: 0.05,
      pheroDecay: 0.1, bias: 0.1, glyphFx: 0.05, sat: 0.05, wet: 0.05, caDens: 0.05,
      stretch: 0.05,
    };
    const step = stepMap[key] ?? 0.05;
    bump(key, op === '+' ? step : -step);
    if (key === 'sat') setSatDrive(state.knobs.sat);
    return;
  }

  // Algo selector.
  if (id.startsWith('algo:')) {
    const sub = id.slice(5);
    if (sub === 'reset')       { resetForAlgo(); setStatus('reseed (' + ALGOS[state.algo] + ')'); close(); return; }
    if (sub === 'caRule')      { state.knobs.caRule = (state.knobs.caRule + 1) % CA_RULES.length; setStatus('caRule: ' + CA_RULES[state.knobs.caRule].name); return; }
    if (sub === 'caSeed')      { reseedStormcell(); setStatus('stormcell reseeded'); return; }
    if (sub === 'canvasClear') {
      if (state.algo !== 1) { state.algo = 1; resetForAlgo(); }
      clearCanvas(); setStatus('canvas cleared'); close(); return;
    }
    if (sub === 'canvasRand')  {
      if (state.algo !== 1) { state.algo = 1; resetForAlgo(); }
      randomizeCanvas(); setStatus('canvas randomized'); close(); return;
    }
    const n = parseInt(sub, 10);
    if (!isNaN(n)) {
      state.algo = n; resetForAlgo(); setStatus('algo: ' + ALGOS[n]); close();
    }
    return;
  }

  // File menu.
  if (id === 'file:load')     { close(); audioFileInput.click(); return; }
  if (id === 'file:default')  { close(); generateDefaultBuffer(); setStatus('reset to pink noise'); return; }
  if (id === 'file:recPanel') { close(); state.recorderOpen = true; audioCtx(); return; }
  if (id === 'file:recStart') { close(); audioCtx(); const ok = startRecording(); setStatus(ok ? '● recording master' : 'recording unavailable'); return; }
  if (id === 'file:recStop')  { close(); const ok = stopRecording(); setStatus(ok ? 'stopped — downloading…' : 'not recording'); return; }
  if (id === 'recorder:close'){ state.recorderOpen = false; return; }
  if (id === 'file:snipSave') { close(); saveSnippet(); return; }
  if (id === 'file:snipClear'){ close(); state.snippets = []; setStatus('snippets cleared'); return; }

  // FX presets.
  if (id === 'fx:pure')  { state.knobs.glyphFx = 0; setStatus('glyphFx: 0'); close(); return; }
  if (id === 'fx:mid')   { state.knobs.glyphFx = 0.6; setStatus('glyphFx: 0.6'); close(); return; }
  if (id === 'fx:max')   { state.knobs.glyphFx = 1; setStatus('glyphFx: 1'); close(); return; }
  if (id === 'fx:dry')   { state.knobs.wet = 0; setStatus('wet: 0'); close(); return; }
  if (id === 'fx:wetlo') { state.knobs.wet = 0.25; setStatus('wet: 0.25'); close(); return; }
  if (id === 'fx:wethi') { state.knobs.wet = 0.8; setStatus('wet: 0.8'); close(); return; }
  if (id === 'fx:satlo') { state.knobs.sat = 0.1; setSatDrive(0.1); setStatus('sat: 0.1'); close(); return; }
  if (id === 'fx:sathi') { state.knobs.sat = 0.9; setSatDrive(0.9); setStatus('sat: 0.9'); close(); return; }

  // Scan / stretch mode.
  if (id === 'scan:toggle') {
    state.scan.on = !state.scan.on;
    if (state.scan.on && (state.scan.pos == null || isNaN(state.scan.pos))) state.scan.pos = 0;
    setStatus(state.scan.on ? 'scan on — playhead sweeps the sample' : 'scan off');
    return;
  }
  if (id === 'scan:scrub' || id === 'scan:scrubPanel') {
    const b = (state.buttons || []).find(x => x.id === id);
    if (b) {
      const rel = (state.mouse.uiC - b.c) / Math.max(1, b.w);
      state.scan.pos = Math.max(0, Math.min(0.999, rel));
      state.scan.on = true;
      setStatus('scan pos: ' + (state.scan.pos * 100).toFixed(1) + '%');
    }
    return;
  }

  // Sampler — input device + sample button.
  if (id === 'input:refresh') {
    listInputDevices().then(list => {
      setStatus('input devices: ' + list.length + (list.length ? '' : ' (allow mic)'));
    });
    state.panelOpen.sample = true;
    return;
  }
  if (id === 'input:default') {
    state.prefs.inputDeviceId = '';
    state.prefs.inputDeviceLabel = 'default mic';
    setStatus('input: default mic');
    return;
  }
  if (id.startsWith('input:pick:')) {
    const devId = id.slice('input:pick:'.length);
    const dev = (state.prefs.inputDevices || []).find(d => d.id === devId);
    state.prefs.inputDeviceId = devId;
    state.prefs.inputDeviceLabel = dev ? dev.label : devId.slice(0, 8);
    setStatus('input: ' + state.prefs.inputDeviceLabel);
    return;
  }
  if (id === 'input:sample') {
    const sec = state.prefs.sampleSeconds || 3;
    setStatus('sampling ' + sec.toFixed(1) + 's from ' + (state.prefs.inputDeviceLabel || 'default mic') + '…');
    sampleFromInput(state.prefs.inputDeviceId, sec)
      .then(() => setStatus('sampled → buffer (' + (state.bufferName || '') + ')'))
      .catch(err => setStatus('sample failed: ' + (err && err.message || err)));
    return;
  }
  if (id === 'sampleSec:-') {
    state.prefs.sampleSeconds = Math.max(0.5, Math.round((state.prefs.sampleSeconds - 0.5) * 10) / 10);
    return;
  }
  if (id === 'sampleSec:+') {
    state.prefs.sampleSeconds = Math.min(30, Math.round((state.prefs.sampleSeconds + 0.5) * 10) / 10);
    return;
  }

  // Audio preferences.
  if (id.startsWith('prefs:src:')) {
    const which = id.slice('prefs:src:'.length);
    setRecordSource(which);
    setStatus('record source: ' + which);
    close();
    return;
  }
  if (id === 'prefs:out:refresh') {
    refreshOutputDevices().then(list => {
      setStatus('output devices: ' + list.length + ' found' + (list.length === 0 ? ' (grant mic permission once)' : ''));
    });
    state.panelOpen.prefs = true;
    return;
  }
  if (id === 'prefs:out:default') {
    setOutputDevice('', 'default').then(ok => setStatus(ok ? 'output: default' : 'setSinkId unsupported'));
    close();
    return;
  }
  if (id.startsWith('prefs:out:pick:')) {
    const devId = id.slice('prefs:out:pick:'.length);
    const dev = (state.prefs.outputDevices || []).find(d => d.id === devId);
    const label = dev ? dev.label : devId.slice(0, 8);
    setOutputDevice(devId, label).then(ok => setStatus(ok ? 'output: ' + label : 'setSinkId unsupported'));
    return;
  }

  // Help.
  if (id === 'help:keys')  { close(); setStatus('keys: see panel · full list in README'); return; }
  if (id === 'help:about') { close(); setStatus('charactergrain — character-only granular synth · part of characterworld'); return; }

  // Paint panel.
  if (id.startsWith('paint:tier:')) { state.paint.tier = id.slice('paint:tier:'.length); state.paint.glyphIdx = -1; return; }
  if (id === 'paint:any')           { state.paint.glyphIdx = -1; return; }
  if (id.startsWith('paint:glyph:')){ state.paint.glyphIdx = parseInt(id.slice('paint:glyph:'.length), 10); return; }
  if (id === 'paint:zalgo')         { state.paint.zalgo = !state.paint.zalgo; return; }

  // Snippet recall.
  if (id.startsWith('snip:')) {
    const i = parseInt(id.slice(5), 10);
    recallSnippet(i);
    return;
  }

  // Transport.
  if (id === 'transport:play') {
    state.playing = !state.playing;
    if (state.playing) audioCtx();
    setStatus(state.playing ? 'playing' : 'paused');
    return;
  }
  if (id === 'transport:panic') {
    panicStop(); state.playing = false; setStatus('panic');
    return;
  }
}

function saveSnippet() {
  const k = { ...state.knobs };
  const label = `${state.snippets.length + 1}. ${ALGOS[state.algo]} d${k.density.toFixed(2)} s${Math.round(k.size)}`;
  state.snippets.unshift({ label, algo: state.algo, knobs: k });
  if (state.snippets.length > SNIPPET_MAX) state.snippets.length = SNIPPET_MAX;
  setStatus('saved snippet: ' + label);
}

function recallSnippet(i) {
  const s = state.snippets[i];
  if (!s) return;
  Object.assign(state.knobs, s.knobs);
  if (state.algo !== s.algo) {
    state.algo = s.algo;
    resetForAlgo();
  }
  setMasterGain(state.knobs.gain);
  setSatDrive(state.knobs.sat);
  setStatus('recalled: ' + s.label);
}

// ──────────────────────────────────────────────────────────────────────────────
// Keyboard.
// ──────────────────────────────────────────────────────────────────────────────

function onKey(e) {
  const tgt = e.target;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
  const k = e.key;
  state.mouse.shift = e.shiftKey;

  if (k === ' ') {
    e.preventDefault();
    state.playing = !state.playing;
    if (state.playing) audioCtx();
    setStatus(state.playing ? 'playing' : 'paused');
    return;
  }
  if (k === 'Escape') {
    if (state.recorderOpen) { state.recorderOpen = false; return; }
    if (state.menuOpen) { state.menuOpen = null; return; }
    panicStop(); state.playing = false; setStatus('panic');
    return;
  }
  if (k === 'F8') { e.preventDefault(); state.recorderOpen = !state.recorderOpen; if (state.recorderOpen) audioCtx(); return; }
  if (k === 'l' || k === 'L') { audioFileInput.click(); return; }
  if (k === 'r' || k === 'R') {
    if (e.shiftKey && state.algo === 1) { clearCanvas(); setStatus('canvas cleared'); return; }
    resetForAlgo(); setStatus('reseed (' + ALGOS[state.algo] + ')');
    return;
  }
  if (k === 'F5') { e.preventDefault(); saveSnippet(); return; }
  if (k === 'F9') { e.preventDefault(); startRecording(); setStatus('● recording master'); return; }
  if (k === 'F10'){ e.preventDefault(); stopRecording(); setStatus('stopped — downloading…'); return; }

  if (k === '[') return bump('density', -0.05);
  if (k === ']') return bump('density', +0.05);
  if (k === ',') return bump('size', -10);
  if (k === '.') return bump('size', +10);
  if (k === ';') return bump('spread', -0.05);
  if (k === "'") return bump('spread', +0.05);
  if (k === '-' || k === '_') return bump('gain', -0.05);
  if (k === '=' || k === '+') return bump('gain', +0.05);
  if (k === 'ArrowUp')   { e.preventDefault(); return bump('pitch', +1); }
  if (k === 'ArrowDown') { e.preventDefault(); return bump('pitch', -1); }

  if (k === '9') return bump('pheroDecay', -0.1);
  if (k === '0') return bump('pheroDecay', +0.1);
  if (k === '7') return bump('bias', -0.1);
  if (k === '8') return bump('bias', +0.1);
  if (k === 'v' || k === 'V') return bump('glyphFx', -0.05);
  if (k === 'b' || k === 'B') return bump('glyphFx', +0.05);
  if (k === 'n' || k === 'N') return bump('sat', -0.05, () => setSatDrive(state.knobs.sat));
  if (k === 'm' || k === 'M') return bump('sat', +0.05, () => setSatDrive(state.knobs.sat));
  if (k === 'h' || k === 'H') return bump('wet', -0.05);
  if (k === 'j' || k === 'J') return bump('wet', +0.05);
  if (k === 'u' || k === 'U') return bump('caDens', -0.05);
  if (k === 'i' || k === 'I') return bump('caDens', +0.05);

  if (k === 't' || k === 'T') {
    state.knobs.caRule = (state.knobs.caRule + 1) % CA_RULES.length;
    setStatus('caRule: ' + CA_RULES[state.knobs.caRule].name);
    return;
  }
  if (k === 'y' || k === 'Y') {
    if (state.algo === 2) { reseedStormcell(); setStatus('stormcell reseeded'); }
    return;
  }
  if (k === 'z' || k === 'Z') {
    state.paint.zalgo = !state.paint.zalgo;
    setStatus('paint zalgo: ' + state.paint.zalgo);
    return;
  }
  if (k === 'x' || k === 'X') {
    const i = PAINT_TIERS.indexOf(state.paint.tier);
    state.paint.tier = PAINT_TIERS[(i + 1) % PAINT_TIERS.length];
    state.paint.glyphIdx = -1;
    setStatus('paint tier: ' + state.paint.tier);
    return;
  }

  if (k === '1') { state.algo = 0; resetForAlgo(); setStatus('algo: ' + ALGOS[0]); return; }
  if (k === '2') { state.algo = 1; resetForAlgo(); setStatus('algo: ' + ALGOS[1]); return; }
  if (k === '3') { state.algo = 2; resetForAlgo(); setStatus('algo: ' + ALGOS[2]); return; }
  if (k === '4') { state.algo = 3; setStatus('algo: ' + ALGOS[3] + ' (coming soon)'); return; }
}

function onKeyUp(e) {
  state.mouse.shift = e.shiftKey;
}

function bump(key, delta, side) {
  const knobs = state.knobs;
  let v = knobs[key] + delta;
  const [lo, hi] = CLAMPS[key];
  if (v < lo) v = lo; if (v > hi) v = hi;
  if (key === 'density' || key === 'spread' || key === 'gain' || key === 'wet' ||
      key === 'glyphFx' || key === 'sat' || key === 'caDens' || key === 'pheroDecay' ||
      key === 'bias') {
    v = Math.round(v * 100) / 100;
  }
  knobs[key] = v;
  if (key === 'gain') setMasterGain(v);
  if (side) side();
  setStatus(key + ': ' + v);
}

function bumpSilent(key, delta) {
  const knobs = state.knobs;
  let v = knobs[key] + delta;
  const [lo, hi] = CLAMPS[key];
  if (v < lo) v = lo; if (v > hi) v = hi;
  knobs[key] = v;
  if (key === 'gain') setMasterGain(v);
}

// ──────────────────────────────────────────────────────────────────────────────
// Gamepad.
// ──────────────────────────────────────────────────────────────────────────────

export function pollGamepad(dt) {
  if (!state.gamepad.connected) return;
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  const pad = pads && pads[state.gamepad.index];
  if (!pad) return;

  const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
  const lx = dz(pad.axes[0] || 0);
  const ly = dz(pad.axes[1] || 0);
  const rx = dz(pad.axes[2] || 0);
  const ry = dz(pad.axes[3] || 0);

  if (lx) bumpSilent('spread',  lx * dt * 1.0);
  if (ly) bumpSilent('pitch',  -ly * dt * 30);
  if (rx) bumpSilent('density', rx * dt * 1.5);
  if (ry) bumpSilent('size',   -ry * dt * 220);

  const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
  const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
  if (lt > 0.05) bumpSilent('glyphFx', -lt * dt * 0.8);
  if (rt > 0.05) bumpSilent('glyphFx',  rt * dt * 0.8);

  const aDown = !!(pad.buttons[0] && pad.buttons[0].pressed);
  const bDown = !!(pad.buttons[1] && pad.buttons[1].pressed);
  const xDown = !!(pad.buttons[2] && pad.buttons[2].pressed);
  const yDown = !!(pad.buttons[3] && pad.buttons[3].pressed);
  const lbDown = !!(pad.buttons[4] && pad.buttons[4].pressed);
  const rbDown = !!(pad.buttons[5] && pad.buttons[5].pressed);

  if (aDown && !state.gamepad.btnA) {
    state.playing = !state.playing;
    if (state.playing) audioCtx();
    setStatus(state.playing ? 'playing' : 'paused');
  }
  if (bDown && !state.gamepad.btnB) { panicStop(); state.playing = false; setStatus('panic'); }
  if (xDown && !state.gamepad.btnX) { resetForAlgo(); setStatus('reseed (' + ALGOS[state.algo] + ')'); }
  if (yDown && !state.gamepad.btnY) {
    state.knobs.caRule = (state.knobs.caRule + 1) % CA_RULES.length;
    setStatus('caRule: ' + CA_RULES[state.knobs.caRule].name);
  }
  if (lbDown && !state.gamepad.btnLB) {
    state.algo = (state.algo + ALGOS.length - 1) % ALGOS.length;
    resetForAlgo(); setStatus('algo: ' + ALGOS[state.algo]);
  }
  if (rbDown && !state.gamepad.btnRB) {
    state.algo = (state.algo + 1) % ALGOS.length;
    resetForAlgo(); setStatus('algo: ' + ALGOS[state.algo]);
  }

  state.gamepad.btnA = aDown;
  state.gamepad.btnB = bDown;
  state.gamepad.btnX = xDown;
  state.gamepad.btnY = yDown;
  state.gamepad.btnLB = lbDown;
  state.gamepad.btnRB = rbDown;
}
