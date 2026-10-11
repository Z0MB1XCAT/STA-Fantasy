// Drives admin.html end to end in demo mode (results are kept in the browser, nothing touches the real
// database): mark a driver as not racing, save, reload, and check the rest of the site picks it up.
// Also checks the logged-out view against the real backend (read only).
//   node tools/dev/e2e-save-results.mjs   (with node serve.mjs running)

import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3000/';
const NOW = 'now=2026-10-14T12:00:00Z';          // before round 1's deadline
let failed = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const dialogs = [];
page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });

const text = sel => page.$eval(sel, e => e.textContent.trim());
const disabled = sel => page.$eval(sel, e => e.disabled);

/* ---- demo mode: save, reload, see it everywhere */
await page.goto(`${BASE}admin.html?store=local&${NOW}`, { waitUntil: 'networkidle0' });
// demo mode treats every logged-in player as an admin; start from a clean browser with one player logged in
await page.evaluate(() => localStorage.setItem('staf.local.v1', JSON.stringify({
  players: [{ id: 'local-tester', username: 'tester', name: 'Tester', team: 'Test team' }], subs: {}, me: 'local-tester',
})));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('[data-act=save]');

check('Save is off when there is nothing to save', await disabled('[data-act=save]'));
check('status says there is nothing to save', /No changes/.test(await text('#save-status')), await text('#save-status'));

await page.click('[data-act=out][data-code=PAB]');
check('Save turns on after a change', !(await disabled('[data-act=save]')));
check('status warns about unsaved changes', /Unsaved changes/.test(await text('#save-status')));
check('file text now lists PAB as not racing', /out: PAB/.test(await text('#file')));

// switching rounds with unsaved work asks first
await page.click('[data-act=round][data-id="2"]');
check('switching rounds with unsaved changes asks first', dialogs.some(d => /unsaved changes/i.test(d)), JSON.stringify(dialogs));
await page.click('[data-act=round][data-id="1"]');
await page.click('[data-act=out][data-code=PAB]');
check('PAB marked again after the round switch', /out: PAB/.test(await text('#file')));

await page.click('[data-act=save]');
await page.waitForFunction(() => /^Saved /.test(document.querySelector('#save-status')?.textContent || ''), { timeout: 5000 });
check('status confirms the save', /^Saved .*This is what players see/.test(await text('#save-status')), await text('#save-status'));
check('Save is off again once saved', await disabled('[data-act=save]'));
check('a toast confirms it', /Saved round 1/.test(await text('#toast')));

await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('#file');
check('after a reload the saved "not racing" is still there', /out: PAB/.test(await text('#file')));
check('and it says it came from a save', /^Saved /.test(await text('#save-status')), await text('#save-status'));

// the player-facing pages read the same saved result
await page.goto(`${BASE}team.html?store=local&${NOW}`, { waitUntil: 'networkidle0' });
await wait(300);
const teamText = await page.$eval('body', b => b.innerText);
check('My team page shows the "Not racing" heads-up', /not racing/i.test(teamText));

// results saved in a later state replace the earlier one rather than piling up
await page.goto(`${BASE}admin.html?store=local&${NOW}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('[data-act=out]');
await page.click('[data-act=out][data-code=PAB]');       // un-mark PAB
await page.click('[data-act=save]');
await page.waitForFunction(() => /^Saved /.test(document.querySelector('#save-status')?.textContent || ''));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('#file');
check('un-marking and saving clears it', !/out:/.test(await text('#file')));

// the save that was just replaced is kept, and can be loaded back into the editor
check('Earlier versions panel is offered', !!(await page.$('[data-act=history]')));
await page.click('[data-act=history]');
await page.waitForSelector('[data-act=restore]', { timeout: 5000 });
check('the replaced save is kept', (await page.$$eval('[data-act=restore]', b => b.length)) === 1);
const label = await page.$eval('[data-act=restore]', b => b.closest('.row').innerText.replace(/\s+/g, ' '));
check('it says what it contained', /Upcoming, 1 not racing/.test(label), label);
check('Save is off before loading anything', await disabled('[data-act=save]'));
await page.click('[data-act=restore]');
check('loading it puts "not racing" back in the editor', /out: PAB/.test(await text('#file')));
check('and counts as an unsaved change', !(await disabled('[data-act=save]')));
await page.click('[data-act=save]');
await page.waitForFunction(() => /^Saved /.test(document.querySelector('#save-status')?.textContent || ''));
await page.click('[data-act=history]');
await page.waitForSelector('[data-act=restore]');
check('restoring and saving keeps the version it replaced', (await page.$$eval('[data-act=restore]', b => b.length)) === 2);

/* ---- logged out against the real backend: can build and preview, cannot save */
const ctx = await browser.createBrowserContext();
const anon = await ctx.newPage();
const anonErrors = [];
anon.on('pageerror', e => anonErrors.push('pageerror: ' + e.message));
anon.on('console', m => { if (m.type() === 'error') anonErrors.push('console: ' + m.text()); });
await anon.goto(`${BASE}admin.html?${NOW}`, { waitUntil: 'networkidle0' });
await anon.waitForSelector('[data-act=save]');
await anon.click('[data-act=out][data-code=PAB]');
check('logged out: told to log in', /Log in to save results/.test(await anon.$eval('.notice', e => e.textContent)));
check('logged out: Save stays off even with changes', await anon.$eval('[data-act=save]', e => e.disabled));
check('logged out: copy and download still work as a backup', !(await anon.$eval('[data-act=copy]', e => e.disabled)));
await ctx.close();

check('no console errors (demo)', errors.length === 0, errors.join(' | '));
check('no console errors (logged out)', anonErrors.length === 0, anonErrors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
