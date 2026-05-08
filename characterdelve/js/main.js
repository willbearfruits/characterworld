// characterdelve entry — RAF loop wires input + world + player + render.

import { state } from './state.js';
import { setCanvas, resize, draw } from './render.js';
import { ensureChunksAround, findSpawn } from './world.js';
import { attachInput, pollInput, getInput } from './input.js';
import { updatePlayer } from './player.js';

const canvas = document.getElementById('stage');
setCanvas(canvas);
resize(canvas);
window.addEventListener('resize', () => resize(canvas));
attachInput(canvas);

const spawn = findSpawn();
state.player.x = spawn.x;
state.player.y = spawn.y;
state.camX = spawn.x;
state.camY = spawn.y;
// pre-generate the 3x3 chunks around the spawn so the world isn't blank on frame 1
ensureChunksAround(Math.floor(spawn.x), Math.floor(spawn.y), 1);

let lastT = performance.now() / 1000;
function loop(nowMs) {
  const now = nowMs / 1000;
  let dt = now - lastT;
  if (dt > 0.1) dt = 0.1;
  lastT = now;
  state.dt = dt;
  state.time += dt;
  state.frame++;

  pollInput(dt);
  if (!state.paused) {
    updatePlayer(dt, getInput());
  }

  // Camera smooth-follow player
  const k = 1 - Math.pow(0.001, dt);
  state.camX += (state.player.x - state.camX) * k * 4;
  state.camY += (state.player.y - state.camY) * k * 4;

  // Stream chunks around player
  ensureChunksAround(Math.floor(state.player.x), Math.floor(state.player.y), 1);

  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
