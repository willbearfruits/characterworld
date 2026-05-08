// main.js — entry. Wires UI + input + scheduler. RAF for redraw + particle
// tick. setInterval for the audio scheduler so it isn't tab-throttled.

import { state, setStatus } from './state.js';
import { initUI, resizeUI, drawUI } from './ui.js';
import { initInput } from './input.js';
import { tickScheduler, drainPendingVisuals } from './scheduler.js';
import { audioCtx, audioNow } from './audio.js';
import { generateDefaultBufferToSlot } from './bank.js';
import { tickParticles, spawnBurst, spawnAmbient } from './particles.js';
import { setAudioApplier, tryAutoload } from './history.js';
import { initIo } from './io.js';
import { setMasterGain, setSatDrive } from './audio.js';

const cv = document.getElementById('cv');
initUI(cv);
initInput(cv);
initIo();
setAudioApplier((g, s) => { setMasterGain(g); setSatDrive(s); });

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  resizeUI(cv, window.innerWidth, window.innerHeight, dpr);
}
window.addEventListener('resize', resize);
resize();

// First-touch audio bring-up.
let seeded = false;
function seedDefault() {
  if (seeded) return;
  audioCtx();
  // Seed a few slots with default noise so several voices have something to play.
  for (let i = 0; i < state.bank.length; i++) generateDefaultBufferToSlot(i);
  seeded = true;
  setStatus('audio ready · slot 1-' + state.bank.length + ' seeded · L to load · P to play');
}
window.addEventListener('keydown', seedDefault, { once: true });
window.addEventListener('pointerdown', seedDefault, { once: true });

// Demo seed: a hopefully-listenable starting point.
function seedDemo() {
  // Tracks 0..3 = SAMPLE, 4..7 = DRUM, 8..11 = GRAIN, 12..15 = FM (per pattern.js defaults)
  // Track 4 (DRUM kick): downbeat
  const t4 = state.pattern.tracks[4];
  if (t4) {
    for (let i = 0; i < t4.length; i += 4) { t4.cells[i].active = true; t4.cells[i].slice = 0; }
  }
  // Track 5 (DRUM snare): backbeat
  const t5 = state.pattern.tracks[5];
  if (t5) {
    for (let i = 2; i < t5.length; i += 4) { t5.cells[i].active = true; t5.cells[i].slice = 1; }
    if (t5.cells[14]) { t5.cells[14].active = true; t5.cells[14].slice = 1; t5.cells[14].retrig = 4; t5.cells[14].grain = true; }
  }
  // Track 6 (DRUM hat): off-beat
  const t6 = state.pattern.tracks[6];
  if (t6) {
    for (let i = 1; i < t6.length; i += 2) { t6.cells[i].active = true; t6.cells[i].slice = 2; t6.cells[i].prob = 80; }
  }
  // Track 0 (SAMPLE): a few hits
  const t0 = state.pattern.tracks[0];
  if (t0) {
    for (let i = 0; i < t0.length; i += 8) { t0.cells[i].active = true; t0.cells[i].slice = (i / 8) % 8; }
  }
  // Track 12 (FM): a sparse line
  const t12 = state.pattern.tracks[12];
  if (t12) {
    const fmNotes = [12, 15, 19, 24];
    [0, 7, 12, 19, 24, 31, 38, 47].forEach((i, idx) => {
      if (i >= t12.length) return;
      t12.cells[i].active = true;
      t12.cells[i].slice = fmNotes[idx % fmNotes.length];
      t12.cells[i].pitch = 0;
    });
  }
}

// Try to autoload last session from localStorage; if nothing there, seed the demo.
const autoloaded = tryAutoload();
if (!autoloaded) seedDemo();
setStatus(autoloaded ? 'restored last session · F1 for help · ctrl+Z undo' : 'F1 help · click cells · drag knobs · P play · ctrl+Z undo · shft+drag select');

// Audio scheduler tick.
setInterval(() => {
  try { tickScheduler(); }
  catch (e) { console.error('scheduler:', e); }
}, 25);

let lastT = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - lastT) / 1000));
  lastT = now;
  // Drain pending visual fire events (matches audio time).
  drainPendingVisuals(audioNow(), (ev) => {
    const layout = state.layout;
    if (!layout || !layout.grid) return;
    const g = layout.grid;
    const visTrack = ev.trackIdx - state.scrollTrack;
    const visStep = ev.stepIdx - state.scrollStep;
    if (visTrack < 0 || visTrack >= g.w / g.colW) return;
    if (visStep < 0 || visStep >= g.h) return;
    const cx = g.x + (visTrack + 0.5) * g.colW;
    const cy = g.y + visStep + 0.5;
    spawnBurst(cx, cy, ev.voice, ev.intensity, ev.accent);
  });
  // Occasional ambient particles when playing.
  if (state.playing && Math.random() < 0.08) {
    spawnAmbient(Math.random() * state.cols, state.rows - 3 + Math.random() * 2);
  }
  tickParticles(dt);
  try { drawUI(); } catch (e) { console.error('ui:', e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
