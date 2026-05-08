// project.js — JSON project save/load. File-based for explicit save/load
// (Ctrl+S / Ctrl+O); auto-save to localStorage is handled in history.js
// (every pushHistory writes the latest snapshot for crash recovery).

import { state, setStatus } from './state.js';
import { pushHistory, restore, snapshot } from './history.js';

const VERSION = 1;

export function exportProject() {
  const s = snapshot('export');
  return {
    version: VERSION,
    saved: new Date().toISOString(),
    bpm: s.bpm,
    swing: s.swing,
    masterGain: s.masterGain,
    satDrive: s.satDrive,
    tracks: s.tracks,
    cursor: s.cursor,
  };
}

export function importProject(obj) {
  if (!obj || obj.version !== VERSION || !Array.isArray(obj.tracks)) {
    setStatus('not a charactertracker project file');
    return false;
  }
  pushHistory('load project');
  restore({
    label: 'load',
    bpm: obj.bpm || 174,
    swing: obj.swing || 0,
    masterGain: obj.masterGain ?? state.knobs.masterGain,
    satDrive:  obj.satDrive  ?? state.knobs.satDrive,
    cursor: obj.cursor || { track: 0, step: 0, field: 'slice' },
    selection: null,
    tracks: obj.tracks,
  });
  setStatus('loaded project');
  return true;
}

export function downloadProjectFile(filename) {
  const obj = exportProject();
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || ('charactertracker-' + Date.now() + '.json');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus('saved: ' + a.download);
}

export async function loadProjectFile(file) {
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    return importProject(obj);
  } catch (e) {
    setStatus('load failed: ' + (e.message || e));
    return false;
  }
}

// Hidden file input shared between bank loader and project loader by accept
// type — invoke via openProjectPicker(). Picker is created lazily.
let projectInputEl = null;
export function openProjectPicker() {
  if (!projectInputEl) {
    projectInputEl = document.createElement('input');
    projectInputEl.type = 'file';
    projectInputEl.accept = 'application/json,.json';
    projectInputEl.style.display = 'none';
    document.body.appendChild(projectInputEl);
    projectInputEl.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      await loadProjectFile(f);
      projectInputEl.value = '';
    });
  }
  projectInputEl.click();
}
