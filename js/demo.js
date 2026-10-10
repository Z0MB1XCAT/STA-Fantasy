// Development only (needs ?store=local&demo=1): invents players and picks so every screen has something to show.
import { evaluate, emptyState } from './engine/squad.js';

function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const NAMES = ['Maya', 'Dex', 'Sol', 'Rhea', 'Kai', 'Nova', 'Jules', 'Ines', 'Tobi', 'Wren'];
const TEAMS = ['Apex Predators', 'Late Brakers', 'Tarmac Tigers', 'DRS Dreamers', 'Box Box', 'Slipstream', 'Parc Fermé', 'Chicane Club', 'Pole Position', 'Undercut FC'];

export function seedDemo(S, store, as = 'Maya') {
  const players = NAMES.map((n, i) => ({ id: 'demo-' + n.toLowerCase(), username: n.toLowerCase(), name: n, team: TEAMS[i] }));
  const subs = {};
  const regs = S.drivers.filter(d => d.role === 'regular').map(d => d.code);
  const cons = S.teams.map(t => t.id);
  const chipIds = Object.keys(S.cfg.chips);
  const lastRound = Math.max(...S.rounds.filter(r => r.status !== 'upcoming').map(r => r.id), 0);

  players.forEach((p, pi) => {
    const r = rng(1000 + pi * 17);
    const pick = (arr, n, exclude = []) => { const pool = arr.filter(x => !exclude.includes(x)); const out = []; while (out.length < n) { const c = pool.splice(Math.floor(r() * pool.length), 1)[0]; out.push(c); } return out; };
    let state = emptyState(S);
    subs[p.id] = {};
    for (const R of S.rounds) {
      if (R.id > lastRound) break;
      let cand = null, ev = null;
      for (let t = 0; t < 400; t++) {
        if (state.base) {
          cand = { drivers: [...state.base.drivers], constructors: [...state.base.constructors], drs: null };
          const k = Math.floor(r() * 4);
          for (let i = 0; i < k; i++) {
            if (r() < 0.7) { const idx = Math.floor(r() * 5); cand.drivers[idx] = pick(regs, 1, cand.drivers)[0]; }
            else { const idx = Math.floor(r() * 2); cand.constructors[idx] = pick(cons, 1, cand.constructors)[0]; }
          }
        } else {
          cand = { drivers: pick(regs, 5), constructors: pick(cons, 2), drs: null };
        }
        cand.drs = cand.drivers[Math.floor(r() * 5)];
        if (r() < 0.07) { const free = chipIds.filter(c => !state.chips.includes(c)); if (free.length) cand.chip = free[Math.floor(r() * free.length)]; }
        ev = evaluate(S, state, R, cand);
        if (ev.valid) break;
      }
      if (ev?.valid) { subs[p.id][R.id] = { drivers: cand.drivers, constructors: cand.constructors, drs: cand.drs, chip: cand.chip || null }; state = ev.next; }
    }
  });
  const me = players.find(p => p.name.toLowerCase() === as.toLowerCase()) || players[0];
  store._replace({ players, subs, me: me.id });
}
