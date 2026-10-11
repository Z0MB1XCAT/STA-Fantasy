// A player's season: squads, budget, transfers, chips and points, all DERIVED from the
// submissions they saved and the season facts. No stored totals, so Sunday edits re-flow everything.

const round1 = x => Math.round(x * 10) / 10;
export const emptyState = S => ({ base: null, cash: S.cfg.budget, carry: 0, chips: [] });

export const assetsOf = sq => [...sq.drivers, ...sq.constructors];
export const squadValue = (sq, p) => round1(assetsOf(sq).reduce((a, id) => a + (p[id] ?? 0), 0));
const value = squadValue;

/** Drivers who have left the league (retired): owners can swap them out for free. */
function outDrivers(S) {
  return new Set(S.drivers.filter(d => d.retired).map(d => d.code));
}

/** Transfers a candidate squad uses against the previous squad, and what they cost. Also used live by the team builder. */
export function transferInfo(S, state, R, cand, chip) {
  const tc = S.cfg.transfers;
  const prev = state.base;
  const unlimited = chip === 'wildcard' || chip === 'limitless' || !prev;
  const out = { used: 0, freeSwaps: 0, effective: 0, free: unlimited ? Infinity : tc.freePerRound + state.carry, penalty: 0 };
  if (!cand || !prev) return out;
  const before = new Set(assetsOf(prev));
  const after = new Set(assetsOf(cand));
  out.used = [...after].filter(id => !before.has(id)).length;
  const outs = outDrivers(S);
  out.freeSwaps = prev.drivers.filter(d => outs.has(d) && !after.has(d)).length;
  out.effective = Math.max(0, out.used - out.freeSwaps);
  out.penalty = unlimited ? 0 : Math.max(0, out.effective - out.free) * tc.penaltyPerExtra;
  return out;
}

/**
 * Check one round's submission against the state after the previous round.
 * @returns {squad, chip, valid, issues, cost, wealth, transfers:{used,freeSwaps,free,effective,penalty}, next}
 */
export function evaluate(S, state, R, sub) {
  const tc = S.cfg.transfers;
  const issues = [];
  const prices = R.prices;
  const prev = state.base;

  let cand = sub ? { drivers: [...(sub.drivers || [])], constructors: [...(sub.constructors || [])], drs: sub.drs || null }
                 : (prev ? { drivers: [...prev.drivers], constructors: [...prev.constructors], drs: prev.drs } : null);
  let chip = sub?.chip || null;
  if (chip && !S.cfg.chips[chip]) { issues.push(`Unknown chip "${chip}" ignored`); chip = null; }
  if (chip && state.chips.includes(chip)) { issues.push(`${S.cfg.chips[chip].name} was already used`); chip = null; }
  // Wildcard and Limitless change an existing team; with no team yet they would be wasted (or worse, Limitless
  // would leave an over-budget team behind), so they are not played and not used up
  if (chip && S.cfg.chips[chip].needsTeam && !prev) { issues.push(`${S.cfg.chips[chip].name} needs a team from an earlier round, so it was not played`); chip = null; }

  const check = c => {
    const errs = [];
    if (!c) return ['No team picked'];
    if (new Set(c.drivers).size !== S.cfg.squad.drivers) errs.push(`Pick ${S.cfg.squad.drivers} different drivers`);
    if (new Set(c.constructors).size !== S.cfg.squad.constructors) errs.push(`Pick ${S.cfg.squad.constructors} different constructors`);
    for (const d of c.drivers) {
      const dd = S.driverMap.get(d);
      if (!dd) errs.push(`Unknown driver ${d}`);
      else if (dd.role !== 'regular') errs.push(`${dd.name} is a reserve and can't be picked`);
    }
    for (const t of c.constructors) if (!S.teamMap.has(t)) errs.push(`Unknown constructor ${t}`);
    return errs;
  };

  let errs = check(cand);
  const wealth = prev ? round1(value(prev, prices) + state.cash) : S.cfg.budget;
  let cost = cand && !errs.length ? value(cand, prices) : 0;
  if (!errs.length && chip !== 'limitless' && cost > wealth + 1e-6) errs.push(`Over budget by ${round1(cost - wealth).toFixed(1)}M`);

  let valid = !errs.length;
  if (!valid) {
    issues.push(...errs);
    if (sub && prev) {
      issues.push('Last round\'s team was kept instead');
      cand = { drivers: [...prev.drivers], constructors: [...prev.constructors], drs: prev.drs };
      chip = null;
      cost = value(cand, prices);
    } else {
      cand = null; chip = null; cost = 0;
    }
  }
  if (cand && (!cand.drs || !cand.drivers.includes(cand.drs))) {
    if (sub && chip !== 'autopilot') issues.push('No DRS Boost driver chosen');   // Autopilot picks the driver itself
    cand.drs = null;
  }

  // transfers
  const { used, freeSwaps, free, effective, penalty } = transferInfo(S, state, R, cand, chip);

  // state after this round
  const next = { base: prev, cash: state.cash, carry: state.carry, chips: chip ? [...state.chips, chip] : state.chips };
  if (cand) {
    if (chip === 'limitless' && prev) {
      // the team reverts afterwards; nothing carries over
    } else {
      next.base = cand;
      next.cash = round1(wealth - cost);
      if (prev && chip !== 'wildcard') next.carry = Math.min(tc.maxBanked, Math.max(0, free - effective));
      if (!prev) next.carry = 0;
    }
  }
  return { squad: cand, chip, valid, issues, cost, wealth, transfers: { used, freeSwaps, free, effective, penalty }, next, submitted: !!sub };
}

/** Points a squad earns in a round that has scores. */
export function squadPoints(S, R, squad, chip) {
  if (!R.scores || !squad) return null;
  const pts = {};
  for (const d of squad.drivers) pts[d] = R.scores.effective[d]?.points ?? 0;
  for (const c of squad.constructors) pts[c] = R.scores.constructors[c]?.total ?? 0;
  if (chip === 'nonegative') for (const k of Object.keys(pts)) pts[k] = Math.max(0, pts[k]);

  const best = list => [...list].sort((a, b) => pts[b] - pts[a])[0] || null;
  const noShow = d => !!R.scores.effective[d]?.absent;
  let drs = squad.drs;
  let drsMoved = false;
  if (chip === 'autopilot') drs = best(squad.drivers);
  else if (drs && noShow(drs) && S.cfg.drs.fallbackWhenAbsent === true) {
    // don't waste the boost on a driver who never turned up: it moves to your best-scoring driver who raced
    const moved = best(squad.drivers.filter(d => d !== drs && !noShow(d)));
    if (moved) { drs = moved; drsMoved = true; }
  }
  const mult = chip === 'extradrs' ? 3 : S.cfg.drs.multiplier;
  const raw = Object.values(pts).reduce((a, x) => a + x, 0);
  const bonus = drs ? pts[drs] * (mult - 1) : 0;
  return { assets: pts, raw, drs, drsMoved, mult, bonus, total: raw + bonus };
}

/**
 * Walk the season for one player.
 * @param subs  { [roundId]: {drivers, constructors, drs, chip} }
 * @param opts  { upTo?: roundId }  last round to process (inclusive)
 */
export function resolvePlayer(S, subs, opts = {}) {
  const upTo = opts.upTo ?? S.rounds.length;
  let state = emptyState(S);
  const rows = [];
  let total = 0, provisional = false;
  for (const R of S.rounds) {
    if (R.id > upTo) break;
    const ev = evaluate(S, state, R, subs?.[R.id]);
    const pts = squadPoints(S, R, ev.squad, ev.chip);
    let roundTotal = null;
    if (pts) {
      roundTotal = pts.total - ev.transfers.penalty;
      total += roundTotal;
      if (R.status === 'provisional') provisional = true;
    }
    rows.push({ round: R.id, status: R.status, ...ev, points: pts, roundTotal });
    state = ev.next;
  }
  return { rows, total, provisional, state };
}
