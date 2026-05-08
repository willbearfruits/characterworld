// characterdelve render — character-only canvas drawing.

import { state } from './state.js';
import { PALETTE, GLYPHS, MODULES, CHUNK } from './constants.js';
import { getTile } from './world.js';

let ctx = null;

export function setCanvas(canvas) {
  ctx = canvas.getContext('2d');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
}

export function resize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width  = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.w = window.innerWidth;
  state.h = window.innerHeight;
  state.cols = Math.ceil(state.w / state.tilePx) + 2;
  state.rows = Math.ceil(state.h / state.tilePx) + 2;
}

// World -> screen.
function worldToScreen(wx, wy) {
  const sx = (wx - state.camX) * state.tilePx + state.w / 2;
  const sy = (wy - state.camY) * state.tilePx + state.h / 2;
  return [sx, sy];
}

export function draw() {
  // clear void
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, state.w, state.h);

  // tiles
  ctx.font = `${state.fontPx}px DejaVu Sans Mono, Menlo, monospace`;
  const visTilesX = Math.ceil(state.w / state.tilePx) + 2;
  const visTilesY = Math.ceil(state.h / state.tilePx) + 2;
  const tileX0 = Math.floor(state.camX - visTilesX / 2);
  const tileY0 = Math.floor(state.camY - visTilesY / 2);
  for (let dy = 0; dy < visTilesY; dy++) {
    for (let dx = 0; dx < visTilesX; dx++) {
      const tx = tileX0 + dx;
      const ty = tileY0 + dy;
      const t = getTile(tx, ty);
      if (!t) continue;
      const [sx, sy] = worldToScreen(tx + 0.5, ty + 0.5);
      ctx.fillStyle = t.color;
      ctx.fillText(t.glyph, sx, sy);
    }
  }

  // recent grain trail (faded glyphs at past positions)
  for (const g of state.recentGrains) {
    const t = (state.time - g.bornAt) / 0.6;
    const alpha = Math.max(0, 1 - t);
    const [sx, sy] = worldToScreen(g.x, g.y);
    ctx.fillStyle = withAlpha(g.color, alpha * 0.7);
    ctx.fillText(g.glyph, sx, sy);
  }

  // pickups (bobbing)
  for (const pk of state.pickups) {
    const m = MODULES[pk.module];
    if (!m) continue;
    const bob = Math.sin(pk.bob) * 0.18;
    const [sx, sy] = worldToScreen(pk.x, pk.y + bob);
    ctx.fillStyle = m.color;
    ctx.fillText(m.glyph, sx, sy);
    // tier marker dot above
    ctx.fillStyle = withAlpha(m.color, 0.4);
    ctx.fillText('·', sx, sy - state.tilePx * 0.7);
  }

  // enemies
  for (const e of state.enemies) {
    const [sx, sy] = worldToScreen(e.x, e.y);
    ctx.fillStyle = e.kind.color;
    ctx.fillText(e.kind.glyph, sx, sy);
    // hp pips below
    ctx.fillStyle = withAlpha(e.kind.color, 0.6);
    ctx.font = `${state.fontPx * 0.55}px DejaVu Sans Mono, Menlo, monospace`;
    ctx.fillText('•'.repeat(e.hp), sx, sy + state.tilePx * 0.75);
    ctx.font = `${state.fontPx}px DejaVu Sans Mono, Menlo, monospace`;
  }

  // particles
  for (const p of state.particles) {
    const remain = p.until - state.time;
    p.x += (p.vx || 0) * (1 / 60);
    p.y += (p.vy || 0) * (1 / 60);
    const [sx, sy] = worldToScreen(p.x, p.y);
    ctx.fillStyle = withAlpha(p.color, Math.max(0, remain));
    ctx.fillText(p.glyph, sx, sy);
  }

  // player — big, pulsing, crosshair so you never lose it
  const p = state.player;
  const [psx, psy] = worldToScreen(p.x, p.y);
  const pulse = 0.7 + 0.3 * Math.sin(state.time * 6);
  // dim crosshair cardinals in the four neighbor cells
  ctx.fillStyle = withAlpha(PALETTE.player, 0.22);
  const r = state.tilePx;
  ctx.fillText('·', psx - r, psy);
  ctx.fillText('·', psx + r, psy);
  ctx.fillText('·', psx, psy - r);
  ctx.fillText('·', psx, psy + r);
  // outer ring — dim @ at half-alpha to widen the silhouette
  ctx.fillStyle = withAlpha(PALETTE.player, 0.35 * pulse);
  ctx.font = `${Math.floor(state.fontPx * 1.6)}px DejaVu Sans Mono, Menlo, monospace`;
  ctx.fillText(GLYPHS.player, psx, psy);
  // bright core
  ctx.fillStyle = PALETTE.player;
  ctx.font = `bold ${state.fontPx}px DejaVu Sans Mono, Menlo, monospace`;
  ctx.fillText(GLYPHS.player, psx, psy);
  ctx.font = `${state.fontPx}px DejaVu Sans Mono, Menlo, monospace`;

  // off-screen pickup markers — arrows at screen edge pointing toward them
  drawOffscreenMarkers();

  // UI overlay
  drawHud();
}

function drawHud() {
  const p = state.player;
  ctx.font = `13px DejaVu Sans Mono, Menlo, monospace`;
  ctx.textAlign = 'left';

  // top-left: title + depth + coords
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('characterdelve', 14, 22);
  ctx.fillStyle = PALETTE.hud;
  ctx.fillText(`depth ${p.depth}   score ${p.score}   xy ${p.x.toFixed(1)},${p.y.toFixed(1)}`, 14, 40);

  // top-right: HP pips
  ctx.textAlign = 'right';
  const hpStr = '♥'.repeat(Math.max(0, p.hp)) + '·'.repeat(Math.max(0, p.maxHp - p.hp));
  ctx.fillStyle = PALETTE.alert;
  ctx.fillText(hpStr, state.w - 14, 22);
  ctx.fillStyle = PALETTE.hud;
  ctx.fillText(`hp ${p.hp}/${p.maxHp}`, state.w - 14, 40);

  // bottom strip: build summary
  ctx.textAlign = 'left';
  const b = state.build;
  const buildBits = [];
  if (b.schedulers.length) buildBits.push('S[' + b.schedulers.map(n => MODULES[n].glyph).join('') + ']');
  if (b.fx.length)         buildBits.push('FX[' + b.fx.map(n => MODULES[n].glyph).join('') + ']');
  if (b.source)            buildBits.push('SRC[' + (MODULES[b.source]?.glyph || '?') + ']');
  if (b.passives.length)   buildBits.push('P[' + b.passives.map(n => MODULES[n].glyph).join('') + ']');
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(buildBits.join('  ') || 'no modules — touch glyphs in rooms to install', 14, state.h - 28);

  // status line
  if (state.status && state.time < state.statusUntil) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(state.status, state.w / 2, state.h - 12);
  }

  // controls hint top-center (faint)
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText('WASD/stick · Space pause · Esc panic · I show build', state.w / 2, 22);

  // gamepad indicator + kaoss readout
  if (state.gamepad.connected) {
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.cool;
    let pad = '◉ pad';
    if (state.kaossLatch) pad += ' ▣latch';
    ctx.fillText(pad, state.w - 14, state.h - 12);
    if (state.kaoss) {
      const k = state.kaoss;
      const f = `cut ${expGuess(k.rx).toFixed(0)}Hz  q ${(0.4 + k.lt * 11.6).toFixed(1)}  fb ${(k.rt * 100).toFixed(0)}%`;
      ctx.fillStyle = PALETTE.dim;
      ctx.fillText(f, state.w - 14, state.h - 28);
    }
  }

  // mini-map / room blip in top-right corner (4 cells × 4 cells of glyphs)
  drawMiniMap();
}

function expGuess(rx) {
  // matches input.js applyKaoss() exp map: 100..18000Hz over rx -1..+1
  const t = (rx + 1) / 2;
  return 100 * Math.pow(180, Math.max(0, Math.min(1, t)));
}

function drawMiniMap() {
  const W = 110, H = 110;
  const x0 = state.w - W - 14;
  const y0 = 60;
  ctx.fillStyle = 'rgba(20,24,34,0.6)';
  ctx.fillRect(x0, y0, W, H);
  ctx.font = `11px DejaVu Sans Mono, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText('· · ·', x0 + W / 2, y0 + 10);
  // cell scale: each minimap pixel = 1 tile, centered on player
  const scale = 1.2;
  const cx = x0 + W / 2, cy = y0 + H / 2;
  // pickups
  for (const pk of state.pickups) {
    const dx = (pk.x - state.player.x) * scale;
    const dy = (pk.y - state.player.y) * scale;
    if (Math.abs(dx) > W / 2 - 6 || Math.abs(dy) > H / 2 - 6) continue;
    ctx.fillStyle = '#74e0c8';
    ctx.fillText('·', cx + dx, cy + dy);
  }
  for (const e of state.enemies) {
    const dx = (e.x - state.player.x) * scale;
    const dy = (e.y - state.player.y) * scale;
    if (Math.abs(dx) > W / 2 - 6 || Math.abs(dy) > H / 2 - 6) continue;
    ctx.fillStyle = e.kind.color;
    ctx.fillText('·', cx + dx, cy + dy);
  }
  // player
  ctx.fillStyle = PALETTE.player;
  ctx.fillText('@', cx, cy);
  ctx.font = `${state.fontPx}px DejaVu Sans Mono, Menlo, monospace`;
}

function drawOffscreenMarkers() {
  // For each pickup or enemy outside the viewport, draw an edge-of-screen arrow glyph
  const margin = 32;
  const cx = state.w / 2, cy = state.h / 2;
  const targets = [
    ...state.pickups.map(p => ({ x: p.x, y: p.y, glyph: '◆', color: '#74e0c8', kind: 'pickup' })),
    ...state.enemies.map(e => ({ x: e.x, y: e.y, glyph: '!', color: e.kind.color,    kind: 'enemy' })),
  ];
  for (const t of targets) {
    const [sx, sy] = worldToScreen(t.x, t.y);
    if (sx >= 0 && sx <= state.w && sy >= 0 && sy <= state.h) continue;
    // direction vector
    const dx = sx - cx, dy = sy - cy;
    const ang = Math.atan2(dy, dx);
    // clamp to viewport rect
    const halfW = state.w / 2 - margin, halfH = state.h / 2 - margin;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    let ex, ey;
    const tx = cosA !== 0 ? halfW / Math.abs(cosA) : Infinity;
    const ty = sinA !== 0 ? halfH / Math.abs(sinA) : Infinity;
    const tEdge = Math.min(tx, ty);
    ex = cx + cosA * tEdge;
    ey = cy + sinA * tEdge;
    ctx.fillStyle = withAlpha(t.color, 0.7);
    ctx.font = `13px DejaVu Sans Mono, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(t.glyph, ex, ey);
  }
  ctx.font = `${state.fontPx}px DejaVu Sans Mono, Menlo, monospace`;
}

function withAlpha(hex, a) {
  // accept #rrggbb
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
