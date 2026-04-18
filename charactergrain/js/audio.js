import { state, pushRecent } from './state.js';
import { FLAT_BANK } from './constants.js';

let ctx = null;
let master = null;
let saturator = null;
let limiter = null;
let wetBus = null;
let convolver = null;
let recDest = null;
let recTap = null;     // GainNode that feeds recDest; swap its input to change source
let taps = {};         // { dry, limiter, master }
let recAnalyser = null;
const _recBuf = new Float32Array(1024);

export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    saturator = ctx.createWaveShaper();
    saturator.curve = makeTanhCurve(1 + state.knobs.sat * 6);
    saturator.oversample = '4x';

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.06;

    master = ctx.createGain();
    master.gain.value = state.knobs.gain;

    convolver = ctx.createConvolver();
    convolver.buffer = makeIR(1.7, 2.0);
    wetBus = ctx.createGain();
    wetBus.gain.value = 1;
    wetBus.connect(convolver).connect(saturator);

    saturator.connect(limiter).connect(master).connect(ctx.destination);

    // Recorder: three tap points, feed a shared recTap gain → recDest. The
    // active tap is the one connected to recTap; switching rebuilds that edge
    // so the rendered file always matches the chosen source. Default 'master'
    // so the recording matches what the user hears through the output device.
    recTap = ctx.createGain();
    recTap.gain.value = 1;
    recDest = ctx.createMediaStreamDestination();
    recTap.connect(recDest);
    recAnalyser = ctx.createAnalyser();
    recAnalyser.fftSize = 1024;
    recAnalyser.smoothingTimeConstant = 0.3;
    recTap.connect(recAnalyser);
    taps = { dry: saturator, limiter: limiter, master: master };
    applyRecordSource();

    if (!state.buffer) generateDefaultBuffer();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function audioNow() { return ctx ? ctx.currentTime : 0; }

export function applyRecordSource() {
  if (!recTap || !taps || !taps[state.prefs.recordSource]) return;
  // Disconnect any previous source from recTap.
  for (const k in taps) {
    try { taps[k].disconnect(recTap); } catch (e) {}
  }
  const src = taps[state.prefs.recordSource];
  src.connect(recTap);
}

export function setRecordSource(which) {
  if (!['master', 'limiter', 'dry'].includes(which)) return;
  state.prefs.recordSource = which;
  applyRecordSource();
}

export function getRecordLevel() {
  if (!recAnalyser) return { rms: 0, peak: 0 };
  recAnalyser.getFloatTimeDomainData(_recBuf);
  let peak = 0, sum = 0;
  for (let i = 0; i < _recBuf.length; i++) {
    const v = Math.abs(_recBuf[i]);
    if (v > peak) peak = v;
    sum += v * v;
  }
  return { rms: Math.sqrt(sum / _recBuf.length), peak };
}

export function getAudioInfo() {
  if (!ctx) return null;
  return {
    sampleRate: ctx.sampleRate,
    baseLatency: ctx.baseLatency ?? 0,
    outputLatency: ctx.outputLatency ?? 0,
    state: ctx.state,
    destinationChannels: ctx.destination.channelCount,
  };
}

export async function refreshOutputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  try {
    // Browsers withhold output-device labels until the page has held a mic
    // permission at least once. Briefly acquire a mic track and stop it so the
    // second enumerate() call returns named sinks.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (_) { /* no mic / user denied — we'll still list unlabeled sinks */ }
    const list = await navigator.mediaDevices.enumerateDevices();
    const outs = list
      .filter(d => d.kind === 'audiooutput')
      .map(d => ({ id: d.deviceId, label: d.label || ('(unnamed ' + d.deviceId.slice(0, 6) + ')') }));
    state.prefs.outputDevices = outs;
    return outs;
  } catch (e) {
    return [];
  }
}

export async function setOutputDevice(deviceId, label) {
  if (!ctx) audioCtx();
  // Modern Chrome/Edge: AudioContext.setSinkId.
  if (typeof ctx.setSinkId === 'function') {
    try {
      await ctx.setSinkId(deviceId || '');
      state.prefs.outputDeviceId = deviceId || '';
      state.prefs.outputDeviceLabel = label || (deviceId ? deviceId.slice(0, 8) : 'default');
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function makeTanhCurve(drive) {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive);
  }
  return c;
}

function makeIR(duration, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * duration);
  const ir = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}

export function setMasterGain(g) {
  if (!master) return;
  master.gain.setTargetAtTime(g, ctx.currentTime, 0.01);
}

export function setSatDrive(v) {
  if (!saturator) return;
  saturator.curve = makeTanhCurve(1 + v * 6);
}

export async function listInputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  try {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
    } catch (_) {}
    const list = await navigator.mediaDevices.enumerateDevices();
    const ins = list
      .filter(d => d.kind === 'audioinput')
      .map(d => ({ id: d.deviceId, label: d.label || ('(unnamed ' + d.deviceId.slice(0, 6) + ')') }));
    state.prefs.inputDevices = ins;
    return ins;
  } catch (e) {
    return [];
  }
}

export async function sampleFromInput(deviceId, seconds) {
  if (state.prefs.sampling) return false;
  audioCtx();
  const sec = Math.max(0.25, Math.min(30, seconds || 3));
  const constraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    },
  };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    throw new Error('mic denied or device unavailable: ' + (e && e.message || e));
  }
  const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  let mime = '';
  for (const m of mimes) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  state.prefs.sampling = true;
  mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  return new Promise((resolve, reject) => {
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      try {
        const blob = new Blob(chunks, { type: mime || 'audio/webm' });
        const buf = await blob.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf);
        state.buffer = audio;
        const tag = state.prefs.inputDeviceLabel || 'mic';
        state.bufferName = 'sample: ' + tag + ' (' + sec.toFixed(1) + 's)';
        state.bufferPeaks = computePeaks(audio, 512);
        state.prefs.sampling = false;
        resolve(true);
      } catch (e) {
        state.prefs.sampling = false;
        reject(e);
      }
    };
    mr.onerror = (e) => { state.prefs.sampling = false; reject(e); };
    mr.start();
    setTimeout(() => { try { mr.stop(); } catch (_) {} }, Math.round(sec * 1000));
  });
}

export async function loadSampleURL(url) {
  audioCtx();
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const ab = await resp.arrayBuffer();
    const audio = await ctx.decodeAudioData(ab.slice(0));
    state.buffer = audio;
    state.bufferName = url.split('/').pop() || url;
    state.bufferPeaks = computePeaks(audio, 512);
    return true;
  } catch (e) {
    return false;
  }
}

export async function loadAudioFile(file) {
  audioCtx();
  state.loading = true;
  try {
    const buf = await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    state.buffer = audio;
    state.bufferName = file.name;
    state.bufferPeaks = computePeaks(audio, 512);
  } finally {
    state.loading = false;
  }
}

export function generateDefaultBuffer() {
  audioCtx();
  const dur = 2.5;
  const channels = 2;
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(channels, Math.floor(rate * dur), rate);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      y = y * 0.97 + w * 0.03;
      d[i] = y * 0.85;
    }
  }
  state.buffer = buf;
  state.bufferName = 'default (pink noise)';
  state.bufferPeaks = computePeaks(buf, 512);
}

function computePeaks(buf, nbuckets) {
  const ch0 = buf.getChannelData(0);
  const peaks = new Float32Array(nbuckets);
  const step = Math.max(1, Math.floor(ch0.length / nbuckets));
  for (let i = 0; i < nbuckets; i++) {
    let max = 0;
    const s = i * step;
    const e = Math.min(ch0.length, s + step);
    for (let j = s; j < e; j++) {
      const v = Math.abs(ch0[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

export function fireGrain(posNorm, pitchSemi, durMs, gain, pan, cents, sharpness, wetAmt, bankIdx) {
  if (!state.buffer || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = state.buffer;
  const totalSemi = pitchSemi + (cents || 0) / 100;
  src.playbackRate.value = Math.pow(2, totalSemi / 12);
  const env = ctx.createGain();
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan || 0));
  const now = ctx.currentTime;
  const dur = Math.max(0.005, durMs / 1000);
  const sharp = sharpness == null ? 0.5 : sharpness;
  const atk = Math.max(0.0003, (1 - sharp) * Math.min(dur * 0.35, 0.02) + 0.0003);
  const rel = Math.min(dur * 0.45, 0.03);
  const peak = Math.max(now + atk + 0.0002, now + dur - rel);
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + atk);
  env.gain.linearRampToValueAtTime(gain, peak);
  env.gain.linearRampToValueAtTime(0, now + dur);
  src.connect(env).connect(panner).connect(saturator);

  if (wetAmt && wetAmt > 0.002 && wetBus) {
    const send = ctx.createGain();
    send.gain.value = wetAmt * gain * 0.9;
    panner.connect(send).connect(wetBus);
  }

  const offset = Math.max(0, Math.min(state.buffer.duration - 0.001, posNorm * state.buffer.duration));
  try { src.start(now, offset); } catch (e) {}
  try { src.stop(now + dur + 0.1); } catch (e) {}

  // Broadcast info for the UI strip.
  if (bankIdx != null) {
    const entry = FLAT_BANK[bankIdx];
    pushRecent({
      t: now,
      ch: entry ? entry.ch : '·',
      tier: entry ? entry.tier : 'ambientLo',
      pitch: Math.round(totalSemi * 10) / 10,
      pan: Math.round(panner.pan.value * 100) / 100,
      dur: Math.round(dur * 1000),
      gain: Math.round(gain * 100) / 100,
      pos: Math.round(posNorm * 100) / 100,
      wet: wetAmt ? Math.round(wetAmt * 100) / 100 : 0,
    });
  }
}

export function panicStop() {
  if (!ctx) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0.0001, now + 0.05);
  master.gain.linearRampToValueAtTime(state.knobs.gain, now + 0.7);
}

// ──────────────────────────────────────────────────────────────────────────────
// Recording: MediaRecorder on the limiter output. Exports webm/ogg by default;
// offline WAV render of recorded chunks isn't trivial, so we ship the native
// container and let users transcode if they want uncompressed.
// ──────────────────────────────────────────────────────────────────────────────

export function startRecording() {
  audioCtx();
  if (!recDest) return false;
  if (state.rec.active) return false;
  const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  let mime = '';
  for (const m of mimes) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
  }
  if (!mime) return false;
  const mr = new MediaRecorder(recDest.stream, { mimeType: mime });
  state.rec.chunks = [];
  state.rec.mime = mime;
  mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) state.rec.chunks.push(e.data); };
  mr.onstop = () => {
    const blob = new Blob(state.rec.chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
    const fname = 'charactergrain-' + Date.now() + '.' + ext;
    a.href = url;
    a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    state.rec.active = false;
    state.rec.mediaRec = null;
    state.rec.lastFile = fname;
  };
  mr.start(100);
  state.rec.active = true;
  state.rec.mediaRec = mr;
  state.rec.startTime = ctx.currentTime;
  return true;
}

export function stopRecording() {
  if (!state.rec.active || !state.rec.mediaRec) return false;
  state.rec.mediaRec.stop();
  return true;
}
