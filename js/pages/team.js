import { boot, problemsNotice } from '../shell.js';
import { carry } from '../env.js';
import { absentIn, notRacing } from './common.js';
import { esc, $, money, delta, fmtNum, nameOf, teamLine, statusBadge, fmtDate, fmtLock, toast, flag } from '../ui.js';
import { resolvePlayer, transferInfo, squadValue, assetsOf } from '../engine/squad.js';
import { icon, ident, carImg, driverCard, constructorCard, emptyDriverCard, emptyConstructorCard, teamWithFlag, shead, avatar, bust, tchip } from '../components.js';

const ctx = await boot('team');
const { S, store, now, problems } = ctx;
const app = $('#app');
const phase = S.phase(now);
const R = phase.round;
const cfg = S.cfg;
const me = store.user;

let subs = {};
try { subs = await store.submissions(); } catch (e) { console.warn(e); }

const pageHead = (right = '') => `
  <div class="page-head">
    <div class="row-flex" style="gap:16px;flex-wrap:nowrap;min-width:0">${flag(R, 'lg')}
      <div style="min-width:0"><h1 class="h1">${esc(me?.team || 'My team')}</h1>
        <p class="muted">Round ${R.id}, ${esc(R.name)}. Picks lock ${fmtDate(R)}, ${fmtLock(R)}.</p></div></div>
    <div class="row-flex">${me ? '<button class="btn btn--ghost btn--sm" type="button" data-act="rename">Rename team</button>' : ''}${right}</div>
  </div>`;

function openRename() {
  let dlg = $('#rename');
  if (!dlg) {
    document.body.insertAdjacentHTML('beforeend', `<dialog id="rename" class="floating" aria-labelledby="rn-title"><form class="dialog__in" id="rn-form" novalidate>
      <h2 class="h2" id="rn-title">Rename your team</h2>
      <div class="field"><label for="rn-input">Team name</label><input class="input" id="rn-input" maxlength="30" required></div>
      <p class="error" id="rn-error" role="alert"></p>
      <div class="row-flex" style="justify-content:flex-end"><button class="btn btn--ghost" type="button" id="rn-cancel">Cancel</button><button class="btn btn--red" type="submit">Save name</button></div>
    </form></dialog>`);
    dlg = $('#rename');
    $('#rn-cancel').addEventListener('click', () => dlg.close());
    $('#rn-form').addEventListener('submit', async e => {
      e.preventDefault();
      const name = $('#rn-input').value.trim();
      if (!name) { $('#rn-error').textContent = 'Enter a team name.'; return; }
      try {
        await store.renameTeam(name);
        me.team = name;
        dlg.close();
        toast('Team renamed');
        render();
      } catch (ex) { $('#rn-error').textContent = ex.message; }
    });
  }
  $('#rn-input').value = me.team || '';
  $('#rn-error').textContent = '';
  dlg.showModal();
  $('#rn-input').select();
}

/* ---------------------------------------------------------------- logged out */
if (!me) {
  app.innerHTML = `<div class="stack">${problemsNotice(problems)}
    ${pageHead()}
    <section class="panel panel--raised"><div class="panel__body--pad prose" style="padding-top:22px">
      <h2 class="h2">Log in to pick your team</h2>
      <p class="muted" style="margin-top:10px;max-width:56ch">Choose 5 drivers and 2 constructors within ${money(cfg.budget)}, give one driver the DRS Boost, and save before the deadline. Anyone can join.</p>
      <div class="hero__cta"><button class="btn btn--red" type="button" onclick="openAuth('login')">Log in</button><button class="btn btn--ghost" type="button" onclick="openAuth('join')">Join the league</button></div>
    </div></section>
    <div class="dgrid">${S.drivers.filter(d => d.role === 'regular').sort((a, b) => R.prices[b.code] - R.prices[a.code]).slice(0, 10).map(d => driverCard(S, d.code, { tag: 'div', cls: 'dcard--static', price: R.prices[d.code] })).join('')}</div></div>`;
} else {

/* ------------------------------------------------------------------ state */
const mine = subs[me.id] || {};
const before = resolvePlayer(S, mine, { upTo: R.id - 1 });
const state = before.state;
const prices = R.prices;
const editable = phase.state === 'open';
const out = notRacing(R);   // announced before the deadline as not racing
const saved = mine[R.id] || null;

let draft = saved
  ? { drivers: [...saved.drivers], constructors: [...saved.constructors], drs: saved.drs, chip: saved.chip }
  : state.base
    ? { drivers: [...state.base.drivers], constructors: [...state.base.constructors], drs: state.base.drs, chip: null }
    : { drivers: [], constructors: [], drs: null, chip: null };
let dirty = false;
let tab = 'drivers';
let sort = 'price';
let query = '';

const wealth = () => (state.base ? Math.round((squadValue(state.base, prices) + state.cash) * 10) / 10 : cfg.budget);
const cost = () => Math.round(assetsOf(draft).reduce((a, id) => a + (prices[id] ?? 0), 0) * 10) / 10;
const unlimited = () => draft.chip === 'limitless';

function check() {
  const errs = [];
  const nD = cfg.squad.drivers, nC = cfg.squad.constructors;
  if (draft.drivers.length < nD) errs.push(`Pick ${nD - draft.drivers.length} more driver${nD - draft.drivers.length === 1 ? '' : 's'}`);
  if (draft.constructors.length < nC) errs.push(`Pick ${nC - draft.constructors.length} more constructor${nC - draft.constructors.length === 1 ? '' : 's'}`);
  const left = Math.round((wealth() - cost()) * 10) / 10;
  if (!unlimited() && left < -1e-6) errs.push(`Over budget by ${money(-left)}`);
  if (draft.chip !== 'autopilot' && draft.drivers.length === nD && !draft.drs) errs.push('Tap DRS on one driver to boost them');
  return { errs, left, ti: transferInfo(S, state, R, draft, draft.chip), complete: errs.length === 0 };
}

/* ------------------------------------------------------------------ views */
function costbarView() {
  const c = check();
  const ti = c.ti;
  const w = wealth();
  const used = Math.min(1, cost() / w);
  const over = !unlimited() && c.left < 0;
  const freeTxt = ti.free === Infinity ? 'unlimited' : `${ti.free} free`;
  return `<div class="costbar">
    <div class="costbar__top">
      <div class="costbar__left"><span class="num ${over ? 'dn' : ''}">${unlimited() ? 'No cap' : money(c.left)}</span><small>${unlimited() ? 'Limitless is on this round' : 'Budget left'}</small></div>
      <div class="costbar__chips">
        <span class="kpi">${icon('coins')}Team <b>${money(cost())}</b> of ${money(w)}</span>
        <span class="kpi">${icon('swap')}Transfers <b>${ti.effective}</b> ${freeTxt}</span>
        <span class="kpi ${ti.penalty ? 'bad' : ''}">Penalty <b>${ti.penalty ? '-' + ti.penalty : '0'}</b></span>
        ${draft.chip ? `<span class="kpi">${icon('bolt')}<b>${esc(cfg.chips[draft.chip].name)}</b></span>` : ''}
      </div>
    </div>
    <div class="costbar__track" role="meter" aria-label="Budget used" aria-valuemin="0" aria-valuemax="${w}" aria-valuenow="${cost()}"><div class="costbar__fill${over ? ' over' : ''}" style="transform:scaleX(${unlimited() ? 1 : used})"></div></div>
  </div>`;
}

function squadView() {
  const nD = cfg.squad.drivers, nC = cfg.squad.constructors;
  const dCards = Array.from({ length: nD }, (_, i) => {
    const id = draft.drivers[i];
    if (!id) return editable ? emptyDriverCard('Add driver', 'data-act="tab" data-id="drivers"') : '<div class="dcard dcard--empty dcard--static"><span>Empty</span></div>';
    const s = S.assetSummary(id);
    const top = `${draft.chip !== 'autopilot' ? `<button class="cardbtn" type="button" data-act="drs" data-id="${id}" aria-pressed="${draft.drs === id}" ${editable ? '' : 'disabled'} title="DRS Boost: ${draft.chip === 'extradrs' ? 3 : cfg.drs.multiplier}x points">DRS</button>` : ''}${editable ? `<button class="cardbtn" type="button" data-act="remove" data-id="${id}" aria-label="Remove ${esc(nameOf(S, id))}">${icon('close')}</button>` : ''}`;
    // once this round has results, show the round's points and grey out anyone who didn't turn up;
    // before that, grey out anyone announced as not racing
    const eff = R.scores?.effective[id];
    const meta = eff ? (eff.absent ? 'Absent<br>0 pts' : `${fmtNum(eff.points)} pts<br>this round`)
      : out.has(id) ? 'Not racing<br>this round' : (s.rounds ? `${fmtNum(s.avg)} avg<br>${fmtNum(s.total)} pts` : 'No races yet');
    return driverCard(S, id, { tag: 'div', cls: `dcard--static${draft.drs === id ? ' is-in' : ''}${eff?.absent || out.has(id) ? ' dcard--absent' : ''}`, price: prices[id], top, meta });
  });
  const cCards = Array.from({ length: nC }, (_, i) => {
    const id = draft.constructors[i];
    if (!id) return editable ? emptyConstructorCard('Add constructor', 'data-act="tab" data-id="constructors"') : '<div class="ccard ccard--empty ccard--static">Empty</div>';
    const seats = S.drivers.filter(d => d.team === id && d.role === 'regular').map(d => d.name).join(' and ');
    return constructorCard(S, id, { tag: 'div', cls: 'ccard--static', price: prices[id], sub: seats, top: editable ? `<button class="cardbtn" type="button" data-act="remove" data-id="${id}" aria-label="Remove ${esc(nameOf(S, id))}">${icon('close')}</button>` : '' });
  });
  return `<div class="dgrid dgrid--squad">${dCards.join('')}</div><div class="cgrid" style="margin-top:12px">${cCards.join('')}</div>`;
}

function chipsView() {
  const usedAt = {};
  before.rows.forEach(r => { if (r.chip) usedAt[r.chip] = r.round; });
  return `<div class="chips-row">${Object.entries(cfg.chips).map(([id, ch]) => {
    const used = state.chips.includes(id);
    return `<button class="chipbtn" type="button" data-act="chip" data-id="${id}" aria-pressed="${draft.chip === id}" ${used || !editable ? 'disabled' : ''}>
      <b>${esc(ch.name)}</b><small>${used ? `Used in round ${usedAt[id] ?? '?'}` : esc(ch.desc)}</small></button>`;
  }).join('')}</div>`;
}

function marketRows() {
  const isD = tab === 'drivers';
  let list = isD
    ? S.drivers.filter(d => d.role === 'regular' && !d.retired).map(d => d.code)
    : S.teams.map(t => t.id);
  const q = query.trim().toLowerCase();
  if (q) list = list.filter(id => nameOf(S, id).toLowerCase().includes(q) || teamLine(S, id).toLowerCase().includes(q));
  const sum = id => S.assetSummary(id);
  const by = { price: id => -prices[id], total: id => -sum(id).total, avg: id => -sum(id).avg, name: id => nameOf(S, id).toLowerCase() };
  list.sort((a, b) => (by[sort](a) > by[sort](b) ? 1 : -1));
  const arr = isD ? draft.drivers : draft.constructors;
  const cap = isD ? cfg.squad.drivers : cfg.squad.constructors;
  const c = cost(), w = wealth();
  return list.map(id => {
    const inSquad = arr.includes(id);
    const full = arr.length >= cap;
    const tooPricey = !unlimited() && c + prices[id] > w + 1e-6;
    const blocked = !inSquad && (full || tooPricey);
    const why = inSquad ? `Remove ${nameOf(S, id)}` : full ? `Squad is full, remove a ${isD ? 'driver' : 'constructor'} first` : tooPricey ? 'Not enough budget' : `Add ${nameOf(S, id)}`;
    const s = sum(id);
    const d = S.priceDelta(id);
    return `<div class="row mrow${inSquad ? ' mrow--in' : ''}${blocked ? ' mrow--off' : ''}">
      ${ident(S, id)}
      <div class="who"><b>${esc(nameOf(S, id))}${out.has(id) ? ' <span class="mark mark--dnf">Not racing</span>' : ''}</b>
        <small>${isD ? teamWithFlag(S, id) : esc(teamLine(S, id))}</small></div>
      ${isD ? '' : carImg(S, id)}
      <div class="stats">
        <div class="stat stat--hide-sm"><span class="num">${s.rounds ? fmtNum(s.avg) : '–'}</span><small>Avg</small></div>
        <div class="stat"><span class="num">${money(prices[id])}</span><small>${d ? delta(d) : 'Price'}</small></div>
      </div>
      ${editable ? `<button class="addbtn${inSquad ? ' addbtn--remove' : ''}" type="button" data-act="${inSquad ? 'remove' : 'add'}" data-id="${id}" ${blocked ? 'disabled' : ''} title="${esc(why)}" aria-label="${esc(why)}">${inSquad ? '−' : '+'}</button>` : ''}
    </div>`;
  }).join('') || '<div class="empty">Nothing matches that search.</div>';
}

function saveBarView() {
  const c = check();
  const msg = c.complete
    ? (dirty || !saved ? (state.base && !dirty && !saved ? 'Your last team carries over. Save only if you change it.' : 'Ready to save') : 'Saved. Any changes you make need saving again.')
    : c.errs[0];
  const canSave = editable && c.complete && (dirty || (!saved && !state.base));
  return `<div class="savebar"><span class="${c.complete ? '' : 'dn'}" style="font-weight:600" role="status">${esc(msg)}</span>
    <button class="btn btn--red" type="button" data-act="save" ${canSave ? '' : 'disabled'}>Save team for ${esc(R.name)}</button></div>`;
}

function seasonView() {
  const upTo = Math.max(...S.rounds.filter(r => r.scores).map(r => r.id), 0);
  if (!upTo) return '';
  const res = resolvePlayer(S, mine, { upTo });
  const rows = res.rows.filter(r => r.points || r.issues.length);
  if (!rows.length) return '';
  const scored = res.rows.filter(r => r.points);
  const best = scored.reduce((b, r) => (!b || r.roundTotal > b.roundTotal ? r : b), null);
  const tally = {};
  for (const r of scored) for (const [id, p] of Object.entries(r.points.assets)) tally[id] = (tally[id] || 0) + p;
  const top = ids => ids.sort((a, b) => tally[b] - tally[a])[0];
  const topD = top(Object.keys(tally).filter(id => S.driverMap.has(id)));
  const topC = top(Object.keys(tally).filter(id => S.teamMap.has(id)));
  let free = 0, extra = 0;
  for (const r of res.rows) {
    if (!r.squad) continue;
    const t = r.transfers;
    const ex = t.penalty / cfg.transfers.penaltyPerExtra;
    extra += ex; free += t.effective - ex;
  }
  const chipRound = {};
  res.rows.forEach(r => { if (r.chip) chipRound[r.chip] = r.round; });
  const bestR = best ? S.round(best.round) : null;
  const stats = `<article class="panel mycard">
    <div class="mycard__head">${avatar(me.team || me.name)}<div class="mycard__name">${esc(me.team || me.name)}</div></div>
    <div class="mycard__body">
      <div class="tile" style="text-align:center"><span class="big">${fmtNum(res.total)} pts</span><span class="small muted">${res.provisional ? 'Includes provisional points' : `After ${scored.length} round${scored.length === 1 ? '' : 's'}`}</span></div>
      ${bestR ? `<div class="tile"><small>Best round</small><div class="row-flex" style="gap:8px">${flag(bestR, 'sm')}<span class="small muted">Round ${bestR.id}</span></div>
        <div class="tile__row" style="margin-top:4px"><b class="display" style="font-size:1.05rem">${esc(bestR.name)}</b><b class="num">${fmtNum(best.roundTotal)} pts</b></div></div>` : ''}
      ${topD ? `<div class="tile tile__row"><div><small style="display:block;color:var(--text2);font-weight:600;font-size:.82rem">Top scorers</small><span class="small">${esc(nameOf(S, topD))}${topC ? ` and ${esc(nameOf(S, topC))}` : ''}</span></div><div class="tile__faces">${bust(S, topD)}${topC ? tchip(S, topC) : ''}</div></div>` : ''}
      <div class="xfer"><div class="xfer__labels"><span>Free transfers<b>${free}</b></span><span style="text-align:right">Extra (-${cfg.transfers.penaltyPerExtra} each)<b>${extra}</b></span></div>
        <div class="xfer__bar">${free || extra ? `<span style="flex:${free}"></span><span style="flex:${extra}"></span>` : ''}</div></div>
      <div><small style="display:block;color:var(--text2);font-weight:600;font-size:.82rem;margin-bottom:8px">Chips used</small>
        <div class="chipicons">${Object.entries(cfg.chips).map(([id, ch]) => `<div class="chipicon${chipRound[id] ? ' used' : ''}" title="${esc(ch.name)}${chipRound[id] ? `, played in round ${chipRound[id]}` : ', not used yet'}"><span>${icon(id)}</span>${chipRound[id] ? `Round ${chipRound[id]}` : esc(ch.name)}</div>`).join('')}</div></div>
    </div></article>`;
  return `<section>${shead('Your season', `${fmtNum(res.total)} points`)}
    <div class="cols cols--1-1">${stats}
    <div class="panel"><div class="panel__body" style="padding-top:8px"><div class="tower">${rows.map(r => {
      const rr = S.round(r.round);
      return `<a class="row row--link" href="results.html${carry}#r${rr.id}"><span class="pos">${r.round}</span>${flag(rr, 'md')}
        <div class="who"><b>${esc(rr.name)}</b>
          <small>${absentIn(rr, r.squad)?.size ? `${[...absentIn(rr, r.squad).keys()].map(d => esc(nameOf(S, d))).join(' and ')} didn't race. ` : ''}${r.chip ? esc(cfg.chips[r.chip].name) + ' played. ' : ''}${r.transfers.penalty ? `${r.transfers.effective} transfers, -${r.transfers.penalty} pts. ` : ''}${esc(r.issues.join('. ')) || (rr.status === 'provisional' ? 'Provisional' : 'Final')}</small></div>
        <div class="stat stat--lead"><span class="num">${r.roundTotal == null ? '–' : fmtNum(r.roundTotal)}</span><small>Points</small></div></a>`;
    }).join('')}</div></div></div></div></section>`;
}

const andList = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

function banner() {
  if (phase.state === 'provisional') return `<div class="notice notice--flag"><span class="glyph">P</span><div><b>Waiting on the stewards</b><span class="muted">Round ${R.id} results are provisional. Transfers and new prices open for round ${R.id + 1} once it is marked final.</span></div></div>`;
  if (phase.state === 'locked') return `<div class="notice notice--signal"><span class="glyph">!</span><div><b>Round ${R.id} is locked</b><span class="muted">This is the team you are racing with. Points appear once the results are entered.</span></div></div>`;
  if (out.size) {
    const names = [...out].map(c => esc(nameOf(S, c)));
    return `<div class="notice notice--flag"><span class="glyph">!</span><div><b>Not racing in ${esc(R.name)}: ${andList(names)}</b><span class="muted">${names.length === 1 ? 'They score' : 'They each score'} 0 points this round. If you have ${names.length === 1 ? 'them' : names.length === 2 ? 'either of them' : 'any of them'}, you can swap them out before the deadline. That uses one of your transfers as normal.</span></div></div>`;
  }
  return '';
}

function render() {
  const tabs = `<div class="seg" role="group" aria-label="Market">${['drivers', 'constructors'].map(k => `<button type="button" data-act="tab" data-id="${k}" aria-pressed="${tab === k}">${k === 'drivers' ? 'Drivers' : 'Constructors'}</button>`).join('')}</div>`;
  app.innerHTML = `<div class="stack" style="--gap:18px">
    ${problemsNotice(problems)}
    ${pageHead(statusBadge(phase.state === 'open' ? 'open' : phase.state))}
    ${banner()}
    <div id="costbar">${costbarView()}</div>
    <div class="cols cols--team">
      <div class="stack" style="--gap:28px">
        <section>${shead('Your squad', '<span id="count"></span>')}
          <div class="panel"><div class="panel__body--pad" id="squad" style="padding-top:16px">${squadView()}</div></div></section>
        <section>${shead('Chips', 'One per round, each once a season')}
          <div class="panel"><div class="panel__body--pad" id="chips" style="padding-top:16px">${chipsView()}</div></div></section>
      </div>
      <section class="market-sticky" id="market-panel">${shead(editable ? 'Market' : 'Prices')}
        <div class="panel">
        <div class="panel__head">${tabs}</div>
        <div class="panel__body" style="padding-top:0">
          <div class="row-flex" style="padding:0 6px 8px;flex-wrap:nowrap">
            <div class="field search" style="flex:1 1 auto"><label class="sr-only" for="q">Search</label>${icon('search')}<input class="input" id="q" type="search" placeholder="Search ${tab}" value="${esc(query)}" autocomplete="off"></div>
            <div class="field" style="flex:0 0 auto"><label class="sr-only" for="sort">Sort by</label><select class="select" id="sort"><option value="price">Price</option><option value="total">Season pts</option><option value="avg">Average</option><option value="name">Name</option></select></div>
          </div>
          <div class="tower scroll-y" id="market">${marketRows()}</div>
        </div>
        </div>
      </section>
    </div>
    ${editable ? `<div id="savebar">${saveBarView()}</div>` : ''}
    ${seasonView()}
  </div>`;
  $('#sort').value = sort;
  updateCount();
}

function updateCount() {
  $('#count').textContent = `${draft.drivers.length}/${cfg.squad.drivers} drivers, ${draft.constructors.length}/${cfg.squad.constructors} constructors`;
}

function refresh() {
  $('#costbar').innerHTML = costbarView();
  $('#squad').innerHTML = squadView();
  $('#chips').innerHTML = chipsView();
  $('#market').innerHTML = marketRows();
  const sb = $('#savebar'); if (sb) sb.innerHTML = saveBarView();
  updateCount();
}

/* ----------------------------------------------------------------- events */
async function act(a, id) {
  if (a === 'tab') {
    tab = id; query = '';
    render();
    if (matchMedia('(max-width: 979px)').matches) $('#market-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (a === 'rename') { openRename(); return; }
  if (!editable) return;
  if (a === 'add') {
    const arr = S.driverMap.has(id) ? draft.drivers : draft.constructors;
    if (!arr.includes(id)) arr.push(id);
    dirty = true;
  } else if (a === 'remove') {
    draft.drivers = draft.drivers.filter(x => x !== id);
    draft.constructors = draft.constructors.filter(x => x !== id);
    if (draft.drs === id) draft.drs = null;
    dirty = true;
  } else if (a === 'drs') {
    draft.drs = draft.drs === id ? null : id; dirty = true;
  } else if (a === 'chip') {
    draft.chip = draft.chip === id ? null : id; dirty = true;
  } else if (a === 'save') {
    const c = check();
    if (!c.complete) return;
    const btn = $('[data-act=save]'); btn.disabled = true;
    try {
      await store.save(R.id, { drivers: draft.drivers, constructors: draft.constructors, drs: draft.chip === 'autopilot' ? null : draft.drs, chip: draft.chip });
      mine[R.id] = { ...draft }; subs[me.id] = mine;
      dirty = false;
      toast('Team saved for ' + R.name);
    } catch (e) { toast(e.message, 'bad'); }
  }
  refresh();
}

app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) act(b.dataset.act, b.dataset.id);
});
app.addEventListener('input', e => { if (e.target.id === 'q') { query = e.target.value; $('#market').innerHTML = marketRows(); } });
app.addEventListener('change', e => { if (e.target.id === 'sort') { sort = e.target.value; $('#market').innerHTML = marketRows(); } });
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

render();
}
