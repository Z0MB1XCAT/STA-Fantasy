// Parses the pasted SimGrid championship tables in tools/source/leagueinfo.md
// into data/history/seasons.json. Run: node tools/parse-history.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'tools/source/leagueinfo.md'), 'utf8').split(/\r?\n/);

// Block order in the file is newest first (Season 4 ... Season 1).
const SEASONS = [
  { season: 4, rounds: 12 },
  { season: 3, rounds: 12 },
  { season: 2, rounds: 9 },
  { season: 1, rounds: 12 },
];

const start = src.findIndex(l => l.startsWith('Championships'));
const end = src.findIndex(l => l.startsWith('This season has a full grid'));
if (start < 0 || end < 0) throw new Error('Could not find the history section in leagueinfo.md');
const lines = src.slice(start, end);

// Split into season blocks on "----" lines.
const blocks = [[]];
for (const l of lines) {
  if (l.trim() === '----') blocks.push([]);
  else blocks[blocks.length - 1].push(l);
}
if (blocks.length < SEASONS.length) throw new Error(`Expected ${SEASONS.length} season blocks, found ${blocks.length}`);

const FLAG = /^(?:[\u{1F1E6}-\u{1F1FF}]{2}\s*)+/u;
const cleanName = s => s.replace(/\s+Follow\s*$/, '').replace(FLAG, '').trim();

function parseToken(tok) {
  // "3·11" -> ["3","11"]; "DNS" -> ["DNS"]; "—" -> ["—"]
  return tok.split('·').map(s => s.trim());
}

const out = [];
for (let b = 0; b < SEASONS.length; b++) {
  const { season, rounds } = SEASONS[b];
  const block = blocks[b];
  const entries = [];
  for (let i = 0; i < block.length; i++) {
    if (!/^\d,\d{3}$/.test(block[i].trim())) continue; // SimGrid rating line
    const name = cleanName(block[i - 1] ?? '');
    const rating = Number(block[i].trim().replace(',', ''));
    const tier = (block[i + 1] ?? '').trim();
    const teamLine = block[i + 2] ?? '';
    const parts = teamLine.split('\t');
    const team = parts[0].trim();
    const rest = parts.slice(1).map(s => s.trim()).filter(Boolean);
    const points = Number(rest.pop());
    let dsq = false;
    if (rest[0] === 'DSQ') { dsq = true; rest.shift(); }
    if (rest.length < rounds) throw new Error(`S${season} ${name}: only ${rest.length} result tokens (need ${rounds})`);
    const resultTokens = rest.slice(rest.length - rounds);
    entries.push({
      simgrid: name,
      rank: entries.length + 1,
      rating,
      tier,
      team,
      dsq,
      points,
      rounds: resultTokens.map(parseToken),
    });
  }
  out.push({ season, rounds, entries });
}

const dest = path.join(root, 'data/history/seasons.json');
fs.writeFileSync(dest, JSON.stringify({ generatedFrom: 'tools/source/leagueinfo.md', seasons: out }, null, 1));
for (const s of out) console.log(`Season ${s.season}: ${s.entries.length} drivers, ${s.rounds} rounds`);
console.log('Wrote', path.relative(root, dest));
