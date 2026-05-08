// io.js — minimal #io overlay for help/about dialogs.
// Atelier-mandated: the ONE DOM exception. Used only for text-heavy modal
// dialogs. Tool/cell/knob UIs are drawn on the canvas, not here.

let io = null;
let body = null;
let onClose = null;

export function initIo() {
  io = document.getElementById('io');
  if (!io) return;
  // Build the overlay scaffolding once.
  io.innerHTML =
    '<div id="ioInner">' +
      '<div id="ioTitle"></div>' +
      '<div id="ioBody"></div>' +
      '<div id="ioBtns">' +
        '<button id="ioClose">close (esc)</button>' +
      '</div>' +
    '</div>';
  body = document.getElementById('ioBody');
  document.getElementById('ioClose').addEventListener('click', closeIo);
  io.addEventListener('click', (e) => {
    // click outside ioInner to close
    if (e.target === io) closeIo();
  });
  // Esc closes — but only when overlay is open, otherwise we'd swallow Esc-stop.
  window.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeIo();
    }
  }, true);
}

export function isOpen() {
  return io && !io.classList.contains('hidden');
}

export function openIo(title, html, onCloseCb) {
  if (!io) return;
  document.getElementById('ioTitle').textContent = title;
  body.innerHTML = html;
  io.classList.remove('hidden');
  onClose = onCloseCb || null;
}

export function closeIo() {
  if (!io) return;
  io.classList.add('hidden');
  if (onClose) { try { onClose(); } catch (_) {} onClose = null; }
}

export function openHelp() {
  openIo('charactertracker — help',
    `
<h3>What is this?</h3>
<p>A character-only sample tracker built for breakcore. 16 tracks, voice types (SAMPLE / GRAIN / FM / DRUM), polyrhythmic per-track length+division, granular bursts and FM leads next to synthesized drums and sliced breaks.</p>

<h3>Mouse</h3>
<ul>
  <li><b>click cell</b> toggle active. <b>drag</b> paints matching state. <b>right-click</b> erases. <b>middle-click</b> toggles GRAIN accent.</li>
  <li><b>shift+drag</b> in pattern: rectangular selection.</li>
  <li><b>wheel</b> on cell: nudge focused field (Tab cycles which one). <b>shift+wheel</b> = ×10.</li>
  <li><b>knob drag vertical</b>: change value. <b>shift</b>=fine. <b>wheel</b> nudges. <b>right-click</b> resets.</li>
  <li><b>click voice tag</b> cycle voice. <b>click slot tag</b> cycle slot. <b>click M/S</b> toggle mute (shift = solo). <b>click bank slot</b> assign to current track (shift+click = load file).</li>
  <li><b>click waveform</b> set slice. <b>click transport</b> play/pause.</li>
</ul>

<h3>Keys — transport / cell</h3>
<table>
<tr><td>↑↓ ←→</td><td>cursor step / track</td></tr>
<tr><td>PgUp/PgDn</td><td>step ±16</td></tr>
<tr><td>Tab / shift+Tab</td><td>cycle focused field</td></tr>
<tr><td>space</td><td>toggle cell active</td></tr>
<tr><td>P / Enter</td><td>play / pause</td></tr>
<tr><td>Esc</td><td>stop</td></tr>
<tr><td>/</td><td>panic</td></tr>
<tr><td>[ ]</td><td>slice -/+</td></tr>
<tr><td>- =</td><td>pitch -/+ (shift = ±12)</td></tr>
<tr><td>, .</td><td>retrig -/+</td></tr>
<tr><td>&lt; &gt;</td><td>gate -/+5</td></tr>
<tr><td>; '</td><td>prob -/+10</td></tr>
<tr><td>q w</td><td>micro -/+5</td></tr>
<tr><td>g</td><td>toggle GRAIN accent</td></tr>
</table>

<h3>Keys — track / pattern</h3>
<table>
<tr><td>m / s</td><td>mute / solo current track</td></tr>
<tr><td>v / shift+v</td><td>cycle voice</td></tr>
<tr><td>b / shift+b</td><td>cycle bank slot</td></tr>
<tr><td>d / shift+d</td><td>cycle division</td></tr>
<tr><td>l</td><td>load sample file</td></tr>
<tr><td>shift+l</td><td>cycle track length</td></tr>
<tr><td>n / shift+n</td><td>double / halve slice count</td></tr>
<tr><td>t</td><td>transient slicing</td></tr>
<tr><td>\`</td><td>reset slot to noise</td></tr>
<tr><td>shift+R / shift+C</td><td>randomize / clear pattern</td></tr>
<tr><td>z x / a f / e</td><td>BPM / master / sat drive</td></tr>
</table>

<h3>Keys — selection / clipboard / project</h3>
<table>
<tr><td>shift+drag</td><td>rectangular cell selection</td></tr>
<tr><td>ctrl+A / ctrl+D</td><td>select all / deselect</td></tr>
<tr><td>ctrl+C / ctrl+X / ctrl+V</td><td>copy / cut / paste at cursor</td></tr>
<tr><td>delete / backspace</td><td>clear selection cells</td></tr>
<tr><td>ctrl+I</td><td>invert active state across selection</td></tr>
<tr><td>ctrl+Z / ctrl+Y / ctrl+shift+Z</td><td>undo / redo</td></tr>
<tr><td>ctrl+S / ctrl+O</td><td>save / load project (.json)</td></tr>
<tr><td>F1 / ?</td><td>this help</td></tr>
</table>

<h3>Keys — views &amp; song mode</h3>
<table>
<tr><td>F2 / F3 / F4</td><td>switch to PATTERN / SONG / MIXER view</td></tr>
<tr><td>F5</td><td>toggle song mode (sequence playback)</td></tr>
<tr><td>ctrl+B</td><td>load samples to bin (multi-file picker)</td></tr>
<tr><td>ctrl+shift+N</td><td>add new pattern (clones current)</td></tr>
<tr><td>click bin entry</td><td>assign sample to current track's bank slot</td></tr>
<tr><td>SONG view click</td><td>select pattern in list / set song step in sequence</td></tr>
<tr><td>SONG view right-click</td><td>remove sequence slot</td></tr>
<tr><td>scrollbar drag</td><td>scroll pattern (vert/horiz) without re-centering</td></tr>
</table>

<h3>Voices</h3>
<ul>
  <li><b>SAMPLE</b> — slice playback. cell.slice = slice index. cell.grain = swap clean playback for granular burst inside the slice.</li>
  <li><b>GRAIN</b> — granular cloud voice. Bigger clouds with track-level density/spread/grainMs knobs.</li>
  <li><b>FM</b> — 2-op FM. cell.slice = semitones above the FM base note (110 Hz). cell.grain doubles modulation index. Track knobs: ratio / index / atk / rel.</li>
  <li><b>DRUM</b> — synthesized 8-piece kit. cell.slice (mod 8) picks: KICK / SNARE / HAT / CLAP / TOM / COW / RIM / CRSH. cell.grain = velocity accent.</li>
</ul>

<p style="opacity:0.6">part of <a href="../" style="color:#9dff7a">characterworld</a> · <a href="https://github.com/willbearfruits/characterworld" style="color:#5ef2ff">github</a></p>
    `
  );
}
