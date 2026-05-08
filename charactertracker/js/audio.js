// audio.js — owns the AudioContext and master chain.
//
// Master chain (borrowed from charactergrain): WaveShaper (tanh) → DynamicsCompressor (limiter) → master Gain → destination.
// All voices route through the saturator so the limiter sees them.

import { state } from './state.js';
import { DEFAULTS } from './constants.js';

let ctx = null;
let saturator = null;
let limiter = null;
let master = null;

export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    saturator = ctx.createWaveShaper();
    saturator.curve = makeTanhCurve(1 + state.knobs.satDrive * 6);
    saturator.oversample = '4x';

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = DEFAULTS.limiterThr;
    limiter.knee.value = 0;
    limiter.ratio.value = DEFAULTS.limiterRatio;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.06;

    master = ctx.createGain();
    master.gain.value = state.knobs.masterGain;

    saturator.connect(limiter).connect(master).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function audioNow() { return ctx ? ctx.currentTime : 0; }
export function audioBus() { return saturator; }

function makeTanhCurve(drive) {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive);
  }
  return c;
}

export function setMasterGain(g) {
  state.knobs.masterGain = g;
  if (!master) return;
  master.gain.setTargetAtTime(g, ctx.currentTime, 0.01);
}

export function setSatDrive(v) {
  state.knobs.satDrive = v;
  if (!saturator) return;
  saturator.curve = makeTanhCurve(1 + v * 6);
}

export function panicStop() {
  if (!ctx) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0.0001, now + 0.05);
  master.gain.linearRampToValueAtTime(state.knobs.masterGain, now + 0.6);
}

// ──────────────────────────────────────────────────────────────────────────────
// SAMPLE voice — clean slice playback.
// ──────────────────────────────────────────────────────────────────────────────

export function fireSlice(when, slot, sliceIdx, pitchSemi, gateSec, gain, pan) {
  if (!ctx || !slot || !slot.buffer || !slot.slices) return;
  const buf = slot.buffer;
  const slices = slot.slices;
  const i = Math.max(0, Math.min(slices.length - 1, sliceIdx | 0));
  const startN = slices[i];
  const endN = (i + 1 < slices.length) ? slices[i + 1] : 1;
  const startSec = startN * buf.duration;
  const sliceDurSec = Math.max(0.001, (endN - startN) * buf.duration);

  const sourcePlayDur = Math.max(0.005, Math.min(sliceDurSec, gateSec));
  const rate = Math.pow(2, pitchSemi / 12);
  const renderedDur = sourcePlayDur / rate;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;

  const env = ctx.createGain();
  const panner = ctx.createStereoPanner();
  panner.pan.value = clamp(pan || 0, -1, 1);

  const atk = 0.0008;
  const rel = Math.min(0.012, renderedDur * 0.4);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + atk);
  const peakT = Math.max(when + atk + 0.0002, when + renderedDur - rel);
  env.gain.linearRampToValueAtTime(gain, peakT);
  env.gain.linearRampToValueAtTime(0, when + renderedDur);

  src.connect(env).connect(panner).connect(saturator);
  try { src.start(when, startSec); } catch (e) {}
  try { src.stop(when + renderedDur + 0.05); } catch (e) {}
}

// ──────────────────────────────────────────────────────────────────────────────
// GRAIN voice — granular burst from inside a slice.
// ──────────────────────────────────────────────────────────────────────────────

export function fireGrainBurst(when, slot, sliceIdx, count, pitchSemi, windowSec, gain, pan, durMs, pitchSpread) {
  if (!ctx || !slot || !slot.buffer || !slot.slices) return;
  const buf = slot.buffer;
  const slices = slot.slices;
  const i = Math.max(0, Math.min(slices.length - 1, sliceIdx | 0));
  const startN = slices[i];
  const endN = (i + 1 < slices.length) ? slices[i + 1] : 1;
  const startSec = startN * buf.duration;
  const sliceDurSec = Math.max(0.001, (endN - startN) * buf.duration);

  const grainDur = Math.max(0.005, (durMs || DEFAULTS.grainDurMs) / 1000);
  const n = Math.max(1, count | 0);
  const spacing = windowSec / n;
  const spread = pitchSpread != null ? pitchSpread : DEFAULTS.grainPitchSpread;

  for (let k = 0; k < n; k++) {
    const t = when + spacing * k;
    const detune = (Math.random() * 2 - 1) * spread;
    const rate = Math.pow(2, (pitchSemi + detune) / 12);
    const offset = startSec + Math.random() * Math.max(0, sliceDurSec - grainDur);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const env = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp((pan || 0) + (Math.random() * 2 - 1) * 0.3, -1, 1);

    const atk = grainDur * 0.3;
    const peak = grainDur * 0.5;
    const grainGain = gain * (0.6 + Math.random() * 0.5);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(grainGain, t + atk);
    env.gain.linearRampToValueAtTime(grainGain, t + peak);
    env.gain.linearRampToValueAtTime(0, t + grainDur);

    src.connect(env).connect(panner).connect(saturator);
    try { src.start(t, offset); } catch (e) {}
    try { src.stop(t + grainDur + 0.05); } catch (e) {}
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// FM voice — 2-op simple FM. Carrier sine, modulator sine, modulator gain
// scales with carrier frequency × index. Index decays slightly over the note's
// lifetime for a plucky breakcore character.
// ──────────────────────────────────────────────────────────────────────────────

export function fireFM(when, freq, durSec, gain, pan, ratio, index, atkSec, relSec) {
  if (!ctx) return;
  const car = ctx.createOscillator();
  car.type = 'sine';
  car.frequency.setValueAtTime(freq, when);

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(freq * ratio, when);

  const modGain = ctx.createGain();
  const startMG = freq * index;
  modGain.gain.setValueAtTime(startMG, when);
  modGain.gain.linearRampToValueAtTime(startMG * 0.3, when + Math.min(0.25, durSec));

  mod.connect(modGain).connect(car.frequency);

  const env = ctx.createGain();
  const panner = ctx.createStereoPanner();
  panner.pan.value = clamp(pan || 0, -1, 1);

  const atk = Math.max(0.001, atkSec || 0.005);
  const rel = Math.min(durSec * 0.6, Math.max(0.005, relSec || 0.15));
  const peakT = Math.max(when + atk + 0.001, when + durSec - rel);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + atk);
  env.gain.linearRampToValueAtTime(gain, peakT);
  env.gain.linearRampToValueAtTime(0, when + durSec);

  car.connect(env).connect(panner).connect(saturator);

  try { car.start(when); mod.start(when); } catch (e) {}
  try { car.stop(when + durSec + 0.05); mod.stop(when + durSec + 0.05); } catch (e) {}
}

// ──────────────────────────────────────────────────────────────────────────────
// DRUM voice — 8 hand-crafted synth drums. Per-drum routines below.
// ──────────────────────────────────────────────────────────────────────────────

export function fireDrum(when, type, pitchSemi, durFactor, gain, pan, accent) {
  if (!ctx) return;
  const tune = Math.pow(2, (pitchSemi || 0) / 12);
  const dur = Math.max(0.3, durFactor || 1);
  const g = gain * (accent ? 1.35 : 1.0);
  const out = ctx.createGain();
  const panner = ctx.createStereoPanner();
  panner.pan.value = clamp(pan || 0, -1, 1);
  out.gain.value = 1;
  out.connect(panner).connect(saturator);

  switch (((type | 0) % 8 + 8) % 8) {
    case 0: drumKick(when, g, tune, dur, out); break;
    case 1: drumSnare(when, g, tune, dur, out); break;
    case 2: drumHat(when, g, tune, dur, out, accent); break;
    case 3: drumClap(when, g, tune, dur, out); break;
    case 4: drumTom(when, g, tune, dur, out); break;
    case 5: drumCow(when, g, tune, dur, out); break;
    case 6: drumRim(when, g, tune, dur, out); break;
    case 7: drumCrash(when, g, tune, dur, out); break;
  }
}

function drumKick(when, gain, tune, dur, dest) {
  const o = ctx.createOscillator();
  const e = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150 * tune, when);
  o.frequency.exponentialRampToValueAtTime(45 * tune, when + 0.05);
  o.frequency.exponentialRampToValueAtTime(35 * tune, when + 0.18 * dur);
  e.gain.setValueAtTime(0.0001, when);
  e.gain.exponentialRampToValueAtTime(gain, when + 0.002);
  e.gain.exponentialRampToValueAtTime(0.0001, when + 0.22 * dur);
  o.connect(e).connect(dest);
  o.start(when);
  o.stop(when + 0.25 * dur + 0.02);
  // click
  const c = ctx.createOscillator();
  const ce = ctx.createGain();
  c.type = 'square';
  c.frequency.value = 1200;
  ce.gain.setValueAtTime(gain * 0.3, when);
  ce.gain.exponentialRampToValueAtTime(0.0001, when + 0.006);
  c.connect(ce).connect(dest);
  c.start(when);
  c.stop(when + 0.01);
}

function drumSnare(when, gain, tune, dur, dest) {
  const o = ctx.createOscillator();
  const oe = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(220 * tune, when);
  o.frequency.exponentialRampToValueAtTime(140 * tune, when + 0.07);
  oe.gain.setValueAtTime(gain * 0.55, when);
  oe.gain.exponentialRampToValueAtTime(0.0001, when + 0.12 * dur);
  o.connect(oe).connect(dest);
  o.start(when);
  o.stop(when + 0.15 * dur);

  const ns = whiteNoise(0.18 * dur);
  const ne = ctx.createGain();
  const nf = ctx.createBiquadFilter();
  nf.type = 'highpass';
  nf.frequency.value = 1200;
  ne.gain.setValueAtTime(gain, when);
  ne.gain.exponentialRampToValueAtTime(0.0001, when + 0.18 * dur);
  ns.connect(nf).connect(ne).connect(dest);
  ns.start(when);
}

function drumHat(when, gain, tune, dur, dest, accent) {
  const len = (accent ? 0.18 : 0.05) * dur;
  const ns = whiteNoise(len + 0.02);
  const ne = ctx.createGain();
  const nf = ctx.createBiquadFilter();
  nf.type = 'highpass';
  nf.frequency.value = 6500 * tune;
  ne.gain.setValueAtTime(gain * 0.7, when);
  ne.gain.exponentialRampToValueAtTime(0.0001, when + len);
  ns.connect(nf).connect(ne).connect(dest);
  ns.start(when);
}

function drumClap(when, gain, tune, dur, dest) {
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1500 * tune;
  f.Q.value = 4;
  for (let i = 0; i < 4; i++) {
    const t = when + i * 0.012;
    const n = whiteNoise(0.025);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(gain, t + 0.001);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    n.connect(f);
    f.connect(e).connect(dest);
    n.start(t);
  }
  // body
  const bn = whiteNoise(0.18 * dur);
  const bf = ctx.createBiquadFilter();
  bf.type = 'bandpass';
  bf.frequency.value = 1200 * tune;
  bf.Q.value = 1.5;
  const be = ctx.createGain();
  be.gain.setValueAtTime(gain * 0.4, when + 0.04);
  be.gain.exponentialRampToValueAtTime(0.0001, when + 0.18 * dur);
  bn.connect(bf).connect(be).connect(dest);
  bn.start(when + 0.04);
}

function drumTom(when, gain, tune, dur, dest) {
  const o = ctx.createOscillator();
  const e = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(180 * tune, when);
  o.frequency.exponentialRampToValueAtTime(80 * tune, when + 0.2 * dur);
  e.gain.setValueAtTime(gain, when);
  e.gain.exponentialRampToValueAtTime(0.0001, when + 0.3 * dur);
  o.connect(e).connect(dest);
  o.start(when);
  o.stop(when + 0.34 * dur);
}

function drumCow(when, gain, tune, dur, dest) {
  for (const f of [800 * tune, 540 * tune]) {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = 'square';
    o.frequency.value = f;
    e.gain.setValueAtTime(gain * 0.35, when);
    e.gain.exponentialRampToValueAtTime(0.0001, when + 0.2 * dur);
    o.connect(e).connect(dest);
    o.start(when);
    o.stop(when + 0.22 * dur);
  }
}

function drumRim(when, gain, tune, dur, dest) {
  const o = ctx.createOscillator();
  const e = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = 1500 * tune;
  e.gain.setValueAtTime(gain * 0.7, when);
  e.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
  o.connect(e).connect(dest);
  o.start(when);
  o.stop(when + 0.04);
  const n = whiteNoise(0.025);
  const ne = ctx.createGain();
  ne.gain.setValueAtTime(gain * 0.4, when);
  ne.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
  n.connect(ne).connect(dest);
  n.start(when);
}

function drumCrash(when, gain, tune, dur, dest) {
  const n = whiteNoise(0.7 * dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 3500 * tune;
  const e = ctx.createGain();
  e.gain.setValueAtTime(gain * 0.5, when);
  e.gain.exponentialRampToValueAtTime(0.0001, when + 0.7 * dur);
  n.connect(f).connect(e).connect(dest);
  n.start(when);
}

function whiteNoise(durSec) {
  const len = Math.max(64, Math.floor(ctx.sampleRate * durSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
