import { boot, problemsNotice } from '../shell.js';
import { esc, $, money, delta, fmtNum, nameOf, teamLine, statusBadge } from '../ui.js';
import { ownership } from '../league.js';
import { notRacing } from './common.js';
import { icon, driverCard, constructorCard, bust, photoOf, teamOf, teamVar, natFlag, countryName } from '../components.js';

const { S, store, now, problems } = await boot('drivers');
const app = $('#app');
const phase = S.phase(now);
const R = phase.round;
const out = notRacing(R);

let players = [], subs = {};
try { [players, subs] = await Promise.all([store.players(), store.submissions()]); } catch (e) { console.warn(e); }
const ownRound = phase.state === 'open' ? R.id - 1 : R.id;           // picks stay hidden until the deadline
const own = ownRound >= 1 && S.rounds.some(r => r.id === ownRound && r.lockAt <= now) ? ownership(S, players, subs, ownRound) : null;

let tab = 'drivers', sort = 'price', query = '';
const prices = R.prices;

function ids() {
  let list = tab === 'drivers' ? S.drivers.filter(d => d.role === 'regular' && !d.retired).map(d => d.code) : S.teams.map(t => t.id);
  const q = query.trim().toLowerCase();
  if (q) list = list.filter(id => nameOf(S, id).toLowerCase().includes(q) || teamLine(S, id).toLowerCase().includes(q));
  const sum = id => S.assetSummary(id);
  const by = { price: id => -prices[id], total: id => -sum(id).total, avg: id => -sum(id).avg, last: id => -(sum(id).last ?? -1e9), own: id => -(own?.[id] ?? 0), name: id => nameOf(S, id).toLowerCase() };
  return list.sort((a, b) => (by[sort](a) > by[sort](b) ? 1 : by[sort](a) < by[sort](b) ? -1 : 0));
}

const movePill = id => {
  const d = S.priceDelta(id);
  return d ? `<span class="mark ${d > 0 ? 'mark--up' : 'mark--down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}</span>` : '';
};
const ownPill = id => (own ? `<span class="mark mark--glass">${own[id] ?? 0}% owned</span>` : '');

function grid() {
  const list = ids();
  if (!list.length) return '<div class="empty"><span class="display">No matches</span>Try a different name or team.</div>';
  if (tab === 'drivers') {
    return `<div class="dgrid">${list.map(id => {
      const s = S.assetSummary(id);
      return driverCard(S, id, {
        price: prices[id],
        top: `${out.has(id) ? '<span class="mark mark--dnf">Not racing</span>' : ''}${movePill(id)}`,
        meta: s.rounds ? `${fmtNum(s.avg)} avg<br>${fmtNum(s.total)} pts` : 'No races yet',
        attrs: `data-open="${id}" aria-label="${esc(nameOf(S, id))}, ${money(prices[id])}. Show details"`,
      });
    }).join('')}</div>`;
  }
  return `<div class="cgrid">${list.map(id => {
    const s = S.assetSummary(id);
    const seats = S.drivers.filter(d => d.team === id && d.role === 'regular').map(d => d.name).join(' and ');
    return constructorCard(S, id, { price: prices[id], sub: seats, top: `${movePill(id)}${ownPill(id)}`, meta: s.rounds ? `${fmtNum(s.avg)} avg, ${fmtNum(s.total)} pts` : '', attrs: `data-open="${id}" aria-label="${esc(nameOf(S, id))}. Show details"` });
  }).join('')}</div>`;
}

/* ------------------------------------------------------------ detail sheet */
function sheetHtml(id) {
  const isD = S.driverMap.has(id);
  const t = teamOf(S, id);
  const s = S.assetSummary(id);
  const d = S.priceDelta(id);
  const log = s.log;
  const cells = S.rounds.filter(r => r.scores).map(r => ({ r, l: log.find(x => x.round === r.id) }));
  const maxAbs = Math.max(10, ...cells.map(c => Math.abs(c.l?.pts ?? 0)));
  const seats = isD ? [] : S.drivers.filter(x => x.team === id && x.role === 'regular');
  return `<div class="sheet__scroll">
    <div class="sheet__hero" style="${teamVar(S, id)}">
      ${t?.logo ? `<img class="dcard__logo" src="${t.logo}" alt="" style="width:32px;height:32px;top:18px;left:20px">` : ''}
      ${isD ? (photoOf(S, id) ? `<img class="dcard__fig" src="${photoOf(S, id)}" alt="">` : '') : (t?.car ? `<img class="ccard__car" src="${t.car}" alt="">` : '')}
      <button class="btn btn--ghost btn--icon sheet__close" type="button" data-close aria-label="Close">${icon('close')}</button>
      <div style="position:relative;z-index:2">
        <div class="dcard__team" style="font-size:.85rem">${isD ? natFlag(S, id) : ''}${esc(teamLine(S, id))}${isD && S.driverMap.get(id).nat ? `, ${esc(countryName(S.driverMap.get(id).nat))}` : ''}${isD && S.driverMap.get(id).simgrid ? `. ${esc(S.driverMap.get(id).simgrid)} on SimGrid` : ''}</div>
        <h2 class="h1" style="color:#fff;margin-top:4px">${esc(nameOf(S, id))}</h2>
      </div>
    </div>
    <div class="sheet__stats">
      <div><span class="num">${money(prices[id])}</span><small>${d ? delta(d) : 'Price'}</small></div>
      <div><span class="num">${s.rounds ? fmtNum(s.total) : '–'}</span><small>Season points</small></div>
      <div><span class="num">${s.rounds ? fmtNum(s.avg) : '–'}</span><small>Per race</small></div>
      <div><span class="num">${own ? (own[id] ?? 0) + '%' : '–'}</span><small>Owned</small></div>
    </div>
    <div class="panel__body--pad stack" style="--gap:14px;padding-top:14px">
      <h3 class="h3">Points by round</h3>
      ${cells.length ? `<div class="spark" style="${teamVar(S, id)}" aria-hidden="true">${cells.map(c => `<i class="${(c.l?.pts ?? 0) < 0 ? 'neg' : ''}" style="height:${c.l ? Math.max(4, Math.round(Math.abs(c.l.pts) / maxAbs * 64)) : 3}px;opacity:${c.l?.raced === false ? .3 : 1}"></i>`).join('')}</div>
      <div class="tower">${cells.map(c => `<div class="row" style="min-height:44px"><span class="pos">${c.r.id}</span><div class="who"><b>${esc(c.r.name)}</b><small>${c.r.status === 'provisional' ? 'Provisional, ' : ''}price then ${money(c.r.prices[id])}</small></div>
        <div class="stat"><span class="num ${(c.l?.pts ?? 0) < 0 ? 'dn' : ''}">${c.l ? (c.l.raced ? fmtNum(c.l.pts) : 'Absent') : '–'}</span><small>Points</small></div></div>`).join('')}</div>`
      : '<p class="muted">No races yet. Points appear here after round 1.</p>'}
      ${seats.length ? `<h3 class="h3">Drivers</h3><div class="tower">${seats.map(x => `<div class="row">${bust(S, x.code)}<div class="who"><b>${esc(x.name)}</b><small>${money(prices[x.code])}</small></div></div>`).join('')}</div>` : ''}
    </div></div>`;
}

function openSheet(id) {
  const dlg = $('#sheet');
  dlg.innerHTML = sheetHtml(id);
  dlg.showModal();
}

function render() {
  app.innerHTML = `<div class="stack" style="--gap:18px">
    ${problemsNotice(problems)}
    <div class="page-head"><div><h1 class="h1">${tab === 'drivers' ? 'Drivers' : 'Constructors'}</h1>
      <p class="muted">Prices for round ${R.id}, ${esc(R.name)}. Tap a card for round-by-round points.</p></div>
      ${statusBadge(R.priceStatus === 'final' ? 'final' : 'provisional', R.priceStatus === 'final' ? 'Prices are final' : 'Prices are projected')}</div>
    <div class="row-flex spread">
      <div class="seg" role="group" aria-label="Market">${['drivers', 'constructors'].map(k => `<button type="button" data-tab="${k}" aria-pressed="${tab === k}">${k === 'drivers' ? 'Drivers' : 'Constructors'}</button>`).join('')}</div>
      <div class="row-flex" style="flex-wrap:nowrap">
        <div class="field search"><label class="sr-only" for="q">Search</label>${icon('search')}<input class="input" id="q" type="search" placeholder="Search" value="${esc(query)}" autocomplete="off" style="min-height:42px;width:min(220px,44vw)"></div>
        <div class="field"><label class="sr-only" for="sort">Sort by</label><select class="select" id="sort" style="min-height:42px"><option value="price">Price</option><option value="total">Season points</option><option value="avg">Average</option><option value="last">Last round</option><option value="own">Ownership</option><option value="name">Name</option></select></div>
      </div>
    </div>
    <div id="grid">${grid()}</div>
  </div>
  <dialog class="sheet" id="sheet" aria-label="Details"></dialog>`;
  $('#sort').value = sort;
}

app.addEventListener('click', e => {
  const tb = e.target.closest('[data-tab]');
  if (tb) { tab = tb.dataset.tab; query = ''; render(); return; }
  const card = e.target.closest('[data-open]');
  if (card) { openSheet(card.dataset.open); return; }
  const dlg = $('#sheet');
  if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
});
app.addEventListener('input', e => { if (e.target.id === 'q') { query = e.target.value; $('#grid').innerHTML = grid(); } });
app.addEventListener('change', e => { if (e.target.id === 'sort') { sort = e.target.value; $('#grid').innerHTML = grid(); } });
render();
