# characterdelve

Top-down scrolling roguelike where every tile is a typed glyph and every
encounter, footstep, and pickup fires grains. Sibling to
[`charactergrain`](../charactergrain/) — same audio philosophy
(`fireGrain` + saturator → limiter → master), different shape.

**Status: v0.** Procedural rooms, walking grains, pickups install sound
modules into your build, enemies trigger grain bursts on touch. Single run,
no permadeath persistence yet.

## Run

```bash
# from characterworld/ root
python3 -m http.server 8000
# open http://localhost:8000/characterdelve/
```

Click anywhere or press Space to unlock the AudioContext.

## Controls

| | |
|---|---|
| **WASD / arrows / left stick** | move |
| **Space / A button** | pause / unpause |
| **Esc / B button** | panic (kill all sound) |
| **I / Y button** | show current build |

## Build modules (pickups)

Touch a glyph in a room to install it. Each adds a layer to your sound:

| Type | Glyph | Effect |
|---|---|---|
| `M` mycelium | scheduler — grains spread on every step (todo: full schedulers) |
| `S` stormcell | scheduler — pulse clusters |
| `⟿` scan | scheduler — playhead drift |
| `↯` sort | scheduler — re-orders grain stream |
| `σ` saturator | fx — adds saturation curve |
| `ρ` reverb | fx — raises wet send |
| `δ` delay | fx — feedback delay (todo: wire) |
| `λ` lowpass | fx — darkens master (todo: wire) |
| `p` pinkbuf | source — pink-noise grain source |
| `t` toneburst | source — detuned chord stack |
| `g` glitchbuf | source — broken-tape grain source |
| `»` speed | passive — +walking speed |
| `◇` range | passive — +grain count on encounter |
| `♯` pitch up | passive — +1 octave |
| `♭` pitch down | passive — −1 octave |
| `※` density | passive — density boost |

## Files

```
characterdelve/
├── index.html       canvas shell
├── css/app.css      void background
└── js/
    ├── main.js      RAF loop
    ├── state.js     mutable state + setStatus()
    ├── constants.js glyphs, palettes, module + enemy catalogs
    ├── audio.js     fireGrain + saturator → limiter → master
    ├── world.js     chunked procgen, drunkard-walk rooms, sample-by-rarity loot
    ├── player.js    movement + pickup + encounter logic
    ├── input.js     keyboard + Gamepad API
    └── render.js    canvas draw — every visible mark is fillText
```

## What's next

- Wire the schedulers so they actually change grain firing patterns (mycelium spread, stormcell pulses, sort, scan).
- Wire the `delay` and `lowpass` fx into the master chain.
- Persistent meta-progression: keep one module across deaths.
- Real depth descend: passable stairs glyph carves to a new procgen seed.
- Boss rooms with audio signatures.
- Visualize active build in a side panel.

## Project law

Every visible glyph is `ctx.fillText`. No images, no SVG, no path geometry.
See [`../AGENTS.md`](../AGENTS.md).
