import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRound } from '../js/engine/parseRound.js';
import { buildSeason } from '../js/engine/season.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

export function baseData() {
  return {
    season: rd('data/season.json'),
    calendar: rd('data/calendar.json'),
    teams: rd('data/teams.json'),
    drivers: rd('data/drivers.json'),
  };
}

/** Build a season from the real data files plus the given round files (text, keyed by round id). */
export function seasonWith(roundTexts = {}, tweak = null) {
  const data = baseData();
  if (tweak) tweak(data);
  const codes = new Set(data.drivers.drivers.map(d => d.code));
  const rounds = new Map();
  for (const [id, text] of Object.entries(roundTexts)) rounds.set(Number(id), parseRound(text, { codes }));
  return buildSeason({ ...data, rounds });
}

export const codesOf = () => new Set(baseData().drivers.drivers.map(d => d.code));

// hand-checked fixture used by several tests
export const ROUND1 = `
round: 1
status: final
quali:   KAM JEN NFS ICE
reverse: NFS ICE KAM JEN
feature: JEN KAM ICE:dnf NFS
fastest: feature=JEN
`;
