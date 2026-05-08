// scheduler.js — look-ahead transport. Per-track step pointers so each track
// has independent length+division (polyrhythmic phasing).
//
// Voice dispatch lives here: a cell's audio behavior depends on the track's
// `voice` field. The actual sound primitives are in audio.js.

import { state, currentPlayPattern } from './state.js';
import {
  audioCtx, audioNow,
  fireSlice, fireGrainBurst, fireFM, fireDrum,
  panicStop,
} from './audio.js';
import { spawnBurst } from './particles.js';
import { DEFAULTS } from './constants.js';

const LOOKAHEAD_SEC = 0.10;

// Visual fire events (deferred to UI sync). { when, trackIdx, cell, cx, cy }.
// UI consumes once now >= when.
export const pendingVisual = [];

export function startTransport() {
  audioCtx();
  if (state.playing) return;
  const now = audioNow();
  state.playing = true;
  state.playStartTime = now;
  state.song.lastAdvanceAt = now;
  const pat = currentPlayPattern();
  state.trackPlay = pat.tracks.map(() => ({ stepIndex: 0, nextStepTime: now }));
}

export function stopTransport() { state.playing = false; }
export function toggleTransport() { state.playing ? stopTransport() : startTransport(); }
export function panic() { stopTransport(); panicStop(); }

export function stepDur(track) {
  return (60 / state.bpm) * (4 / track.div);
}

// Bars-based song-step duration. Pattern.bars × 16 sixteenths × stepDur(div=16).
// Chosen for two reasons: (1) tracks within a pattern can have different
// lengths/divisions so there's no natural "pattern wrap" — bars give a
// musical fixed boundary; (2) Renoise patterns are bar-aligned, this matches.
function patternDurSec(pat) {
  const sixteenth = (60 / state.bpm) / 4;
  return (pat.bars || 4) * 16 * sixteenth;
}

function maybeAdvanceSong(now) {
  if (!state.song.songMode) return false;
  const seq = state.song.sequence;
  if (!seq.length) return false;
  const pat = currentPlayPattern();
  if (!pat) return false;
  const elapsed = now - state.song.lastAdvanceAt;
  if (elapsed < patternDurSec(pat)) return false;
  // Advance song step.
  state.song.songStep = (state.song.songStep + 1) % seq.length;
  state.song.lastAdvanceAt += patternDurSec(pat);
  if (state.song.follow) state.song.editIndex = seq[state.song.songStep] || 0;
  // Reset all per-track pointers to the new pattern's step 0 at `now`.
  const newPat = currentPlayPattern();
  state.trackPlay = newPat.tracks.map(() => ({ stepIndex: 0, nextStepTime: now }));
  return true;
}

export function tickScheduler() {
  if (!state.playing) return;
  const ctx = audioCtx();
  const now = ctx.currentTime;
  // Song-mode pattern boundary advance — must run before scheduling the next
  // window so newly-scheduled cells come from the new pattern.
  maybeAdvanceSong(now);

  const horizon = now + LOOKAHEAD_SEC;
  const pat = currentPlayPattern();
  const tracks = pat.tracks;
  const anySolo = tracks.some(t => t.solo);

  for (let i = 0; i < tracks.length; i++) {
    const tr = tracks[i];
    if (!state.trackPlay[i]) state.trackPlay[i] = { stepIndex: 0, nextStepTime: now };
    const tp = state.trackPlay[i];
    const sd = stepDur(tr);
    const audible = !tr.mute && (!anySolo || tr.solo);

    while (tp.nextStepTime < horizon) {
      const stepIdx = tp.stepIndex % tr.length;
      const cell = tr.cells[stepIdx];
      if (audible && cell && cell.active && rollProb(cell.prob)) {
        scheduleCell(tp.nextStepTime, tr, i, cell, sd, stepIdx);
      }
      tp.nextStepTime += sd;
      tp.stepIndex = (tp.stepIndex + 1) % tr.length;
    }
  }
}

function rollProb(p) {
  if (p >= 100) return true;
  if (p <= 0) return false;
  return Math.random() * 100 < p;
}

function scheduleCell(when, track, trackIdx, cell, sd, stepIdx) {
  const microShift = (cell.micro / 100) * sd;
  const t0 = when + microShift;
  const gateSec = sd * (cell.gate / 100);
  const retrig = Math.max(1, cell.retrig | 0);

  switch (track.voice) {
    case 'SAMPLE': scheduleSample(t0, track, cell, gateSec, retrig); break;
    case 'GRAIN':  scheduleGrain(t0, track, cell, gateSec, retrig);  break;
    case 'FM':     scheduleFM(t0, track, cell, gateSec, retrig);     break;
    case 'DRUM':   scheduleDrum(t0, track, cell, gateSec, retrig);   break;
  }

  // Defer particle spawn to when the sound is heard (matches the audio).
  pendingVisual.push({
    when: t0,
    trackIdx, stepIdx,
    voice: track.voice,
    intensity: retrig,
    accent: cell.grain,
  });
}

function scheduleSample(t0, track, cell, gateSec, retrig) {
  const slot = state.bank[track.slot];
  if (!slot || !slot.buffer || !slot.slices) return;
  if (cell.grain) {
    const grains = retrig * DEFAULTS.grainBurst;
    fireGrainBurst(t0, slot, cell.slice, grains, cell.pitch, gateSec, track.gain, track.pan, DEFAULTS.grainDurMs, DEFAULTS.grainPitchSpread);
  } else {
    const each = gateSec / retrig;
    for (let r = 0; r < retrig; r++) {
      fireSlice(t0 + each * r, slot, cell.slice, cell.pitch, each, track.gain, track.pan);
    }
  }
}

function scheduleGrain(t0, track, cell, gateSec, retrig) {
  const slot = state.bank[track.slot];
  if (!slot || !slot.buffer) return;
  const p = track.params;
  const density = (p.density || DEFAULTS.grainBurst) * retrig * (cell.grain ? 2 : 1);
  const spread = (p.spread || DEFAULTS.grainPitchSpread) * (cell.grain ? 2 : 1);
  const grainMs = p.grainMs || DEFAULTS.grainDurMs;
  fireGrainBurst(t0, slot, cell.slice, Math.max(1, density | 0), cell.pitch, gateSec, track.gain, track.pan, grainMs, spread);
}

function scheduleFM(t0, track, cell, gateSec, retrig) {
  const p = track.params;
  const note = cell.slice + cell.pitch;
  const freq = DEFAULTS.fmBaseFreq * Math.pow(2, note / 12);
  const each = gateSec / retrig;
  const indexBoost = cell.grain ? 2 : 1;
  for (let r = 0; r < retrig; r++) {
    fireFM(
      t0 + each * r, freq, each,
      track.gain, track.pan,
      p.ratio || DEFAULTS.fmRatio,
      (p.index || DEFAULTS.fmIndex) * indexBoost,
      p.atk || DEFAULTS.fmAtk,
      p.rel || DEFAULTS.fmRel,
    );
  }
}

function scheduleDrum(t0, track, cell, gateSec, retrig) {
  const each = gateSec / retrig;
  const durFactor = Math.max(0.3, gateSec * 6);     // longer gate → bigger tail
  for (let r = 0; r < retrig; r++) {
    fireDrum(t0 + each * r, cell.slice | 0, cell.pitch, durFactor, track.gain, track.pan, cell.grain);
  }
}

// Drain pending visual events whose `when` has now passed. Called by main RAF
// loop with the current audio time and a callback to spawn particles using
// the layout cache (so positions match the track column on screen).
export function drainPendingVisuals(now, onFire) {
  let i = 0;
  while (i < pendingVisual.length) {
    const ev = pendingVisual[i];
    if (ev.when <= now) {
      onFire(ev);
      pendingVisual.splice(i, 1);
    } else {
      // Events aren't strictly sorted across tracks, so we keep scanning.
      i++;
    }
  }
}

export function playheadFor(trackIdx) {
  if (!state.playing) return -1;
  const playPat = currentPlayPattern();
  // Playhead is meaningful only against the playing pattern (not the edit
  // pattern). When viewing a different pattern, return -1 so UI doesn't
  // mis-render a phantom playhead on cells that aren't actually firing.
  if (state.song.songMode && playPat !== state.pattern) return -1;
  const tr = playPat.tracks[trackIdx];
  if (!tr) return -1;
  const sd = stepDur(tr);
  const elapsed = audioNow() - state.song.lastAdvanceAt;
  if (elapsed < 0) return -1;
  return (elapsed / sd) % tr.length;
}

// Song progress (0..1) within the currently-playing pattern.
export function songProgress() {
  if (!state.playing) return 0;
  const pat = currentPlayPattern();
  if (!pat) return 0;
  const elapsed = audioNow() - state.song.lastAdvanceAt;
  const sixteenth = (60 / state.bpm) / 4;
  const total = (pat.bars || 4) * 16 * sixteenth;
  return Math.max(0, Math.min(1, elapsed / total));
}
