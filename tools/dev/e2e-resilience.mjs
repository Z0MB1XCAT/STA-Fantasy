// Browser checks for: chips locked in round 1, "can't reach the server" handling, the server-clock correction,
// the automatic lock at the deadline, the "new results are in" bar and the pinned standings row.
//   node tools/dev/e2e-resilience.mjs   (with node serve.mjs running; needs internet for the real-backend checks)

import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3000/';
let failed = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: 'new' });
const newPage = async setup => {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  if (setup) await setup(page);
  return page;
};
const player = { players: [{ id: 'local-tester', username: 'tester', name: 'Tester', team: 'Test team' }], subs: {}, me: 'local-tester' };
const asPlayer = page => page.evaluateOnNewDocument(p => { if (!localStorage.getItem('staf.local.v1')) localStorage.setItem('staf.local.v1', JSON.stringify(p)); }, player);

/* ---- 1. chips that need a team are off in round 1, on later */
{
  const page = await newPage(asPlayer);
  await page.goto(`${BASE}team.html?store=local&now=2026-10-14T12:00:00Z`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.chipbtn');
  const chip = id => page.$eval(`[data-act=chip][data-id=${id}]`, e => ({ disabled: e.disabled, text: e.textContent.replace(/\s+/g, ' ').trim(), img: !!e.querySelector('img.chipimg'), loaded: e.querySelector('img')?.naturalWidth > 0 }));
  const wc = await chip('wildcard'), ll = await chip('limitless'), ex = await chip('extradrs');
  check('round 1: Wildcard is switched off', wc.disabled, wc.text);
  check('round 1: Limitless is switched off', ll.disabled);
  check('round 1: the reason is shown', /Needs a team from an earlier round/.test(wc.text));
  check('round 1: Extra DRS, No Negative and Autopilot stay available', !ex.disabled && !(await chip('nonegative')).disabled && !(await chip('autopilot')).disabled);
  check('every chip shows its artwork, and it loads', [wc, ll, ex].every(c => c.img && c.loaded));
  await page.close();

  const later = await newPage();
  await later.goto(`${BASE}team.html?rounds=tests/fixtures/rounds&store=local&demo=1&as=Maya&now=2026-11-04T12:00:00Z`, { waitUntil: 'networkidle0' });
  await later.waitForSelector('.chipbtn');
  const states = await later.$$eval('.chipbtn', bs => bs.map(b => [b.dataset.id, b.disabled]));
  check('later rounds: Wildcard and Limitless can be played again', states.filter(([id]) => ['wildcard', 'limitless'].includes(id)).every(([, d]) => !d), JSON.stringify(states));
  const icons = await later.$$eval('.chipicon .chipimg', is => is.map(i => i.naturalWidth > 0));
  check('"Chips used" shows the artwork too', icons.length === 5 && icons.every(Boolean));
  await later.close();

  const rules = await newPage();
  await rules.goto(`${BASE}rules.html?now=2026-10-14T12:00:00Z`, { waitUntil: 'networkidle0' });
  const txt = await rules.$eval('.chipgrid', e => e.innerText.replace(/\s+/g, ' '));
  check('Rules page explains the round 1 limit', /Not available in round 1/.test(txt), txt.slice(0, 120));
  check('Rules page shows five chip images', (await rules.$$eval('.chipgrid .chipimg', i => i.length)) === 5);
  await rules.close();
}

/* ---- 2. league server unreachable */
{
  const block = async page => { await page.setRequestInterception(true); page.on('request', r => (r.url().includes('supabase.co') ? r.abort() : r.continue())); };
  for (const [name, file] of [['home', 'index.html'], ['league', 'league.html']]) {
    const page = await newPage(block);
    const t0 = Date.now();
    await page.goto(`${BASE}${file}?now=2026-10-14T12:00:00Z`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('main')?.innerText.length > 40, { timeout: 15000 });
    const ms = Date.now() - t0;
    const txt = await page.$eval('main', m => m.innerText.replace(/\s+/g, ' '));
    check(`${name}: says it can't reach the league server`, /Can't reach the league server/.test(txt));
    check(`${name}: no longer claims "No players yet"`, !/No players yet|first on the board/.test(txt));
    check(`${name}: appears quickly instead of after ~8 s`, ms < 3500, `${ms} ms`);
    await page.close();
  }
}

/* ---- 3. countdown follows the server's clock, even when the device clock is 10 minutes off */
{
  const skew = page => page.evaluateOnNewDocument(() => {
    const Real = Date, off = 10 * 60 * 1000;
    class Skewed extends Real { constructor(...a) { if (a.length === 0) super(Real.now() + off); else super(...a); } static now() { return Real.now() + off; } }
    window.Date = Skewed;
  });
  const lock = Date.parse('2026-10-16T19:00:00Z');
  const read = async page => {
    const [d, h, m, s] = await page.$$eval('#clock .num', ns => ns.map(n => +n.textContent));
    return ((d * 24 + h) * 60 + m) * 60 + s;
  };
  const straight = await newPage();
  await straight.goto(`${BASE}index.html`, { waitUntil: 'networkidle0' });
  const skewed = await newPage(skew);
  await skewed.goto(`${BASE}index.html`, { waitUntil: 'networkidle0' });
  const expect = Math.round((lock - Date.now()) / 1000);
  const a = await read(straight), b = await read(skewed);
  check('device clock correct: countdown matches the real time left', Math.abs(a - expect) < 5, `shows ${a}s, expected ~${expect}s`);
  check('device clock 10 minutes fast: countdown is still right', Math.abs(b - expect) < 5, `shows ${b}s, expected ~${expect}s (uncorrected it would be ${expect - 600}s)`);
  await straight.close(); await skewed.close();
}

/* ---- 4. a page left open locks itself at the deadline */
{
  const lockAt = '2026-10-16T19:00:00Z';
  const nowStr = new Date(Date.parse(lockAt) - 4000).toISOString();          // 4 seconds before the deadline
  const home = await newPage();
  let navs = 0;
  home.on('framenavigated', f => { if (f === home.mainFrame()) navs++; });
  await home.goto(`${BASE}index.html?now=${nowStr}`, { waitUntil: 'networkidle0' });
  const before = navs;
  await wait(7500);
  check('home page reloads itself once the countdown reaches zero', navs > before, `navigations ${before} -> ${navs}`);
  await home.close();

  const team = await newPage(asPlayer);
  let tnavs = 0;
  team.on('framenavigated', f => { if (f === team.mainFrame()) tnavs++; });
  await team.goto(`${BASE}team.html?store=local&now=${nowStr}`, { waitUntil: 'networkidle0' });
  const t0 = tnavs;
  await team.waitForFunction(() => /Picks have locked/.test(document.querySelector('#toast')?.textContent || ''), { timeout: 9000 })
    .then(() => check('team page tells you the picks have locked', true))
    .catch(() => check('team page tells you the picks have locked', false));
  await wait(3500);
  check('team page then reloads into the locked view', tnavs > t0, `navigations ${t0} -> ${tnavs}`);
  await team.close();
}

/* ---- 5. "new results are in" bar (real backend, with the poll answer faked) */
{
  const page = await newPage(async p => {
    await p.setRequestInterception(true);
    p.on('request', r => {
      if (r.url().includes('round_results?select=updated_at')) {
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
        if (r.method() === 'OPTIONS') r.respond({ status: 204, headers: cors });          // the browser's CORS pre-check
        else r.respond({ status: 200, contentType: 'application/json', headers: cors, body: '[{"updated_at":"2099-01-01T00:00:00+00:00"}]' });
      } else r.continue();
    });
  });
  await page.goto(`${BASE}results.html?now=2026-10-14T12:00:00Z`, { waitUntil: 'networkidle0' });
  check('no bar before anything new is saved', !(await page.$('.fresh')));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // what happens when you come back to the tab
  await page.waitForSelector('.fresh.show', { timeout: 5000 })
    .then(() => check('bar appears when newer results exist', true))
    .catch(() => check('bar appears when newer results exist', false));
  const barText = await page.$eval('.fresh', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
  check('bar says so and offers Refresh', /New results are in/.test(barText) && /Refresh/.test(barText), barText);
  await page.close();
}

/* ---- 6. standings: your own row is pinned when you are outside the top list */
{
  const page = await newPage();
  await page.goto(`${BASE}index.html?store=local&now=2026-10-14T12:00:00Z`, { waitUntil: 'networkidle0' });
  const out = await page.evaluate(async () => {
    const { leaderboardRows } = await import('/js/pages/common.js');
    const rows = Array.from({ length: 8 }, (_, i) => ({ player: { id: 'p' + i, name: 'Player ' + i, team: 'Team ' + i }, rank: i + 1, total: 100 - i, lastRound: 10, provisional: false }));
    const html = (me, limit) => leaderboardRows(rows, me, limit);
    return { far: html('p7', 3), near: html('p3', 3), inside: html('p1', 3), nobody: html(undefined, 3) };
  });
  const count = (h, re) => (h.match(re) || []).length;
  check('far down the table: top 3 plus your row', count(out.far, /class="row row--link/g) === 4 && /Team 7/.test(out.far));
  check('far down the table: says how many players were skipped', /4 more players/.test(out.far));
  check('just below the list: your row follows with no gap', count(out.near, /class="row row--link/g) === 4 && !/more player/.test(out.near));
  check('inside the list: nothing is added', count(out.inside, /class="row row--link/g) === 3);
  check('logged out: just the top 3', count(out.nobody, /class="row row--link/g) === 3);
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
