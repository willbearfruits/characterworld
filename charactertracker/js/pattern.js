// pattern.js — pure data ops on tracks/cells. No audio, no canvas.

import { DEFAULTS, EMPTY_CELL, CLAMPS, VOICES } from './constants.js';

export function makeCell() { return { ...EMPTY_CELL }; }

const VOICE_PARAMS_DEFAULT = {
  SAMPLE: {},                                      // params live on the slot/cell
  GRAIN:  { density: 6, grainMs: 45, spread: 6 },  // default cloud
  FM:     { ratio: 1.5, index: 4, atk: 0.005, rel: 0.18 },
  DRUM:   {},
};

// Spread voices across initial tracks so a fresh project sounds varied:
// 0..3 → SAMPLE, 4..7 → DRUM, 8..11 → GRAIN, 12..15 → FM.
function defaultVoiceFor(idx) {
  const tier = Math.floor(idx / 4);
  return ['SAMPLE', 'DRUM', 'GRAIN', 'FM'][tier % 4];
}

export function makeTrack(idx) {
  const voice = defaultVoiceFor(idx);
  const length = DEFAULTS.pattern.length;
  return {
    name: 'T' + (idx + 1).toString().padStart(2, '0'),
    voice,
    slot: idx % DEFAULTS.bankSlots,
    length,
    div: 16,
    gain: 0.85,
    pan: 0,
    mute: false,
    solo: false,
    params: { ...VOICE_PARAMS_DEFAULT[voice] },
    cells: Array.from({ length }, makeCell),
  };
}

export function setTrackVoice(track, voice) {
  if (!VOICES.includes(voice)) return;
  if (track.voice === voice) return;
  track.voice = voice;
  track.params = { ...VOICE_PARAMS_DEFAULT[voice] };
}

export function makePattern(numTracks, name) {
  return {
    name: name || ('P' + (Math.random() * 1000 | 0).toString().padStart(3, '0')),
    tracks: Array.from({ length: numTracks }, (_, i) => makeTrack(i)),
    bars: 4,                          // song-mode duration in bars (4 = ~5.5 s @ 174 BPM)
  };
}

// Top-level song container. Linear pattern-matrix model: an ordered list of
// pattern indices. Scheduler advances songStep when each pattern's bars have
// elapsed (see scheduler.js::maybeAdvanceSong).
export function makeSong() {
  const p0 = makePattern(DEFAULTS.numTracks, 'P01');
  return {
    patterns: [p0],
    sequence: [0],
    editIndex: 0,
    songStep: 0,
    songMode: false,                  // when true, scheduler runs the sequence
    follow: true,                     // when true, edit-index follows song-step
    lastAdvanceAt: 0,                 // audio-time of last songStep advance
  };
}

export function clonePattern(pat, newName) {
  return {
    name: newName || (pat.name + '\''),
    bars: pat.bars,
    tracks: pat.tracks.map((t) => ({
      ...t,
      params: { ...t.params },
      cells: t.cells.map((c) => ({ ...c })),
    })),
  };
}

export function resizeTrack(track, newLength) {
  if (newLength === track.cells.length) {
    track.length = newLength;
    return;
  }
  if (newLength > track.cells.length) {
    while (track.cells.length < newLength) track.cells.push(makeCell());
  } else {
    track.cells.length = newLength;
  }
  track.length = newLength;
}

export function clearPattern(pattern) {
  for (const t of pattern.tracks) {
    for (let i = 0; i < t.cells.length; i++) t.cells[i] = makeCell();
  }
}

export function setCellField(cell, field, value) {
  switch (field) {
    case 'active': cell.active = !!value; return;
    case 'slice':  cell.slice  = clamp(value | 0, ...CLAMPS.slice); return;
    case 'pitch':  cell.pitch  = clamp(value | 0, ...CLAMPS.pitch); return;
    case 'gate':   cell.gate   = clamp(value | 0, ...CLAMPS.gate); return;
    case 'retrig': cell.retrig = Math.max(1, Math.min(16, value | 0)); return;
    case 'prob':   cell.prob   = clamp(value | 0, ...CLAMPS.prob); return;
    case 'micro':  cell.micro  = clamp(value | 0, ...CLAMPS.micro); return;
    case 'grain':  cell.grain  = !!value; return;
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Song-level mutators
export function songAddPattern(song, atIndex) {
  const dup = song.patterns[song.editIndex] || song.patterns[0];
  const np = clonePattern(dup, 'P' + (song.patterns.length + 1).toString().padStart(2, '0'));
  song.patterns.push(np);
  const newIdx = song.patterns.length - 1;
  if (atIndex == null) {
    song.sequence.push(newIdx);
  } else {
    song.sequence.splice(atIndex, 0, newIdx);
  }
  song.editIndex = newIdx;
}
export function songInsertSequence(song, patternIdx, atSlot) {
  const slot = atSlot == null ? song.sequence.length : Math.max(0, Math.min(song.sequence.length, atSlot));
  song.sequence.splice(slot, 0, patternIdx);
}
export function songRemoveSequenceSlot(song, slot) {
  if (song.sequence.length <= 1) return;
  song.sequence.splice(slot, 1);
  song.songStep = Math.min(song.songStep, song.sequence.length - 1);
}
export function songMoveSequenceSlot(song, from, to) {
  if (from === to || from < 0 || from >= song.sequence.length) return;
  const [v] = song.sequence.splice(from, 1);
  const t = Math.max(0, Math.min(song.sequence.length, to));
  song.sequence.splice(t, 0, v);
}

// Voice-aware randomization. Each voice gets a flavor.
export function randomizePattern(pattern, slicesPerTrack) {
  for (let ti = 0; ti < pattern.tracks.length; ti++) {
    const t = pattern.tracks[ti];
    const slices = (slicesPerTrack && slicesPerTrack[ti]) || 16;
    switch (t.voice) {
      case 'DRUM':   randomizeDrum(t, ti); break;
      case 'FM':     randomizeFM(t, ti); break;
      case 'GRAIN':  randomizeGrain(t, slices, ti); break;
      default:       randomizeBreak(t, slices, ti); break;
    }
  }
}

function randomizeDrum(t, ti) {
  for (let i = 0; i < t.cells.length; i++) {
    const c = t.cells[i];
    Object.assign(c, EMPTY_CELL);
    // Track 0 is kicks-on-1, track 4 is snares-on-3, track 8 is hats etc.
    // But we don't know the actual track index of "kick row" — use ti % 4 to bias.
    const role = ti % 4;
    if (role === 0) {                                // kick row
      if (i % 4 === 0)      { c.active = Math.random() < 0.92; c.slice = 0; }
      else if (i % 16 === 7) { c.active = Math.random() < 0.45; c.slice = 0; c.pitch = -2; }
    } else if (role === 1) {                         // snare row
      if (i % 4 === 2)      { c.active = Math.random() < 0.82; c.slice = 1; }
      if (i % 32 === 30)    { c.active = true; c.slice = 1; c.retrig = 4; c.grain = true; }
    } else if (role === 2) {                         // hat row
      if (i % 2 === 1)      { c.active = Math.random() < 0.55; c.slice = 2; }
      if (i % 8 === 0)      { c.active = Math.random() < 0.35; c.slice = 2; c.pitch = 4; }
    } else {                                         // perc/clap/tom row
      const drum = (i & 1) ? 3 : 4;
      if (i % 8 === 4)      { c.active = Math.random() < 0.5; c.slice = drum; }
      if (Math.random() < 0.07) { c.active = true; c.slice = (Math.random() * 8) | 0; c.retrig = [2,3,4][Math.random()*3|0]; }
    }
    if (c.active) {
      c.prob = Math.random() < 0.85 ? 100 : 80;
      c.micro = Math.random() < 0.18 ? [-12, 12][Math.random()*2|0] : 0;
      c.gate = 80;
    }
  }
}

function randomizeFM(t, ti) {
  const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
  for (let i = 0; i < t.cells.length; i++) {
    const c = t.cells[i];
    Object.assign(c, EMPTY_CELL);
    const onProb = (ti % 4 === 3) ? 0.18 : 0.32;     // FM rows tend sparse
    c.active = Math.random() < onProb;
    if (!c.active) continue;
    c.slice = scale[(Math.random() * scale.length) | 0];
    c.pitch = Math.random() < 0.4 ? -12 : (Math.random() < 0.2 ? 12 : 0);
    c.retrig = Math.random() < 0.18 ? [2, 3, 4, 6][(Math.random() * 4) | 0] : 1;
    c.prob = Math.random() < 0.7 ? 100 : [90, 75, 50][(Math.random() * 3) | 0];
    c.micro = Math.random() < 0.15 ? [-25, -12, 12, 25][(Math.random() * 4) | 0] : 0;
    c.grain = Math.random() < 0.12;
    c.gate = Math.random() < 0.5 ? 60 : 100;
  }
}

function randomizeGrain(t, slices, ti) {
  for (let i = 0; i < t.cells.length; i++) {
    const c = t.cells[i];
    Object.assign(c, EMPTY_CELL);
    c.active = Math.random() < 0.18;
    if (!c.active) continue;
    c.slice = (Math.random() * slices) | 0;
    c.pitch = (Math.random() < 0.5) ? ((Math.random() * 24 - 12) | 0) : 0;
    c.retrig = Math.random() < 0.4 ? [2, 3, 4, 6, 8][(Math.random() * 5) | 0] : 1;
    c.prob = Math.random() < 0.7 ? 100 : 75;
    c.gate = 120;                                     // long clouds
    c.grain = Math.random() < 0.5;
    c.micro = Math.random() < 0.25 ? [-25, 25][Math.random()*2|0] : 0;
  }
}

function randomizeBreak(t, slices, ti) {
  for (let i = 0; i < t.cells.length; i++) {
    const c = t.cells[i];
    Object.assign(c, EMPTY_CELL);
    const onProb = ti === 0 ? 0.55 : 0.22 + (ti % 4) * 0.06;
    c.active = Math.random() < onProb;
    if (!c.active) continue;
    c.slice = (Math.random() * slices) | 0;
    c.pitch = (Math.random() < 0.35) ? ((Math.random() * 14 - 7) | 0) : 0;
    c.retrig = Math.random() < 0.22 ? [2, 3, 4, 6, 8][(Math.random() * 5) | 0] : 1;
    c.prob = Math.random() < 0.7 ? 100 : [90, 75, 50][(Math.random() * 3) | 0];
    c.micro = Math.random() < 0.18 ? [-25, -12, 12, 25][(Math.random() * 4) | 0] : 0;
    c.grain = Math.random() < 0.08;
    c.gate = 80;
  }
}
