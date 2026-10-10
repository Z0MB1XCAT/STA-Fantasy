import { boot, problemsNotice, contactLink } from '../shell.js';
import { carry } from '../env.js';
import { esc, $, fmtDate, fmtLock, statusBadge, countdownParts, pad2, money, delta, nameOf, flag, fmtNum } from '../ui.js';
import { standings } from '../league.js';
import { resolvePlayer } from '../engine/squad.js';
import { leaderboardRows, squadRows, lineup, rivalSheet, absentIn } from './common.js';
import { icon, bust, tchip, teamOf, teamWithFlag, trackImg, shead, avatar, ordinal } from '../components.js';

const ctx = await boot('home');
const { S, store, now, problems } = ctx;
const app = $('#app');
const q = carry;

let players = [], subs = {};
try { [players, subs] = await Promise.all([store.players(), store.submissions()]); } catch (e) { console.warn(e); }

const phase = S.phase(now);
const R = phase.round;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const me = store.user;
const mine = me ? resolvePlayer(S, subs[me.id] || {}, { upTo: R.id }) : null;
const myRow = mine?.rows.find(r => r.round === R.id) || null;
const scoredRounds = S.rounds.filter(r => r.scores);
const lastScored = scoredRounds.at(-1) || null;

/* ------------------------------------------------------------------ hero */
function litCount() {
  if (phase.state === 'locked') return 5;
  if (phase.state !== 'open') return 0;
  const h = (R.lockAt - now) / 3600e3;
  return h <= 1 / 6 ? 5 : h <= 1 ? 4 : h <= 3 ? 3 : h <= 12 ? 2 : h <= 24 ? 1 : 0;
}

function heroCopy() {
  switch (phase.state) {
    case 'open': return { lead: 'Picks lock when Short Quali starts', sub: `${fmtDate(R)}, ${fmtLock(R)}.`, label: 'Team lock deadline' };
    case 'locked': return { lead: 'Picks are locked', sub: 'Racing is under way. Points appear once the results are in.', label: 'Picks locked', state: 'Results after the races' };
    case 'provisional': return { lead: 'Results are in, waiting on the stewards', sub: 'Points are provisional until the round is final. Transfers and new prices open then.', label: 'Provisional', state: 'Final results on Sunday' };
    default: return { lead: 'Season complete', sub: 'Every round is final.', label: 'Season complete', state: 'See you next season' };
  }
}

// whose car launches: your DRS driver's team, otherwise a different team each round
const heroTeam = (myRow?.squad && teamOf(S, myRow.squad.drs || myRow.squad.drivers[0])) || S.teams[(R.id - 1) % S.teams.length];

function heroHtml() {
  const c = heroCopy();
  const inner = phase.state === 'open'
    ? `<div class="clock" id="clock" aria-label="Time until picks lock">
        <div><span class="num" data-k="d">00</span><small>days</small></div><span class="sep" aria-hidden="true">:</span>
        <div><span class="num" data-k="h">00</span><small>hrs</small></div><span class="sep" aria-hidden="true">:</span>
        <div><span class="num" data-k="m">00</span><small>mins</small></div><span class="sep" aria-hidden="true">:</span>
        <div><span class="num" data-k="s">00</span><small>secs</small></div>
      </div>`
    : `<span class="display" style="font-size:clamp(1.2rem,3vw,1.6rem)">${c.state}</span>`;
  const cta = phase.state === 'open'
    ? `<a class="btn btn--red" href="team.html${q}">${myRow?.squad ? 'Manage your team' : 'Pick your team'}${icon('chevron')}</a>`
    : `<a class="btn btn--light" href="results.html${q}#r${R.id}">See the results${icon('chevron')}</a>`;
  return `
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero__grid">
      <div class="hero__text">
        <div class="hero__where">${flag(R, 'lg')}<span>Round ${R.id} of ${S.rounds.length}</span></div>
        <h1 class="h-hero hero__name" id="hero-title" style="--chars:${Math.max(...R.name.split(/\s+/).map(w => w.length))}">${esc(R.name)}</h1>
        <p class="hero__lede"><b>${c.lead}.</b> ${c.sub}</p>
        <div class="hero__cta">${cta}<a class="btn btn--ghost" href="rules.html${q}">How it works</a></div>
      </div>
      <div>
        <div class="gantry" id="gantry" aria-hidden="true">${'<span class="light"></span>'.repeat(5)}</div>
        <div class="deadline"><span class="deadline__label">${c.label}</span>${inner}</div>
      </div>
    </div>
    ${trackImg(R, 'hero__track')}
    ${heroTeam?.car ? `<img class="launch" id="launch" src="${heroTeam.car}" alt="">` : ''}
  </section>`;
}

function runLights() {
  const lights = [...document.querySelectorAll('#gantry .light')];
  const car = $('#launch');
  const final = litCount();
  const settle = () => lights.forEach((l, i) => l.classList.toggle('on', i < final));
  if (reduced) return settle();
  lights.forEach((l, i) => setTimeout(() => l.classList.add('on'), 300 + i * 320));
  const out = 300 + 5 * 320 + 650;                         // ...and it's lights out
  setTimeout(() => { lights.forEach(l => l.classList.remove('on')); car?.classList.add('go'); }, out);
  setTimeout(() => {
    if (!car) return;
    car.classList.remove('go'); car.classList.add('back');
    requestAnimationFrame(() => requestAnimationFrame(() => { car.classList.remove('back'); car.classList.add('settle'); }));
  }, out + 1250);
  setTimeout(settle, out + 1500);
}

const t0 = performance.now();
function tick() {
  const el = $('#clock');
  if (!el) return;
  const t = countdownParts(R.lockAt - new Date(now.getTime() + (performance.now() - t0)));
  for (const k of ['d', 'h', 'm', 's']) el.querySelector(`[data-k=${k}]`).textContent = pad2(t[k]);
}

/* ----------------------------------------------------------- your last round */
function lastRoundSection() {
  if (!me || !lastScored) return '';
  const res = resolvePlayer(S, subs[me.id] || {}, { upTo: lastScored.id });
  const row = res.rows.find(r => r.round === lastScored.id);
  if (!row?.points) return '';
  const rankNow = standings(S, players, subs, lastScored.id).find(x => x.player.id === me.id)?.rank;
  const prev = scoredRounds.at(-2);
  const rankBefore = prev ? standings(S, players, subs, prev.id).find(x => x.player.id === me.id)?.rank : null;
  const move = rankBefore && rankNow ? rankBefore - rankNow : 0;
  const best = ids => ids.reduce((b, id) => (row.points.assets[id] ?? -1e9) > (row.points.assets[b] ?? -1e9) ? id : b, ids[0]);
  const topD = best(row.squad.drivers), topC = best(row.squad.constructors);
  const moveTxt = !rankNow ? '' : move > 0 ? `<span class="up">Up ${move}, now ${ordinal(rankNow)}</span>` : move < 0 ? `<span class="dn">Down ${-move}, now ${ordinal(rankNow)}</span>` : `<span class="muted">${ordinal(rankNow)} overall</span>`;
  return `<section aria-labelledby="last-h">
    ${shead('Your last round', `${flag(lastScored, 'sm')}`, 'last-h').replace('<div class="shead__aside">', `<div class="shead__aside row-flex" style="gap:8px">${esc(lastScored.name)}`)}
    <article class="panel mycard">
      <div class="mycard__head">${avatar(me.team || me.name)}<div><div class="mycard__name">${esc(me.team || me.name)}</div><div class="muted small">${lastScored.status === 'provisional' ? 'Provisional points' : 'Final points'}</div></div></div>
      <div class="mycard__body">
        <div class="tiles">
          <div class="tile"><small>Round points</small><span class="big">${fmtNum(row.roundTotal)}</span><span class="small">${moveTxt}</span></div>
          <div class="tile"><small>Chip used</small><b class="display" style="font-size:1rem">${row.chip ? esc(S.cfg.chips[row.chip].name) : 'None'}</b>${row.transfers.penalty ? `<span class="small dn" style="display:block;margin-top:6px">-${row.transfers.penalty} transfer penalty</span>` : ''}</div>
        </div>
        <div class="tile tile__row"><div><small style="display:block;color:var(--text2);font-weight:600;font-size:.82rem">Top scorers</small><span class="small">${esc(nameOf(S, topD))} ${fmtNum(row.points.assets[topD])} pts, ${esc(nameOf(S, topC))} ${fmtNum(row.points.assets[topC])} pts</span></div>
          <div class="tile__faces">${bust(S, topD)}${tchip(S, topC)}</div></div>
        <a class="link-more" href="results.html${q}#r${lastScored.id}" style="justify-self:center">View result${icon('chevron')}</a>
      </div>
    </article></section>`;
}

/* ---------------------------------------------------------------- panels */
function myTeamSection() {
  let body;
  if (!me) {
    body = `<div class="panel__body--pad prose muted" style="padding-top:16px"><p>Pick 5 drivers and 2 constructors within ${money(S.cfg.budget)}, choose a DRS Boost driver and climb the table. Anyone can join.</p>
      <p style="margin-top:14px"><button class="btn btn--red" type="button" onclick="openAuth('join')">Join the league</button></p></div>`;
  } else if (!myRow?.squad) {
    body = `<div class="panel__body--pad prose muted" style="padding-top:16px"><p>You have not picked a team yet.</p>
      <p style="margin-top:14px"><a class="btn btn--red" href="team.html${q}">Pick your team${icon('chevron')}</a></p></div>`;
  } else {
    const last = mine.rows.filter(r => r.points).at(-1);
    body = `<div class="panel__head"><div><b>${esc(me.team || 'Your team')}</b><div class="muted small">${fmtNum(mine.total)} points${mine.provisional ? ', provisional' : ''}</div></div>
        <a class="link-more" href="team.html${q}">${phase.state === 'open' ? 'Manage' : 'View'}${icon('chevron')}</a></div>
      <div class="panel__body--pad" style="padding-top:2px">${lineup(S, myRow.squad, R.prices, last && last.round === R.id ? last.points.assets : null, absentIn(R, myRow.squad))}</div>
      <div class="panel__body">${squadRows(S, myRow.squad, R.prices, null, true)}</div>`;
  }
  return `<section>${shead('Your team')}<div class="panel">${body}</div></section>`;
}

function moversSection() {
  const idx = S.rounds.indexOf(R);
  const hasMoves = idx > 0 && S.rounds[idx - 1].moves;
  const ds = S.drivers.filter(d => d.role === 'regular' && !d.retired);
  let a, b, titleA, titleB, fmt;
  if (hasMoves) {
    const withD = ds.map(d => ({ d, v: S.priceDelta(d.code) }));
    a = withD.filter(x => x.v > 0).sort((x, y) => y.v - x.v).slice(0, 4);
    b = withD.filter(x => x.v < 0).sort((x, y) => x.v - y.v).slice(0, 4);
    titleA = 'Rising'; titleB = 'Falling'; fmt = x => `<span class="num" style="font-size:1rem">${delta(x.v)}</span>`;
  } else {
    const byPrice = ds.map(d => ({ d, v: R.prices[d.code] }));
    a = [...byPrice].sort((x, y) => y.v - x.v).slice(0, 4);
    b = [...byPrice].sort((x, y) => x.v - y.v).slice(0, 4);
    titleA = 'Most expensive'; titleB = 'Best value'; fmt = x => `<span class="num" style="font-size:1rem">${money(x.v)}</span>`;
  }
  const list = (title, arr) => `<div><h3 class="h3 muted" style="padding:6px 10px 0;font-size:.9rem">${title}</h3><div class="tower">${arr.length ? arr.map(x => `
    <div class="row">${bust(S, x.d.code)}
      <div class="who"><b>${esc(x.d.name)}</b><small>${teamWithFlag(S, x.d.code)}</small></div>
      <div class="stat">${fmt(x)}</div></div>`).join('') : '<div class="row"><span class="muted small">No moves yet</span></div>'}</div></div>`;
  return `<section>${shead('Market', `<a class="link-more" href="drivers.html${q}">All prices${icon('chevron')}</a>`)}
    <div class="panel"><div class="panel__body" style="display:grid;gap:6px;padding-top:6px">${list(titleA, a)}${list(titleB, b)}</div></div></section>`;
}

function calendarSection() {
  const breaks = ctx.raw.calendar.breaks || [];
  const rows = [];
  for (const r of S.rounds) {
    const current = r.id === R.id && phase.state !== 'complete';
    const right = current ? statusBadge(phase.state === 'open' ? 'open' : phase.state, phase.state === 'open' ? 'Next' : undefined)
      : r.status !== 'upcoming' ? statusBadge(r.status) : `<span class="faint small">${fmtDate(r, true)}</span>`;
    rows.push(`<a class="row row--link${current ? ' row--me' : ''}" href="results.html${q}#r${r.id}">
      <span class="pos">${r.id}</span>${flag(r, 'md')}
      <div class="who"><b>${esc(r.name)}</b><small>${fmtDate(r)}</small></div>${trackImg(r)}${right}</a>`);
    for (const b of breaks.filter(x => x.afterRound === r.id)) rows.push(`<div class="row" style="min-height:0;justify-content:center"><span class="faint small">${esc(b.label)}</span></div>`);
  }
  return `<section>${shead('Calendar', `<a class="link-more" href="calendar.ics" download="sta-fantasy-deadlines.ics">${icon('calendar')}Add deadlines to your calendar</a>`)}<div class="panel"><div class="panel__body" style="padding-top:8px"><div class="tower">${rows.join('')}</div></div></div></section>`;
}

function helpCard() {
  return `<div class="panel"><div class="panel__body--pad row-flex spread" style="padding-top:16px">
    <div class="row-flex" style="gap:12px;flex-wrap:nowrap"><span class="ruleicon">${icon('chat')}</span><div><b>Need help?</b><p class="muted small">${contactLink(S, true)}.</p></div></div></div></div>`;
}

/* --------------------------------------------------------------- compose */
const board = standings(S, players, subs);
const standingsAside = lastScored ? (phase.state === 'provisional' ? 'Includes provisional points' : `After round ${lastScored.id}`)
  : `${players.length} ${players.length === 1 ? 'player' : 'players'} so far`;
app.innerHTML = `
  <div class="stack" style="--gap:22px">
    ${problemsNotice(problems)}
    ${heroHtml()}
    ${phase.state === 'provisional' ? '<div class="notice notice--flag"><span class="glyph">P</span><div><b>These points are provisional</b><span class="muted">The stewards can still change results until Sunday. Everything recalculates when the round is marked final.</span></div></div>' : ''}
    <div class="cols cols--2-1">
      <div class="stack" style="--gap:28px">
        ${lastRoundSection()}
        <section>${shead('Standings', standingsAside)}
          <div class="panel"><div class="panel__body" style="padding-top:8px">${leaderboardRows(board, me?.id, 12)}</div>${!lastScored ? '<p class="muted small" style="padding:0 18px 16px">Points start after round 1.</p>' : ''}</div></section>
        ${calendarSection()}
      </div>
      <div class="stack" style="--gap:28px">${myTeamSection()}${moversSection()}${helpCard()}</div>
    </div>
  </div>
  <dialog class="sheet" id="rival" aria-label="Player's team"></dialog>`;

// tap a player in the standings to see their team (revealed once picks lock)
app.addEventListener('click', e => {
  const dlg = $('#rival');
  const row = e.target.closest('[data-player]');
  if (row) {
    const standing = board.find(x => String(x.player.id) === row.dataset.player);
    if (!standing) return;
    dlg.innerHTML = rivalSheet(S, standing, subs[standing.player.id], now);
    dlg.showModal();
    return;
  }
  if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
});
runLights();
tick();
if ($('#clock')) setInterval(tick, 1000);
