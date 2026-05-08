# charactertracker

Character-only sample tracker built for breakcore. Sixteen voice-typed tracks, polyrhythmic per-track length+division, drawn glyph knobs, granular bursts, FM leads, synthesized drums. Mouse-first painting. Glyphs only.

Part of [characterworld](https://github.com/willbearfruits/characterworld).

## Run

```
python3 -m http.server 8000
# → http://localhost:8000/charactertracker/
```

## What this is

A sixteen-track tracker where every cell is a step in a per-track loop and every track has its own length, division, and voice — so a 32-step 1/16 SAMPLE track alongside a 27-step 1/24 DRUM track produces polyrhythmic phasing for free.

### Voices (per track)

- **SAMPLE** — load a buffer, slice into N segments, cells fire slice playback. Cell's GRAIN flag swaps clean playback for a granular burst inside the slice.
- **GRAIN** — granular cloud voice. The slot's buffer is the source; cell fires `density × retrig` grains across the gate window, with pitch spread + accent.
- **FM** — 2-op FM synth. Cell.slice is semitones above DEFAULTS.fmBaseFreq (110 Hz). Cell.pitch adds. Cell's GRAIN flag doubles modulation index.
- **DRUM** — synthesized 8-piece drum kit. Cell.slice picks the drum (KICK/SNARE/HAT/CLAP/TOM/COW/RIM/CRSH). Cell.pitch tunes. GRAIN = velocity accent.

### Cells

Each cell has seven editable fields:

| field   | range          | meaning                                                             |
| ------- | -------------- | ------------------------------------------------------------------- |
| slice   | 0..63 (hex)    | voice-dependent — slice / cloud center / FM note / drum type        |
| pitch   | -48..+48 semis | pitch shift                                                         |
| gate    | 5..200 %       | how much of the step the voice plays for                            |
| retrig  | 1..16          | per-step ratchet count                                              |
| prob    | 0..100 %       | per-cell probability roll                                           |
| micro   | -50..+50 %     | step microshift, off-grid                                           |
| grain   | on/off         | voice-dependent accent toggle                                       |

### Visual chaos

- **Zalgo** — active cells gain combining-mark stacks (above + below + middle) deterministically scaled by retrig + grain + sub-100% probability. Cells with high retrig + grain look visibly destroyed.
- **Particles** — every fire event spawns voice-tinted glyph particles drifting upward from the track column. Hot SAMPLE bursts, sparkly GRAIN, FM tildes, drum circles. Ambient drift particles flicker during playback.
- **Live waveform** — the cursor track's bank slot is drawn as a multi-row peak plot with vertical `│` slice markers, the active slice highlighted in voice color, and a `║` playhead scrubbing through it as it fires.
- **Drawn glyph knobs** — the right panel is a grid of 7-cell × 3-row glyph knobs with bar + thumb + value display. Drag vertical to change. Click + drag, wheel to nudge, right-click to reset.

## Mouse

- **Click cell** — toggle active. Drag = paint matching state across cells.
- **Right-click cell** — clear (force inactive). Drag = erase.
- **Wheel on cell** — adjust the focused field's value (Tab cycles which one). Shift = ×10.
- **Middle-click cell** — toggle the GRAIN accent flag.
- **Drag knob** — vertical = change value. Shift = fine.
- **Wheel on knob** — nudge.
- **Right-click knob** — reset to range midpoint.
- **Click voice tag** — cycle voice. Shift = reverse.
- **Click slot tag** — cycle bank slot. Shift = reverse.
- **Click M/S indicator** — toggle mute. Shift+click = toggle solo.
- **Click bank slot** — select for current track. Shift+click = load file into that slot.
- **Click waveform** — set the current cell's slice index from the click position.
- **Click transport** — play / pause.

## Keys

```
↑ ↓             cursor step
← →             cursor track
PgUp PgDn       step ±16
Home / End      first / last step
Tab / shift+Tab cycle focused field

space           toggle cell active
Enter / P       play / pause
Esc             stop
/               panic — duck master, stop transport

[ / ]           slice -/+
- / =           pitch -/+ (shift = ±12)
, / .           retrig -/+
< / >           gate -5/+5
; / '           prob -10/+10
q / w           micro -5/+5
g               toggle GRAIN accent

m / s           mute / solo current track
b / shift+b     cycle current track's bank slot
d / shift+d     cycle current track's tempo division
v / shift+v     cycle current track's voice
l               load file → current track's slot
shift+l         cycle current track's length

n / shift+n     double / halve slice count for current slot
t               redo current slot's slices via transient detection
`               re-seed current slot with default noise

shift+r         randomize pattern (voice-aware)
shift+c         clear pattern

z / x           BPM -1 / +1 (shift = ±10)
a / f           master gain -/+
e               saturator drive +/- (shift = -)

F2 / F3 / F4    PATTERN / SONG / MIXER view
F5              toggle song mode (sequence playback)
ctrl+B          load samples to bin (multi-file picker)
ctrl+shift+N    add new pattern (clones current)

F1 / ?          help overlay
ctrl+Z          undo (auto-saves to localStorage on every edit)
ctrl+Y / ctrl+shift+Z  redo
ctrl+A / ctrl+D select all / deselect
ctrl+C / X / V  copy / cut / paste at cursor
ctrl+I          invert active state across selection
delete          clear selection cells
ctrl+S / ctrl+O save / load project (.json)
shift+drag      rectangular cell selection (mouse)
```

Touch (phone): single-finger drag to paint, two-finger touch to erase, double-tap to play/pause.

## Audio chain

```
fireSlice / fireGrainBurst / fireFM / fireDrum
  ↓
WaveShaper (tanh, 4× oversample)
  ↓
DynamicsCompressor (thr -3, ratio 20)
  ↓
master Gain → destination
```

Borrowed from `charactergrain` — same safety net so you can stack 16-retrig grain bursts across sixteen tracks without the output clipping.

## Limits / planned

- v1 has one pattern. Song-mode is planned.
- No MIDI yet.
- Slicing is even by default; transient detection (T) is rough — a real onset detector goes here later.
- Drag-and-drop sample loading: TODO.
- Gamepad: TODO.
- Sample buffers aren't saved with the project (only the pattern); reload audio after loading a `.json`.

## License

Same as the rest of `characterworld` — see the repo root.
