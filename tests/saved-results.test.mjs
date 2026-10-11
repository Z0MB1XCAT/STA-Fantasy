import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRounds } from '../js/engine/chooseRounds.js';
import { parseRound, serializeRound } from '../js/engine/parseRound.js';
import { seasonWith, codesOf } from './helpers.mjs';

const ids = [1, 2, 3];
const files = ['round: 1\nstatus: upcoming\n', 'round: 2\nstatus: upcoming\n', null];

test('a saved row beats the round file; with no row the file is used', () => {
  const rows = new Map([[2, { round_id: 2, content: 'round: 2\nstatus: provisional\n', updated_at: '2026-10-23T21:30:00Z' }]]);
  const picks = chooseRounds(ids, files, rows);
  assert.equal(picks[0].source, 'file');
  assert.equal(picks[1].source, 'database');
  assert.match(picks[1].text, /provisional/);
  assert.equal(picks[1].updatedAt, '2026-10-23T21:30:00Z');
});

test('a round with no file and no row is simply not played yet', () => {
  assert.equal(chooseRounds(ids, files, new Map())[2], null);
});

test('a saved row works even when the repo has no file for that round', () => {
  const rows = new Map([[3, { round_id: 3, content: 'round: 3\nstatus: final\n' }]]);
  assert.equal(chooseRounds(ids, files, rows)[2].source, 'database');
});

test('an empty saved row is ignored rather than wiping the round', () => {
  const rows = new Map([[1, { round_id: 1, content: '  \n' }]]);
  assert.equal(chooseRounds(ids, files, rows)[0].source, 'file');
});

test('what the admin page saves is read back as the same round, including who is not racing', () => {
  const saved = serializeRound({
    round: 1, status: 'upcoming', out: ['PAB', 'ICE'], sessions: { quali: [], reverse: [], feature: [] },
    grids: {}, fastest: {}, notes: 'Pablo is away',
  });
  const back = parseRound(saved, { codes: codesOf() });
  assert.ok(back.ok, back.errors.join('; '));
  assert.deepEqual(back.out, ['PAB', 'ICE']);
  assert.equal(back.notes, 'Pablo is away');
  assert.equal(back.status, 'upcoming');
});

test('a not-racing announcement saved from the database shows up in the season', () => {
  const text = serializeRound({ round: 1, status: 'upcoming', out: ['PAB'], sessions: { quali: [], reverse: [], feature: [] }, grids: {}, fastest: {}, notes: '' });
  const picks = chooseRounds([1], [null], new Map([[1, { content: text }]]));
  const S = seasonWith({ 1: picks[0].text });
  assert.deepEqual(S.round(1).file.out, ['PAB']);
});
