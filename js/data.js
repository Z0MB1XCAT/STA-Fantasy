// Loads the season facts (JSON + one text file per round) and replays the season.
// Results saved from the admin page come from the database and win over the round files in the repo.
import { parseRound } from './engine/parseRound.js';
import { chooseRounds } from './engine/chooseRounds.js';
import { buildSeason } from './engine/season.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { localResultRows } from './store.js';

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

// How far this device's clock is from the server's (ms, server minus device). The deadline is enforced by the
// database's clock, so the countdown and the open/locked state must follow that, not a phone that is a few minutes off.
let serverOffsetMs = 0;
export const serverClockOffset = () => serverOffsetMs;

/**
 * Results saved from the admin page, as Map<roundId, {content, updated_at}>.
 * Never throws: if the database can't be reached the round files in the repo are used instead, so the
 * site still shows whatever was last committed.
 */
async function getSavedResults() {
  if (qs.get('store') === 'local') return localResultRows();                // demo mode keeps its own
  if (qs.get('rounds') || qs.get('data')) return new Map();                 // developer fixtures
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const sent = Date.now();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/round_results?select=round_id,content,updated_at`, {
      headers: { apikey: SUPABASE_KEY }, cache: 'no-store', signal: ctl.signal,
    });
    const got = Date.now();
    const server = Date.parse(r.headers.get('date') || '');
    // the Date header is whole seconds (rounded down), so add half a second, and split the round trip evenly
    if (!Number.isNaN(server)) serverOffsetMs = server + 500 - (sent + got) / 2;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return new Map((await r.json()).map(row => [row.round_id, row]));
  } catch (e) {
    console.warn('Saved results unavailable, using the round files', e);
    return new Map();
  } finally { clearTimeout(timer); }
}

export async function loadSeason() {
  const [season, calendar, teams, drivers, saved] = await Promise.all([
    getJson('season.json'), getJson('calendar.json'), getJson('teams.json'), getJson('drivers.json'), getSavedResults(),
  ]);
  const codes = new Set(drivers.drivers.map(d => d.code));
  const ids = calendar.rounds.map(r => r.id);
  const fileTexts = await Promise.all(ids.map(id => getText(`${ROUNDS_BASE}/${pad(id)}.txt`)));
  const rounds = new Map();
  const sources = new Map();     // round id -> { source: 'database' | 'file', updatedAt }
  const problems = [];
  chooseRounds(ids, fileTexts, saved).forEach(pick => {
    if (!pick) return;
    const p = parseRound(pick.text, { codes });
    if (p.round !== pick.id) { p.errors.push(`The results say "round: ${p.round}" but should say "round: ${pick.id}"`); p.ok = false; }
    rounds.set(pick.id, p);
    sources.set(pick.id, { source: pick.source, updatedAt: pick.updatedAt });
    if (!p.ok) problems.push({ round: pick.id, errors: p.errors });
  });
  const S = buildSeason({ season, calendar, teams, drivers, rounds });
  return { S, problems, rounds, sources, raw: { season, calendar, teams, drivers } };
}
