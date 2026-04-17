# characterfilm

**Character-only video editor.** Webcam or video → typed glyphs in real time. Record, scrub, paint over frames, export GIF / PNG / ANSI / JSON.

Part of [`characterworld`](../). Same philosophy as [`charactershop`](../charactershop/): every visible form is a typed character — the filmstrip, the playhead, the cursor, the UI, all of it.

**Live:** [willbearfruits.github.io/characterworld/characterfilm](https://willbearfruits.github.io/characterworld/characterfilm/)

---

## What it does

- **Source**: webcam (browser `getUserMedia`), video file, or still image
- **Live converter**: every frame of the source is sampled into a character grid using a chosen density ramp; you control brightness, contrast, gamma, threshold, edge-detect strength, invert, ramp, theme, color mode
- **Recording**: press `R` to capture incoming frames into a clip at your chosen FPS. Cap: 600 frames (~50s at 12fps)
- **Timeline**: scrub the character-based filmstrip, step frame-by-frame, duplicate, delete, clear
- **Per-frame painting**: brush / pencil / erase / fill / eyedrop — same tool pattern as the atelier
- **Undo / redo**: 64-deep snapshot-based history
- **Save / load**: JSON project (`.cwf.json`) for round-tripping, localStorage for quick save
- **Export**: animated GIF (LZW, shows motion), PNG (current frame), TXT, truecolor ANSI, JSON

Onion skin is planned, not yet shipped.

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
| `Delete` | Delete current frame |
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
