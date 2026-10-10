// Small rendering helpers shared by every page.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const money = x => `$${Number(x).toFixed(1)}M`;
export const signed = n => (n > 0 ? `+${n}` : `${n}`);
export const fmtNum = n => (Math.round(n * 10) / 10).toString();

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function fmtDate(R, short = false) {
  const [y, m, d] = R.date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return short ? `${d} ${MONTHS[m - 1].slice(0, 3)}` : `${DAYS[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
/** "8 pm" in UK time, plus the viewer's own time if they are elsewhere */
export function fmtLock(R) {
  const uk = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).format(R.lockAt).replace(':00', '').replace(' ', ' ');
  const mine = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }).format(R.lockAt);
  const myZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nb = s => s.replace(/ /g, ' ');
  return myZone === 'Europe/London' || myZone === 'Europe/Belfast' ? `${nb(uk)} UK time` : `${nb(uk)} UK time (${nb(mine)} for you)`;
}

/** Country flag image (Windows has no flag emoji); falls back to a code chip if the image fails. */
export function flag(R, size = 'md') {
  const iso = R.iso || 'xx';
  return `<img class="flag flag--${size}" src="https://flagcdn.com/w80/${iso}.png" srcset="https://flagcdn.com/w160/${iso}.png 2x" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;tag&quot;>${iso.toUpperCase()}</span>'">`;
}

export function teamOfDriver(S, d) { return d?.team ? S.teamMap.get(d.team) : null; }
export function colorOf(S, id) {
  if (S.teamMap.has(id)) return S.teamMap.get(id).color;
  const d = S.driverMap.get(id);
  return teamOfDriver(S, d)?.color || '#4a5060';
}
export function nameOf(S, id) {
  return S.driverMap.get(id)?.name || S.teamMap.get(id)?.name || id;
}
export function tag(S, teamId) {
  const t = S.teamMap.get(teamId);
  return t ? `<span class="tag" style="--team:${t.color}">${esc(t.short)}</span>` : '<span class="tag">RES</span>';
}
export function teamLine(S, id) {
  const d = S.driverMap.get(id);
  if (d) return d.team ? S.teamMap.get(d.team).name : 'Reserve';
  return 'Constructor';
}

export function statusBadge(status, label) {
  const text = label || { final: 'Final', provisional: 'Provisional', upcoming: 'Upcoming', open: 'Picks open', locked: 'Locked' }[status] || status;
  return `<span class="badge badge--${status}">${esc(text)}</span>`;
}
/** Small text line under a round chip: Final / Provisional / date. */
export function roundStatus(R) {
  if (R.status === 'final') return '<span class="rchip__st rchip__st--final">Final</span>';
  if (R.status === 'provisional') return '<span class="rchip__st rchip__st--provisional">Provisional</span>';
  return `<span class="rchip__st" style="color:inherit;opacity:.6;font-weight:600">${fmtDate(R, true)}</span>`;
}

export function delta(d) {
  if (!d) return '<span class="faint">0.0</span>';
  return d > 0 ? `<span class="up">▲ ${d.toFixed(1)}</span>` : `<span class="dn">▼ ${Math.abs(d).toFixed(1)}</span>`;
}
export function posBox(n) {
  return `<span class="pos${n <= 3 ? ' pos--' + n : ''}">${n}</span>`;
}

export function loaderHtml() { return '<div class="loader" role="status" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>'; }

let toastTimer;
export function toast(msg, kind = 'ok') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.className = `toast toast--${kind}`;
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

export function countdownParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
export const pad2 = n => String(n).padStart(2, '0');
