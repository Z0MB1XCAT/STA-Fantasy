// Loads the season facts (JSON + one text file per round) and replays the season.
import { parseRound } from './engine/parseRound.js';
import { buildSeason } from './engine/season.js';

import { params as qs } from './env.js';
// ?data=tests/fixtures lets us point the whole site at a different folder while developing
export const DATA_BASE = (qs.get('data') || 'data').replace(/[^a-z0-9_\-/]/gi, '');

// ?rounds=tests/fixtures/rounds swaps only the round files (used with tools/make-demo.mjs)
const ROUNDS_BASE = (qs.get('rounds') || `${DATA_BASE}/rounds`).replace(/[^a-z0-9_\-/]/gi, '');

async function getJson(p) {
  const r = await fetch(`${DATA_BASE}/${p}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Could not load ${p} (${r.status})`);
  return r.json();
}
async function getText(p) {
  const r = await fetch(p, { cache: 'no-cache' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Could not load ${p} (${r.status})`);
  return r.text();
}
const pad = n => String(n).padStart(2, '0');

export async function loadSeason() {
  const [season, calendar, teams, drivers] = await Promise.all([
    getJson('season.json'), getJson('calendar.json'), getJson('teams.json'), getJson('drivers.json'),
  ]);
  const codes = new Set(drivers.drivers.map(d => d.code));
  const texts = await Promise.all(calendar.rounds.map(r => getText(`${ROUNDS_BASE}/${pad(r.id)}.txt`)));
  const rounds = new Map();
  const problems = [];
  texts.forEach((t, i) => {
    if (t == null) return;
    const id = calendar.rounds[i].id;
    const p = parseRound(t, { codes });
    if (p.round !== id) { p.errors.push(`${pad(id)}.txt says "round: ${p.round}" but should say "round: ${id}"`); p.ok = false; }
    rounds.set(id, p);
    if (!p.ok) problems.push({ round: id, errors: p.errors });
  });
  const S = buildSeason({ season, calendar, teams, drivers, rounds });
  return { S, problems, rounds, raw: { season, calendar, teams, drivers } };
}
