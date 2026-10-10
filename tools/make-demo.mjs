// Generates FAKE round results for trying the site without real data. Never touches data/rounds.
//   node tools/make-demo.mjs
// Then open e.g.  http://localhost:3000/index.html?rounds=tests/fixtures/rounds&store=local&demo=1&now=2026-11-04T12:00:00Z
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRound } from '../js/engine/parseRound.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const drivers = JSON.parse(fs.readFileSync(path.join(root, 'data/drivers.json'), 'utf8')).drivers;
const regulars = drivers.filter(d => d.role === 'regular');
const codes = new Set(drivers.map(d => d.code));

function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function shuffleBy(list, score, r, noise) {
  return list.map(x => ({ x, s: score(x) + (r() - 0.5) * noise })).sort((a, b) => b.s - a.s).map(o => o.x);
}

function makeRound(id, status, seed, opts = {}) {
  const r = rng(seed);
  const absent = new Set();
  const reserves = ['XMK', 'KIE'];
  const pool = regulars.map(d => d.code);
  for (let i = 0; i < (opts.absent ?? 3); i++) { const c = pool[Math.floor(r() * pool.length)]; absent.add(c); }
  // reserves still race (they fill the grid) but are not part of the fantasy game
  const racing = [...regulars.filter(d => !absent.has(d.code)).map(d => d.code), ...reserves.slice(0, Math.min(2, absent.size))];
  const strength = c => (drivers.find(d => d.code === c)?.quality ?? 0.5) * 10;
  const quali = shuffleBy(racing, strength, r, 6);
  const reverseGrid = [...quali].reverse();
  const reverse = shuffleBy(racing, c => strength(c) * 0.4 - reverseGrid.indexOf(c) * 0.0 + (quali.length - quali.indexOf(c)) * -0.15, r, 7);
  const feature = shuffleBy(racing, c => strength(c) + (quali.length - quali.indexOf(c)) * 0.12, r, 5);
  const mark = (list, nDnf) => list.map((c, i) => (i >= list.length - nDnf && i > 5 ? c + ':dnf' : c));
  const lines = [`round: ${id}`, `status: ${status}`];
  if (status !== 'upcoming') {
    lines.push(`quali: ${quali.join(' ')}`);
    lines.push(`reverse: ${mark(reverse, 2).join(' ')}`);
    lines.push(`feature: ${mark(feature, 1).join(' ')}`);
    lines.push(`fastest: reverse=${reverse[0]} feature=${feature[Math.floor(r() * 3)]}`);
  }
  const text = lines.join('\n') + '\n';
  const parsed = parseRound(text, { codes });
  if (!parsed.ok) throw new Error(`demo round ${id}: ${parsed.errors.join('; ')}`);
  return text;
}

function write(dir, plan) {
  const abs = path.join(root, 'tests/fixtures', dir);
  fs.mkdirSync(abs, { recursive: true });
  for (let id = 1; id <= 12; id++) {
    const p = plan[id] || ['upcoming', 100 + id, { absent: 0 }];
    const upcoming = `round: ${id}\nstatus: upcoming\n${p[2]?.out ? `out: ${p[2].out.join(' ')}\n` : ''}`;
    fs.writeFileSync(path.join(abs, String(id).padStart(2, '0') + '.txt'), p[0] === 'upcoming' ? upcoming : makeRound(id, p[0], p[1], p[2]));
  }
}

// R1-R3 final -> picks open for round 4, with KAM and FAZ announced as not racing
write('rounds', { 1: ['final', 11, {}], 2: ['final', 22, { absent: 4 }], 3: ['final', 33, {}], 4: ['upcoming', 44, { out: ['KAM', 'FAZ'] }] });
// R1-R2 final, R3 provisional -> window closed, waiting on the stewards
write('rounds-prov', { 1: ['final', 11, {}], 2: ['final', 22, { absent: 4 }], 3: ['provisional', 33, {}] });
console.log('Wrote tests/fixtures/rounds and tests/fixtures/rounds-prov');
