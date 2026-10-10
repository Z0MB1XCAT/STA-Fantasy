// Everyone's team, round by round. A round's picks only show once its deadline has passed
// (the database hides them before that), so there is nothing here to copy ahead of time.
import { boot, problemsNotice } from '../shell.js';
import { esc, $, money, fmtNum, fmtDate, fmtLock, nameOf, statusBadge, flag, roundStatus } from '../ui.js';
import { standings, ownership } from '../league.js';
import { lineup, absentIn } from './common.js';
import { icon, avatar, bust, tchip, shead, teamWithFlag, ordinal } from '../components.js';

const { S, store, now, problems } = await boot('league');
const app = $('#app');
const me = store.user;

let players = [], subs = {};
try { [players, subs] = await Promise.all([store.players(), store.submissions()]); } catch (e) { console.warn(e); }

const revealed = S.rounds.filter(r => r.lockAt <= now);
const fromHash = () => Number((location.hash.match(/^#r(\d+)$/) || [])[1]) || null;
let selected = revealed.find(r => r.id === fromHash())?.id ?? revealed.at(-1)?.id ?? null;
let query = '';

/* ------------------------------------------------------------------ data */
function teamsFor(roundId) {
  const R = S.round(roundId);
  const rows = standings(S, players, subs, roundId).map(st => ({ st, row: st.rows.find(r => r.round === roundId) || null }));
  return { R, picked: rows.filter(x => x.row?.squad), missing: rows.filter(x => !x.row?.squad) };
}

/* ------------------------------------------------------------------ views */
function teamCard({ st, row }, R) {
  const p = st.player;
  const mine = p.id === me?.id;
  const pts = row.points?.assets || null;
  const notes = [
    row.chip ? `<span class="badge">${icon('bolt')}${esc(S.cfg.chips[row.chip].name)}</span>` : '',
    row.transfers.penalty ? `<span class="badge badge--bad">-${row.transfers.penalty} transfer penalty</span>` : '',
  ].filter(Boolean).join('');
  return `<article class="panel tcard${mine ? ' tcard--me' : ''}" data-name="${esc(`${p.team || ''} ${p.name}`.toLowerCase())}">
    <header class="tcard__head">
      <span class="tcard__rank${st.rank <= 3 ? ' tcard__rank--top' : ''}" aria-label="${ordinal(st.rank)} place">${st.rank}</span>
      ${avatar(p.team || p.name, `avatar--lg${mine ? ' avatar--me' : ''}`)}
      <div class="who"><b class="tcard__name">${esc(p.team || p.name)}</b><small>${esc(p.name)}${mine ? ', you' : ''}</small></div>
      <div class="tcard__pts"><span class="num">${fmtNum(st.total)}</span><small>${row.roundTotal == null
        ? 'Not scored yet'
        : `<span class="${row.roundTotal < 0 ? 'dn' : ''}">${fmtNum(row.roundTotal)}</span> this round`}</small></div>
    </header>
    <div class="tcard__body">
      ${lineup(S, row.squad, R.prices, pts, absentIn(R, row.squad))}
      <div class="tcard__cons">${row.squad.constructors.map(c => `<div class="tcard__con">${tchip(S, c)}<b>${esc(nameOf(S, c))}</b><span class="num">${pts ? `${fmtNum(pts[c] ?? 0)}` : money(R.prices[c] ?? 0)}</span></div>`).join('')}</div>
      ${notes ? `<div class="tcard__notes">${notes}</div>` : ''}
    </div>
  </article>`;
}

function mostPicked(R, n) {
  const own = ownership(S, players, subs, R.id);
  if (!own) return '';
  const drs = {};
  for (const x of teamsFor(R.id).picked) if (x.row.squad.drs) drs[x.row.squad.drs] = (drs[x.row.squad.drs] || 0) + 1;
  const top = (ids, k) => ids.filter(id => own[id]).sort((a, b) => own[b] - own[a]).slice(0, k);
  const bar = pct => `<span class="pick__bar" aria-hidden="true"><i style="transform:scaleX(${pct / 100})"></i></span>`;
  const rowsOf = ids => ids.map(id => `<div class="row pick">${S.driverMap.has(id) ? bust(S, id) : tchip(S, id)}
      <div class="who"><b>${esc(nameOf(S, id))}</b>${bar(own[id])}</div><span class="num pick__pct">${own[id]}%</span></div>`).join('');
  // only call it a favourite when at least two teams agree
  const favDrs = Object.keys(drs).filter(id => drs[id] > 1).sort((a, b) => drs[b] - drs[a])[0];
  return `<section>${shead('Most picked', `${n} ${n === 1 ? 'team' : 'teams'}`)}
    <div class="panel"><div class="panel__body" style="display:grid;gap:6px;padding-top:6px">
      <div><h3 class="h3 muted pick__h">Drivers</h3><div class="tower">${rowsOf(top(S.drivers.map(d => d.code), 5))}</div></div>
      <div><h3 class="h3 muted pick__h">Constructors</h3><div class="tower">${rowsOf(top(S.teams.map(t => t.id), 3))}</div></div>
      ${favDrs ? `<div><h3 class="h3 muted pick__h">Favourite DRS Boost</h3><div class="tower"><div class="row pick">${bust(S, favDrs)}
        <div class="who"><b>${esc(nameOf(S, favDrs))}</b><small>${teamWithFlag(S, favDrs)}</small></div><span class="num pick__pct">${drs[favDrs]} of ${n}</span></div></div></div>` : ''}
    </div></div></section>`;
}

function strip() {
  return `<nav class="rounds-strip" aria-label="Rounds">${revealed.map(r => `
    <a class="rchip" href="#r${r.id}" ${r.id === selected ? 'aria-current="true"' : ''}>
      <small>${flag(r, 'sm')}Round ${r.id}</small><b>${esc(r.name)}</b>${r.status === 'upcoming' ? '<span class="rchip__st" style="color:inherit;opacity:.6;font-weight:600">Locked</span>' : roundStatus(r)}</a>`).join('')}</nav>`;
}

function grid(picked, R) {
  const q = query.trim().toLowerCase();
  const list = q ? picked.filter(x => `${x.st.player.team || ''} ${x.st.player.name}`.toLowerCase().includes(q)) : picked;
  if (!list.length) return `<div class="panel"><div class="empty"><span class="display">No team matches "${esc(query)}"</span>Search by team name or player name.</div></div>`;
  return `<div class="tgrid">${list.map(x => teamCard(x, R)).join('')}</div>`;
}

function before() {
  const first = S.rounds[0];
  const names = players.map(p => `<span class="pchip">${avatar(p.team || p.name)}${esc(p.team || p.name)}</span>`).join('');
  return `<div class="stack" style="--gap:18px">
    ${problemsNotice(problems)}
    <div class="page-head"><div><h1 class="h1">League</h1><p class="muted">Everyone's team, round by round.</p></div></div>
    <section class="panel"><div class="empty">
      <span class="display">Teams stay secret until the first deadline</span>
      Picks for round 1, ${esc(first.name)}, lock ${fmtDate(first)}, ${fmtLock(first)}. Every team shows up here after that.
      ${me ? '' : '<p style="margin-top:16px"><button class="btn btn--red" type="button" onclick="openAuth(\'join\')">Join the league</button></p>'}
    </div></section>
    ${players.length ? `<section>${shead('In the league', `${players.length} ${players.length === 1 ? 'player' : 'players'}`)}<div class="pchips">${names}</div></section>` : ''}
  </div>`;
}

function render() {
  if (!selected) { app.innerHTML = before(); return; }
  const { R, picked, missing } = teamsFor(selected);
  const lede = R.scores
    ? `Every team for round ${R.id}, ${esc(R.name)}, ranked by total points after that round.`
    : `Every team for round ${R.id}, ${esc(R.name)}. Points appear once the results are in.`;
  app.innerHTML = `<div class="stack" style="--gap:18px">
    ${problemsNotice(problems)}
    ${revealed.length > 1 ? strip() : ''}
    <div class="page-head">
      <div><h1 class="h1">League</h1><p class="muted">${lede}</p>${R.status !== 'upcoming' ? `<div style="margin-top:10px">${statusBadge(R.status)}</div>` : ''}</div>
      ${picked.length > 1 ? `<div class="field search league__search"><label class="sr-only" for="q">Find a team</label>${icon('search')}<input class="input" id="q" type="search" placeholder="Find a team or player" value="${esc(query)}" autocomplete="off"></div>` : ''}
    </div>
    ${picked.length ? `<div class="cols cols--2-1">
      <div class="stack" style="--gap:14px">
        <div id="grid">${grid(picked, R)}</div>
        ${missing.length ? `<p class="muted small">No team for this round: ${missing.map(x => esc(x.st.player.team || x.st.player.name)).join(', ')}.</p>` : ''}
      </div>
      <div class="stack" style="--gap:28px">${mostPicked(R, picked.length)}</div>
    </div>` : `<section class="panel"><div class="empty"><span class="display">Nobody picked a team for this round</span>Teams saved for later rounds show up once those deadlines pass.</div></section>`}
  </div>`;
  $('.rchip[aria-current=true]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

app.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  query = e.target.value;
  const { R, picked } = teamsFor(selected);
  $('#grid').innerHTML = grid(picked, R);
});
addEventListener('hashchange', () => {
  const id = fromHash();
  if (id && revealed.some(r => r.id === id)) { selected = id; query = ''; render(); }
});
render();
