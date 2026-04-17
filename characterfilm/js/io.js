const io = document.getElementById('io');
const ioBody = document.getElementById('ioBody');

let currentClose = null;

export function openIo(title, bodyHtml, primary, onPrimary, secondary, onSecondary) {
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  ioBody.innerHTML = '<h3>' + esc(title) + '</h3>' + bodyHtml +
    '<div class="row">' +
    (secondary ? '<button id="ioCancel">' + esc(secondary) + '</button>' : '') +
    (primary ? '<button id="ioOk" class="primary">' + esc(primary) + '</button>' : '') +
    '</div>';
  io.classList.add('on');
  const ok = document.getElementById('ioOk');
  const cancel = document.getElementById('ioCancel');
  const close = () => { io.classList.remove('on'); ioBody.innerHTML = ''; currentClose = null; window.removeEventListener('keydown', keyHandler, true); };
  const keyHandler = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (onSecondary) onSecondary(); close(); }
    else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.stopPropagation(); e.preventDefault(); if (onPrimary) onPrimary(); close(); }
  };
  window.addEventListener('keydown', keyHandler, true);
  currentClose = close;
  if (ok) ok.addEventListener('click', () => { if (onPrimary) onPrimary(); close(); });
  if (cancel) cancel.addEventListener('click', () => { if (onSecondary) onSecondary(); close(); });
  const first = ioBody.querySelector('input, textarea, select');
  if (first) setTimeout(() => first.focus(), 30);
}

export function closeIo() {
  if (currentClose) currentClose();
}

export function isIoOpen() { return io.classList.contains('on'); }
