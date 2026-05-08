// characterdelve world — chunked procgen tile field.

import { state } from './state.js';
import { CHUNK, GLYPHS, MODULES, ENEMY_KINDS } from './constants.js';

// Deterministic small PRNG so chunk regen is stable.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function chunkSeed(cx, cy, depth) {
  return ((cx * 73856093) ^ (cy * 19349663) ^ (depth * 83492791)) >>> 0;
}

function chunkKey(cx, cy) { return `${cx},${cy}`; }

function pickFromString(s, rand) {
  return s[Math.floor(rand() * s.length)];
}

function sampleModule(rand) {
  // weighted by 1/rarity
  const entries = Object.entries(MODULES);
  const weighted = entries.flatMap(([name, m]) => Array(7 - (m.rarity || 1)).fill(name));
  return weighted[Math.floor(rand() * weighted.length)];
}

// Generate a chunk: tiles[CHUNK.cols * CHUNK.rows] of glyphs, plus pickups + enemies.
export function generateChunk(cx, cy) {
  const seed = chunkSeed(cx, cy, state.player.depth);
  const rand = mulberry32(seed);
  const tiles  = new Array(CHUNK.cols * CHUNK.rows);
  const colors = new Array(CHUNK.cols * CHUNK.rows);
  const passable = new Uint8Array(CHUNK.cols * CHUNK.rows);
  const pickups = [];
  const enemies = [];

  // Carve: start with mostly walls, then drunkard-walk a few rooms / corridors.
  for (let i = 0; i < tiles.length; i++) {
    tiles[i] = pickFromString(GLYPHS.wall, rand);
    colors[i] = '#3a4256';
    passable[i] = 0;
  }

  // 2-4 rooms
  const roomCount = 2 + Math.floor(rand() * 3);
  const rooms = [];
  for (let r = 0; r < roomCount; r++) {
    const rw = 5 + Math.floor(rand() * 8);
    const rh = 4 + Math.floor(rand() * 6);
    const rx = 2 + Math.floor(rand() * (CHUNK.cols - rw - 4));
    const ry = 2 + Math.floor(rand() * (CHUNK.rows - rh - 4));
    rooms.push({ rx, ry, rw, rh });
    for (let yy = ry; yy < ry + rh; yy++) {
      for (let xx = rx; xx < rx + rw; xx++) {
        const idx = yy * CHUNK.cols + xx;
        tiles[idx] = pickFromString(GLYPHS.floor, rand);
        colors[idx] = '#1a1e28';
        passable[idx] = 1;
      }
    }
  }

  // Local carve helper — used for in-chunk corridors AND edge exits.
  const carve = (x, y) => {
    if (x < 0 || x >= CHUNK.cols || y < 0 || y >= CHUNK.rows) return;
    const idx = y * CHUNK.cols + x;
    tiles[idx] = pickFromString(GLYPHS.floor, rand);
    colors[idx] = '#1a1e28';
    passable[idx] = 1;
  };

  // Connect rooms with L-corridors.
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i], b = rooms[i + 1];
    const ax = Math.floor(a.rx + a.rw / 2), ay = Math.floor(a.ry + a.rh / 2);
    const bx = Math.floor(b.rx + b.rw / 2), by = Math.floor(b.ry + b.rh / 2);
    const horizFirst = rand() < 0.5;
    if (horizFirst) {
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, ay);
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(bx, y);
    } else {
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(ax, y);
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, by);
    }
  }

  // Carve 4 deterministic edge exits at fixed positions so neighboring chunks
  // always have matching openings — that's how rooms link across chunks.
  const exits = [
    { x: Math.floor(CHUNK.cols / 2), y: 0 },                         // top
    { x: Math.floor(CHUNK.cols / 2), y: CHUNK.rows - 1 },            // bottom
    { x: 0,                          y: Math.floor(CHUNK.rows / 2) },// left
    { x: CHUNK.cols - 1,             y: Math.floor(CHUNK.rows / 2) },// right
  ];
  for (const ex of exits) {
    // tunnel inward 2 tiles so the opening connects to the chunk interior
    if (ex.y === 0) { for (let yy = 0; yy <= 2; yy++) carve(ex.x, yy); }
    if (ex.y === CHUNK.rows - 1) { for (let yy = CHUNK.rows - 3; yy < CHUNK.rows; yy++) carve(ex.x, yy); }
    if (ex.x === 0) { for (let xx = 0; xx <= 2; xx++) carve(xx, ex.y); }
    if (ex.x === CHUNK.cols - 1) { for (let xx = CHUNK.cols - 3; xx < CHUNK.cols; xx++) carve(xx, ex.y); }
    // and L-corridor each exit to the nearest room center
    if (rooms.length) {
      let best = rooms[0], bestD = 1e9;
      for (const rm of rooms) {
        const cx2 = rm.rx + rm.rw / 2, cy2 = rm.ry + rm.rh / 2;
        const d = (cx2 - ex.x) ** 2 + (cy2 - ex.y) ** 2;
        if (d < bestD) { bestD = d; best = rm; }
      }
      const tx = Math.floor(best.rx + best.rw / 2);
      const ty = Math.floor(best.ry + best.rh / 2);
      if (rand() < 0.5) {
        for (let x = Math.min(ex.x, tx); x <= Math.max(ex.x, tx); x++) carve(x, ex.y);
        for (let y = Math.min(ex.y, ty); y <= Math.max(ex.y, ty); y++) carve(tx, y);
      } else {
        for (let y = Math.min(ex.y, ty); y <= Math.max(ex.y, ty); y++) carve(ex.x, y);
        for (let x = Math.min(ex.x, tx); x <= Math.max(ex.x, tx); x++) carve(x, ty);
      }
    }
  }

  // Sprinkle decay + rubble glyphs in floor tiles.
  for (let i = 0; i < tiles.length; i++) {
    if (passable[i] && rand() < 0.04) {
      tiles[i] = pickFromString(GLYPHS.rubble, rand);
      colors[i] = '#272d3a';
    }
  }

  // Spawn pickups in rooms (skip the chunk that contains origin).
  const pickupChance = (cx === 0 && cy === 0) ? 0 : 0.85;
  for (const rm of rooms) {
    if (rand() < pickupChance) {
      const px = rm.rx + 1 + Math.floor(rand() * (rm.rw - 2));
      const py = rm.ry + 1 + Math.floor(rand() * (rm.rh - 2));
      const moduleName = sampleModule(rand);
      pickups.push({
        x: cx * CHUNK.cols + px + 0.5,
        y: cy * CHUNK.rows + py + 0.5,
        module: moduleName,
        bob: rand() * Math.PI * 2,
      });
    }
  }

  // Spawn enemies — fewer near origin.
  const enemyCount = (cx === 0 && cy === 0) ? 0 : 1 + Math.floor(rand() * (1 + state.player.depth));
  for (let e = 0; e < enemyCount; e++) {
    const rm = rooms[Math.floor(rand() * rooms.length)];
    if (!rm) continue;
    const ex = rm.rx + 1 + Math.floor(rand() * (rm.rw - 2));
    const ey = rm.ry + 1 + Math.floor(rand() * (rm.rh - 2));
    const kind = ENEMY_KINDS[Math.floor(rand() * ENEMY_KINDS.length)];
    enemies.push({
      x: cx * CHUNK.cols + ex + 0.5,
      y: cy * CHUNK.rows + ey + 0.5,
      kind,
      hp: kind.hp,
      cooldown: 0,
      wanderT: rand() * 4,
    });
  }

  return { cx, cy, tiles, colors, passable, pickups, enemies, rooms };
}

export function ensureChunksAround(tx, ty, radius = 1) {
  const cx0 = Math.floor(tx / CHUNK.cols);
  const cy0 = Math.floor(ty / CHUNK.rows);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const k = chunkKey(cx0 + dx, cy0 + dy);
      if (!state.chunks.has(k)) {
        const ch = generateChunk(cx0 + dx, cy0 + dy);
        state.chunks.set(k, ch);
        for (const p of ch.pickups) state.pickups.push(p);
        for (const e of ch.enemies) state.enemies.push(e);
      }
    }
  }
}

export function getTile(tx, ty) {
  const cx = Math.floor(tx / CHUNK.cols);
  const cy = Math.floor(ty / CHUNK.rows);
  const ch = state.chunks.get(chunkKey(cx, cy));
  if (!ch) return null;
  const lx = ((tx % CHUNK.cols) + CHUNK.cols) % CHUNK.cols;
  const ly = ((ty % CHUNK.rows) + CHUNK.rows) % CHUNK.rows;
  const idx = ly * CHUNK.cols + lx;
  return { glyph: ch.tiles[idx], color: ch.colors[idx], passable: !!ch.passable[idx] };
}

export function isPassable(tx, ty) {
  const t = getTile(tx, ty);
  return t ? t.passable : false;
}

// Find a passable tile in the origin chunk to spawn the player.
export function findSpawn() {
  ensureChunksAround(0, 0, 0);
  const ch = state.chunks.get(chunkKey(0, 0));
  if (!ch) return { x: 0, y: 0 };
  // try center first
  const cx = Math.floor(CHUNK.cols / 2);
  const cy = Math.floor(CHUNK.rows / 2);
  if (ch.passable[cy * CHUNK.cols + cx]) return { x: cx + 0.5, y: cy + 0.5 };
  // fallback: scan
  for (let y = 0; y < CHUNK.rows; y++) {
    for (let x = 0; x < CHUNK.cols; x++) {
      if (ch.passable[y * CHUNK.cols + x]) return { x: x + 0.5, y: y + 0.5 };
    }
  }
  return { x: 1.5, y: 1.5 };
}
