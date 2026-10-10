// Builds data/drivers.json (identity + starting price + rating basis) from:
//   data/roster.json            who is who
//   data/history/seasons.json   parsed championships (tools/parse-history.mjs)
//   data/history/ratings.json   SimGrid ratings for rookies (fill these in)
//   data/season.json            price curve settings
// Run: node tools/seed-prices.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const roster = rd('data/roster.json').drivers;
const history = rd('data/history/seasons.json').seasons;
const ratingsFile = rd('data/history/ratings.json');
const cfg = rd('data/season.json').prices;
const teams = rd('data/teams.json').teams;

const FIELD = 20;              // typical grid size, used to normalise finishing positions
const DNF_QUALITY = 0.12;      // started but did not finish: poor, not zero
const SEASON_WEIGHT = { 4: 1, 3: 0.55, 2: 0.3, 1: 0.15 };
const SHRINK_K = 6;            // pseudo-sessions of "average" mixed in, so tiny samples don't dominate

const key = s => s.toLowerCase().trim();

// quality in [0,1] for one session token, or null if the driver did not take part
function quality(tok) {
  if (/^\d+$/.test(tok)) return Math.max(0, Math.min(1, (FIELD - Number(tok)) / (FIELD - 1)));
  if (tok === 'DNF') return DNF_QUALITY;
  return null; // DNS, DSQ, —
}

// per-driver, per-season: { n sessions, mean quality, rounds attended }
function seasonStats(entry) {
  let n = 0, sum = 0, roundsIn = 0;
  for (const r of entry.rounds) {
    let any = false;
    for (const tok of r) {
      const q = quality(tok);
      if (q != null) { n++; sum += q; any = true; }
    }
    if (any) roundsIn++;
  }
  return { n, mean: n ? sum / n : null, roundsIn };
}

// every historical driver: weighted quality + latest known SimGrid rating
const people = new Map();
for (const s of history) {
  for (const e of s.entries) {
    const k = key(e.simgrid);
    if (!people.has(k)) people.set(k, { name: e.simgrid, seasons: {}, rating: null });
    const p = people.get(k);
    p.seasons[s.season] = seasonStats(e);
    if (p.rating == null) p.rating = e.rating; // newest season first
  }
}

const allQ = [];
for (const p of people.values()) {
  let wN = 0, wSum = 0;
  for (const [season, st] of Object.entries(p.seasons)) {
    if (!st.n) continue;
    const w = SEASON_WEIGHT[season] * st.n;
    wN += w; wSum += w * st.mean;
  }
  p.wN = wN; p.rawQ = wN ? wSum / wN : null;
  if (p.rawQ != null && p.wN >= 4) allQ.push(p.rawQ);
}
const priorQ = allQ.reduce((a, b) => a + b, 0) / allQ.length;
for (const p of people.values()) {
  p.q = p.rawQ == null ? null : (p.wN * p.rawQ + SHRINK_K * priorQ) / (p.wN + SHRINK_K);
}

// regression of quality on SimGrid rating (only people with a decent sample), used for rookies
const pts = [...people.values()].filter(p => p.q != null && p.wN >= 6 && p.rating);
const mx = pts.reduce((a, p) => a + p.rating, 0) / pts.length;
const my = pts.reduce((a, p) => a + p.q, 0) / pts.length;
let sxy = 0, sxx = 0, syy = 0;
for (const p of pts) { sxy += (p.rating - mx) * (p.q - my); sxx += (p.rating - mx) ** 2; syy += (p.q - my) ** 2; }
const slope = sxy / sxx, intercept = my - slope * mx;
const r2 = (sxy * sxy) / (sxx * syy);
const predict = rating => Math.max(0.05, Math.min(0.95, intercept + slope * rating));

// current lineup -> quality
const rows = roster.map(d => {
  const hist = people.get(key(d.simgrid));
  const hasHistory = hist && hist.q != null && hist.wN >= 1;
  let q, basis, rating = null, placeholder = false;
  if (hasHistory) {
    q = hist.q; basis = 'history'; rating = hist.rating;
  } else {
    const given = ratingsFile.ratings[d.simgrid];
    if (given == null) { rating = ratingsFile.placeholderRating; placeholder = true; }
    else rating = given;
    // regression is noisy, so pull rookies 25% toward the average
    q = 0.75 * predict(rating) + 0.25 * priorQ;
    // exactly 2000 is SimGrid's starting value: the driver has no rated races, so the number says nothing
    basis = placeholder ? 'placeholder' : rating === 2000 ? 'simgrid-unrated' : 'simgrid-rating';
  }
  return { ...d, q, basis, rating, placeholder, sessions: hist ? Math.round(hist.wN * 10) / 10 : 0 };
});

// map quality -> price. Convex curve, exponent tuned so the mean driver price hits the target.
const regulars = rows.filter(r => r.role === 'regular');
const qs = regulars.map(r => r.q);
const qMin = Math.min(...qs), qMax = Math.max(...qs);
const priceAt = (q, exp) => cfg.min + (cfg.max - cfg.min) * ((q - qMin) / (qMax - qMin)) ** exp;
let lo = 0.3, hi = 4;
for (let i = 0; i < 60; i++) {
  const mid = (lo + hi) / 2;
  const mean = regulars.reduce((a, r) => a + priceAt(r.q, mid), 0) / regulars.length;
  if (mean > cfg.targetDriverMean) lo = mid; else hi = mid;
}
const exp = (lo + hi) / 2;
const round1 = x => Math.round(x * 10) / 10;

const drivers = rows.map(r => ({
  code: r.code,
  name: r.name,
  simgrid: r.simgrid,
  team: r.team,
  role: r.role,
  nat: r.nat ?? null,
  price: r.role === 'reserve' ? cfg.reservePrice : round1(priceAt(r.q, exp)),
  basis: r.basis,
  rating: r.rating,
  quality: Math.round(r.q * 1000) / 1000,
  historySessions: r.sessions,
}));

// constructors priced from their two drivers
const teamOut = teams.map(t => {
  const ds = drivers.filter(d => d.team === t.id);
  const sum = ds.reduce((a, d) => a + d.price, 0);
  return { id: t.id, price: round1(sum * cfg.constructorFactor) };
});

const out = {
  generatedBy: 'tools/seed-prices.mjs',
  note: 'Starting prices before Round 1. Safe to hand-edit a price, but re-running the tool overwrites this file.',
  model: { fieldSize: FIELD, seasonWeights: SEASON_WEIGHT, shrinkK: SHRINK_K, priorQuality: round1(priorQ * 1000) / 1000, curveExponent: Math.round(exp * 1000) / 1000, ratingFit: { slope, intercept, r2: Math.round(r2 * 1000) / 1000, n: pts.length } },
  drivers,
  constructors: teamOut,
};
fs.writeFileSync(path.join(root, 'data/drivers.json'), JSON.stringify(out, null, 1));

// report
const pad = (s, n) => String(s).padEnd(n);
console.log(`rating->quality fit: r2=${r2.toFixed(2)} on ${pts.length} drivers (slope ${slope.toExponential(2)}), prior quality ${priorQ.toFixed(3)}, curve exp ${exp.toFixed(2)}`);
console.log(pad('code', 5), pad('name', 18), pad('team', 10), pad('basis', 15), pad('rating', 7), pad('quality', 8), 'price');
for (const d of [...drivers].sort((a, b) => b.price - a.price)) {
  console.log(pad(d.code, 5), pad(d.name, 18), pad(d.team ?? '-', 10), pad(d.basis, 15), pad(d.rating ?? '', 7), pad(d.quality.toFixed(3), 8), d.price.toFixed(1));
}
console.log('\nConstructors:');
for (const c of [...teamOut].sort((a, b) => b.price - a.price)) console.log(' ', pad(c.id, 10), c.price.toFixed(1));
const meanD = regulars.reduce((a, r) => a + (drivers.find(d => d.code === r.code).price), 0) / regulars.length;
const meanC = teamOut.reduce((a, c) => a + c.price, 0) / teamOut.length;
console.log(`\nMean driver ${meanD.toFixed(2)}, mean constructor ${meanC.toFixed(2)}, avg squad (5D+2C) = ${(5 * meanD + 2 * meanC).toFixed(1)} vs budget ${rd('data/season.json').budget}`);
const missing = drivers.filter(d => d.basis === 'placeholder').map(d => d.simgrid);
if (missing.length) console.log(`\nPlaceholder rating used for ${missing.length} rookies (add real ratings to data/history/ratings.json): ${missing.join(', ')}`);
