import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRound } from '../js/engine/parseRound.js';
import { baseData } from './helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const d = baseData();

test('roster: unique 3-letter codes, 22 regulars in 11 teams of 2, plus reserves', () => {
  const codes = d.drivers.drivers.map(x => x.code);
  assert.equal(new Set(codes).size, codes.length, 'duplicate code');
  for (const c of codes) assert.match(c, /^[A-Z0-9]{3}$/);
  const regs = d.drivers.drivers.filter(x => x.role === 'regular');
  assert.equal(regs.length, 22);
  assert.equal(d.teams.teams.length, 11);
  for (const t of d.teams.teams) {
    const mine = regs.filter(x => x.team === t.id).map(x => x.code).sort();
    assert.equal(mine.length, 2, `${t.id} should have 2 drivers`);
    assert.deepEqual(mine, [...t.drivers].sort(), `${t.id} roster differs from teams.json`);
  }
  assert.ok(d.drivers.drivers.filter(x => x.role === 'reserve').length >= 2);
  assert.equal(d.drivers.constructors.length, 11);
});

test('calendar: 12 Fridays, deadline is 8 pm UK time', () => {
  const rounds = d.calendar.rounds;
  assert.equal(rounds.length, 12);
  rounds.forEach((r, i) => {
    assert.equal(r.id, i + 1);
    const day = new Date(r.date + 'T12:00:00Z').getUTCDay();
    assert.equal(day, 5, `${r.name} (${r.date}) is not a Friday`);
    const uk = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(r.lockUtc));
    assert.equal(uk, '20:00', `${r.name} lock is ${uk} UK time`);
    const ukDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(r.lockUtc));
    assert.equal(ukDate, r.date, `${r.name} lock falls on a different UK date`);
  });
  const ids = rounds.map(r => new Date(r.lockUtc).getTime());
  assert.deepEqual([...ids].sort((a, b) => a - b), ids, 'rounds out of order');
});

test('starting prices: sensible, constructors consistent, an average squad is about the budget', () => {
  const regs = d.drivers.drivers.filter(x => x.role === 'regular');
  for (const x of d.drivers.drivers) assert.ok(x.price >= d.season.prices.min && x.price <= d.season.prices.max, `${x.code} price ${x.price}`);
  const meanD = regs.reduce((a, x) => a + x.price, 0) / regs.length;
  const meanC = d.drivers.constructors.reduce((a, c) => a + c.price, 0) / d.drivers.constructors.length;
  const avgSquad = 5 * meanD + 2 * meanC;
  assert.ok(avgSquad > d.season.budget * 0.93 && avgSquad < d.season.budget * 1.08, `average squad costs ${avgSquad.toFixed(1)}`);
  // it must be possible to build a squad of the very best (otherwise nobody can pick stars)
  const cheap5 = regs.map(x => x.price).sort((a, b) => a - b).slice(0, 5).reduce((a, b) => a + b, 0);
  assert.ok(cheap5 < d.season.budget / 2);
});

test('every round file in data/rounds parses cleanly and matches its filename', () => {
  const codes = new Set(d.drivers.drivers.map(x => x.code));
  const dir = path.join(root, 'data/rounds');
  const files = fs.readdirSync(dir).filter(f => /^\d\d\.txt$/.test(f));
  assert.equal(files.length, 12, 'expected 01.txt ... 12.txt');
  for (const f of files) {
    const p = parseRound(fs.readFileSync(path.join(dir, f), 'utf8'), { codes });
    assert.deepEqual(p.errors, [], `${f}: ${p.errors.join('; ')}`);
    assert.equal(p.round, Number(f.slice(0, 2)), `${f} says round ${p.round}`);
  }
});

test('demo fixtures (if generated) are valid too', () => {
  const codes = new Set(d.drivers.drivers.map(x => x.code));
  for (const sub of ['rounds', 'rounds-prov']) {
    const dir = path.join(root, 'tests/fixtures', sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const p = parseRound(fs.readFileSync(path.join(dir, f), 'utf8'), { codes });
      assert.deepEqual(p.errors, [], `${sub}/${f}`);
    }
  }
});

test('parseRound warns when a replaced driver also appears in the results', () => {
  const codes = new Set(d.drivers.drivers.map(x => x.code));
  const p = parseRound('round: 1\nstatus: provisional\nsubs: ZMB>XMK\nquali: KAM ZMB XMK', { codes });
  assert.equal(p.ok, true);
  assert.match(p.warnings.join(' '), /ZMB is marked as replaced/);
});
