// Replays the whole season from facts (calendar + round files + starting prices):
// fantasy points per round, price at every deadline, and where the season currently stands.
import { scoreRound } from './scoring.js';
import { priceMoves } from './prices.js';

const round1 = x => Math.round(x * 10) / 10;

/**
 * @param data {
 *   season, calendar, teams: {teams:[]}, drivers: {drivers:[], constructors:[]}, rounds: Map<number, parsedRound>
 * }
 */
export function buildSeason(data) {
  const cfg = data.season;
  const teams = data.teams.teams;
  const drivers = data.drivers.drivers.map(d => ({ ...d, startPrice: d.price }));
  const driverMap = new Map(drivers.map(d => [d.code, d]));
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const startPrices = {};
  for (const d of drivers) startPrices[d.code] = d.price;
  for (const c of data.drivers.constructors) startPrices[c.id] = c.price;

  const ctx = { scoring: cfg.scoring, drivers, teams };
  const recent = {};          // asset id -> raced-round points
  const pointsLog = {};       // asset id -> [{round, pts, raced}]
  const log = (id, round, pts, raced) => { (pointsLog[id] ||= []).push({ round, pts, raced }); };

  let prices = { ...startPrices };
  let priceStatus = 'final';
  const rounds = [];

  for (const cal of data.calendar.rounds) {
    const parsed = data.rounds.get(cal.id) || null;
    const R = {
      ...cal,
      lockAt: new Date(cal.lockUtc),
      file: parsed,
      status: parsed && parsed.ok ? parsed.status : 'upcoming',
      error: parsed && !parsed.ok ? parsed.errors : null,
      prices: { ...prices },
      priceStatus,
      scores: null,
      moves: null,
    };

    if (parsed && parsed.ok && parsed.status !== 'upcoming') {
      const scored = scoreRound(parsed, ctx);
      R.scores = scored;

      // log fantasy points for every asset (drivers: own result; constructors: seat total)
      for (const d of drivers) log(d.code, cal.id, scored.drivers[d.code].total, scored.drivers[d.code].raced);
      for (const t of teams) log(t.id, cal.id, scored.constructors[t.id].total, scored.constructors[t.id].raced);

      const dGroup = [], cGroup = [];
      // a no-show counts like a race with 0 points (unless prices.absentCountsAsRace is false)
      const absentCounts = cfg.prices.absentCountsAsRace !== false;
      for (const d of drivers) {
        if (d.role !== 'regular' || d.retired) continue;
        const s = scored.drivers[d.code];
        if (!s.raced && !absentCounts) continue;
        (recent[d.code] ||= []).push(s.raced ? s.total : 0);
        dGroup.push({ id: d.code, price: prices[d.code], recent: recent[d.code], tierSplit: cfg.prices.tierSplit });
      }
      for (const t of teams) {
        const s = scored.constructors[t.id];
        if (!s.raced && !absentCounts) continue;
        (recent[t.id] ||= []).push(s.total);
        cGroup.push({ id: t.id, price: prices[t.id], recent: recent[t.id], tierSplit: cfg.prices.tierSplitConstructor });
      }
      const moves = new Map([...priceMoves(dGroup, cfg.prices), ...priceMoves(cGroup, cfg.prices)]);
      R.moves = Object.fromEntries(moves);
      const next = { ...prices };
      for (const [id, m] of moves) next[id] = m.price;
      prices = next;
      priceStatus = parsed.status === 'final' ? 'final' : 'projected';
    } else if (priceStatus === 'final') {
      // nothing scored yet; later prices are unchanged but not yet decided
      priceStatus = 'final';
    }
    rounds.push(R);
  }

  const S = {
    cfg, teams, drivers, driverMap, teamMap, rounds, pointsLog, startPrices,
    constructors: data.drivers.constructors,
    round: id => rounds.find(r => r.id === id),

    /** The round the game is currently "about": first one not yet Final. */
    currentRound() { return rounds.find(r => r.status !== 'final') || null; },

    /** open | locked | provisional | complete for a given moment. */
    phase(now = new Date()) {
      const r = this.currentRound();
      if (!r) return { state: 'complete', round: rounds[rounds.length - 1] };
      if (r.status === 'provisional') return { state: 'provisional', round: r };
      return now < r.lockAt ? { state: 'open', round: r } : { state: 'locked', round: r };
    },

    /** Latest prices that are decided or projected, for the market: prices at the current round's deadline. */
    currentPrices() {
      const r = this.currentRound() || rounds[rounds.length - 1];
      return r.prices;
    },

    /** Summary of an asset's season so far. */
    assetSummary(id) {
      const rows = (pointsLog[id] || []).filter(x => x.raced);
      const total = rows.reduce((a, x) => a + x.pts, 0);
      return { rounds: rows.length, total, avg: rows.length ? total / rows.length : 0, last: rows.at(-1)?.pts ?? null, log: pointsLog[id] || [] };
    },

    priceDelta(id) {
      const r = this.currentRound();
      if (!r) return 0;
      const idx = rounds.indexOf(r);
      if (idx === 0) return 0;
      const prev = rounds[idx - 1];
      return round1((r.prices[id] ?? 0) - (prev.prices[id] ?? 0));
    },
  };
  return S;
}
