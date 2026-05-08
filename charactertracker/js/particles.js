// particles.js — purely visual feedback. Each fire event spawns a few
// particles that drift up + outward + fade. No audio, no scheduling.
// State is held on `state.particles` so ui.js can render in lockstep with
// everything else.

import { state, pushParticle } from './state.js';
import { PARTICLE_GLYPHS, THEME_VOID } from './constants.js';

// Fire event → particle burst. Coords are in *glyph cells* (cx, cy) so they
// scale automatically with viewport changes.
export function spawnBurst(cx, cy, voice, intensity, accent) {
  const palettes = {
    SAMPLE: PARTICLE_GLYPHS.hot,
    GRAIN:  PARTICLE_GLYPHS.spark,
    FM:     PARTICLE_GLYPHS.fm,
    DRUM:   PARTICLE_GLYPHS.drum,
  };
  const colors = { SAMPLE: 'ACC', GRAIN: 'SUN', FM: 'PNK', DRUM: 'WARN' };
  const pal = palettes[voice] || PARTICLE_GLYPHS.cool;
  const cKey = colors[voice] || 'INK';
  const col = THEME_VOID[cKey] || '#fff';

  const n = Math.min(12, 1 + intensity + (accent ? 4 : 0));
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;  // mostly upward
    const speed = 6 + Math.random() * 14;            // glyph-cells per second
    pushParticle({
      x: cx + (Math.random() - 0.5) * 0.4,
      y: cy + (Math.random() - 0.5) * 0.2,
      vx: Math.cos(angle) * speed * 0.4,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.6,
      age: 0,
      glyph: pal[(Math.random() * pal.length) | 0],
      color: col,
      voice,
    });
  }
}

// Ambient drift particles spawned occasionally during playback to keep the
// field alive even when nothing is firing in a track.
export function spawnAmbient(cx, cy) {
  if (state.particles.length > 240) return;
  pushParticle({
    x: cx + (Math.random() - 0.5) * 0.5,
    y: cy,
    vx: (Math.random() - 0.5) * 0.4,
    vy: -2 - Math.random() * 1.5,
    life: 1.0 + Math.random() * 0.8,
    age: 0,
    glyph: PARTICLE_GLYPHS.cool[(Math.random() * PARTICLE_GLYPHS.cool.length) | 0],
    color: THEME_VOID.AMBIENT,
    voice: 'AMBIENT',
  });
}

export function tickParticles(dt) {
  const arr = state.particles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.6, dt);
    p.vy *= Math.pow(0.7, dt);
    p.age += dt;
    if (p.age >= p.life) arr.splice(i, 1);
  }
}

export function clearParticles() {
  state.particles.length = 0;
}
