// Fantasy scoring for one round. Pure functions, no DOM.
//
// Asset ids: drivers use their 3-letter code (KAM); constructors use the team id (redbull).

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Starting grids derived from quali (feature = quali order, reverse = quali reversed), unless overridden. */
export function deriveGrids(round) {
  const classified = round.sessions.quali.filter(x => !x.mark).map(x => x.code);
  return {
    reverse: round.grids?.reverse?.length ? round.grids.reverse : [...classified].reverse(),
    feature: round.grids?.feature?.length ? round.grids.feature : classified,
  };
}

function scoreQuali(list, cfg) {
  const out = {};
  list.forEach((e, i) => {
    const parts = [];
    if (e.mark === 'dsq') parts.push({ label: 'Disqualified', pts: cfg.dsq });
    else if (e.mark === 'dns') { /* absent: nothing */ }
    else {
      const p = cfg.positions[i] ?? 0;
      parts.push({ label: `P${i + 1}`, pts: p });
    }
    out[e.code] = { pos: i + 1, grid: null, mark: e.mark, parts, pts: parts.reduce((a, x) => a + x.pts, 0) };
  });
  return out;
}

function scoreRace(list, grid, fastestCode, cfg) {
  const out = {};
  const gridIndex = new Map(grid.map((c, i) => [c, i + 1]));
  // drivers who raced but are not on the derived grid start from the back (pit lane), in finishing order
  let extra = grid.length;
  const haveGrid = grid.length > 0;
  list.forEach((e, i) => {
    const pos = i + 1;
    const parts = [];
    let g = gridIndex.get(e.code) ?? null;
    if (haveGrid && g == null && e.mark !== 'dns') g = ++extra;
    if (e.mark === 'dns') {
      // did not start: nothing, no penalty
    } else if (e.mark === 'dnf' || e.mark === 'dsq') {
      parts.push({ label: e.mark === 'dsq' ? 'Disqualified' : 'Did not finish', pts: e.mark === 'dsq' ? cfg.dsq : cfg.dnf });
    } else {
      const base = cfg.positions[i] ?? 0;
      parts.push({ label: `P${pos}`, pts: base });
      if (g != null) {
        const diff = g - pos; // + = places gained
        const raw = diff * cfg.gainPerPlace;
        const pts = clamp(raw, -cfg.lossCap, cfg.gainCap);
        if (pts !== 0) parts.push({ label: diff > 0 ? `Gained ${diff} place${diff === 1 ? '' : 's'}` : `Lost ${-diff} place${diff === -1 ? '' : 's'}`, pts });
      }
      if (fastestCode === e.code && cfg.fastestLap) parts.push({ label: 'Fastest lap', pts: cfg.fastestLap });
    }
    out[e.code] = { pos, grid: g, mark: e.mark, parts, pts: parts.reduce((a, x) => a + x.pts, 0) };
  });
  return out;
}

/**
 * @param round parsed round (see parseRound)
 * @param ctx { scoring, drivers: [{code, team, role}], teams: [{id}] }
 */
export function scoreRound(round, ctx) {
  const { scoring } = ctx;
  const grids = deriveGrids(round);
  const sess = {
    quali: scoreQuali(round.sessions.quali, scoring.quali),
    reverse: scoreRace(round.sessions.reverse, grids.reverse, round.fastest?.reverse, scoring.reverse),
    feature: scoreRace(round.sessions.feature, grids.feature, round.fastest?.feature, scoring.feature),
  };

  // per-driver totals
  const drivers = {};
  for (const d of ctx.drivers) {
    const per = {};
    let total = 0, raced = false;
    for (const s of ['quali', 'reverse', 'feature']) {
      const r = sess[s][d.code] || null;
      per[s] = r;
      if (r) { total += r.pts; if (r.mark !== 'dns') raced = true; }
    }
    drivers[d.code] = { code: d.code, sessions: per, total, raced };
  }

  // who is in each seat this round, and what owners of a driver receive
  const seat = round.seatMap || {};
  const effective = {};
  for (const d of ctx.drivers) {
    const standIn = seat[d.code] || null;
    const base = drivers[d.code];
    if (standIn && drivers[standIn]) {
      effective[d.code] = { points: drivers[standIn].total, via: standIn, absent: !base.raced };
    } else {
      effective[d.code] = { points: base.total, via: null, absent: !base.raced };
    }
  }

  // constructors: both seats
  const constructors = {};
  for (const t of ctx.teams) {
    const seats = ctx.drivers.filter(d => d.team === t.id && d.role === 'regular').map(d => seat[d.code] || d.code);
    const per = { quali: 0, reverse: 0, feature: 0 };
    for (const code of seats) for (const s of ['quali', 'reverse', 'feature']) per[s] += drivers[code]?.sessions[s]?.pts || 0;
    let bonus = 0;
    const b = scoring.constructor?.bothInPointsBonus;
    if (b && seats.length === 2) {
      const list = round.sessions[b.session] || [];
      const inPoints = c => { const i = list.findIndex(x => x.code === c); return i >= 0 && i < b.topN && !list[i].mark; };
      if (seats.every(inPoints)) bonus = b.points;
    }
    const total = per.quali + per.reverse + per.feature + bonus;
    constructors[t.id] = { id: t.id, seats, sessions: per, bonus, total, raced: seats.some(c => drivers[c]?.raced) };
  }

  return { grids, sessions: sess, drivers, effective, constructors };
}

/** Position-in-session lookup helper for UIs. */
export function sessionTable(round, scored, session) {
  return round.sessions[session].map((e, i) => ({
    code: e.code, mark: e.mark, pos: i + 1,
    grid: scored.sessions[session][e.code]?.grid ?? null,
    pts: scored.sessions[session][e.code]?.pts ?? 0,
    parts: scored.sessions[session][e.code]?.parts ?? [],
  }));
}
