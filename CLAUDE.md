# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Law (read first)

This project is **character-only**. Every visible subject, UI control, cursor, border, particle, texture, and effect must be built from typed glyphs (ASCII, Unicode, box/block elements, punctuation, combining marks). The full policy lives in `AGENTS.md` and `skills/character-only-art/SKILL.md` — they are authoritative.

Forbidden as visible subject matter: `<img>`, `<svg>`, `<video>`, sprite sheets, icon fonts used pictorially, 3D models, canvas `arc`/`rect`/`path` geometry, and CSS decorative shapes (blobs, gradient-as-art, border-radius cards, shadows carrying the art). Allowed: canvas `fillText`/`strokeText`, DOM text, CSS for layout/color/font/transforms only, and plain background fills that exist solely as a stage for characters.

When a feature seems to require an image, redesign it as character art (glyph cluster, density-map figure, ASCII composition) — do not reach for SVG or shapes.

## Commands

There is no build system, package manager, lint, or test suite. Artifacts are standalone HTML files.

- Run: open `index.html` directly in a browser, or serve the directory (`python3 -m http.server 8000`) and visit the file.
- There is nothing to install and no dependencies to manage.

## Architecture

Current artifact is a single file: `index.html` (~960 lines) — a character-only paint tool called "characterworld paint". All other browser pieces added to this repo should follow the same standalone single-file pattern unless a framework is already present.

The rendering model in `index.html` is the reference pattern for new pieces:

- **Two nested character grids on one fullscreen canvas.** A coarse UI grid (`cols`×`rows` at `cell` px) hosts panels, meters, and buttons; a finer "art" grid (`artCols`×`artRows` at `artCell` px) is the drawing surface. Both are rendered by iterating cells and calling `fillText` — no path geometry.
- **State lives in flat typed arrays** sized `artCols*artRows`: `chars` (string cells), `colors` (Uint8Array indexing into `COLORS`), `heat` (Float32Array for decay/glow), `marks` (Uint8Array for combining-mark overlays: above/below/strike). Index helper: `idx(x,y) = y*artCols + x`.
- **`resize()` is the pivot.** It recomputes DPR, font size, UI and art cell metrics, and `cols`/`rows`, then calls `layout()`, which recomputes the art viewport and **reallocates all grid buffers while preserving overlap from the old grid**. Any new persistent per-cell state must be added to both the allocation block in `layout()` and the copy-over loop that follows.
- **Palettes are index-based arrays**: `GLYPHS`, `COLORS` (`[name, hex]` pairs), `MODES`, `SHORT_MODE`, plus combining-mark sets `ABOVE`/`BELOW`/`STRIKE` and a `DENSITY` ramp. Add to these rather than introducing ad-hoc literals.
- **UI is drawn, not DOM.** `button()`, `meter()`, `signedMeter()`, `box()`, `colorSwatch()`, `commandGroup()` all emit text via `text()` and push hit-test rects into a `buttons` array that is rebuilt each frame. Interaction is pointer coordinates → cell → lookup against `buttons`. Do not introduce HTML form elements for controls — keep affordances textual (bracketed labels, glyph cursors, terminal panels).
- **Undo is snapshot-based**: `pushUndo()` captures `chars`/`colors`/`marks` via `snapshot()`; history is capped at 30. New per-cell state that should be undoable must be added to both `snapshot()` and `restore()`.
- **System cursor is hidden** (`body{cursor:none}`) because a character cursor replaces it. If you hide the cursor anywhere else, you must render a glyph cursor in its place.

## When adding a new piece

- Prefer a new standalone HTML file at the repo root over adding a framework.
- Keep `resize()` responsible for all metric/buffer recomputation; do not scatter font or column math across handlers.
- Use typed arrays for any grid ≥ a few thousand cells.
- Do not add image preloads, icon libraries, or SVG assets to the repo — the `character-only-art` skill's review checklist will reject them.
