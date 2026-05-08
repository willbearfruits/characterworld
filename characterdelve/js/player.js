// characterdelve player — movement, pickup logic, sound triggering.

import { state, setStatus } from './state.js';
import { PLAYER, MODULES, GLYPHS, AUDIO } from './constants.js';
import { isPassable } from './world.js';
import { fireGrain, setReverbWet, setSourceBuffer, setSaturation } from './audio.js';

let stepTimer = 0;
const STEP_INTERVAL = 0.16;        // seconds per ambient grain while moving

export function updatePlayer(dt, input) {
  const p = state.player;
  const speed = PLAYER.baseSpeed + state.build.speedBoost;

  // ---- RB grain volley ----
  if (input.fire) fireVolley(input);

  // input.move = {x, y} in -1..1
  const ax = input.move.x;
  const ay = input.move.y;
  let nx = p.x + ax * speed * dt;
  let ny = p.y + ay * speed * dt;

  // axis-separated tile collision: try x then y so we slide along walls
  if (isPassable(Math.floor(nx + Math.sign(ax) * 0.3), Math.floor(p.y))) {
    p.x = nx;
  }
  if (isPassable(Math.floor(p.x), Math.floor(ny + Math.sign(ay) * 0.3))) {
    p.y = ny;
  }
  if (Math.abs(ax) > 0.05) p.facing = Math.sign(ax);

  // Ambient sound: every step, fire a grain whose pitch depends on Y, position on X.
  const moving = Math.abs(ax) + Math.abs(ay) > 0.1;
  stepTimer += dt;
  const triggerWhen = moving ? STEP_INTERVAL : 0.6;     // slow ticking when idle
  if (stepTimer > triggerWhen) {
    stepTimer = 0;
    triggerStepGrain(moving);
  }

  // Pickup detection
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.bob += dt * 2;
    const dx = pk.x - p.x, dy = pk.y - p.y;
    if (dx * dx + dy * dy < PLAYER.pickupRadius * PLAYER.pickupRadius) {
      collectPickup(pk);
      state.pickups.splice(i, 1);
    }
  }

  // Enemy interaction (touch = damage exchange + grain blast)
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.vx = (Math.random() * 2 - 1) * e.kind.speed;
      e.vy = (Math.random() * 2 - 1) * e.kind.speed;
      e.wanderT = 0.6 + Math.random() * 1.2;
    }
    // chase if close
    const dxp = p.x - e.x, dyp = p.y - e.y;
    const distp = Math.hypot(dxp, dyp);
    if (distp < 6) {
      const k = e.kind.speed * 0.4;
      e.vx = (dxp / (distp || 1)) * (e.kind.speed + k);
      e.vy = (dyp / (distp || 1)) * (e.kind.speed + k);
    }
    let enx = e.x + (e.vx || 0) * dt;
    let eny = e.y + (e.vy || 0) * dt;
    if (isPassable(Math.floor(enx), Math.floor(e.y))) e.x = enx;
    if (isPassable(Math.floor(e.x), Math.floor(eny))) e.y = eny;

    if (distp < PLAYER.encounterRadius && e.cooldown <= 0) {
      // Encounter: emit a sound burst tied to enemy's note offset, take/deal damage.
      grainBurst(e);
      e.cooldown = 0.7;
      e.hp -= 1;
      p.hp -= 1;
      setStatus(`hit ${e.kind.name}  (hp ${p.hp}/${p.maxHp})`, 1.2);
      if (e.hp <= 0) {
        state.enemies.splice(i, 1);
        p.score += 10;
        setStatus(`${e.kind.name} silenced  (+10)`, 1.5);
      }
      if (p.hp <= 0) {
        // simple death: reset hp + drop player back to spawn-ish
        p.hp = p.maxHp;
        p.depth = Math.max(1, p.depth - 1);
        setStatus(`* you fall *  reset to depth ${p.depth}`, 4);
      }
    }
  }

  // recent grain trail decay
  state.recentGrains = state.recentGrains.filter(g => g.until > state.time);
  state.particles = state.particles.filter(pt => pt.until > state.time);
}

function fireVolley(input) {
  const p = state.player;
  // direction: prefer right-stick aim, else movement, else random
  let ax = input.aim.x, ay = input.aim.y;
  if (Math.hypot(ax, ay) < 0.2) { ax = input.move.x; ay = input.move.y; }
  if (Math.hypot(ax, ay) < 0.2) { ax = (Math.random() * 2 - 1); ay = (Math.random() * 2 - 1); }
  const ang = Math.atan2(ay, ax);
  const count = 8 + (state.build.rangeBoost || 0);
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      fireGrain({
        posNorm: Math.random(),
        pitchSemi: 12 + (state.build.pitchOffset || 0) + (Math.random() - 0.5) * 6,
        durMs: 50 + Math.random() * 140,
        gain: 0.5,
        pan: Math.cos(ang) * 0.85,
      });
    }, i * 22);
  }
  // visual particles flying outward in aim direction
  for (let i = 0; i < 12; i++) {
    const spread = (Math.random() - 0.5) * 0.7;
    const r = 1.4 + Math.random() * 1.6;
    state.particles.push({
      x: p.x + Math.cos(ang) * 0.4,
      y: p.y + Math.sin(ang) * 0.4,
      vx: Math.cos(ang + spread) * r,
      vy: Math.sin(ang + spread) * r,
      glyph: '*+×·-—'[Math.floor(Math.random() * 6)],
      color: '#ffd066',
      until: state.time + 0.45,
    });
  }
  // flag the recent volley for HUD
  state.lastVolleyAt = state.time;
}

function triggerStepGrain(moving) {
  const p = state.player;
  // map y (mod 16) to scale degree, x to playhead
  const posNorm = Math.abs(Math.sin(p.x * 0.1)) * 0.5 + 0.25;
  const yScale = [-12, -7, -5, 0, 3, 5, 7, 10, 12];
  const noteIdx = ((Math.floor(p.y) % yScale.length) + yScale.length) % yScale.length;
  const semi = yScale[noteIdx] + (state.build.pitchOffset || 0) + AUDIO.basePitchSemi;
  const dur = moving ? 0.13 : 0.32;
  const gain = moving ? 0.32 : 0.18;
  const pan = Math.max(-1, Math.min(1, p.x * 0.05 - state.camX * 0.04));
  fireGrain({ posNorm, pitchSemi: semi, durMs: dur * 1000, gain, pan });

  // visual: leave a recent-grain glyph at player position
  const g = moving ? '·' : '∘';
  state.recentGrains.push({
    glyph: g, color: '#74e0c8',
    x: p.x, y: p.y,
    until: state.time + 0.6,
    bornAt: state.time,
  });
}

function grainBurst(enemy) {
  const range = 6 + (state.build.rangeBoost || 0);
  for (let i = 0; i < range; i++) {
    setTimeout(() => {
      fireGrain({
        posNorm: Math.random(),
        pitchSemi: enemy.kind.noteOffset + (state.build.pitchOffset || 0) + (Math.random() - 0.5) * 4,
        durMs: 60 + Math.random() * 200,
        gain: 0.45,
        pan: (Math.random() * 2 - 1) * 0.7,
      });
    }, i * 30);
  }
  // visual particles
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.5;
    state.particles.push({
      x: enemy.x + Math.cos(angle) * 0.2,
      y: enemy.y + Math.sin(angle) * 0.2,
      vx: Math.cos(angle) * r,
      vy: Math.sin(angle) * r,
      glyph: '*+×·'[Math.floor(Math.random() * 4)],
      color: enemy.kind.color,
      until: state.time + 0.6,
    });
  }
}

function collectPickup(pk) {
  const m = MODULES[pk.module];
  if (!m) return;

  // Stack effects
  if (m.type === 'scheduler') {
    if (!state.build.schedulers.includes(pk.module)) state.build.schedulers.push(pk.module);
  } else if (m.type === 'fx') {
    state.build.fx.push(pk.module);
    applyFx(pk.module);
  } else if (m.type === 'source') {
    state.build.source = pk.module;
    setSourceBuffer(pk.module);
  } else if (m.type === 'passive') {
    state.build.passives.push(pk.module);
    applyPassive(pk.module);
  }

  // pickup celebratory grain burst
  for (let i = 0; i < 5; i++) {
    setTimeout(() => fireGrain({
      pitchSemi: 7 + i * 3 + state.build.pitchOffset,
      durMs: 90, gain: 0.35,
      pan: (Math.random() * 2 - 1) * 0.4,
    }), i * 40);
  }

  setStatus(`+ ${pk.module}  (${m.desc})`, 2.5);
  state.player.score += 5;
}

function applyFx(name) {
  const fxCount = state.build.fx.filter(x => x === name).length;
  if (name === 'reverb') setReverbWet(Math.min(0.9, fxCount * 0.35));
  if (name === 'saturator') setSaturation(2.0 + fxCount * 1.5);
  // delay/lowpass — TODO wire master nodes
}

function applyPassive(name) {
  if (name === 'speed')   state.build.speedBoost += 1.2;
  if (name === 'range')   state.build.rangeBoost += 4;
  if (name === 'pitchUp') state.build.pitchOffset += 12;
  if (name === 'pitchDn') state.build.pitchOffset -= 12;
  if (name === 'density') state.build.densityBoost += 0.15;
}
