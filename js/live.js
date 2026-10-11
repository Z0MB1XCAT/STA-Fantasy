// Tells people when new results have been saved, so a page left open doesn't keep showing old standings.
// It only offers a Refresh button (it never reloads by itself), so nobody loses a half-built team.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { params, DEV } from './env.js';

const EVERY_MS = 60_000;

/** Newest save time (ms) among the results that came from the database, or 0 if there are none. */
export const latestSaved = sources => Math.max(0, ...[...sources.values()].filter(s => s.source === 'database' && s.updatedAt).map(s => Date.parse(s.updatedAt)));

export function watchForNewResults(knownMs) {
  // demo mode and developer fixtures have no shared database to watch
  if (DEV && (params.get('store') === 'local' || params.get('rounds') || params.get('data'))) return;
  let shown = false;

  async function check() {
    if (document.hidden || shown) return;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/round_results?select=updated_at&order=updated_at.desc&limit=1`, {
        headers: { apikey: SUPABASE_KEY }, cache: 'no-store',
      });
      if (!r.ok) return;
      const [row] = await r.json();
      if (row && Date.parse(row.updated_at) > knownMs) show();
    } catch { /* offline for a moment: try again next time */ }
  }

  function show() {
    shown = true;
    document.body.insertAdjacentHTML('beforeend', `<div class="fresh" role="status"><span>New results are in.</span><button class="btn btn--light btn--sm" type="button" id="fresh-go">Refresh</button></div>`);
    document.getElementById('fresh-go').addEventListener('click', () => location.reload());
    requestAnimationFrame(() => document.querySelector('.fresh')?.classList.add('show'));
  }

  setInterval(check, EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });   // coming back to the tab
}
