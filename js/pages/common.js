// Pieces used by more than one page.
import { esc, posBox, money, fmtNum, nameOf, teamLine } from '../ui.js';
import { avatar, ident, carImg, photoOf, teamVar, teamOf, ordinal, icon } from '../components.js';
import { resolvePlayer } from '../engine/squad.js';

export { playerColor } from '../components.js';

export function leaderboardRows(rows, meId, limit = 10) {
  if (!rows.length) return '<div class="empty"><span class="display">No players yet</span>Join the league to be the first on the board.</div>';
  return `<div class="tower">${rows.slice(0, limit).map(r => `
    <button class="row row--link row--btn${r.player.id === meId ? ' row--me' : ''}" type="button" data-player="${esc(r.player.id)}" aria-label="${esc(r.player.team || r.player.name)}, ${ordinalRank(r.rank)} with ${fmtNum(r.total)} points. Show their team">
      ${posBox(r.rank)}
      ${avatar(r.player.team || r.player.name, `avatar--lg${r.player.id === meId ? ' avatar--me' : ''}`)}
      <div class="who"><b>${esc(r.player.team || r.player.name)}</b><small>${esc(r.player.name)}${r.player.id === meId ? ', you' : ''}</small></div>
      <div class="stats">
        <div class="stat stat--hide-sm"><span class="num">${r.lastRound == null ? '–' : fmtNum(r.lastRound)}</span><small>Last round</small></div>
        <div class="stat stat--lead"><span class="num">${fmtNum(r.total)}</span><small>${r.provisional ? 'Provisional' : 'Points'}</small></div>
      </div>
    </button>`).join('')}</div>`;
}
const ordinalRank = n => ordinal(n);

/**
 * Sheet showing another player's team for the latest round whose deadline has passed
 * (picks before that are hidden by the database, so there is nothing to leak).
 */
export function rivalSheet(S, standing, subsOfPlayer, now) {
  const p = standing.player;
  const revealed = [...S.rounds].reverse().find(r => r.lockAt <= now) || null;
  let body;
  if (!revealed) {
    body = `<p class="muted">Teams are revealed when picks lock for round 1, ${esc(S.rounds[0].name)}. Until then everyone's picks stay secret.</p>`;
  } else {
    const res = resolvePlayer(S, subsOfPlayer || {}, { upTo: revealed.id });
    const row = res.rows.find(r => r.round === revealed.id);
    if (!row?.squad) {
      body = `<p class="muted">No team picked for round ${revealed.id}, ${esc(revealed.name)}.</p>`;
    } else {
      const pts = row.points?.assets || null;
      body = `<div class="row-flex spread" style="margin-bottom:12px">
          <span class="muted small">Round ${revealed.id}, ${esc(revealed.name)}${row.chip ? `. ${esc(S.cfg.chips[row.chip].name)} played` : ''}</span>
          ${row.roundTotal != null ? `<span class="num" style="font-size:1.1rem">${fmtNum(row.roundTotal)} pts</span>` : '<span class="muted small">Not scored yet</span>'}
        </div>
        ${lineup(S, row.squad, revealed.prices, pts)}
        <div style="margin-top:10px">${squadRows(S, row.squad, revealed.prices, pts, true)}</div>`;
    }
  }
  return `<div class="sheet__scroll">
    <div class="mycard__head" style="position:relative">${avatar(p.team || p.name)}
      <div style="min-width:0"><div class="mycard__name">${esc(p.team || p.name)}</div><div class="muted small">${esc(p.name)}, ${ordinal(standing.rank)} with ${fmtNum(standing.total)} points</div></div>
      <button class="btn btn--ghost btn--icon" type="button" data-close aria-label="Close" style="margin-left:auto">${icon('close')}</button></div>
    <div class="panel__body--pad" style="padding-top:16px">${body}</div></div>`;
}

/** Five small figure tiles, F1-Fantasy style. */
export function lineup(S, squad, prices, pointsByAsset = null) {
  return `<div class="lineup">${squad.drivers.map(code => {
    const src = photoOf(S, code);
    return `<div class="lineup__cell">
      <div class="lineup__tile" style="${teamVar(S, code)}">
        ${teamOf(S, code)?.logo ? `<img class="lineup__logo" src="${teamOf(S, code).logo}" alt="">` : ''}
        ${src ? `<img class="lineup__fig" src="${src}" alt="" loading="lazy">` : ''}
        ${squad.drs === code ? '<span class="mark mark--drs lineup__drs">DRS</span>' : ''}
      </div>
      <div class="lineup__name">${esc(nameOf(S, code))}</div>
      <div class="lineup__meta">${pointsByAsset ? `${fmtNum(pointsByAsset[code] ?? 0)} pts` : money(prices[code] ?? 0)}</div>
    </div>`;
  }).join('')}</div>`;
}

/** Compact rows for a squad (drivers then constructors). */
export function squadRows(S, squad, prices, pointsByAsset = null, onlyConstructors = false) {
  const ids = onlyConstructors ? squad.constructors : [...squad.drivers, ...squad.constructors];
  return `<div class="tower">${ids.map(id => {
    const isDriver = S.driverMap.has(id);
    return `<div class="row">
      ${ident(S, id)}
      <div class="who"><b>${esc(nameOf(S, id))}${isDriver && squad.drs === id ? ' <span class="mark mark--drs">DRS</span>' : ''}</b><small>${esc(teamLine(S, id))}</small></div>
      ${isDriver ? '' : carImg(S, id)}
      <div class="stats">${pointsByAsset ? `<div class="stat"><span class="num">${fmtNum(pointsByAsset[id] ?? 0)}</span><small>Pts</small></div>` : ''}<div class="stat"><span class="num">${money(prices[id] ?? 0)}</span><small>Price</small></div></div>
    </div>`;
  }).join('')}</div>`;
}
