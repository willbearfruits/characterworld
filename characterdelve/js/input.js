// characterdelve input — keyboard + full Xbox gamepad mapping (xbosinst-grade).
//
// Mapping:
//   left stick      move
//   right stick X   master kaoss filter cutoff (low ↔ open)
//   right stick Y   master delay time + reverb send  (down = wet)
//   LT              filter resonance (more pulled = narrower / sing)
//   RT              delay feedback (more pulled = self-osc territory)
//   d-pad           digital movement fallback
//   A               pause / unpause   (LB+A reserved for descend later)
//   B               panic
//   X               cycle source buffer (pinkbuf → toneburst → glitchbuf)
//   Y               toggle build readout
//   LB held         shift modifier
//   RB              fire grain volley in heading
//   LS click        recenter camera now (snap)
//   RS click        freeze (kaoss latch)
//   View / Back     show inventory pop
//   Menu / Start    pause
//   Share           snippet (placeholder)
//   Guide / Xbox    panic (full)

import { state, setStatus } from './state.js';
import { audioCtx, panicStop, setMasterFilter, setMasterDelay,
         setSourceBuffer, fireGrain } from './audio.js';
import { MODULES } from './constants.js';

const SOURCE_CYCLE = ['pinkbuf', 'toneburst', 'glitchbuf'];

const input = {
  move: { x: 0, y: 0 },
  aim:  { x: 0, y: 0 },
  fire: false,            // edge: true on the frame RB was just pressed
};

export function getInput() { return input; }

export function attachInput(canvas) {
  // ---- Keyboard ----
  window.addEventListener('keydown', (e) => {
    state.keys.add(e.key.toLowerCase());
    if (e.key === ' ') {
      audioCtx();
      state.paused = !state.paused;
      setStatus(state.paused ? 'paused' : 'playing');
    }
    if (e.key === 'Escape') panicStop();
    if (e.key.toLowerCase() === 'i') setStatus(`build: ${describeBuild()}`, 4);
    if (e.key.toLowerCase() === 'f') input.fire = true;        // F to fire (kbd parity)
    if (e.key.toLowerCase() === 'x') cycleSource();
  });
  window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

  // ---- Gamepad connect/disconnect ----
  window.addEventListener('gamepadconnected', (e) => {
    state.gamepad.connected = true;
    state.gamepad.index = e.gamepad.index;
    setStatus(`gamepad: ${e.gamepad.id.split(' (')[0]}`);
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (state.gamepad.index === e.gamepad.index) {
      state.gamepad.connected = false;
      state.gamepad.index = -1;
      setStatus('gamepad disconnected');
    }
  });

  // First-click: unlock audio
  canvas.addEventListener('pointerdown', () => audioCtx());
}

function describeBuild() {
  const b = state.build;
  const parts = [];
  if (b.schedulers.length) parts.push('S:' + b.schedulers.join(','));
  if (b.fx.length)         parts.push('FX:' + b.fx.join(','));
  if (b.source)            parts.push('src:' + b.source);
  if (b.passives.length)   parts.push('p:' + b.passives.join(','));
  return parts.join(' | ') || 'empty';
}

function cycleSource() {
  const i = SOURCE_CYCLE.indexOf(state.build.source);
  state.build.source = SOURCE_CYCLE[(i + 1) % SOURCE_CYCLE.length];
  setSourceBuffer(state.build.source);
  setStatus(`source: ${state.build.source}`);
}

// Edge-detect helper.
function edge(curr, prevName) {
  const prev = state.gamepad[prevName];
  state.gamepad[prevName] = curr;
  return curr && !prev;
}

export function pollInput(dt) {
  // Reset edge inputs (consumed by player.js this frame).
  input.fire = false;

  // ---- Keyboard movement ----
  let kx = 0, ky = 0;
  if (state.keys.has('a') || state.keys.has('arrowleft'))  kx -= 1;
  if (state.keys.has('d') || state.keys.has('arrowright')) kx += 1;
  if (state.keys.has('w') || state.keys.has('arrowup'))    ky -= 1;
  if (state.keys.has('s') || state.keys.has('arrowdown'))  ky += 1;

  // ---- Gamepad ----
  let gx = 0, gy = 0, rx = 0, ry = 0, lt = 0, rt = 0;
  let dpadDx = 0, dpadDy = 0;

  if (state.gamepad.connected && navigator.getGamepads) {
    const pad = navigator.getGamepads()[state.gamepad.index];
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      gx = dz(pad.axes[0] || 0);
      gy = dz(pad.axes[1] || 0);
      rx = dz(pad.axes[2] || 0);
      ry = dz(pad.axes[3] || 0);
      lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      rt = pad.buttons[7] ? pad.buttons[7].value : 0;

      // d-pad (W3C standard mapping: 12=up, 13=down, 14=left, 15=right)
      if (pad.buttons[12]?.pressed) dpadDy -= 1;
      if (pad.buttons[13]?.pressed) dpadDy += 1;
      if (pad.buttons[14]?.pressed) dpadDx -= 1;
      if (pad.buttons[15]?.pressed) dpadDx += 1;

      // ---- buttons (edge-triggered) ----
      const aDown   = !!pad.buttons[0]?.pressed;
      const bDown   = !!pad.buttons[1]?.pressed;
      const xDown   = !!pad.buttons[2]?.pressed;
      const yDown   = !!pad.buttons[3]?.pressed;
      const lbDown  = !!pad.buttons[4]?.pressed;
      const rbDown  = !!pad.buttons[5]?.pressed;
      const viewDown= !!pad.buttons[8]?.pressed;
      const menuDown= !!pad.buttons[9]?.pressed;
      const lsDown  = !!pad.buttons[10]?.pressed;
      const rsDown  = !!pad.buttons[11]?.pressed;
      const guideDown=!!pad.buttons[16]?.pressed;

      // LB shift state (held)
      state.gamepad.lbHeld = lbDown;

      // chord panic: LB+RB
      const chord = (lbDown && rbDown) && (!state.gamepad.btnLB || !state.gamepad.btnRB);

      if (edge(aDown, 'btnA')) {
        audioCtx();
        state.paused = !state.paused;
        setStatus(state.paused ? 'paused' : 'playing');
      }
      if (edge(bDown, 'btnB')) {
        panicStop();
        setStatus('panic');
      }
      if (edge(xDown, 'btnX')) cycleSource();
      if (edge(yDown, 'btnY')) setStatus(`build: ${describeBuild()}`, 4);

      // RB = fire grain volley in heading. Use right-stick direction if pressed,
      // else use left-stick movement direction, else random.
      if (edge(rbDown, 'btnRB') && !chord) {
        input.fire = true;
      }

      if (edge(lsDown, 'btnLS')) {
        // snap camera
        state.camX = state.player.x;
        state.camY = state.player.y;
        setStatus('center');
      }
      if (edge(rsDown, 'btnRS')) {
        state.kaossLatch = !state.kaossLatch;
        if (state.kaossLatch) { state.rxLatched = rx; state.ryLatched = ry; }
        setStatus(`kaoss latch ${state.kaossLatch ? 'ON' : 'off'}`);
      }
      if (edge(viewDown, 'btnView')) setStatus(`build: ${describeBuild()}`, 5);
      if (edge(menuDown, 'btnMenu')) {
        state.paused = !state.paused;
        setStatus(state.paused ? 'paused' : 'playing');
      }
      if (edge(guideDown, 'btnGuide') || chord) {
        panicStop();
        setStatus('PANIC');
        state.gamepad.btnLB = false; state.gamepad.btnRB = false;
      }
      // track lb/rb separately so chord re-edges work
      state.gamepad.btnLB = lbDown;
      state.gamepad.btnRB = rbDown;
    }
  }

  // ---- Combine movement (gamepad wins if touched) ----
  let mx = 0, my = 0;
  if (Math.abs(gx) > 0.05 || Math.abs(gy) > 0.05) { mx = gx; my = gy; }
  else if (dpadDx || dpadDy)                       { mx = dpadDx; my = dpadDy; }
  else                                              { mx = kx; my = ky; }
  const mag = Math.hypot(mx, my);
  if (mag > 1) { input.move.x = mx / mag; input.move.y = my / mag; }
  else         { input.move.x = mx;       input.move.y = my; }

  // ---- Right stick aim ----
  input.aim.x = rx;
  input.aim.y = ry;

  // ---- Master FX modulated by right stick + triggers (kaoss-pad) ----
  applyKaoss(rx, ry, lt, rt);

  // expose to HUD
  state.kaoss = { rx, ry, lt, rt };
}

function applyKaoss(rx, ry, lt, rt) {
  // honor latch — when latched, freeze rx/ry at moment of toggle
  if (state.kaossLatch) {
    rx = state.rxLatched ?? rx;
    ry = state.ryLatched ?? ry;
  }
  // X = filter cutoff (exponential), LT closes Q (more pulled = narrower)
  const cutoff = expMap(rx, -1, 1, 100, 18000);
  const q = lerp(0.4, 12, lt);
  setMasterFilter(cutoff, q);

  // Y (negative half = up) shapes delay time; RT = feedback;
  // a small steady send so right-stick alone makes an audible delay rise.
  const dtime  = lerp(0.05, 0.6, Math.abs(ry));
  const dfb    = lerp(0.0, 0.85, rt);
  const dsend  = lerp(0.0, 0.9, Math.max(0, ry));   // bottom-half adds wet
  setMasterDelay(dtime, dfb, dsend);
}

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function expMap(v, vMin, vMax, oMin, oMax) {
  const t = (v - vMin) / (vMax - vMin);
  return oMin * Math.pow(oMax / oMin, Math.max(0, Math.min(1, t)));
}
