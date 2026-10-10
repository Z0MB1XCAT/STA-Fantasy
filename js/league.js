// League-wide numbers computed from everyone's visible picks.
import { resolvePlayer } from './engine/squad.js';

/** Last round that has scores (provisional or final). */
export function lastScoredRound(S) {
  let last = 0;
  for (const R of S.rounds) if (R.scores) last = R.id;
  return last;
}

export function standings(S, players, subsByPlayer, upTo = lastScoredRound(S)) {
  const rows = players.map(p => {
    const res = resolvePlayer(S, subsByPlayer[p.id] || {}, { upTo });
    const scored = res.rows.filter(r => r.roundTotal != null);
    const last = scored.at(-1) || null;
    return {
      player: p,
      total: res.total,
      provisional: res.provisional,
      lastRound: last ? last.roundTotal : null,
      lastRoundId: last ? last.round : null,
      played: scored.filter(r => r.squad).length,
      rows: res.rows,
    };
  });
  rows.sort((a, b) => b.total - a.total || (b.lastRound ?? -1e9) - (a.lastRound ?? -1e9) || a.player.name.localeCompare(b.player.name));
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    if (prev === null || r.total !== prev) rank = i + 1;
    r.rank = rank; prev = r.total;
  });
  return rows;
}

/** % of players holding each asset in the given round (null until picks are visible). */
export function ownership(S, players, subsByPlayer, roundId) {
  const R = S.round(roundId);
  if (!R) return null;
  const held = {};
  let n = 0;
  for (const p of players) {
    const res = resolvePlayer(S, subsByPlayer[p.id] || {}, { upTo: roundId });
    const row = res.rows.find(r => r.round === roundId);
    if (!row?.squad) continue;
    n++;
    for (const id of [...row.squad.drivers, ...row.squad.constructors]) held[id] = (held[id] || 0) + 1;
  }
  if (!n) return null;
  return Object.fromEntries(Object.entries(held).map(([k, v]) => [k, Math.round((v / n) * 100)]));
}
