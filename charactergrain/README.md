# charactergrain

**Status: beta.** MYCELIUM, CANVAS, STORMCELL shipped. SORT stubbed for v4. Full mouse-clickable UI. Keyboard + Xbox-style gamepad. Record the master bus to a downloadable audio file.

**Character-only generative granular synth.** Grains are glyphs on a field — every cell picks its own ASCII/Unicode/Zalgo character, and that character shapes the grain it fires (micro-pitch, pan, attack sharpness). Four schedulers decide when and where grains land. Source defaults to pink noise; load any audio file to use as the grain buffer. A tanh saturator → convolution reverb → hard limiter chain lets density sweep from drones to wall-of-noise safely.

Part of [`characterworld`](../). Every visible glyph is drawn via `fillText`. No images, no SVG, no path geometry.

**Live:** [willbearfruits.github.io/characterworld/charactergrain](https://willbearfruits.github.io/characterworld/charactergrain/)

---

## Scan / stretch mode

The **SCAN / STRETCH** panel section is a PaulStretch-style listening mode. Toggle `SCAN: on` and the grain-position source changes from random / x-derived to a slow-moving playhead, so every grain fires from (roughly) the same spot in the buffer and the sample stays recognizable. The `stretch` knob sets the slowdown factor from 1× (realtime) up to ~200× (pure drone). A triangle marker on the waveform shows the playhead; click anywhere on the waveform (or the mini-bar in the panel) to scrub.

## Default sample

On first load, the bundled `armadilo.wav` is fetched and decoded as the grain buffer. Press `L` or `FILE → Load audio file…` to swap in your own, or use the **SAMPLER** section to capture fresh audio from a mic / line in.

## Algorithms

- **MYCELIUM** — tips consume nutrient to fire, deposit pheromone, branch into neighbors weighted by `nutrient + pheromone × bias`, die when starved. Click to seed a tip, shift-click to clear, right-drag to paint nutrient.
- **CANVAS** — *paint grains and reveal them by hovering.* Left-drag stamps glyphs from the selected tier onto the grid; shift-drag erases. Hit `Space` and move the mouse over painted cells to fire them like a music box you wander through. At high density the canvas also breathes on its own (ambient re-fires).
- **STORMCELL** — Life-like cellular automaton. Live cells fire grains each step; cluster count picks the glyph tier. `T` cycles through 8 rules (Conway, HighLife, Maze, Mazectric, Seeds, LongLife, Anneal, Replicatr). `Y` reseeds at the caDens probability. Click cells to toggle.
- **SORT** *(v4)* — sort the buffer by amplitude/brightness and play the array as it sorts.

## Glyph bank

36 glyphs across 6 tiers: `ambientLo`, `ambientHi`, `cool`, `warm`, `hot`, `tip`. Each carries `{ cents, pan, sharp }` — micro-pitch, pan offset, attack sharpness. The `glyphFx` knob scales how much the glyph overrides the global knobs (0 = pure knob control, 1 = per-cell chaos). High-heat cells layer a Zalgo combining mark.

## UI

- **Menu bar** (`FILE / ALGO / FX / HELP`) — click to open a dropdown. Load audio, reset to pink noise, record master, save/clear snippets, switch algorithms, cycle rules, jump to FX presets.
- **Right panel** — collapsible sections (SOUND, GROWTH, FX, algo-specific, SOURCE, SNIPPETS, TRANSPORT). Every knob has clickable `[-]` and `[+]`. Section headers toggle open/closed. Algo selector, CA rule cycle, paint tier picker, paint glyph picker, zalgo toggle.
- **Info strip** (above status) — last-fired grain details (tier color, glyph, pitch, pan, duration, position, gain), a scrolling trail of recent grain glyphs, the tier colour legend, and live stats (tips, live cells, painted cells, grains fired).
- **Waveform strip** — peak-sampled waveform of the source buffer with duration readout.
- **Status bar** — transient messages, mouse field position, and playback time (`mm:ss.msec`).

## Keyboard

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `Esc` | Close menu / panic |
| `L` | Load audio file |
| `R` | Reseed current algorithm |
| `Shift+R` | Clear canvas (in CANVAS mode) |
| `1` `2` `3` `4` | MYCELIUM / CANVAS / STORMCELL / SORT |
| `[` `]` | Density − / + |
| `,` `.` | Grain size − / + (ms) |
| `;` `'` | Spread − / + |
| `↑` `↓` | Pitch + / − (semitones) |
| `-` `=` | Master gain − / + |
| `9` `0` | Pheromone decay − / + (mycelium) |
| `7` `8` | Bias − / + (pheromone vs nutrient) |
| `v` `b` | Glyph FX intensity − / + |
| `n` `m` | Saturation − / + |
| `h` `j` | Reverb wet − / + |
| `u` `i` | CA density − / + (stormcell) |
| `T` | Cycle CA rule |
| `Y` | Reseed stormcell |
| `X` | Cycle paint tier |
| `Z` | Toggle paint zalgo |
| `F5` | Save snippet |
| `F8` | Toggle recorder overlay |
| `F9` / `F10` | Start / stop master record |
| mouse wheel | Grain size − / + |
| left-click | Seed tip / paint glyph / toggle CA cell |
| left-drag | Paint (CANVAS) |
| shift + left-click | Clear tips (mycelium) / erase (CANVAS) |
| right-drag | Paint nutrient (mycelium) |

## Gamepad

| Input | Effect |
|---|---|
| Left stick X / Y | Spread / Pitch |
| Right stick X / Y | Density / Size |
| A / B | Play-pause / Panic |
| X / Y | Reseed / Cycle CA rule |
| LB / RB | Previous / next algorithm |
| LT / RT | Glyph FX − / + |

---

## Recording & snippets

Press **F8** (or click `◉ recorder…` in the sidebar / `FILE → Recorder…`) to open the floating recorder overlay. It shows the active source, output device, chosen MIME type, a live peak+RMS meter in dB, and record / stop controls. `F9` and `F10` still work as shortcuts from anywhere. On stop, the take downloads as `.webm`/`.ogg`/`.m4a` (whichever your browser supports). You can transcode to WAV with `ffmpeg -i charactergrain-*.webm output.wav`.

### Sampler (mic / line in)

The **SAMPLER** panel section captures audio from any input device into the grain buffer. Click `↻ refresh inputs` (grant mic permission on the first run so device labels populate), pick a device (USB mic, audio interface, loopback, PipeWire monitor, etc.), choose a length with `[-]`/`[+]`, and hit `● sample Ns → buffer`. The captured audio replaces the current source — you can immediately play, paint, or record from it. Echo cancel / noise suppression / AGC are all disabled so the sample is raw.

### Audio prefs

The **PREFS** menu (and the `AUDIO PREFS` panel section on the right) lets you choose:

- **Record source** — `Master` (post-gain, default), `Limiter` (pre-gain, constant level), or `Dry` (pre-limiter, raw grain sum). If your recording level doesn't follow the gain knob, switch to Master.
- **Output device** — click `↻ refresh list` to enumerate audio outputs, then pick one (`AudioContext.setSinkId` — Chrome/Edge only; Firefox/Safari fall back to system default). Browsers may withhold device labels until you grant microphone permission at least once.
- Live sample rate, base/output latency, channel count, and context state appear below the device list.

`F5` (or the `+ snippet` button) saves the current knob state as a named preset. Snippets appear in the right panel as clickable rows; click to recall. Up to six most-recent snippets are kept.

---

## Run it

```bash
# from the characterworld/ repo root:
python3 -m http.server 8000
# then open http://localhost:8000/charactergrain/
```

AudioContext is created on the first user gesture — press `Space`.

---

## What's in v3

- Clickable UI — menu bar, dropdowns, knob `[-]`/`[+]`, algorithm selector, paint tier picker, section collapse.
- **CANVAS** algorithm — paint grains onto the grid, hover to reveal/fire them; high-density ambient re-fires.
- Grain info strip — live per-grain readout (glyph, tier color, pitch, pan, duration, position, gain), recent-grain trail, tier legend, live stats.
- Time display — `mm:ss.msec` playback timer in the menu bar and status bar.
- Loading state — loading banner in SOURCE panel while decoding.
- Master recording — `MediaRecorder` tap on the limiter output, download on stop.
- Snippets — save/recall knob presets.
- FX presets — quick-dial glyphFx/wet/sat from the FX menu.

## What's next (v4)

- SORT scheduler (bubble/radix/merge).
- Mic input as a live source (ring buffer).
- Buffer region cuts / loop points.
- WAV offline-render export.
- Onion-blend mode (two algorithms layered).

---

## Project law

Every visible glyph is drawn via `fillText`. No images, SVG, path geometry, or decorative CSS shapes. See [`../AGENTS.md`](../AGENTS.md).

Inspired in spirit by [`characterglitch`](https://github.com/willbearfruits/characterglitch) and sibling [`characterfilm`](../characterfilm/) (menu-bar pattern, clickable panels).

---

## License

MIT — see [`../charactershop/LICENSE`](../charactershop/LICENSE).
