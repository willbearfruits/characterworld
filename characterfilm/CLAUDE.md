# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Law (read first)

Shared policy: see `../AGENTS.md` and `../skills/character-only-art/SKILL.md`. Every visible subject, UI control, cursor, border, timeline strip, film-strip thumbnail, and effect must be typed glyphs. The two image assets (`og.png`, `hero.png` when added) are social-card metadata for external platforms — not part of the rendered product.

## Commands

No build step. ES modules load natively.

- Run locally: `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000/characterfilm/`.
- Syntax-check all JS modules: `for f in characterfilm/js/*.js; do node --check "$f"; done`.
- Deploy: merging to `main` auto-publishes to `https://willbearfruits.github.io/characterworld/characterfilm/` (shared Pages deploy with the parent repo).

## Architecture

`characterfilm` is a character-only video editor. It is deliberately multi-file — unlike `charactershop/` (single HTML, 2450 lines), this project is split into ES modules so that source conversion, timeline state, UI rendering, and export formats can evolve independently.

### File layout

```
characterfilm/
├─ index.html            shell + hidden <video>/<input> elements + #io overlay
├─ css/app.css           fullscreen canvas, io overlay styling
├─ js/
│  ├─ main.js            entry: resize, pointer/keyboard, main raf loop
│  ├─ constants.js       RAMPS, THEMES, MODES, GLYPH_PICKER, defaults, MAX_FRAMES
│  ├─ state.js           single mutable `state` object + `setStatus()`
│  ├─ video.js           source (webcam/video/image) + sampleFrame() conversion
│  ├─ timeline.js        frames[], record/play/scrub, capture, clear/dup/del, resetGridTo
│  ├─ tools.js           per-frame edit tools (brush/pencil/erase/fill/eyedrop, strokeLine)
│  ├─ history.js         snapshot/restore/undo/redo over layers + knobs + current
│  ├─ io.js              DOM overlay for text-heavy dialogs (new/resize/keys/about)
│  ├─ ui.js              drawn UI: menus, panels, viewport, timeline strip, status, cursor
│  └─ export.js          PNG / GIF (LZW) / TXT / ANSI / JSON / localStorage
```

Only `ui.js` and `main.js` know about the canvas context. Tools and timeline manipulate the `state.frames[]` store; export reads from state.

### Core data model

A **frame** is a flat grid of size `cols*rows`:

```js
{ chars: Array<string>, colors: Uint8Array, marks: Uint8Array }
```

`chars[i] === ' '` means empty (renders nothing). `colors[i]` indexes into the active theme palette (`THEMES[THEME_NAMES[state.knobs.themeIdx]]`). `marks[i]` is reserved for combining-mark density (not yet used — kept to match the `charactershop` per-cell shape).

State lives in one place: `state.js` exports a mutable `state` object. Every module imports it. Frames are stored in `state.frames`, current selected frame index in `state.current` (−1 = live mode). `state.live` holds the current converted frame from the source.

### Source → character conversion

`video.sampleFrame()` (called each raf tick while in live mode or recording):

1. Draws the current source (webcam `MediaStream` / `<video>` element / `<img>`) to an offscreen sample canvas at the character grid size, letterboxed with `CHAR_ASPECT = 0.5` so characters' height-to-width ratio is preserved.
2. Per cell, computes grayscale luminance, applies brightness/contrast/gamma/invert/threshold, then optionally adds a Sobel edge response.
3. Maps density to a glyph via the selected ramp (`RAMPS[RAMP_NAMES[knobs.rampIdx]]`).
4. Assigns color by one of three `colorMode`s: MONO (single palette index), QUANTIZED (nearest palette color to source RGB), EDGE (edge pixels → HI, body → ink).

All conversion is driven by `state.knobs`; the UI panel just bumps these values. `state.live.dirty` is a hint — currently conversion runs every frame regardless.

### Timeline

`state.frames[]`, `state.current`, `state.fps`, `state.playing`, `state.recording`. `tickRecord(now)` pushes the live buffer into frames at `1000/fps` intervals when recording; `tickPlay(now)` advances `current` at the same cadence when playing. `captureFromLive()` is the single-shot capture used by `C` and the timeline strip click. `gotoFrame(i)` is the scrub primitive (called by clicking on the film-strip).

Cap: `MAX_FRAMES = 600` (~50s @ 12fps). Recording auto-stops when reached.

### Per-frame editing

Tools only write when `state.viewMode === 'frame'` and `state.current >= 0`. Each tool calls `pushHistory(label)` at stroke start. `strokeLine()` uses Bresenham to interpolate during drags (so fast moves don't leave gaps). Brushes respect `state.brushSize` via a radius-sq test. Fill is flood-fill by matching `chars[i]` + `colors[i]`.

Adding a new tool: append to `MODES` in `constants.js`, ensure its id has a single-letter first char for the `MODE_KEY` map, and add dispatch in `main.js` `applyToolStroke()` (for drag tools) or in the pointerdown branch (for single-click tools like FILL/EYEDROP).

### UI: drawn, not DOM

Each raf, `ui.drawUI()` rebuilds `buttons = []` via `addButton(id, c, r, w, h)`. `hitButton(col, row)` does reverse-order lookup so later-drawn (smaller/more specific) buttons win over earlier ones. `handleUIClick(col, row)` dispatches by id (convention: `"category:action"` or `"category:action:arg"`). Menu dropdowns are modal: clicking outside closes via the guard at the top of `handleUIClick`.

The DOM is used ONLY for:
- The fullscreen `<canvas>`.
- A hidden `<video id="src">` for playback of webcam/video sources (not rendered — only `drawImage` into the sample canvas).
- Two hidden `<input type="file">` pickers for video/image load and project load.
- The `#io` overlay for text-heavy dialogs (`openIo()` / `closeIo()` in `io.js`).

Do NOT add DOM buttons for regular tool UI. The one exception for text input is the `#io` overlay.

### Adding new work

- New ramp: append to `RAMPS` in `constants.js`; the cycle buttons pick it up automatically.
- New theme: append to `THEMES`; same automatic pickup.
- New filter (destructive transform on the current frame): add a function that iterates `currentFrame().chars/colors`, gated on `pushHistory` first; register via a menu item.
- New source kind: add a `SRC_*` constant in `constants.js`, a loader in `video.js`, and a branch in `sampleFrame()` for how to draw to the sample canvas.
- New per-frame field (e.g. `heat` for onion-skin decay): update `makeBlankFrame`, `captureFromLive`, `duplicateCurrentFrame`, `resetGridTo`, `importJsonFile`, and history's `cloneFrame`. Update JSON serialization in `export.js`.

### Onion skin (not yet implemented)

Planned: in `ui.drawViewport`, when viewing a frame and the user has onion skin enabled, also render `frames[current-1]` at low alpha in a cool color and `frames[current+1]` at low alpha in a warm color, before drawing the current frame. No data-model change needed.

## Deployment

- Repo: `willbearfruits/characterworld`
- Pages: `main` branch, root; this project lives at `characterworld/characterfilm/` and deploys to `.../characterworld/characterfilm/`.
- OG meta tags in `index.html` point at `https://willbearfruits.github.io/characterworld/characterfilm/og.png` (generate when a hero screenshot is available).
