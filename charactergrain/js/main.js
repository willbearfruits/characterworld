import { state, setStatus } from './state.js';
import { initUI, resizeUI, drawUI } from './ui.js';
import { resetForAlgo, tickScheduler, advanceScan, randomizeCanvas } from './grains.js';
import { initInput, pollGamepad } from './input.js';
import { audioNow, loadSampleURL } from './audio.js';

const cv = document.getElementById('cv');
initUI(cv);

let prevCols = 0, prevRows = 0;
let lastT = 0;
let wasPlaying = false;
let playAnchor = 0;

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  resizeUI(cv, window.innerWidth, window.innerHeight, dpr);
  if (state.cols !== prevCols || state.rows !== prevRows) {
    resetForAlgo();
    prevCols = state.cols;
    prevRows = state.rows;
  }
  // Mobile: on first detection, collapse verbose panel sections so the essentials fit.
  if (state.compact && !state.compactApplied) {
    state.panelOpen = {
      sound: true, scan: true, play: true,
      growth: false, fx: false, canvas: true, stormcell: false,
      algo: false, source: false, sample: false, prefs: false,
    };
    // Boot straight into CANVAS with a painted field + sequencer running.
    // First tap unlocks audio (pointerdown → audioCtx resume) and you hear it.
    state.algo = 1;
    resetForAlgo();
    randomizeCanvas();
    state.canvasSeq.on = true;
    state.canvasSeq.pos = 0;
    state.playing = true;
    setStatus('tap anywhere to unlock sound · drag to paint');
    state.compactApplied = true;
  }
}

function tick(now) {
  const dt = Math.min(0.1, ((now - (lastT || now)) / 1000) || 0.016);
  lastT = now;
  pollGamepad(dt);
  // Track elapsed play time.
  if (state.playing && !wasPlaying) playAnchor = audioNow() - state.playElapsed;
  if (state.playing) state.playElapsed = Math.max(0, audioNow() - playAnchor);
  wasPlaying = state.playing;

  if (state.playing) { advanceScan(dt); tickScheduler(dt); }
  drawUI();
  requestAnimationFrame(tick);
}

window.addEventListener('resize', resize);
resize();
initInput();
requestAnimationFrame(tick);

// Try to auto-load the bundled demo sample. Falls back silently to the
// synthesized pink-noise default if the fetch or decode fails.
loadSampleURL('armadilo.wav').then(ok => {
  if (ok) setStatus('loaded: armadilo.wav · press SPACE to play');
});
