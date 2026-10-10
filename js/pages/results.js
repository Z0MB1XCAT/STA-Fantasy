import { boot, problemsNotice } from '../shell.js';
import { esc, $, money, fmtNum, signed, fmtDate, fmtLock, nameOf, teamLine, statusBadge, posBox, flag, roundStatus } from '../ui.js';
import { sessionTable } from '../engine/scoring.js';
import { bust, tchip, carImg, ident, photoOf, teamVar, teamWithFlag, trackImg } from '../components.js';

const { S, now, problems } = await boot('results');
const app = $('#app');
const phase = S.phase(now);

const latestScored = [...S.rounds].reverse().find(r => r.scores);
let selected = Number((location.hash.match(/^#r(\d+)$/) || [])[1]) || (latestScored ? latestScored.id : phase.round.id);
let tab = 'feature';

const BAND = { great: 'Great round', good: 'Good round', poor: 'Poor round', terrible: 'Rough round' };
const partsText = parts => parts.map(p => `${p.label} ${signed(p.pts)}`).join(', ');
const standInFor = (R, code) => Object.entries(R.file?.seatMap || {}).find(([, v]) => v === code)?.[0] || null;

function podium(rows, unit = 'pts') {
  const top = rows.filter(r => !r.mark).slice(0, 3);
  if (top.length < 3) return '';
  const spot = (r, place) => `<div class="podium__spot podium__spot--${place}" style="${teamVar(S, r.code)}">
      ${photoOf(S, r.code) ? `<img class="podium__fig" src="${photoOf(S, r.code)}" alt="">` : ''}
      <div class="podium__block"><div class="podium__pos">P${place}</div><div class="podium__name">${esc(nameOf(S, r.code))}</div><div class="podium__pts">${fmtNum(r.pts)} ${unit}</div></div></div>`;
  return `<div class="podium" aria-label="Podium">${spot(top[1], 2)}${spot(top[0], 1)}${spot(top[2], 3)}</div>`;
}

function sessionView(R, session) {
  const rows = sessionTable(R.file, R.scores, session);
  if (!rows.length) return '<div class="empty"><span class="display">Not entered yet</span>This session has no results in the round file.</div>';
  const fl = R.file.fastest?.[session];
  return `${podium(rows)}<div class="tower" style="margin-top:8px">${rows.map(r => {
    const sFor = standInFor(R, r.code);
    const marks = `${r.mark ? `<span class="mark mark--${r.mark}">${r.mark.toUpperCase()}</span> ` : ''}${fl === r.code ? '<span class="mark mark--fl" title="Fastest lap">Fastest lap</span> ' : ''}${sFor ? `<span class="mark">For ${esc(nameOf(S, sFor))}</span>` : ''}`;
    const gridInfo = session === 'quali' ? '' : (r.grid != null ? `From P${r.grid}` : '');
    return `<div class="row">
      ${posBox(r.pos)}${bust(S, r.code)}
      <div class="who"><b>${esc(nameOf(S, r.code))} ${marks}</b>
        <small>${teamWithFlag(S, r.code)}${gridInfo ? `, ${gridInfo}` : ''}${r.parts.length ? `. ${esc(partsText(r.parts))}` : ''}</small></div>
      ${S.driverMap.get(r.code)?.team ? tchip(S, S.driverMap.get(r.code).team, 'tchip--sm') : ''}
      <div class="stat stat--lead"><span class="num ${r.pts < 0 ? 'dn' : ''}">${fmtNum(r.pts)}</span><small>Pts</small></div></div>`;
  }).join('')}</div>${notRacing(R)}`;
}

function notRacing(R) {
  const absent = S.drivers.filter(d => d.role === 'regular' && !R.scores.drivers[d.code].raced);
  if (!absent.length) return '';
  return `<p class="muted small" style="padding:14px 10px 4px">Not racing: ${absent.map(d => { const s = R.file.seatMap?.[d.code]; return esc(d.name) + (s ? ` (stand-in ${esc(nameOf(S, s))})` : ''); }).join(', ')}. Owners of an absent driver score the stand-in's points, or 0 with no penalty if there was none.</p>`;
}

function fantasyView(R) {
  const list = S.drivers.map(d => ({ d, own: R.scores.drivers[d.code], eff: R.scores.effective[d.code] }))
    .filter(x => x.own.raced || x.eff.via || x.d.role === 'regular')
    .sort((a, b) => b.eff.points - a.eff.points);
  const top = list.slice(0, 3).map(x => ({ code: x.d.code, pts: x.eff.points, mark: null }));
  return `${podium(top)}<div class="tower" style="margin-top:8px">${list.map((x, i) => {
    const s = x.own.sessions;
    const cell = (k, label) => `<div class="stat stat--hide-sm"><span class="num">${s[k] ? fmtNum(s[k].pts) : '–'}</span><small>${label}</small></div>`;
    return `<div class="row">${posBox(i + 1)}${bust(S, x.d.code)}
      <div class="who"><b>${esc(x.d.name)}${x.eff.via ? ` <span class="mark">Via ${esc(nameOf(S, x.eff.via))}</span>` : ''}${!x.own.raced && !x.eff.via ? ' <span class="mark">Absent</span>' : ''}</b><small>${esc(teamLine(S, x.d.code))}</small></div>
      <div class="stats">${cell('quali', 'Quali')}${cell('reverse', 'Reverse')}${cell('feature', 'Feature')}<div class="stat stat--lead"><span class="num ${x.eff.points < 0 ? 'dn' : ''}">${fmtNum(x.eff.points)}</span><small>Total</small></div></div></div>`;
  }).join('')}</div>`;
}

function constructorsView(R) {
  const list = S.teams.map(t => R.scores.constructors[t.id]).sort((a, b) => b.total - a.total);
  return `<div class="tower">${list.map((c, i) => `
    <div class="row">${posBox(i + 1)}${tchip(S, c.id)}
      <div class="who"><b>${esc(nameOf(S, c.id))}</b><small>${c.seats.map(s => esc(nameOf(S, s))).join(' and ')}${c.bonus ? `, both in the points +${c.bonus}` : ''}</small></div>
      ${carImg(S, c.id)}
      <div class="stats">
        <div class="stat stat--hide-sm"><span class="num">${fmtNum(c.sessions.quali)}</span><small>Quali</small></div>
        <div class="stat stat--hide-sm"><span class="num">${fmtNum(c.sessions.reverse)}</span><small>Reverse</small></div>
        <div class="stat stat--hide-sm"><span class="num">${fmtNum(c.sessions.feature)}</span><small>Feature</small></div>
        <div class="stat stat--lead"><span class="num ${c.total < 0 ? 'dn' : ''}">${fmtNum(c.total)}</span><small>Total</small></div></div></div>`).join('')}</div>`;
}

function pricesView(R) {
  if (!R.moves) return '<div class="empty"><span class="display">No price moves</span>Prices change once a round has results.</div>';
  const idx = S.rounds.indexOf(R);
  const next = S.rounds[idx + 1];
  const rows = Object.entries(R.moves).map(([id, m]) => ({ id, ...m, from: R.prices[id] })).sort((a, b) => b.delta - a.delta);
  const label = R.status === 'final' ? 'Applied for the next round' : 'Projected: these become final when the round is marked final';
  return `<p class="muted small" style="padding:0 10px 10px">${label}.${next ? ` Next up: round ${next.id}, ${esc(next.name)}.` : ''}</p>
    <div class="tower">${rows.map(r => `
      <div class="row">${ident(S, r.id)}
        <div class="who"><b>${esc(nameOf(S, r.id))}</b><small>${esc(teamLine(S, r.id))}. ${BAND[r.band]}, ${r.ppm.toFixed(2)} pts per $M</small></div>
        <div class="stats"><div class="stat"><span class="num">${money(r.price)}</span><small>${r.delta > 0 ? `<span class="up">▲ ${r.delta.toFixed(1)}</span>` : r.delta < 0 ? `<span class="dn">▼ ${Math.abs(r.delta).toFixed(1)}</span>` : 'No change'} from ${money(r.from)}</small></div></div></div>`).join('')}</div>`;
}

function strip() {
  return `<nav class="rounds-strip" aria-label="Rounds">${S.rounds.map(r => `
    <a class="rchip" href="#r${r.id}" ${r.id === selected ? 'aria-current="true"' : ''}>
      <small>${flag(r, 'sm')}Round ${r.id}</small><b>${esc(r.name)}</b>${roundStatus(r)}</a>`).join('')}</nav>`;
}

function body(R) {
  if (R.error) return `<div class="notice notice--signal"><span class="glyph">!</span><div><b>This round's results file has a problem</b><span class="muted">${R.error.map(esc).join('<br>')}</span></div></div>`;
  if (!R.scores) {
    const out = Object.entries(R.file?.out || {});
    return `<section class="panel"><div class="empty"><span class="display">${R.id === phase.round.id && phase.state === 'open' ? 'Picks are open' : 'No results yet'}</span>
      Results appear here after the races${R.id === phase.round.id ? `. Picks lock ${fmtDate(R)}, ${fmtLock(R)}` : ''}.</div>
      ${out.length ? `<div class="panel__body--pad"><div class="notice notice--flag"><span class="glyph">!</span><div><b>Driver changes</b><span class="muted">${out.map(([a, b]) => `${esc(nameOf(S, a))} is out and ${esc(nameOf(S, b))} drives their seat.`).join('<br>')}</span></div></div></div>` : ''}</section>`;
  }
  const tabs = [['quali', 'Short Quali'], ['reverse', 'Reverse Grid'], ['feature', 'Feature Race'], ['fantasy', 'Fantasy points'], ['constructors', 'Constructors'], ['prices', 'Prices']];
  const view = ['quali', 'reverse', 'feature'].includes(tab) ? sessionView(R, tab) : tab === 'fantasy' ? fantasyView(R) : tab === 'constructors' ? constructorsView(R) : pricesView(R);
  return `${R.status === 'provisional' ? '<div class="notice notice--flag"><span class="glyph">P</span><div><b>Provisional results</b><span class="muted">The stewards can still change these until Sunday. Points, prices and the standings update when the round is marked final.</span></div></div>' : ''}
    <section class="panel"><div class="panel__head"><div class="seg" role="group" aria-label="Result views">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>
      ${R.file.notes ? `<span class="muted small">${esc(R.file.notes)}</span>` : ''}</div>
      <div class="panel__body">${view}</div></section>`;
}

function render() {
  const R = S.round(selected) || S.rounds[0];
  app.innerHTML = `<div class="stack" style="--gap:18px">
    ${problemsNotice(problems)}
    ${strip()}
    <div class="page-head"><div class="row-flex" style="gap:16px;flex-wrap:nowrap">${flag(R, 'lg')}<div><h1 class="h1">${esc(R.name)}</h1><p class="muted">Round ${R.id}, ${fmtDate(R)}, ${fmtLock(R)}</p><div style="margin-top:10px">${statusBadge(R.status)}</div></div></div>${R.track ? `<div class="circuit">${trackImg(R, '')}</div>` : ''}</div>
    ${body(R)}</div>`;
  $('.rchip[aria-current=true]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

app.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
addEventListener('hashchange', () => { const m = location.hash.match(/^#r(\d+)$/); if (m) { selected = Number(m[1]); render(); } });
render();
