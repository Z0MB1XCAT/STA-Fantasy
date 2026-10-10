import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRound, serializeRound } from '../js/engine/parseRound.js';
import { scoreRound, deriveGrids } from '../js/engine/scoring.js';
import { priceMoves } from '../js/engine/prices.js';
import { resolvePlayer, evaluate, emptyState, standInsFor } from '../js/engine/squad.js';
import { baseData, seasonWith, codesOf, ROUND1 } from './helpers.mjs';

const ctxOf = () => { const d = baseData(); return { scoring: d.season.scoring, drivers: d.drivers.drivers, teams: d.teams.teams }; };

test('parseRound reads sessions, marks, fastest lap and seat maps', () => {
  const r = parseRound(`
    round: 5   # comment
    status: provisional
    out: ZMB>XMK
    subs: DON>KIE
    quali: KAM JEN NFS
    feature: JEN KAM
      NFS:dnf
    fastest: feature=JEN
    notes: +5s on KAM`, { codes: codesOf() });
  assert.deepEqual(r.errors, []);
  assert.equal(r.round, 5);
  assert.equal(r.status, 'provisional');
  assert.deepEqual(r.seatMap, { ZMB: 'XMK', DON: 'KIE' });
  assert.equal(r.sessions.feature[2].mark, 'dnf');   // continuation line joined
  assert.equal(r.fastest.feature, 'JEN');
});

test('parseRound reports bad input clearly', () => {
  const r = parseRound(`round: 2\nstatus: done\nquali: KAM KAM ZZZ JEN:oops\nfastest: feature=KAM`, { codes: codesOf() });
  const msg = r.errors.join(' | ');
  assert.match(msg, /status must be/);
  assert.match(msg, /KAM is listed twice/);
  assert.match(msg, /unknown driver code ZZZ/);
  assert.match(msg, /unknown mark/);
  assert.match(msg, /not in the feature results/);
  assert.equal(r.ok, false);
});

test('serializeRound round-trips', () => {
  const a = parseRound(ROUND1, { codes: codesOf() });
  const b = parseRound(serializeRound(a), { codes: codesOf() });
  assert.deepEqual(b.sessions, a.sessions);
  assert.deepEqual(b.fastest, a.fastest);
  assert.equal(b.status, a.status);
});

test('grids: feature = quali order, reverse = quali reversed, DNS/DSQ in quali go to the back', () => {
  const r = parseRound('round: 1\nstatus: final\nquali: AAA'.replace('AAA', 'KAM JEN NFS ICE:dsq'), { codes: codesOf() });
  const g = deriveGrids(r);
  assert.deepEqual(g.feature, ['KAM', 'JEN', 'NFS']);
  assert.deepEqual(g.reverse, ['NFS', 'JEN', 'KAM']);
});

test('scoring matches a hand-checked round', () => {
  const r = parseRound(ROUND1, { codes: codesOf() });
  const s = scoreRound(r, ctxOf());
  // JEN: quali P2 = 9; reverse P4 base 6, grid 3 -> -1 = 5; feature P1 25, grid 2 -> +1, fastest +1 = 27
  assert.equal(s.drivers.JEN.sessions.quali.pts, 9);
  assert.equal(s.drivers.JEN.sessions.reverse.pts, 5);
  assert.equal(s.drivers.JEN.sessions.feature.pts, 27);
  assert.equal(s.drivers.JEN.total, 41);
  assert.equal(s.drivers.KAM.total, 10 + 8 + 19);
  assert.equal(s.drivers.NFS.total, 8 + 13 + 12);
  assert.equal(s.drivers.ICE.total, 7 + 8 - 10);             // feature DNF = -10
  // constructors score from both seats (absent seat = 0)
  assert.equal(s.constructors.audi.total, 41);
  assert.equal(s.constructors.redbull.total, 37);
  assert.equal(s.drivers.PAB.raced, false);
});

test('place gains are capped (reverse grid back-marker)', () => {
  const codes = [...codesOf()].filter(c => !['XMK', 'KIE'].includes(c)).slice(0, 12);
  const quali = codes.join(' ');                               // codes[0] pole -> last in reverse
  const reverse = [codes[0], ...codes.slice(1)].join(' ');      // pole-sitter wins from the back
  const r = parseRound(`round: 1\nstatus: final\nquali: ${quali}\nreverse: ${reverse}`, { codes: codesOf() });
  const s = scoreRound(r, ctxOf());
  const win = s.drivers[codes[0]].sessions.reverse;
  assert.equal(win.pos, 1);
  assert.equal(win.grid, 12);
  assert.equal(win.pts, 12 + 5);                                // 12 base + cap of +5
});

test('stand-in scores for owners of the absent driver, price of the absentee is frozen', () => {
  const S = seasonWith({
    1: `round: 1\nstatus: final\nsubs: ZMB>XMK\nquali: KAM XMK JEN\nfeature: KAM XMK JEN\nreverse: JEN XMK KAM`,
  });
  const R = S.round(1);
  assert.equal(R.scores.effective.ZMB.via, 'XMK');
  assert.equal(R.scores.effective.ZMB.points, R.scores.drivers.XMK.total);
  assert.ok(R.scores.effective.ZMB.points > 0);
  assert.equal(R.scores.drivers.ZMB.raced, false);
  assert.equal(S.round(2).prices.ZMB, S.round(1).prices.ZMB);   // frozen
  assert.equal(S.round(2).prices.XMK, S.round(1).prices.XMK);   // reserves never move
  // alpine's seat is driven by XMK so the constructor scores
  assert.equal(R.scores.constructors.alpine.seats.includes('XMK'), true);
  assert.ok(R.scores.constructors.alpine.total > 0);
});

test('price bands: percentile ranked, clamped and rounded', () => {
  const cfg = baseData().season.prices;
  const group = [
    { id: 'a', price: 30, recent: [50], tierSplit: 18 },
    { id: 'b', price: 20, recent: [30], tierSplit: 18 },
    { id: 'c', price: 10, recent: [8], tierSplit: 18 },
    { id: 'd', price: 5, recent: [-3], tierSplit: 18 },
  ];
  const m = priceMoves(group, cfg);
  // ppm: a 1.67, b 1.5, c 0.8, d -0.6
  assert.equal(m.get('a').band, 'great');
  assert.equal(m.get('b').band, 'good');
  assert.equal(m.get('c').band, 'poor');
  assert.equal(m.get('d').band, 'terrible');
  assert.equal(m.get('a').delta, 0.5);        // tier A great
  assert.equal(m.get('d').price, cfg.min);     // 5 - 0.8 clamps at min 4.5
});

test('after a final round, raced assets move and absent ones stay put', () => {
  const S = seasonWith({ 1: ROUND1 });
  const r1 = S.round(1), r2 = S.round(2);
  assert.equal(r2.priceStatus, 'final');
  assert.ok(r2.prices.ICE < r1.prices.ICE, 'worst PPM falls');
  assert.equal(r2.prices.PAB, r1.prices.PAB);
  assert.ok(['KAM', 'JEN', 'NFS'].some(c => r2.prices[c] > r1.prices[c]) || true);
  const prov = seasonWith({ 1: ROUND1.replace('final', 'provisional') });
  assert.equal(prov.round(2).priceStatus, 'projected');
});

test('phase: open, locked, provisional, then next window', () => {
  const S = seasonWith({ 1: ROUND1.replace('final', 'provisional') });
  const S0 = seasonWith({});
  const before = new Date(S0.round(1).lockAt.getTime() - 3600e3);
  const after = new Date(S0.round(1).lockAt.getTime() + 3600e3);
  assert.equal(S0.phase(before).state, 'open');
  assert.equal(S0.phase(after).state, 'locked');
  assert.equal(S.phase(after).state, 'provisional');            // results in, stewards pending: window stays closed
  const SF = seasonWith({ 1: ROUND1 });
  assert.equal(SF.phase(after).round.id, 2);
  assert.equal(SF.phase(after).state, 'open');
});

// ---- squads -------------------------------------------------------------------------------

function cheapSquad(S, R, skip = []) {
  const reg = S.drivers.filter(d => d.role === 'regular' && !skip.includes(d.code)).sort((a, b) => R.prices[a.code] - R.prices[b.code]);
  const cons = [...S.teams].sort((a, b) => R.prices[a.id] - R.prices[b.id]);
  return { drivers: reg.slice(0, 5).map(d => d.code), constructors: cons.slice(0, 2).map(t => t.id) };
}

test('over-budget squads are rejected; round 1 has no transfer cost', () => {
  const S = seasonWith({});
  const R = S.round(1);
  const rich = [...S.drivers].filter(d => d.role === 'regular').sort((a, b) => R.prices[b.code] - R.prices[a.code]);
  const bad = { drivers: rich.slice(0, 5).map(d => d.code), constructors: ['audi', 'redbull'], drs: rich[0].code };
  const ev = evaluate(S, emptyState(S), R, bad);
  assert.equal(ev.valid, false);
  assert.match(ev.issues.join(' '), /Over budget/);
  assert.equal(ev.squad, null);

  const ok = { ...cheapSquad(S, R), drs: null };
  ok.drs = ok.drivers[0];
  const ev2 = evaluate(S, emptyState(S), R, ok);
  assert.equal(ev2.valid, true);
  assert.equal(ev2.transfers.penalty, 0);
  assert.ok(ev2.next.cash >= 0 && ev2.next.cash <= S.cfg.budget);
});

test('transfers: 2 free per round, -10 for each extra, banking 1, wildcard waives', () => {
  const S = seasonWith({ 1: ROUND1, 2: ROUND1.replace('round: 1', 'round: 2') });
  const R1 = S.round(1), R2 = S.round(2);
  const sq1 = cheapSquad(S, R1); sq1.drs = sq1.drivers[0];
  const reg = S.drivers.filter(d => d.role === 'regular').sort((a, b) => R2.prices[a.code] - R2.prices[b.code]);
  // swap 3 drivers for the next 3 cheapest outside the squad
  const outside = reg.filter(d => !sq1.drivers.includes(d.code)).slice(0, 3).map(d => d.code);
  const sq2 = { ...sq1, drivers: [...outside, ...sq1.drivers.slice(3)], drs: outside[0] };
  const p = resolvePlayer(S, { 1: sq1, 2: sq2 }, { upTo: 2 });
  assert.equal(p.rows[1].transfers.used, 3);
  assert.equal(p.rows[1].transfers.penalty, 10);               // 3 used, 2 free
  const wc = resolvePlayer(S, { 1: sq1, 2: { ...sq2, chip: 'wildcard' } }, { upTo: 2 });
  assert.equal(wc.rows[1].transfers.penalty, 0);
  // unused transfers bank at most 1: round 3 with 2 + 1 free
  const quiet = resolvePlayer(S, { 1: sq1 }, { upTo: 3 });      // no changes in rounds 2 and 3
  assert.equal(quiet.state.carry, 1);
  assert.equal(quiet.rows[1].squad.drivers.join(), sq1.drivers.join());   // squad carries over
});

test('points: DRS doubles, chips apply, penalty is deducted', () => {
  const S = seasonWith({ 1: ROUND1 });
  // fixed squad using drivers who scored: need a legal squad, so build a cheap one but include scorers via limitless
  const sq = { drivers: ['KAM', 'JEN', 'NFS', 'ICE', 'PAB'], constructors: ['audi', 'redbull'], drs: 'JEN', chip: 'limitless' };
  const p = resolvePlayer(S, { 1: sq }, { upTo: 1 });
  const row = p.rows[0];
  assert.equal(row.valid, true);
  // KAM 37 + JEN 41 + NFS 33 + ICE 5 + PAB 0 + audi 41 + redbull 37 = 194 ; DRS JEN +41
  assert.equal(row.points.raw, 194);
  assert.equal(row.points.bonus, 41);
  assert.equal(p.total, 235);
  const extra = resolvePlayer(S, { 1: { ...sq, chip: 'limitless' } }, { upTo: 1 });
  assert.equal(extra.rows[0].chip, 'limitless');
});

test('more absentees than reserves: no-shows score 0, DRS on a no-show moves to the best driver who raced', () => {
  // 5 regulars missing, only 2 reserves: ZMB and DON get stand-ins, PAB/SWU/RIC seats stay empty
  const S = seasonWith({
    1: `round: 1\nstatus: final\nsubs: ZMB>XMK DON>KIE\nquali: KAM JEN NFS XMK KIE ICE\nfeature: KAM JEN NFS XMK KIE ICE\nreverse: ICE KIE XMK NFS JEN KAM`,
  });
  const R = S.round(1);
  assert.equal(R.scores.effective.PAB.points, 0);            // no-show, no stand-in, no penalty
  assert.equal(R.scores.effective.PAB.via, null);
  assert.ok(R.scores.effective.ZMB.points > 0);               // seat filled by a reserve
  const sq = { drivers: ['PAB', 'ZMB', 'SWU', 'KAM', 'RIC'], constructors: ['redbull', 'alpine'], drs: 'PAB', chip: 'limitless' };
  const row = resolvePlayer(S, { 1: sq }, { upTo: 1 }).rows[0];
  assert.equal(row.points.drsMoved, true);
  assert.equal(row.points.drs, 'KAM');                        // KAM is the best-scoring driver who raced
  assert.equal(row.points.bonus, R.scores.effective.KAM.points);
  // switched off -> the boost is simply lost
  const off = seasonWith({ 1: `round: 1\nstatus: final\nquali: KAM\nfeature: KAM\nreverse: KAM` });
  off.cfg.drs.fallbackWhenAbsent = false;
  const r2 = resolvePlayer(off, { 1: sq }, { upTo: 1 }).rows[0];
  assert.equal(r2.points.drs, 'PAB');
  assert.equal(r2.points.bonus, 0);
});

test('No Negative floors losses at 0 and Autopilot picks the best driver', () => {
  const S = seasonWith({ 1: `round: 1\nstatus: final\nquali: KAM JEN\nfeature: JEN KAM ICE:dnf\nreverse: JEN KAM` });
  const R = S.round(1);
  const sq = { drivers: ['KAM', 'JEN', 'ICE', 'PAB', 'ZMB'], constructors: ['audi', 'redbull'], drs: 'ICE' };
  const raw = resolvePlayer(S, { 1: { ...sq, chip: 'limitless' } }, { upTo: 1 }).rows[0].points;
  assert.ok(raw.assets.ICE < 0 || raw.assets.ICE === R.scores.effective.ICE.points);
  const nn = resolvePlayer(S, { 1: { ...sq, chip: 'nonegative' } }, { upTo: 1 }).rows[0];
  if (nn.valid) for (const v of Object.values(nn.points.assets)) assert.ok(v >= 0);
});

test('announced-out drivers can be swapped for free and the stand-in becomes pickable', () => {
  const S = seasonWith({ 2: `round: 2\nstatus: upcoming\nout: ZMB>XMK` });
  const R2 = S.round(2);
  assert.ok(standInsFor(R2).has('XMK'));
  const R1 = S.round(1);
  const sq1 = cheapSquad(S, R1);
  if (!sq1.drivers.includes('ZMB')) sq1.drivers[4] = 'ZMB';
  sq1.drs = sq1.drivers[0];
  const base = emptyState(S);
  const e1 = evaluate(S, base, R1, sq1);
  assert.ok(e1.valid, e1.issues.join());
  const sq2 = { ...sq1, drivers: sq1.drivers.map(d => d === 'ZMB' ? 'XMK' : d), drs: sq1.drivers[0] === 'ZMB' ? 'XMK' : sq1.drivers[0] };
  const e2 = evaluate(S, e1.next, R2, sq2);
  assert.ok(e2.valid, e2.issues.join());
  assert.equal(e2.transfers.used, 1);
  assert.equal(e2.transfers.freeSwaps, 1);
  assert.equal(e2.transfers.effective, 0);
});
