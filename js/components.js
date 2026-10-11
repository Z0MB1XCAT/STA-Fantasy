// Visual building blocks shared by every page: icons, team art, driver and constructor cards.
import { esc, money, nameOf, teamLine } from './ui.js';

/* ------------------------------------------------------------------ icons */
const ICONS = {
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  team: '<path d="M3.5 15.5a8.5 8.5 0 0 1 17 0v2.5a1.5 1.5 0 0 1-1.5 1.5H9.5l-6-3z"/><path d="M11 11.5h9.3"/><path d="M11 11.5v8"/>',
  drivers: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  results: '<path d="M5 21V4"/><path d="M5 4.5c3-1.6 5.5 1.6 8.5 0s5-1.2 6 0v8c-1-1.2-3-1.6-6 0s-5.5-1.6-8.5 0"/>',
  rules: '<path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v15H7a2.5 2.5 0 0 0-2.5 2.5z"/><path d="M4.5 20.5V5.5"/><path d="M8.5 7.5h7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  logout: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  coins: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2.1-.6-2.5-1.5M12 6.5v1.5M12 16v1.5"/>',
  swap: '<path d="M7 7h12l-3-3"/><path d="M17 17H5l3 3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  absent: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0"/><path d="m17 8 4 4m0-4-4 4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  league: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a2.5 2.5 0 0 0 3 4M16 6h3a2.5 2.5 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a2.5 2.5 0 0 0 3 4M16 6h3a2.5 2.5 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  chat: '<path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-8.5L6 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/** Chip artwork (images/chips/<id>.webp, cut from the chip guide by tools/dev/make-chips.mjs). */
export const chipImg = (id, cls = '') => `<img class="chipimg ${cls}" src="images/chips/${id}.webp" alt="" width="128" height="128" loading="lazy" decoding="async">`;

/* --------------------------------------------------------------- team art */
const SILHOUETTE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 115"><g fill="#d4d8e0"><circle cx="20" cy="10" r="7.5"/><path d="M9 22c2-3 6-4 11-4s9 1 11 4l3 30-5 2-1 58h-6l-2-46-2 46h-6l-1-58-5-2z"/></g></svg>');

export function teamOf(S, id) {
  if (S.teamMap.has(id)) return S.teamMap.get(id);
  const d = S.driverMap.get(id);
  return d?.team ? S.teamMap.get(d.team) : null;
}
export const photoOf = (S, code) => teamOf(S, code)?.photos?.[code] || null;
export const teamColor = (S, id) => teamOf(S, id)?.color || '#5a6070';

/** Relative luminance (WCAG) of a #rrggbb colour. */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
/** Team colour plus readable text/logo colours for it (white logos vanish on Haas white or Audi silver). */
export function teamStyle(color) {
  const light = luminance(color) > 0.4;
  return `--team:${color};--on-team:${light ? '#0e0f13' : '#fff'};--logo-filter:${light ? 'brightness(0)' : 'none'}`;
}
export const teamVar = (S, id) => teamStyle(teamColor(S, id));

/** Head-and-shoulders crop of the driver figure in a team-coloured circle. */
export function bust(S, code, cls = '') {
  const src = photoOf(S, code);
  return `<span class="bust ${cls}${src ? '' : ' bust--ghost'}" style="${teamVar(S, code)}"><img src="${src || SILHOUETTE}" alt="" loading="lazy" decoding="async"></span>`;
}
/** Team logo on a team-coloured tile. */
export function tchip(S, teamId, cls = '') {
  const t = S.teamMap.get(teamId);
  return `<span class="tchip ${cls}" style="${teamStyle(t?.color || '#4a5060')}">${t?.logo ? `<img src="${t.logo}" alt="" loading="lazy">` : ''}</span>`;
}
export function carImg(S, teamId, cls = 'carthumb') {
  const t = S.teamMap.get(teamId);
  return t?.car ? `<img class="${cls}" src="${t.car}" alt="" loading="lazy" decoding="async">` : '';
}
/** Small identity block used at the start of list rows: bust for drivers, logo chip for constructors. */
export function ident(S, id, lg = false) {
  return S.driverMap.has(id) ? bust(S, id, lg ? 'bust--lg' : '') : tchip(S, id);
}

/* ------------------------------------------------------ nationality, tracks */
const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
export function countryName(nat) {
  if (!nat) return '';
  if (nat === 'gb-wls') return 'Wales';
  if (nat === 'gb-sct') return 'Scotland';
  if (nat === 'gb-eng') return 'England';
  return regionNames?.of(nat.toUpperCase()) || nat.toUpperCase();
}
/** Small nationality flag for a driver, or nothing if we don't know it yet. */
export function natFlag(S, code) {
  const nat = S.driverMap.get(code)?.nat;
  return nat ? `<img class="nat" src="https://flagcdn.com/w40/${nat}.png" srcset="https://flagcdn.com/w80/${nat}.png 2x" alt="${esc(countryName(nat))}" title="${esc(countryName(nat))}" loading="lazy">` : '';
}
/** "flag Team" line used under driver names. */
export const teamWithFlag = (S, code) => `${natFlag(S, code)}${esc(teamLine(S, code))}`;
export function trackImg(R, cls = 'trackthumb') {
  return R?.track ? `<img class="${cls}" src="${R.track}" alt="" loading="lazy">` : '';
}

export function playerColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 66%)`;
}
export function avatar(name, cls = '') {
  const parts = String(name).trim().split(/\s+/);
  const ini = ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
  return `<span class="avatar ${cls}" aria-hidden="true">${esc(ini)}</span>`;
}

/**
 * F1-Fantasy style driver card.
 * @param opts { price, meta, top, tag ('button'|'div'|'article'), attrs, cls }
 */
export function driverCard(S, code, opts = {}) {
  const t = teamOf(S, code);
  const tag = opts.tag || 'button';
  const src = photoOf(S, code);
  return `<${tag} class="dcard ${opts.cls || ''}" style="${teamVar(S, code)}" ${tag === 'button' ? 'type="button"' : ''} ${opts.attrs || ''}>
    <div class="dcard__art">
      ${t?.logo ? `<img class="dcard__logo" src="${t.logo}" alt=""><img class="dcard__mark" src="${t.logo}" alt="">` : ''}
      <img class="dcard__fig${src ? '' : ' dcard__fig--ghost'}" src="${src || SILHOUETTE}" alt="" loading="lazy" decoding="async">
      <div class="dcard__top">${opts.top || ''}</div>
    </div>
    <div class="dcard__body">
      <div class="dcard__name" style="--len:${Math.max(8, ...nameOf(S, code).split(/\s+/).map(w => w.length))}">${esc(nameOf(S, code))}</div>
      <div class="dcard__team">${teamWithFlag(S, code)}</div>
      <div class="dcard__foot"><span class="dcard__price">${opts.price != null ? money(opts.price) : ''}</span><span class="dcard__meta">${opts.meta || ''}</span></div>
    </div></${tag}>`;
}

/** Constructor card with the car. */
export function constructorCard(S, teamId, opts = {}) {
  const t = S.teamMap.get(teamId);
  const tag = opts.tag || 'button';
  return `<${tag} class="ccard ${opts.cls || ''}" style="${teamStyle(t.color)}" ${tag === 'button' ? 'type="button"' : ''} ${opts.attrs || ''}>
    <div class="ccard__art">
      ${t.logo ? `<img class="ccard__logo" src="${t.logo}" alt="">` : ''}
      ${t.car ? `<img class="ccard__car" src="${t.car}" alt="" loading="lazy" decoding="async">` : ''}
      <div class="ccard__top">${opts.top || ''}</div>
    </div>
    <div class="ccard__body">
      <div class="ccard__name">${esc(t.name)}</div>
      <div class="ccard__sub">${esc(opts.sub ?? 'Constructor')}</div>
      <div class="ccard__foot"><span class="ccard__price">${opts.price != null ? money(opts.price) : ''}</span><span class="ccard__meta">${opts.meta || ''}</span></div>
    </div>
  </${tag}>`;
}

/** F1-style section header (racing stripe + heavy italic title). */
export const shead = (title, aside = '', id = '') =>
  `<div class="shead"><h2 class="shead__title"${id ? ` id="${id}"` : ''}>${title}</h2>${aside ? `<div class="shead__aside">${aside}</div>` : ''}</div>`;

export const ordinal = n => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

export function emptyDriverCard(label, attrs = '') {
  return `<button class="dcard dcard--empty" type="button" ${attrs}><span class="plus" aria-hidden="true">+</span><span>${esc(label)}</span></button>`;
}
export function emptyConstructorCard(label, attrs = '') {
  return `<button class="ccard ccard--empty" type="button" ${attrs}><span class="plus" aria-hidden="true">+</span><span style="font-weight:700">${esc(label)}</span></button>`;
}
