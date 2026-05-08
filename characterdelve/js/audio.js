// characterdelve audio — fireGrain + master safety chain.
// Adapted from charactergrain's audio.js, simplified.

import { state } from './state.js';
import { AUDIO } from './constants.js';

export function audioCtx() {
  if (!state.audio.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    state.audio.ctx = ctx;

    const sat = ctx.createWaveShaper();
    sat.curve = makeTanhCurve(2.0);
    sat.oversample = '4x';

    // Master kaoss filter — driven by right stick X.
    const masterFilter = ctx.createBiquadFilter();
    masterFilter.type = 'lowpass';
    masterFilter.frequency.value = 18000;
    masterFilter.Q.value = 0.7;

    // Feedback delay — driven by right stick Y + RT (feedback).
    const delayNode = ctx.createDelay(1.5);
    delayNode.delayTime.value = 0.25;
    const delayFb = ctx.createGain();
    delayFb.gain.value = 0.0;
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0.0;        // pre-delay send
    const delayReturn = ctx.createGain();
    delayReturn.gain.value = 0.6;
    delaySend.connect(delayNode);
    delayNode.connect(delayFb).connect(delayNode);     // feedback loop
    delayNode.connect(delayReturn);

    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.06;

    const master = ctx.createGain();
    master.gain.value = 0.7;

    const conv = ctx.createConvolver();
    conv.buffer = makeIR(ctx, AUDIO.reverbSecs, 2.0);

    const wet = ctx.createGain();
    wet.gain.value = 0.0;        // wet starts dry; reverb pickup raises this
    wet.connect(conv).connect(sat);

    // Chain: sat → masterFilter → limiter → master → out
    // Send taps: sat → delaySend (parallel), delayReturn → masterFilter
    sat.connect(masterFilter);
    sat.connect(delaySend);
    delayReturn.connect(masterFilter);
    masterFilter.connect(lim).connect(master).connect(ctx.destination);

    state.audio.masterFilter = masterFilter;
    state.audio.delaySend = delaySend;
    state.audio.delayFb = delayFb;
    state.audio.delayNode = delayNode;

    state.audio.saturator = sat;
    state.audio.limiter   = lim;
    state.audio.master    = master;
    state.audio.convolver = conv;
    state.audio.wetBus    = wet;

    state.audio.sourceBuffer = makeNoiseBuffer(ctx, 2.0, 'pink');
  }
  if (state.audio.ctx.state === 'suspended') state.audio.ctx.resume();
  return state.audio.ctx;
}

export function fireGrain(opts = {}) {
  const ctx = state.audio.ctx;
  if (!ctx || !state.audio.sourceBuffer) return;
  const {
    posNorm   = Math.random(),
    pitchSemi = 0,
    durMs     = AUDIO.baseGrainDur * 1000,
    gain      = AUDIO.baseGrainGain,
    pan       = 0,
  } = opts;

  const dur = durMs / 1000;
  const buf = state.audio.sourceBuffer;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = Math.pow(2, pitchSemi / 12);

  const env = ctx.createGain();
  const now = ctx.currentTime;
  const atk = Math.min(0.012, dur * 0.15);
  const rel = Math.min(0.06,  dur * 0.5);
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + atk);
  env.gain.linearRampToValueAtTime(gain, now + dur - rel);
  env.gain.linearRampToValueAtTime(0, now + dur);

  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));

  const startTime = posNorm * Math.max(0, buf.duration - dur);
  src.start(now, startTime, dur + 0.05);

  src.connect(env).connect(panner);
  // dry to saturator, send to wet bus
  panner.connect(state.audio.saturator);
  panner.connect(state.audio.wetBus);

  src.stop(now + dur + 0.05);
  setTimeout(() => { try { src.disconnect(); env.disconnect(); panner.disconnect(); } catch (_) {} }, (dur + 0.1) * 1000);
}

export function panicStop() {
  // Slam master gain to zero briefly.
  const m = state.audio.master;
  if (!m) return;
  const ctx = state.audio.ctx;
  m.gain.cancelScheduledValues(ctx.currentTime);
  m.gain.setValueAtTime(m.gain.value, ctx.currentTime);
  m.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
  m.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.6);
}

export function setReverbWet(amount01) {
  const w = state.audio.wetBus; if (!w) return;
  w.gain.setTargetAtTime(amount01, state.audio.ctx.currentTime, 0.05);
}

export function setSaturation(curveIntensity) {
  const s = state.audio.saturator; if (!s) return;
  s.curve = makeTanhCurve(curveIntensity);
}

export function setMasterGain(g) {
  const m = state.audio.master; if (!m) return;
  m.gain.setTargetAtTime(g, state.audio.ctx.currentTime, 0.04);
}

// Kaoss-pad master filter — call from input.js with right stick X / LT.
export function setMasterFilter(cutoffHz, q) {
  const f = state.audio.masterFilter; if (!f) return;
  const ctx = state.audio.ctx;
  f.frequency.setTargetAtTime(Math.max(80, Math.min(20000, cutoffHz)), ctx.currentTime, 0.03);
  if (q !== undefined) f.Q.setTargetAtTime(Math.max(0.1, Math.min(18, q)), ctx.currentTime, 0.03);
}

// Master delay — right stick Y for time, RT for feedback.
export function setMasterDelay(timeSecs, feedback01, sendAmount01) {
  const ctx = state.audio.ctx;
  if (state.audio.delayNode) state.audio.delayNode.delayTime.setTargetAtTime(
    Math.max(0.001, Math.min(1.4, timeSecs)), ctx.currentTime, 0.04);
  if (state.audio.delayFb)   state.audio.delayFb.gain.setTargetAtTime(
    Math.max(0, Math.min(0.92, feedback01)), ctx.currentTime, 0.04);
  if (sendAmount01 !== undefined && state.audio.delaySend) {
    state.audio.delaySend.gain.setTargetAtTime(
      Math.max(0, Math.min(1.0, sendAmount01)), ctx.currentTime, 0.04);
  }
}

// ---- helpers ----
function makeTanhCurve(k) {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x);
  }
  return c;
}

function makeIR(ctx, secs, decay) {
  const len = Math.floor(ctx.sampleRate * secs);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return ir;
}

function makeNoiseBuffer(ctx, secs, kind) {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    if (kind === 'pink') {
      // simple pink-ish noise (Voss-McCartney would be better; this is fine).
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
        data[i] = out * 0.11;
      }
    } else {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
  }
  return buf;
}

export function setSourceBuffer(kind) {
  const ctx = state.audio.ctx; if (!ctx) return;
  if (kind === 'pinkbuf')   state.audio.sourceBuffer = makeNoiseBuffer(ctx, 2.0, 'pink');
  if (kind === 'toneburst') state.audio.sourceBuffer = makeToneBuffer(ctx, 2.0);
  if (kind === 'glitchbuf') state.audio.sourceBuffer = makeGlitchBuffer(ctx, 2.0);
}

function makeToneBuffer(ctx, secs) {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      // detuned chord stack
      d[i] = 0.18 * (
        Math.sin(2*Math.PI*220*t) +
        Math.sin(2*Math.PI*330*t) * 0.5 +
        Math.sin(2*Math.PI*441*t) * 0.3
      );
    }
  }
  return buf;
}

function makeGlitchBuffer(ctx, secs) {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const seg = Math.floor(t * 24) % 6;
      if (seg < 3) d[i] = (Math.random() * 2 - 1) * 0.3;
      else d[i] = Math.sin(2*Math.PI*(110 + seg*40)*t) * 0.25;
    }
  }
  return buf;
}
