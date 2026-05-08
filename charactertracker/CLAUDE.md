# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Law (read first)

Shared policy: see `../AGENTS.md` and `../skills/character-only-art/SKILL.md`. Every visible form — header, transport, pattern grid, cells, waveform, bank panel, knobs, particles, mouse cursor — must be typed glyphs drawn via `fillText`. The only bitmap assets allowed are social-card OG images (not generated yet).

## Commands

No build step. ES modules load natively.

- Run locally: `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000/charactertracker/`.
- Syntax-check all modules: `for f in charactertracker/js/*.js; do node --check "$f"; done`.
- Headless smoke test: `chromium --headless --disable-gpu --no-sandbox --window-size=1600,900 --virtual-time-budget=3000 --screenshot=/tmp/tracker.png http://localhost:8000/charactertracker/` then inspect `/tmp/tracker.png`.
- Deploy: merging to `main` auto-publishes to `https://willbearfruits.github.io/characterworld/charactertracker/`.

## Architecture

`charactertracker` is a character-only sample tracker built for breakcore. ES modules, no framework, mouse-first with dense keyboard shortcuts.

### File layout

```
charactertracker/
├─ index.html            shell + canvas + hidden audio file input + #io overlay
├─ css/app.css           fullscreen canvas, system cursor hidden, #io overlay styled
├─ js/
│  ├─ main.js            entry: resize, RAF (drain visuals + tick particles + draw), scheduler interval, autoload-or-seed
│  ├─ constants.js       THEME_VOID, VOICES, DRUM_TYPES, DEFAULTS, CLAMPS, EMPTY_CELL, GLYPHS, CHROME, ZALGO_*, PARTICLE_GLYPHS
│  ├─ state.js           single mutable `state` (transport, pattern, cursor, bank, knobs, mouse, hover, particles, selection, layout)
│  ├─ pattern.js         pure data: makeCell/makeTrack/makePattern, makeSong (top-level container), clonePattern, songAddPattern/songInsertSequence/songRemoveSequenceSlot, setTrackVoice, voice-aware randomizePattern, resizeTrack
│  ├─ bin.js             sample bin (separate from bank): addFilesToBin, openBinPicker, assignBinToSlot, removeBinItem; multi-file decode + peaks
│  ├─ bank.js            shared sample bank: load file/URL, even or transient slicing, peak compute, default-noise generator
│  ├─ audio.js           AudioContext + master chain (saturator → limiter → master) and the four voice primitives — fireSlice, fireGrainBurst, fireFM, fireDrum
│  ├─ scheduler.js       look-ahead transport: per-track stepIndex/nextStepTime, voice-dispatched scheduleCell, pendingVisual queue + drainPendingVisuals
│  ├─ particles.js       glyph particle pool, spawnBurst (per fire), spawnAmbient (drift), tickParticles
│  ├─ knobs.js           drawn glyph knobs (label/bar/thumb/value), buildKnobList per frame, knobAt + applyKnobDrag for hit-testing/dragging
│  ├─ history.js         atelier-style snapshot stack: snapshot/restore/pushHistory/undo/redo + tryAutoload from localStorage
│  ├─ clipboard.js       cell-range selection + copy/cut/paste/delete/invert; selectAll/deselect/setSelection
│  ├─ project.js         JSON project save/load: downloadProjectFile (Ctrl+S), openProjectPicker (Ctrl+O)
│  ├─ io.js              the ONE DOM exception — `#io` overlay used only for help dialog (atelier-mandated)
│  ├─ input.js           keyboard + mouse + touch: paint/erase drag, select drag, knob drag, wheel, ctrl shortcuts; pushHistory before mutations
│  └─ ui.js              everything drawn: header, cell-detail line, track headers (with sub-region hit-test entries), pattern grid (zalgo + cursor + hover + playhead + selection ants), right panel (knobs + bank + waveform), particles, mouse cursor
```

Module boundaries:
- `audio.js` owns the Web Audio graph. Nothing else creates AudioContext nodes.
- `ui.js` and `main.js` are the only canvas writers.
- `scheduler.js` reads `state` and calls `audio.fire*`. It pushes events into `pendingVisual` for `main.js` to drain into particle spawns at audio time.
- `pattern.js` is pure data — no audio, no canvas, no DOM.
- `history.js` calls into `audio.js` only via the applier set by `main.js::setAudioApplier` — avoids a circular import. Snapshots cover pattern + transport + master + cursor + selection; NOT bank (assets) or runtime transport state (playing/trackPlay/particles).
- `clipboard.js` and `project.js` call `pushHistory(label)` before mutating, so paste/load are undoable.
- `state.layout` is rebuilt every frame by `ui.js` and consumed by `input.js` for hit-tests. Only `ui.js` writes it.
- `io.js` is the only module that touches `#io` overlay HTML. All other UI is canvas-drawn.

### Audio graph

```
fireSlice / fireGrainBurst / fireFM / fireDrum
  → BufferSource or Oscillator(s) + envelope GainNode + StereoPanner
                                      ↓
                                  WaveShaper (tanh, 4× oversample)
                                      ↓
                                  DynamicsCompressor (thr -3, ratio 20)
                                      ↓
                                  master Gain → destination
```

The saturator + limiter is the safety net — with 16 tracks × 16-grain bursts × 16-step retrigs the peak event count is hundreds per second, but the limiter prevents the output device clipping.

### Song / pattern model

`state.song = { patterns: [...], sequence: [pIdx, ...], editIndex, songStep, songMode, follow, lastAdvanceAt }`. Renoise-lite linear pattern matrix:

- `patterns[]` — pool of patterns. Each pattern is `{ name, bars, tracks: [...] }`.
- `sequence[]` — ordered list of pattern indices to play (e.g. `[0, 1, 0, 2, 0, 1]`).
- `editIndex` — which pattern is open in the editor.
- `songStep` — current position in `sequence` while playing.
- `songMode` — when `false`, just loop the edit pattern. When `true`, scheduler walks `sequence` and advances per-pattern bar boundaries.
- `follow` — when `true` and `songMode` is on, `editIndex` mirrors playback so the editor scrolls along with the song.

**`state.pattern`** is a GETTER on the state object — returns `state.song.patterns[state.song.editIndex]`. All existing callers (`state.pattern.tracks`) keep working. The scheduler uses `currentPlayPattern()` (exported from state.js) to deliberately read the playing pattern, which differs from `state.pattern` only when song mode is on.

Song-step duration: `pattern.bars × 16 × stepDur(div=16)` seconds. Within a pattern, tracks loop independently — polyrhythm is preserved per pattern. Crossing the song-step boundary resets all `trackPlay` pointers to step 0 of the next pattern.

Three views toggle via F2/F3/F4 (or top-right tab clicks): **PATTERN** (the editor grid), **SONG** (pattern list + sequence editor), **MIXER** (vertical track stripes with gain meters + voice + mute/solo).

### Voice types

Each track picks a `voice`. Cell semantics shift slightly per voice:

| voice  | cell.slice                          | cell.pitch          | cell.grain (per-cell accent toggle)             | track.params                       |
| ------ | ----------------------------------- | ------------------- | ----------------------------------------------- | ---------------------------------- |
| SAMPLE | which slice of the bank slot        | pitch in semis      | replace clean playback with a granular burst    | (uses bank slot only)              |
| GRAIN  | slice center of the cloud           | center pitch        | wider/denser cloud                              | density, grainMs, spread           |
| FM     | semis above DEFAULTS.fmBaseFreq     | extra pitch shift   | 2× modulation index                             | ratio, index, atk, rel             |
| DRUM   | drum type index (0-7, see DRUM_TYPES)| tune                | velocity accent (+30%)                          | (drum routines hand-crafted)       |

Default voice rotation on a fresh pattern: tracks 0-3 SAMPLE, 4-7 DRUM, 8-11 GRAIN, 12-15 FM. Change via `V` key, the VOICE knob, or click the voice tag in the track header. `pattern.js::setTrackVoice` resets `track.params` to defaults — switch back loses tuning.

### Scheduler

`scheduler.js::tickScheduler` runs on a 25 ms `setInterval` (RAF gets throttled when the tab is hidden, which would tear timing). Per-track look-ahead window is 100 ms.

`stepDur(track) = (60 / state.bpm) * (4 / track.div)`.

`scheduleCell` chains transformations on the cell's nominal time:
1. Apply `cell.micro` as a fractional step shift.
2. Compute the gate window (`stepDur * cell.gate / 100`).
3. Dispatch by voice → SAMPLE/GRAIN/FM/DRUM-specific routine.
4. Push a `pendingVisual` event with timing + voice + intensity for the UI.

Polyrhythm is automatic — every track maintains its own `nextStepTime`/`stepIndex`, so a 32-step / 1/16 track running alongside a 27-step / 1/24 track phases against itself on every cycle.

### Visual layers

1. **Pattern grid** — every active cell is voice-tinted, glyph-coded by mode (■ on, ⟫ retrig, ◇ grain, ◈ retrig+grain), and decorated with combining-mark zalgo deterministically scaled to retrig count + grain density + sub-100% probability.
2. **Selection ants** — `drawSelection` strokes a marching-ants dashed border around `state.selection` (rectangular cell range) plus corner glyphs (┏ ┓ ┗ ┛). Phase advances with `performance.now()`.
3. **Scrollbars** — vertical (right edge of grid) + horizontal (above grid) drawn with `│`/`█` and `─`/`━`. Layout cached as `state.layout.scrollV` / `scrollH`; draggable from `input.js::handleDragMove`. `state.scrollLockUntil = performance.now() + 1500` after each manual scroll prevents the cursor's auto-recenter from yanking the view back.
4. **Waveform** — current cursor track's bank slot rendered as a multi-row bar plot with `│` slice markers and a live `║` playhead scrubbing through the firing slice.
5. **Particles** — every fire event spawns 1-12 glyph particles drifting upward from the track column, fading over ~0.5-1 s. Voice-keyed glyph palette + color (PARTICLE_GLYPHS in constants.js). Ambient drift particles spawn occasionally when playing.
6. **Drawn knobs** — `knobs.js` builds a fresh list every frame for the right panel: master section (BPM, MAST, SAT, SWING) + cursor track's knobs (VOICE, GAIN, PAN, LEN, DIV, SLOT, plus voice-specific params for GRAIN/FM). Knobs are 7×3 glyph blocks with bar+thumb+value text.
7. **Visible mouse cursor** — the system cursor is hidden via CSS; `ui.js::drawMouseCursor` paints a translucent block + `+` glyph at `state.mouse.{cx,cy}` whenever the mouse is over the canvas.

**Right panel composition** (top to bottom, fixed width = `RIGHT_W = 28` glyph cells): KNOBS → BANK (8 slots) → WAVE (5 rows) → BIN. The wave is intentionally short so the bin always has room. BIN list scrolls via wheel-on-bin.

**View dispatch** in `drawUI`: header + cell-detail row are always drawn; below them, `state.view` selects PATTERN (track headers + grid + selection + scrollbars), SONG (`drawSongView`), or MIXER (`drawMixerView`). The right panel is drawn in all three views.

### State.layout cache

`ui.js` rebuilds `state.layout = { ... }` on every frame. `input.js::handleHover` reads it for hit-testing — never the other way around. Sub-fields:

- `grid` `{ x, y, w, h, colW }` — pattern grid bounds (cells)
- `trackHeaders[]` — sub-region entries `{ idx, region, x, y, w, h }` where region is `'muteSolo' | 'name' | 'voice' | 'slot'`
- `knobs[]` — `{ id, scope, x, y, w, h, lo, hi, set, categorical, value, label }`
- `bankSlots[]`, `binItems[]`, `songSlots[]`, `songPatterns[]`, `mixerStripes[]`, `viewTabs[]`
- `scrollV` / `scrollH` `{ x, y, w, h, total, visible, thumbX|thumbY, thumbW|thumbH }`
- `waveBox` `{ x, y, w, h }`
- `transportBox` `{ x, y, w }`

When adding a new clickable region: push an entry into the appropriate layout array in the relevant draw function, then add a hit-test branch in `handleHover` and a dispatch branch in `onMouseDown`.

### Mouse + keyboard + touch

Mouse:
- Cell — left click toggle / drag to paint matching state / right-click clear / wheel adjusts the focused field on hover / middle-click toggles grain.
- **Shift+drag in pattern grid** — rectangular cell selection.
- Knob — drag vertical (down = decrease) for value / shift = fine / wheel nudges / right-click resets to range midpoint.
- Track header — click voice tag to cycle voice (shift = reverse), click slot tag to cycle slot, click name to select track, click M/S indicator to toggle mute (shift = solo).
- Bank slot — click selects for current track / shift+click loads file into that slot.
- Waveform — click sets current cell's slice index based on click position.
- Transport — click play/pause.

Keyboard: see `input.js::handleKey` for the full table. Headline shortcuts: arrows nav, Tab cycle field, ⎵ toggle, P play, [/] slice, -/= pitch, ,/. retrig, ;/' prob, q/w micro, G grain, V voice, B slot, L load, shft+L length, shft+R rand, shft+C clear, z/x bpm, A/F master, E sat drive, / panic, ` reseed slot.

**View / song / bin shortcuts**:
- F2 / F3 / F4 — switch to PATTERN / SONG / MIXER view
- F5 — toggle song mode (sequence playback)
- Ctrl+B — load samples to bin (multi-file picker; samples appear in right-panel BIN section, click to assign to current track's slot)
- Ctrl+Shift+N — add new pattern (clones current edit pattern, appends to sequence)
- In SONG view: click pattern in list to edit it; click sequence slot to set song step; right-click sequence slot to remove; click `[+]` to append current pattern.
- Scrollbars on the pattern grid (vertical at right edge of grid, horizontal above) are draggable; wheel on scrollbar scrolls without re-centering. The cursor still auto-scrolls into view but the lock window (1.5 s after last manual scroll) prevents yank-back.

**Atelier shortcuts** (added on top of the tracker keys):
- Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z — undo / redo
- Ctrl+A / Ctrl+D — select all / deselect
- Ctrl+C / Ctrl+X / Ctrl+V — copy / cut / paste at cursor
- Ctrl+I — invert active state across selection
- Delete / Backspace — clear selection cells
- Ctrl+S / Ctrl+O — download / load project JSON
- F1 or `?` — open help overlay (closes on Esc or click outside)

Touch (synthesized in `input.js`):
- Single-finger drag — paint cells (left-click drag).
- Two-finger touch — right-click (erase).
- Double-tap — play/pause.

### Adding stuff

- **New cell field**: extend `EMPTY_CELL` + `CLAMPS` in constants.js, add a clamped writer in `pattern.js::setCellField`, key+wheel binding in `input.js`, render in `ui.js::drawGrid` + `drawCellDetail`, consume in `scheduler.js::scheduleCell`. Make sure `history.js::cloneTrack` copies the new field (it does via `{ ...c }` already).
- **New voice**: add to `VOICES`, default a `VOICE_PARAMS_DEFAULT` block in `pattern.js`, add a `schedule<Name>` branch in `scheduler.js`, add a `fire<Name>` primitive in `audio.js`, optionally pick a tint in `VOICE_COLOR` + add voice-specific knobs in `knobs.js::buildKnobList`.
- **New visual layer**: add a draw call in `ui.js::drawUI` between existing layers; if interactive, append a layout cache in `state.layout` and add a hit-test branch in `input.js::handleHover`.
- **New mutating action**: ALWAYS call `pushHistory('label')` BEFORE mutating. For continuous gestures (drag, wheel scrub), push once at gesture start. For one-shot keys, push once per keystroke. Skipping this breaks undo and the user will notice.
- **New project field** (loadable from saved JSON): add to `history.js::snapshot` + `restore`, then to `project.js::exportProject` + `importProject`. The autosave format follows snapshot shape directly so they stay in lockstep. Bump `charactertracker.autosave.vN` if the shape changes incompatibly.
- **New view mode** (alongside PATTERN/SONG/MIXER): add to the `tabs` array in `drawHeader`, write a `drawXView(rowStart)` function in ui.js, add the dispatch branch in `drawUI`, and (if interactive) cache hit-targets in `state.layout` + handle them in `input.js::handleHover` + `onMouseDown`. Pick an Fn key for the keyboard shortcut.

### Resize behavior

`resizeUI` recomputes `state.cellW/cellH/cols/rows` from the viewport (target ~150 cols). The grid scrolls vertically to keep `cursor.step` near the middle when track length exceeds visible rows; horizontally if the viewport is too narrow for all 16 tracks at once. Both scrolls are managed in `ui.js::computeScroll`.

**Atelier rule**: window-resize never reallocates pattern data. Track-length changes do (via `pattern.js::resizeTrack`) and they invalidate `state.selection` because the row count changes — input.js handles this on the L key, mouse handlers handle it on lenDiv clicks.

### Persistence

- **Auto-save**: every `pushHistory(label)` writes the latest snapshot to `localStorage` under `charactertracker.autosave.v2` (key bumped after song/sequence shape change — old v1 saves are ignored). On boot, `main.js::tryAutoload` restores it; if absent, `seedDemo()` runs instead.
- **Manual save/load**: Ctrl+S downloads a JSON file, Ctrl+O opens a file picker. Format is versioned (`{ version: 1, ... }`) so future loaders can migrate.
- The bank (sample buffers) and bin are intentionally NOT persisted — buffers are heavy/binary. Reloading a project gets you the pattern + song + sequence back; samples must be re-loaded into bin or assigned to slots fresh.

### Bank vs. bin (don't confuse)

- **Bank** — fixed array of 8 slots wired into the audio path. Tracks point at slot indices via `track.slot`. `bank.js` owns slot loading + slicing.
- **Bin** — open-ended pool of decoded samples. `bin.js` owns the list. Items click-or-drag into bank slots. The bin exists so you can keep many candidate samples in memory and try them on different slots without re-decoding each time.

## Deployment

- Repo: `willbearfruits/characterworld` (public)
- Pages: `main` branch, root, auto-deploys on push
- This project lives at `characterworld/charactertracker/` and deploys to `.../characterworld/charactertracker/`
- Social preview: `og.png` (1200×630) referenced by OG meta tags in `index.html` (not generated yet)
