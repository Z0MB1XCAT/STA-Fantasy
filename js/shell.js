// Page chrome (header, footer, login dialog) + boot sequence shared by every page.
import { loadSeason, serverClockOffset } from './data.js';
import { createStore } from './store.js';
import { esc, $, loaderHtml, toast } from './ui.js';
import { icon, avatar } from './components.js';
import { watchForOutage } from './fallback.js';
import { watchForNewResults, latestSaved } from './live.js';

const NAV = [
  ['index.html', 'Home', 'home'],
  ['team.html', 'My team', 'team'],
  ['league.html', 'League', 'league'],
  ['drivers.html', 'Drivers', 'drivers'],
  ['results.html', 'Results', 'results'],
  ['rules.html', 'Rules', 'rules'],
];

import { params as qs, carry } from './env.js';
/**
 * The current time. Follows the server's clock rather than the device's, because the database enforces the deadline
 * with its own clock. ?now=2026-10-16T18:00:00Z pretends it is that moment (testing only).
 */
export const clock = () => (qs.get('now') ? new Date(qs.get('now')) : new Date(Date.now() + serverClockOffset()));

/**
 * Runs `then` just after a round's pick deadline passes, even if the tab was asleep or in the background,
 * so a page left open turns into the locked view by itself instead of letting someone edit a team that can't be saved.
 */
export function atDeadline(R, now, then) {
  let done = false;
  const fire = () => { if (!done) { done = true; then(); } };
  const ms = R.lockAt - now + 1500;
  if (ms > 0 && ms < 2 ** 31 - 1) setTimeout(fire, ms);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && clock() >= R.lockAt + 1000) fire(); });
}

/** Everyone's players and visible picks. `ok` is false when the league server could not be reached. */
export async function loadLeague(store) {
  try {
    const [players, subs] = await Promise.all([store.players(), store.submissions()]);
    return { players, subs, ok: true };
  } catch (e) {
    console.warn('League data unavailable', e);
    return { players: [], subs: {}, ok: false };
  }
}

const link = (href, id, pageId) => `href="${href}${carry}"${id === pageId ? ' aria-current="page"' : ''}`;

// Painted straight away (before data loads) so pages don't flash; the user area fills in later.
function header(pageId) {
  return `
  <header class="topbar">
    <div class="wrap topbar__in">
      <a class="brand" href="index.html${carry}" aria-label="STA Fantasy home">
        <span class="brand__mark" aria-hidden="true"><span><i></i><i></i><i></i></span><img class="brand__logo" src="images/league-logo.png" alt="" onerror="this.remove()"></span>
        <span class="brand__word">STA <span>Fantasy</span></span>
      </a>
      <nav class="nav" aria-label="Main">
        ${NAV.map(([href, label, id]) => `<a ${link(href, id, pageId)}>${icon(id)}${label}</a>`).join('')}
      </nav>
      <div class="topbar__end" id="topbar-end"></div>
    </div>
  </header>`;
}

const tabbar = pageId => `<nav class="tabbar" aria-label="Main">${NAV.map(([href, label, id]) =>
  `<a ${link(href, id, pageId)}>${icon(id)}<span>${id === 'team' ? 'Team' : label}</span></a>`).join('')}</nav>`;

function userArea(store) {
  const u = store.user;
  return u
    ? `<span class="userchip">${avatar(u.name)}<b title="${esc(u.name)}">${esc(u.name)}</b><button class="btn btn--ghost btn--icon" id="btn-logout" type="button" aria-label="Log out" title="Log out">${icon('logout')}</button></span>`
    : `<button class="btn btn--ghost btn--sm" id="btn-login" type="button">Log in</button><button class="btn btn--red btn--sm" id="btn-join" type="button">Join</button>`;
}

const footer = (store, S) => `
  <footer class="site"><div class="wrap row-flex spread">
    <span>STA Fantasy, Season 5. Points are provisional until the stewards' decisions are in.</span>
    <span class="row-flex" style="gap:16px">${S.cfg.discord ? `<a href="${S.cfg.discord}" target="_blank" rel="noopener">League Discord</a>` : ''}${store.user?.isAdmin ? '<a href="admin.html">Enter results</a>' : ''}${store.kind === 'local' ? '<span class="badge badge--provisional"><i></i>Demo mode: saved in this browser only</span>' : ''}${store.kind === 'offline' ? '<span class="badge badge--locked"><i></i>Login is unavailable right now</span>' : ''}</span>
  </div></footer>`;

/** "Contact us on Discord" (deliberately no name), linked to season.json contactUrl or the league server. */
export function contactLink(S, capital = false) {
  const url = S.cfg.contactUrl || S.cfg.discord;
  const text = `${capital ? 'Contact' : 'contact'} us on Discord`;
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${text}</a>` : text;
}

const authDialog = S => `
<dialog id="auth" class="floating" aria-labelledby="auth-title">
  <form method="dialog" class="dialog__in" id="auth-form" novalidate>
    <div class="row-flex spread">
      <h2 class="h2" id="auth-title">Log in</h2>
      <button class="btn btn--ghost btn--icon" type="button" id="auth-close" aria-label="Close">${icon('close')}</button>
    </div>
    <div class="seg" role="group" aria-label="Log in or join">
      <button type="button" id="tab-login" aria-pressed="true">Log in</button>
      <button type="button" id="tab-join" aria-pressed="false">Join the league</button>
    </div>
    <div class="field"><label for="a-name">Your name</label><input class="input" id="a-name" autocomplete="username" maxlength="24" required></div>
    <div class="field"><label for="a-pass">Password</label><input class="input" id="a-pass" type="password" autocomplete="current-password" minlength="6" required></div>
    <div class="field join-only" hidden><label for="a-team">Team name <span class="faint">(optional)</span></label><input class="input" id="a-team" maxlength="30" placeholder="e.g. Tarmac Tigers"></div>
    <p class="hint join-only" hidden>Anyone can join. Your name is what other players see, so pick one you will remember. There is no email reset: if you forget your password, ${contactLink(S)}.</p>
    <p class="hint login-only">Forgotten your password? ${contactLink(S, true)}.</p>
    <p class="error" id="auth-error" role="alert"></p>
    <button class="btn btn--red" id="auth-submit" type="submit">Log in</button>
  </form>
</dialog>`;

function wireAuth(store) {
  const dlg = $('#auth');
  if (!dlg) return;
  let mode = 'login';
  const setMode = m => {
    mode = m;
    $('#tab-login').setAttribute('aria-pressed', m === 'login');
    $('#tab-join').setAttribute('aria-pressed', m === 'join');
    $('#auth-title').textContent = m === 'login' ? 'Log in' : 'Join the league';
    $('#auth-submit').textContent = m === 'login' ? 'Log in' : 'Create my team';
    dlg.querySelectorAll('.join-only').forEach(el => (el.hidden = m === 'login'));
    dlg.querySelectorAll('.login-only').forEach(el => (el.hidden = m !== 'login'));
    $('#a-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('#auth-error').textContent = '';
  };
  const open = m => { setMode(m); if (!dlg.open) dlg.showModal(); $('#a-name').focus(); };
  window.openAuth = open;
  $('#btn-login')?.addEventListener('click', () => open('login'));
  $('#btn-join')?.addEventListener('click', () => open('join'));
  $('#btn-logout')?.addEventListener('click', async () => { await store.signOut(); toast('Logged out'); location.reload(); });
  $('#tab-login').addEventListener('click', () => setMode('login'));
  $('#tab-join').addEventListener('click', () => setMode('join'));
  $('#auth-close').addEventListener('click', () => dlg.close());
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#auth-submit');
    const err = $('#auth-error');
    err.textContent = '';
    const username = $('#a-name').value.trim(), password = $('#a-pass').value;
    if (!username || !password) { err.textContent = 'Enter your name and password.'; return; }
    btn.disabled = true;
    try {
      if (mode === 'login') await store.signIn(username, password);
      else await store.join({ username, password, teamName: $('#a-team').value.trim() });
      dlg.close();
      location.reload();
    } catch (ex) {
      err.textContent = ex.message;
    } finally { btn.disabled = false; }
  });
}

/**
 * Loads data + store and paints the chrome. Returns what pages need.
 * @param pageId one of home | team | league | drivers | results | rules | admin
 */
export async function boot(pageId) {
  const app = $('#app');
  $('#site-header').innerHTML = header(pageId);
  app.innerHTML = loaderHtml();
  let season, store;
  try {
    [season, store] = await Promise.all([loadSeason(), createStore()]);
  } catch (e) {
    app.innerHTML = `<div class="notice notice--signal"><span class="glyph">!</span><div><b>Could not load the season</b><span class="muted">${esc(e.message)}. Check your connection and refresh.</span></div></div>`;
    throw e;
  }
  if (qs.get('demo') && store.kind === 'local') {
    const { seedDemo } = await import('./demo.js');
    seedDemo(season.S, store, qs.get('as') || 'Maya');
  }
  $('#topbar-end').innerHTML = userArea(store);
  $('#site-footer').innerHTML = footer(store, season.S) + tabbar(pageId);
  document.body.insertAdjacentHTML('beforeend', authDialog(season.S));
  wireAuth(store);
  watchForOutage();
  if (pageId !== 'admin') watchForNewResults(latestSaved(season.sources));   // the admin page is where results come from
  return { ...season, store, now: clock() };
}

/** Shown instead of "no players yet" when the league server can't be reached. */
export const serverDownNotice = S => `
  <div class="notice notice--signal"><span class="glyph">!</span><div>
    <b>Can't reach the league server</b>
    <span class="muted">Standings, teams and logins are unavailable right now, but results and prices still show. Refresh in a minute. If it carries on, ${contactLink(S)}.</span></div>
    <button class="btn btn--ghost btn--sm" type="button" onclick="location.reload()" style="margin-left:auto;flex:0 0 auto">Refresh</button></div>`;

export function problemsNotice(problems) {
  if (!problems.length) return '';
  return problems.map(p => `
    <div class="notice notice--signal"><span class="glyph">!</span><div>
      <b>Round ${p.round} results have a problem, so they are being ignored</b>
      <span class="muted">${p.errors.map(esc).join('<br>')}</span></div></div>`).join('');
}
