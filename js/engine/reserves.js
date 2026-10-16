// Reserve drivers added from the admin page. They live in the database (table `reserves`), are merged with the
// reserves already in data/drivers.json every time the site loads, and so never need a deploy.
// Pure functions only, so they can be tested without a browser.

export const CODE_RE = /^[A-Z0-9]{3}$/;

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const latin = s => String(s || '').toLowerCase().replace(/[а-яё]/g, c => CYRILLIC[c] ?? '');
const words = s => latin(s).split(/[^a-z]+/).filter(Boolean);

/** A database row as the site's driver record. A reserve has no team, can't be picked and never scores. */
export function reserveToDriver(row, price) {
  return {
    code: row.code, name: row.name, simgrid: row.simgrid || null, team: null, role: 'reserve', nat: null,
    price, basis: 'added', rating: null, quality: null, historySessions: 0, added: true,
  };
}

/**
 * drivers.json plus the reserves from the database. A code already in drivers.json wins, and malformed rows are
 * skipped rather than breaking the site. Safe to call again with a new list: earlier additions are replaced.
 */
export function mergeReserves(driversJson, rows, price) {
  const base = driversJson.drivers.filter(d => !d.added);
  const seen = new Set(base.map(d => d.code));
  const extra = [];
  for (const r of rows || []) {
    if (!r || !CODE_RE.test(r.code || '') || !String(r.name || '').trim() || seen.has(r.code)) continue;
    seen.add(r.code);
    extra.push(reserveToDriver(r, price));
  }
  return { ...driversJson, drivers: [...base, ...extra] };
}

/**
 * A free 3-character code for a new reserve, based on their name (Cyrillic is transliterated), or the SimGrid
 * and Discord names if the name has no letters. `taken` is every code already in use.
 */
export function suggestCode(name, taken, ...alternatives) {
  const free = c => CODE_RE.test(c) && !taken.has(c);
  for (const source of [name, ...alternatives]) {
    const w = words(source);
    const s = w.join('').toUpperCase();
    if (s.length < 3) continue;
    const tries = [s.slice(0, 3)];
    if (w.length > 1) tries.push((w[0][0] + w[w.length - 1].slice(0, 2)).toUpperCase());      // Faze Goma -> FGO
    for (let i = 3; i < s.length; i++) tries.push(s[0] + s[1] + s[i]);
    for (let i = 1; i < s.length - 1; i++) tries.push(s[0] + s[i] + s[i + 1]);
    const hit = tries.find(free);
    if (hit) return hit;
  }
  const s = words(name).join('').toUpperCase();
  if (s.length >= 2) for (let n = 1; n <= 9; n++) if (free(s.slice(0, 2) + n)) return s.slice(0, 2) + n;
  for (let n = 1; n <= 99; n++) if (free('R' + String(n).padStart(2, '0'))) return 'R' + String(n).padStart(2, '0');
  return '';
}

/** Trims and normalises what was typed into the add form, and says what is wrong with it, if anything. */
export function checkReserve(input, taken) {
  const clean = {
    code: String(input.code || '').trim().toUpperCase(),
    name: String(input.name || '').trim().replace(/\s+/g, ' '),
    simgrid: String(input.simgrid || '').trim() || null,
    discord: String(input.discord || '').trim().replace(/^@/, '') || null,
  };
  const errors = [];
  if (!clean.name) errors.push('Enter a name.');
  else if (clean.name.length > 40) errors.push('The name can be at most 40 characters.');
  if (!clean.code) errors.push('Enter a 3-character code.');
  else if (!CODE_RE.test(clean.code)) errors.push('The code must be exactly 3 letters or numbers.');
  else if (taken.has(clean.code)) errors.push(`The code ${clean.code} is already used by another driver.`);
  if (clean.simgrid && clean.simgrid.length > 60) errors.push('The SimGrid name can be at most 60 characters.');
  if (clean.discord && clean.discord.length > 60) errors.push('The Discord name can be at most 60 characters.');
  return { clean, errors, ok: errors.length === 0 };
}

/** Round ids whose results or "not racing" list mention this driver. Removing a driver who is in a round would break it. */
export function roundsUsing(code, rounds) {
  const ids = [];
  for (const [id, r] of rounds) {
    if (!r) continue;
    const used = Object.values(r.sessions || {}).some(list => list.some(x => x.code === code))
      || (r.out || []).includes(code)
      || Object.values(r.grids || {}).some(list => list.includes(code));
    if (used) ids.push(id);
  }
  return ids.sort((a, b) => a - b);
}
