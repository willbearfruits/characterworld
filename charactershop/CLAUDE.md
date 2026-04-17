# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Law (read first)

This project is **character-only**. Every visible subject, UI control, cursor, border, particle, texture, and effect must be built from typed glyphs (ASCII, Unicode, box/block elements, punctuation, combining marks). The full policy lives in `../AGENTS.md` and `../skills/character-only-art/SKILL.md` (at the meta-repo root) — they are authoritative.

Forbidden as visible subject matter: `<img>`, `<svg>`, `<video>`, sprite sheets, icon fonts used pictorially, 3D models, canvas `arc`/`rect`/`path` geometry, and CSS decorative shapes (blobs, gradient-as-art, border-radius cards, shadows carrying the art). Allowed: canvas `fillText`/`strokeText`, DOM text, CSS for layout/color/font/transforms only, and plain background fills that exist solely as a stage for characters.

Exception: `og.png` and `hero.png` inside `charactershop/` are a PNG screenshot + OpenGraph social card. They are *metadata for external platforms*, not part of the visible product — their pixels happen to depict character art. Do not reach for bitmap assets inside `index.html`.

When a feature seems to require an image, redesign it as character art (glyph cluster, density-map figure, ASCII composition) — do not reach for SVG or shapes.

## Commands

No build system, package manager, lint, or test suite. Single static HTML file.

- Run locally: `python3 -m http.server 8000` then open `http://localhost:8000`. Or double-click `index.html`.
- Syntax-check JS: `sed -n '27,2453p' index.html > /tmp/cw.js && node --check /tmp/cw.js` (line range covers the `<script>` block — adjust if the file grows).
- Regenerate social card from a new screenshot:
  ```bash
  cp path/to/screenshot.png og-src.png
  python3 -c "from PIL import Image; im=Image.open('og-src.png').convert('RGB'); w,h=im.size; s=min(1200/w,630/h); nw,nh=int(w*s),int(h*s); im=im.resize((nw,nh),Image.LANCZOS); c=Image.new('RGB',(1200,630),(3,4,3)); c.paste(im,((1200-nw)//2,(630-nh)//2)); c.save('og.png',optimize=True)"
  rm og-src.png
  ```
- Deploy: merging to `main` auto-publishes to `https://willbearfruits.github.io/characterworld/charactershop/` via GitHub Pages (legacy branch source, root of the `characterworld` repo — this project lives in the `charactershop/` subdir). Build status: `gh api repos/willbearfruits/characterworld/pages/builds/latest --jq '.status'`.

## Architecture

`index.html` (~2450 lines) is the single artifact — "characterworld / atelier", a Photoshop-style character-only paint program. All other browser pieces added to this repo should follow the same standalone single-file pattern unless a framework is already present.

### Core rendering model

- **Two nested character grids on one fullscreen canvas.** A coarse UI grid (`uiCols`×`uiRows` at `uiCell` px) hosts menu bar, tool rail, side panels, status bar. A finer "art" grid (`artCols`×`artRows` at `artCell` px, scaled by `zoom`) is the drawing surface, viewed through a viewport (`viewCols`×`viewRows`) at offset (`panX`,`panY`). Both grids render by iterating cells and calling `fillText` — no path geometry.
- **`resize()` handles viewport only; `resizeCanvasTo(w,h)` handles canvas dimensions.** `resize()` recomputes DPR, font sizes, UI metrics, viewport size — it does NOT reallocate layer buffers. Canvas dimension changes go through `resizeCanvasTo()`, which reallocates every layer with content-preserving copy. This split is important: zoom/pan must not destroy paint.
- **System cursor is hidden** (`body{cursor:none}`); a character cursor is always rendered in its place.

### Layer stack (not a single grid)

Per-cell state is **per-layer**, not global. Each entry in `layers` is:
```
{name, visible, opacity(0-100), blend(0-5), locked,
 chars:Array<string>, colors:Uint8Array, marks:Uint8Array, heat:Float32Array}
```
all sized `artCols*artRows`. `activeLayer()` returns `layers[active]`. Tools write to `activeLayer()`, not to globals. Never assume a single `chars[]`/`colors[]` — that pattern is from the pre-atelier rewrite.

Layer operations: `makeLayer`, `copyLayer`, `addLayer`, `removeLayer`, `duplicateLayer`, `moveLayerUp/Down`, `mergeDown`, `flatten`.

### Composite pipeline

`composite()` runs each frame, folding all visible layers top-down into a flat `compBuf` (`chars`/`colors`/`alpha`/`marks`) sized `artCols*artRows`. `drawComposite()` then iterates `compBuf` and draws runs of same-color cells. Blend modes (`BLENDS = NORMAL/SCREEN/MULTIPLY/STACK/CORRUPT/BEHIND`) are implemented inside the composite loop — `brightenIdx`/`darkenIdx`/`mixIdx` do color math by nearest-palette-neighbor. Add new blend modes by extending the `BLENDS` array and adding a branch in `composite()`.

### Selection model

`selection` is either `null` or `{x,y,w,h, mask: Uint8Array}` of size `artCols*artRows` — 1 means selected. `inSel(x,y)` is the universal gate; every paint/filter op calls it before writing. Selection tools: marquee (`selectRect`), lasso (`selectLasso` — even-odd fill), magic wand (`selectMagic` — flood-fill by matching char+color), plus `selectAll`/`deselect`/`invertSelection`/`selectFromLayer`. Marching ants: `drawSelection()` renders alternating `╳`/`┼` on mask perimeter cells, phased on `t`.

### Clipboard

`clipboard` is `{w, h, chars, colors, marks, mask}` — a rectangle crop of the selected region. `copySelection(cut)` extracts; `paste()` stamps back (centered). MOVE tool reuses this: it cuts on mousedown, pastes at offset on mouseup.

### Palettes and constants (index-based)

`GLYPHS`, `COLORS` (`[name,hex]` pairs), `MODES` (21 tools), `MODE_KEY` (single-letter shortcut map), `BLENDS`, `BRUSH_PRESETS`, `THEMES` (4 palettes; `TH` is the active one), combining-mark sets `ABOVE`/`BELOW`/`STRIKE`, and the `DENSITY` ramp. State indices (`glyph`, `color`, `color2`, `mode`, `bgTheme`) reference these — add entries to the arrays rather than introducing ad-hoc literals.

### UI — drawn, not DOM

Each frame `buttons=[]` is rebuilt. Helpers push hit-test rects: `button`, `plainButton`, `frame`, `meterRow`, `signedMeterRow`, plus panel sections (`panelGlyphs`, `panelPalette`, `panelBrush`, `panelLayers`, `panelInfo`, `panelHistory`). `hitButton(col,row)` does pointer→button lookup. `handleButton` dispatches by id string (pattern: `"category:action"` or `"category:action:arg"`). Menu dropdowns (`drawMenus`) are modal: `menuOpen` holds the open menu id; click outside to close.

Exception to "no DOM": `#io` is a fullscreen overlay with `<input>`/`<textarea>` for text-heavy dialogs (new canvas, resize, glyph search, about/keys). Opened via `openIo()`, closed via `closeIo()`. Keep this for text input; do NOT add DOM buttons for regular tool UI.

### History (undo + redo)

`pushHistory(label)` snapshots full layer stack + selection + canvas dims, capped at 64, clears redo. `snapshot()` deep-copies; `restore(s)` reallocates layers from snapshot. `undo()` pushes current to `future`; `redo()` reverses. Every mutating operation must call `pushHistory` BEFORE mutating, so undo returns to pre-op state. Operations that shift buffers (crop/rotate/resize) also clear `selection` because the mask size changes.

### Adding new work

- New tool: append to `MODES`, add shortcut to `MODE_KEY`, branch in `applyCell()` (for per-cell brushes) or handle explicitly in `onDown`/`onMove`/`onUp` (for shape/drag tools). Selection-respect via `inSel()` is mandatory.
- New filter: add a `filter*()` function using `forEachSel((L,x,y,p)=>...)` as the iteration pattern; register in the FILTER menu dispatch in `doMenuAction`.
- New blend mode: add to `BLENDS`, add branch in `composite()`.
- New per-layer persistent state: update `makeLayer`, `copyLayer`, `snapshot`, `restore`, `applyProject` (JSON load/save), and the composite/decay loops.
- New standalone piece: do NOT add it inside `charactershop/` — create a new sibling directory at the `characterworld/` repo root (see the meta-level `../CLAUDE.md`). Do not add frameworks. Do not add image/SVG/icon assets to the repo.

## Deployment

- Repo: `willbearfruits/characterworld` (public)
- Pages: `main` branch, root, auto-deploys on push
- Social preview: `og.png` (1200×630) referenced by OpenGraph/Twitter meta tags in `index.html`; GitHub auto-picks `hero.png` from the README for repo-URL previews
- Topics set for discoverability via `gh repo edit --add-topic ...`
