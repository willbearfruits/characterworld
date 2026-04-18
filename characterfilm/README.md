# characterfilm

**Status: beta.** Feature-complete through v2 (onion skin, range ops, truecolor, MP4/WebM export) — rough edges likely, feedback welcome.

**Character-only video editor.** Webcam or video → typed glyphs in real time. Record, scrub, paint over frames, export GIF / PNG / ANSI / MP4 / WebM / JSON.

Part of [`characterworld`](../). Same philosophy as [`charactershop`](../charactershop/): every visible form is a typed character — the filmstrip, the playhead, the cursor, the UI, all of it.

**Live:** [willbearfruits.github.io/characterworld/characterfilm](https://willbearfruits.github.io/characterworld/characterfilm/)

---

## What it does

- **Source**: webcam (browser `getUserMedia`), video file, or still image
- **Live converter**: every frame of the source is sampled into a character grid using a chosen density ramp; you control brightness, contrast, gamma, threshold, edge-detect strength, invert, ramp, theme, color mode
- **Color modes**: MONO · QUANTIZED (palette-match) · EDGE (edges in highlight, body in ink) · TRUE (24-bit truecolor sampled per cell from source)
- **Recording**: press `R` to capture incoming frames into a clip at your chosen FPS. Cap: 600 frames (~50s at 12fps)
- **Import video as clip**: bake every frame of an external video into the timeline at the chosen fps
- **Timeline**: scrub the character-based filmstrip, step frame-by-frame, duplicate, delete, clear
- **Range ops**: shift-click to extend selection, `Ctrl+A`/`Ctrl+D` select-all/none, delete / duplicate / reverse range, shift frame left/right
- **Onion skin**: ghost prev/next frames tinted cool/warm while editing (toggle with `O`, adjust range with `,`/`.`)
- **Per-frame painting**: brush / pencil / erase / fill / eyedrop — same tool pattern as the atelier
- **Undo / redo**: 64-deep snapshot-based history
- **Save / load**: JSON project (`.cwf.json`) for round-tripping, localStorage for quick save
- **Export**: animated GIF (LZW, shows motion), MP4 / WebM video (MediaStreamTrackGenerator where available, canvas.captureStream fallback), PNG (current frame), TXT, truecolor ANSI, JSON

---

## Keyboard

| Key | Action |
|---|---|
| `W` | Open webcam |
| `R` | Record / stop |
| `Space` | Play / pause |
| `C` | Capture current live frame |
| `Tab` | Toggle live / frame view |
| `←` `→` | Step backward / forward |
| `B` `P` `E` `F` `I` | Brush / pencil / erase / fill / eyedrop |
| `[` `]` | Brush size − / + |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` / `Ctrl+O` | Save project JSON / open project JSON |
| `Ctrl+Shift+S` / `Ctrl+Shift+O` | Quick save / load (localStorage) |
| `Ctrl+J` | Duplicate current frame |
| `Ctrl+Shift+J` | Duplicate selected range |
| `Delete` | Delete current frame |
| `Shift+Del` | Delete selected range |
| `O` | Toggle onion skin |
| `,` `.` | Onion range − / + |
| `Shift+←` `Shift+→` | Extend selection |
| `Alt+←` `Alt+→` | Shift current frame left / right |
| `Ctrl+A` `Ctrl+D` | Select all / none |
| `Esc` | Close menus / dialogs |

---

## Run it

```bash
# From the characterworld/ repo root:
python3 -m http.server 8000
# then open http://localhost:8000/characterfilm/
```

Webcam requires HTTPS in production (GitHub Pages serves HTTPS) or localhost.

---

## Project law

Every visible pixel is driven by `fillText`. No images, no SVG, no canvas path geometry. See [`../AGENTS.md`](../AGENTS.md).

---

## License

MIT — inherited from the parent `characterworld` repo. See [`../charactershop/LICENSE`](../charactershop/LICENSE).
