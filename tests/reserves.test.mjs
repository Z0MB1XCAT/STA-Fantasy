import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRound } from '../js/engine/parseRound.js';
import { buildSeason } from '../js/engine/season.js';
import { CODE_RE, mergeReserves, suggestCode, checkReserve, roundsUsing } from '../js/engine/reserves.js';
import { baseData } from './helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = [
  { code: 'KAR', name: 'KaR3Nyeeee', simgrid: 'KaR3Nyeeee' },
  { code: 'CAM', name: 'cameron_rowlands1234', simgrid: null },
];

test('added reserves become reserve drivers with no team, after the built-in ones', () => {
  const d = baseData();
  const merged = mergeReserves(d.drivers, rows, 4.5);
  const added = merged.drivers.filter(x => x.added);
  assert.deepEqual(added.map(x => x.code), ['KAR', 'CAM']);
  for (const x of added) {
    assert.equal(x.role, 'reserve');
    assert.equal(x.team, null);
    assert.equal(x.price, 4.5);
  }
  assert.equal(added[1].simgrid, null);
  assert.deepEqual(merged.drivers.slice(0, d.drivers.drivers.length).map(x => x.code), d.drivers.drivers.map(x => x.code));
  assert.equal(merged.constructors, d.drivers.constructors);
});

test('a code already in drivers.json wins, bad rows are skipped, and merging again replaces earlier additions', () => {
  const d = baseData();
  const messy = [
    { code: 'XMK', name: 'Imposter', simgrid: null },       // built in already
    { code: 'ab', name: 'Too short', simgrid: null },
    { code: 'ZZZ', name: '   ', simgrid: null },
    { code: 'KAR', name: 'First', simgrid: null },
    { code: 'KAR', name: 'Second', simgrid: null },          // duplicate of the row above
    null,
  ];
  const once = mergeReserves(d.drivers, messy, 4.5);
  assert.deepEqual(once.drivers.filter(x => x.added).map(x => `${x.code}:${x.name}`), ['KAR:First']);
  assert.equal(once.drivers.find(x => x.code === 'XMK').name, d.drivers.drivers.find(x => x.code === 'XMK').name);
  const twice = mergeReserves(once, rows, 4.5);
  assert.deepEqual(twice.drivers.filter(x => x.added).map(x => x.code), ['KAR', 'CAM']);
  assert.equal(twice.drivers.length, d.drivers.drivers.length + 2);
  assert.equal(mergeReserves(d.drivers, undefined, 4.5).drivers.length, d.drivers.drivers.length);
});

test('a saved round can name an added reserve once the reserves are merged, and not before', () => {
  const d = baseData();
  const text = 'round: 1\nstatus: provisional\nquali: KAM KAR JEN\nreverse: KAR KAM JEN\nfeature: JEN KAM KAR:dnf\n';
  const before = parseRound(text, { codes: new Set(d.drivers.drivers.map(x => x.code)) });
  assert.equal(before.ok, false);
  assert.match(before.errors.join(' '), /unknown driver code KAR/);

  const merged = mergeReserves(d.drivers, rows, 4.5);
  const after = parseRound(text, { codes: new Set(merged.drivers.map(x => x.code)) });
  assert.equal(after.ok, true, after.errors.join('; '));
});

test('an added reserve scores for nobody, takes no constructor points and never moves in price', () => {
  const d = baseData();
  const merged = mergeReserves(d.drivers, rows, 4.5);
  const codes = new Set(merged.drivers.map(x => x.code));
  const r1 = parseRound('round: 1\nstatus: final\nquali: KAR KAM JEN NFS\nreverse: KAR KAM JEN NFS\nfeature: KAR KAM JEN NFS\n', { codes });
  const S = buildSeason({ ...d, drivers: merged, rounds: new Map([[1, r1]]) });
  const R = S.round(1);
  assert.equal(R.scores.constructors.alpine.seats.includes('KAR'), false);
  for (const t of S.teams) assert.equal(R.scores.constructors[t.id].seats.includes('KAR'), false);
  assert.equal(S.round(2).prices.KAR, S.round(1).prices.KAR);
  assert.equal(S.driverMap.get('KAR').role, 'reserve');
});

test('suggested codes are valid, unused, and read well', () => {
  const d = baseData();
  const taken = new Set(d.drivers.drivers.map(x => x.code));
  assert.equal(suggestCode('KaR3Nyeeee', taken), 'KAR');
  assert.equal(suggestCode('Bvessier', taken), 'BVE');
  assert.equal(suggestCode('арсений', taken), 'ARS');                       // Cyrillic is transliterated
  assert.equal(suggestCode('фанат жидких с 2008', taken), 'FAN');
  assert.equal(suggestCode('Faze_Goma', taken), 'FGO', 'FAZ is already a regular driver');
  assert.equal(suggestCode('1234', taken, 'arcxlight'), 'ARC', 'falls back to the other names when the first has no letters');
});

test('suggested codes never collide, even when almost every obvious choice is taken', () => {
  const taken = new Set(['ABC', 'ABD', 'ABE', 'ACD', 'ACE', 'ADE', 'AB1', 'AB2']);
  const c = suggestCode('Abcde', taken);
  assert.match(c, CODE_RE);
  assert.equal(taken.has(c), false);
  const lots = new Set();
  for (let i = 0; i < 40; i++) { const c2 = suggestCode('Same Name', lots); assert.match(c2, CODE_RE); assert.equal(lots.has(c2), false); lots.add(c2); }
  assert.equal(suggestCode('12', new Set(), '!!'), 'R01', 'a name with no letters still gets a usable code');
  assert.equal(suggestCode('12', new Set(['R01', 'R02'])), 'R03');
});

test('the add form: trims, upper-cases, and explains what is wrong', () => {
  const taken = new Set(['KAM', 'XMK']);
  const good = checkReserve({ name: '  Some   Racer ', code: ' som ', simgrid: ' ', discord: '@somebody' }, taken);
  assert.equal(good.ok, true);
  assert.deepEqual(good.clean, { code: 'SOM', name: 'Some Racer', simgrid: null, discord: 'somebody' });

  assert.match(checkReserve({ name: '', code: 'SOM' }, taken).errors.join(' '), /Enter a name/);
  assert.match(checkReserve({ name: 'x', code: '' }, taken).errors.join(' '), /3-character code/);
  assert.match(checkReserve({ name: 'x', code: 'AB' }, taken).errors.join(' '), /exactly 3/);
  assert.match(checkReserve({ name: 'x', code: 'A-B' }, taken).errors.join(' '), /exactly 3/);
  assert.match(checkReserve({ name: 'x', code: 'kam' }, taken).errors.join(' '), /KAM is already used/);
  assert.match(checkReserve({ name: 'x'.repeat(41), code: 'ABC' }, taken).errors.join(' '), /at most 40/);
});

test('removal is blocked for a driver who is in a round: results, not-racing list or grid override', () => {
  const rounds = new Map([
    [1, parseRound('round: 1\nstatus: final\nquali: KAM KAR\n', {})],
    [2, parseRound('round: 2\nstatus: upcoming\nout: CAM\n', {})],
    [3, parseRound('round: 3\nstatus: provisional\nquali: KAM\nreverse: KAM\nfeature: KAM\ngridfeature: KAM ARC\n', {})],
    [4, null],
  ]);
  assert.deepEqual(roundsUsing('KAR', rounds), [1]);
  assert.deepEqual(roundsUsing('CAM', rounds), [2]);
  assert.deepEqual(roundsUsing('ARC', rounds), [3]);
  assert.deepEqual(roundsUsing('ALE', rounds), []);
});

test('the reserves seeded by the migration are well-formed and do not clash with the roster', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261016_reserves.sql'), 'utf8');
  const block = sql.slice(sql.indexOf('insert into public.reserves'), sql.indexOf('insert into public.reserve_contacts'));
  const seeded = [...block.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(null|'[^']+')\s*\)/g)].map(m => ({ code: m[1], name: m[2] }));
  assert.equal(seeded.length, 7);
  const used = new Set(baseData().drivers.drivers.map(x => x.code));
  for (const s of seeded) {
    assert.match(s.code, CODE_RE);
    assert.equal(used.has(s.code), false, `${s.code} is already a driver`);
    used.add(s.code);
  }
  const contacts = [...sql.slice(sql.indexOf('insert into public.reserve_contacts')).matchAll(/\(\s*'([A-Z0-9]{3})'\s*,/g)].map(m => m[1]);
  assert.deepEqual(contacts, seeded.map(s => s.code), 'every seeded reserve has a Discord entry, in the same order');
});
