// Where players and their saved picks live.
//  - supabaseStore: the real thing (logins, deadline enforced by the database)
//  - localStore:    browser-only fallback for development / when Supabase can't be reached
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_JS } from './config.js';

import { params as qs, DEV } from './env.js';

// must match slugify()/emailFor() in the `join` edge function
export const slugify = name => name.trim().toLowerCase().replace(/\s+/g, '-');
export const emailFor = name => `${slugify(name)}@players.example.com`;

export async function createStore() {
  if (qs.get('store') === 'local') return localStore();
  try {
    return await supabaseStore();
  } catch (e) {
    console.warn('Supabase unavailable', e);
    // Only developers get the browser-only store. On the real site, degrade to read-only so nobody
    // "joins" a league that only exists in their own browser.
    if (DEV) {
      const s = localStore();
      s.fallbackReason = String(e.message || e);
      return s;
    }
    return offlineStore(e);
  }
}

function offlineStore(reason) {
  const down = () => { throw new Error('Cannot reach the league server right now. Try again in a minute.'); };
  return {
    kind: 'offline', user: null, reason: String(reason?.message || reason), onChange() {},
    signIn: down, join: down, signOut: async () => {}, save: down, renameTeam: down,
    players: async () => [], submissions: async () => ({}),
  };
}

/* ------------------------------------------------------------------ Supabase */
async function supabaseStore() {
  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const listeners = new Set();
  const store = { kind: 'supabase', user: null, onChange: cb => listeners.add(cb) };
  const emit = () => listeners.forEach(f => f(store.user));

  async function loadUser() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { store.user = null; return; }
    const { data } = await sb.from('profiles').select('id,username,display_name,team_name,is_admin').eq('id', session.user.id).maybeSingle();
    store.user = data ? { id: data.id, username: data.username, name: data.display_name, team: data.team_name, isAdmin: data.is_admin } : null;
  }
  await loadUser();
  // never await supabase calls directly inside this callback (known deadlock), so defer
  sb.auth.onAuthStateChange(() => setTimeout(async () => { await loadUser(); emit(); }, 0));

  const friendly = msg => /invalid login/i.test(msg) ? 'That name and password do not match.' : msg;

  Object.assign(store, {
    async signIn(username, password) {
      const { error } = await sb.auth.signInWithPassword({ email: emailFor(username), password });
      if (error) throw new Error(friendly(error.message));
      await loadUser(); emit();
    },
    async join({ username, password, teamName }) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/join`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, teamName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not join. Try again.');
      await store.signIn(username, password);
    },
    async signOut() { await sb.auth.signOut(); store.user = null; emit(); },
    async players() {
      const { data, error } = await sb.from('profiles').select('id,username,display_name,team_name');
      if (error) throw error;
      return data.map(p => ({ id: p.id, username: p.username, name: p.display_name, team: p.team_name }));
    },
    /** { playerId: { roundId: {drivers, constructors, drs, chip} } } for every row RLS lets us see */
    async submissions() {
      const { data, error } = await sb.from('submissions').select('user_id,round_id,drivers,constructors,drs,chip,updated_at');
      if (error) throw error;
      const out = {};
      for (const r of data) (out[r.user_id] ||= {})[r.round_id] = { drivers: r.drivers, constructors: r.constructors, drs: r.drs, chip: r.chip, updatedAt: r.updated_at };
      return out;
    },
    async save(roundId, sub) {
      if (!store.user) throw new Error('Log in first.');
      const { error } = await sb.from('submissions').upsert({
        user_id: store.user.id, round_id: roundId,
        drivers: sub.drivers, constructors: sub.constructors, drs: sub.drs || null, chip: sub.chip || null,
      }, { onConflict: 'user_id,round_id' });
      if (error) {
        if (/row-level security/i.test(error.message)) throw new Error('Picks for this round are locked.');
        throw new Error(error.message);
      }
    },
    async renameTeam(name) {
      const { error } = await sb.from('profiles').update({ team_name: name }).eq('id', store.user.id);
      if (error) throw new Error(error.message);
      await loadUser(); emit();
    },
  });
  return store;
}

/* --------------------------------------------------------------------- Local */
function localStore() {
  const KEY = 'staf.local.v1';
  let mem = { players: [], subs: {}, me: null };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || mem; } catch { return mem; } };
  const persist = d => { mem = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };
  const listeners = new Set();
  const store = { kind: 'local', user: null, onChange: cb => listeners.add(cb) };
  const emit = () => listeners.forEach(f => f(store.user));
  const sync = () => {
    const d = load();
    const p = d.players.find(x => x.id === d.me);
    store.user = p ? { id: p.id, username: p.username, name: p.name, team: p.team, isAdmin: true } : null;
  };
  sync();
  Object.assign(store, {
    async signIn(username) {
      const d = load();
      const p = d.players.find(x => x.username === slugify(username));
      if (!p) throw new Error('No demo player with that name. Use "Join" first.');
      d.me = p.id; persist(d); sync(); emit();
    },
    async join({ username, teamName }) {
      const d = load();
      const slug = slugify(username);
      if (d.players.some(x => x.username === slug)) throw new Error('That name is already taken.');
      const p = { id: 'local-' + slug, username: slug, name: username.trim(), team: teamName || `${username.trim()}'s team` };
      d.players.push(p); d.me = p.id; persist(d); sync(); emit();
    },
    async signOut() { const d = load(); d.me = null; persist(d); sync(); emit(); },
    async players() { return load().players; },
    async submissions() { return load().subs; },
    async save(roundId, sub) {
      const d = load();
      if (!d.me) throw new Error('Log in first.');
      (d.subs[d.me] ||= {})[roundId] = { drivers: sub.drivers, constructors: sub.constructors, drs: sub.drs || null, chip: sub.chip || null };
      persist(d);
    },
    async renameTeam(name) { const d = load(); const p = d.players.find(x => x.id === d.me); if (p) p.team = name; persist(d); sync(); emit(); },
    _replace(d) { persist(d); sync(); },
    _load: load,
  });
  return store;
}
