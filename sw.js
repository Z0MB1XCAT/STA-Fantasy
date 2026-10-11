// Backup plan for the main host (Netlify). If the site stops answering, for example because the account
// ran out of credits and the project was paused, page loads are sent to the same page on GitHub Pages.
//
// This only helps people who have opened the site before (the browser keeps this file). A paused host
// can't run any code of its own, so a first-time visitor sees the host's error page instead.
//
// It only ever looks at page loads, never images, scripts or data, so it can't serve anything stale.
// It does nothing on the backup site itself.

const BACKUP = 'https://z0mb1xcat.github.io/STA-Fantasy/';   // keep in step with FALLBACK_SITE in js/config.js

const backupHost = new URL(BACKUP).hostname;
const scopePath = new URL(self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.mode !== 'navigate' || req.method !== 'GET') return;
  if (self.location.hostname === backupHost) return;
  event.respondWith(answer(req));
});

async function answer(req) {
  let res;
  try { res = await fetch(req); } catch { return toBackup(req); }      // host unreachable or refusing connections
  if (res.ok || res.type === 'opaqueredirect') return res;             // fine (a redirect from the host itself counts as fine)
  if (res.status >= 500 || res.status === 402) return toBackup(req);   // "Site not available" and similar
  // 404 and friends: our own 404 page is fine, but a host-level "site not found" page is not.
  // Tell them apart by asking for a file that always exists on a healthy copy of the site.
  return (await siteIsUp()) ? res : toBackup(req);
}

async function siteIsUp() {
  try { return (await fetch('data/season.json', { cache: 'no-store' })).ok; } catch { return false; }
}

function toBackup(req) {
  const u = new URL(req.url);
  const rel = u.pathname.startsWith(scopePath) ? u.pathname.slice(scopePath.length) : '';
  return Response.redirect(new URL(rel + u.search, BACKUP).href, 302);
}
