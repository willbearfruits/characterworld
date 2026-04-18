# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Law (read first)

Shared policy: see `../AGENTS.md` and `../skills/character-only-art/SKILL.md`. Every visible form — menu, field, knob, waveform, grain, status line — must be typed glyphs drawn via `fillText`. The only bitmap assets allowed are social-card OG images (not generated yet).

## Commands

No build step. ES modules load natively.

- Run locally: `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000/charactergrain/`.
- Syntax-check all modules: `for f in charactergrain/js/*.js; do node --check "$f"; done`.
- Deploy: merging to `main` auto-publishes to `https://willbearfruits.github.io/characterworld/charactergrain/` via GitHub Pages.

## Architecture

`charactergrain` is a character-only generative granular synth. Multi-file ES modules — same pattern as `characterfilm`, not the single-HTML pattern of `charactershop`.

### File layout

```
charactergrain/
├─ index.html            shell + canvas + hidden file input + io overlay
├─ css/app.css           fullscreen canvas, io overlay styling
├─ js/
│  ├─ main.js            entry: resize, RAF loop, wires input + scheduler + UI
│  ├─ constants.js       THEMES, ALGOS, GRAIN_GLYPHS, DEFAULTS, CLAMPS
│  ├─ state.js           single mutable `state` object + setStatus()
│  ├─ audio.js           AudioContext, buffer load, master chain, fireGrain(), panicStop()
│  ├─ grains.js          scheduler algorithms: tickMycelium (shipped), tickSort (todo), tickStormcell (todo), tickScheduler dispatcher
│  ├─ input.js           keyboard + Gamepad API polling
│  └─ ui.js              drawn UI: menu bar, grain field, knob panel, waveform strip, status
```

Only `ui.js` and `main.js` touch the canvas context. `audio.js` owns the Web Audio graph. `grains.js` mutates `state.myc` / `state.heat` and calls `fireGrain()` — it never touches the canvas.

### Core data model

- **Grid**: `state.cols × state.rows`. X maps to source-buffer position (0..1 of buffer duration, plus `spread` jitter). Y maps to pitch offset — top is `+DEFAULTS.pitchRangeSemi` semitones, bottom is `-DEFAULTS.pitchRangeSemi`, around the master `pitch` knob.
- **Mycelium**: `state.myc = { nutrient: Float32Array(n), tips: [...] }`. `tips[i] = { cx, cy, energy, accum }`. Tips consume local nutrient to fire grains, branch into neighbors, die when starved. Nutrient regrows globally at `DEFAULTS.regrow` per second.
- **Heat**: `state.heat: Float32Array(n)` — per-cell exponential decay; each grain fire adds to the cell's heat and the UI renders the trail (`●` hot → `○` warm → `∘` cool → ambient nutrient glyphs).
- **Buffer**: `state.buffer` is an `AudioBuffer`. `state.bufferPeaks` is a `Float32Array` of absolute-value peaks precomputed at load time for the waveform strip.

### Audio graph

```
fireGrain() → BufferSource + GainNode (envelope)
             ↓
         WaveShaper (tanh, 4x oversample)
             ↓
         DynamicsCompressor (hard-limiter settings: thr -3, ratio 20, attack 2ms)
             ↓
         master Gain → destination
```

Each grain is a one-shot `AudioBufferSourceNode` + envelope `GainNode`. Envelope: linear ramp 0 → `gain` over `atk`, hold, ramp to 0 over `rel`. Nodes GC after `stop(now + dur + 50ms)`.

The saturator + limiter pair is the safety net that lets density+spread go wild without clipping the output device — crucial for the "harsh noise" end of the dynamic range.

### Algorithms

- **MYCELIUM** (shipped). Tips fire grains at their cell; per-tip rate is `2 + density * 22` Hz scaled by local nutrient. Branching probability `DEFAULTS.branchP * (0.3 + density)` per tick. Death probability `DEFAULTS.dieP` per tick, plus energy decay when nutrient is low. Respawns 3 seeds when the population hits zero.
- **SORT** (todo). Planned: load the buffer as an array of grain positions ordered by amplitude/brightness; each tick advance one compare-swap of a sort (bubble/radix/merge selectable) and play the array in its current order. The audible resolution of the sort is the point.
- **STORMCELL** (todo). Planned: Life-like cellular automaton on the grid; live cells fire grains, dead cells are silent. Rules selector (B3/S23 for classic Life, BriansBrain, HighLife, etc.) should expose everything from sparse melodies to wall-of-noise.

Adding a new algorithm:

1. Append to `ALGOS` in `constants.js`.
2. Implement `tick<Name>(dt)` in `grains.js` that mutates `state.myc`/`state.heat` and calls `fireGrain(posNorm, pitchSemi, durMs, gain)`.
3. Register in `tickScheduler(dt)` dispatch.
4. Add a key binding in `input.js` (`4`, `5`, etc.) and a panel row in `ui.js` if needed.

### Input

Wired in `input.js`:

- Keyboard (see README for the map). Direct `window.keydown` handlers; no framework.
- Gamepad via the Gamepad API. `pollGamepad(dt)` runs each RAF. Sticks are continuous modulators; face buttons are edge-triggered.

### UI

Drawn, not DOM. `drawUI()` rebuilds every frame. Layout cells live in `ui.js::LAYOUT`: top menu row, right knob panel (22 cells wide), bottom waveform strip (4 rows), bottom status row (1 row). The grain field fills the remainder; `resizeUI` recomputes `state.cols`/`state.rows` so the scheduler grid tracks the window.

The DOM is used ONLY for:
- The fullscreen `<canvas>`.
- A hidden `<input type="file">` for loading audio.
- The `#io` overlay (not used in v1; kept for future help/about dialogs).

Do NOT add DOM buttons for regular controls.

### Resize behavior

When the window resizes, `main.js::resize()` recomputes `state.cols`/`state.rows` and, if they changed, reinitializes the mycelium (`nutrient`, `tips`, `heat` are all reallocated). That's the cheapest correct thing — the mycelium is a running process, not a user-authored artifact.

## Deployment

- Repo: `willbearfruits/characterworld` (public)
- Pages: `main` branch, root, auto-deploys on push
- This project lives at `characterworld/charactergrain/` and deploys to `.../characterworld/charactergrain/`
- Social preview: `og.png` (1200×630) referenced by OG meta tags in `index.html` (not generated yet — render a hero screenshot then resize to 1200×630)
