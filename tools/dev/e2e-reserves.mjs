// Drives the Reserves panel on admin.html in demo mode (reserves are kept in the browser, nothing touches the
// real database): add one, see it in the results pool, save a round with them in it, reload, try to remove them
// while they are in a round (refused), take them out, remove them. Then checks the logged-out view against the
// real backend (read only): the panel shows but adding is off.
//   node tools/dev/e2e-reserves.mjs   (with node serve.mjs running)

import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3000/';
const NOW = 'now=2026-10-14T12:00:00Z';          // before round 1's deadline
const SHOTS = process.env.SHOTS || '';           // a folder to drop screenshots in, if wanted
let failed = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const dialogs = [];
let acceptDialogs = true;
page.on('dialog', async d => { dialogs.push(d.message()); if (acceptDialogs) await d.accept(); else await d.dismiss(); });

const text = sel => page.$eval(sel, e => e.textContent.trim());
const disabled = sel => page.$eval(sel, e => e.disabled);
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };
// the toast sits at the bottom of the screen for a few seconds and can cover a button that was just scrolled into view, so click through the DOM
const clickDom = sel => page.$eval(sel, el => { el.scrollIntoView({ block: 'center' }); el.click(); });
const type = async (sel, value) => { await page.click(sel, { clickCount: 3 }); await page.keyboard.press('Backspace'); if (value) await page.type(sel, value); };
const rowFor = code => page.evaluate(c => [...document.querySelectorAll('details[data-key=reserves] .tower .row')]
  .find(r => r.querySelector('.num')?.textContent.trim() === c)?.innerText.replace(/\s+/g, ' ') || null, code);
const summary = () => page.$eval('details[data-key=reserves] summary', e => e.innerText.replace(/\s+/g, ' ').trim());
const waitToast = pattern => page.waitForFunction(p => new RegExp(p).test(document.querySelector('#toast')?.textContent || ''), { timeout: 4000 }, pattern.source)
  .catch(async err => { throw new Error(err.message + ' (toast says: ' + JSON.stringify(await page.$eval('#toast', e => e.textContent).catch(() => null)) + ')'); });

/* ---- demo mode: add, use, try to remove, remove */
await page.goto(`${BASE}admin.html?store=local&${NOW}`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.setItem('staf.local.v1', JSON.stringify({
  players: [{ id: 'local-tester', username: 'tester', name: 'Tester', team: 'Test team' }], subs: {}, me: 'local-tester',
})));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('details[data-key=reserves]');

check('the Reserves panel is on the page', /Reserves\s*2 available/.test(await summary()), await summary());
await page.click('details[data-key=reserves] summary');
check('the two built-in reserves are listed as built in', /XMK.*Built in/.test(await rowFor('XMK')) && /KIE.*Built in/.test(await rowFor('KIE')));
check('Add is off while the form is empty', await disabled('#rv-add'));
check('and says nothing yet', (await text('#rv-msg')) === '');

// the code is suggested from the name
await page.type('#rv-name', 'Faze_Goma');
check('typing a name suggests a code', (await page.$eval('#rv-code', e => e.value)) === 'FGO', await page.$eval('#rv-code', e => e.value));
check('FAZ is a regular driver, so it was not suggested', (await page.$eval('#rv-code', e => e.value)) !== 'FAZ');
check('Add turns on', !(await disabled('#rv-add')));

// a clashing or malformed code is explained and blocks Add
await type('#rv-code', 'faz');
check('a taken code shows why', /FAZ is already used/.test(await text('#rv-msg')), await text('#rv-msg'));
check('and Add stays off', await disabled('#rv-add'));
await type('#rv-code', 'x');
check('a short code is explained', /exactly 3/.test(await text('#rv-msg')), await text('#rv-msg'));
await type('#rv-code', '');
check('while the code field is empty and focused it is left alone', (await page.$eval('#rv-code', e => e.value)) === '');
await page.focus('#rv-name');
check('clearing the code and leaving the field goes back to suggesting one', (await page.$eval('#rv-code', e => e.value)) === 'FGO');

// add one with every field, including a Discord name
await type('#rv-name', 'Nova Racer');
await type('#rv-simgrid', 'NovaR');
await type('#rv-discord', '@nova_r');
check('the suggestion follows the name', (await page.$eval('#rv-code', e => e.value)) === 'NOV');
await shot('reserves-form-filled');
await page.click('#rv-add');
await waitToast(/Added Nova Racer/);
check('adding confirms with a toast', /Added Nova Racer/.test(await text('#toast')), await text('#toast'));
check('the panel stays open', await page.$eval('details[data-key=reserves]', d => d.open));
check('the count goes up', /3 available/.test(await summary()), await summary());
const nov = await rowFor('NOV');
check('the new reserve is listed with SimGrid and Discord', /Nova Racer.*SimGrid NovaR.*Discord nova_r/.test(nov), nov);
check('with a Remove button', !!(await page.$('[data-act=rv-remove][data-code=NOV]')));
check('the form is cleared and ready for the next one', (await page.$eval('#rv-name', e => e.value)) === '' && (await disabled('#rv-add')));
check('focus is back on the name field', await page.evaluate(() => document.activeElement?.id === 'rv-name'));

// no SimGrid, non-Latin name
await page.type('#rv-name', 'фанат жидких с 2008');
check('a Cyrillic name gets a readable code', (await page.$eval('#rv-code', e => e.value)) === 'FAN', await page.$eval('#rv-code', e => e.value));
await page.click('#rv-add');
await waitToast(/Added фанат/);
check('and shows as having no SimGrid', /No SimGrid account/.test(await rowFor('FAN') || ''), await rowFor('FAN'));

// the same code twice is refused
await page.type('#rv-name', 'Nova Racer Two');
await type('#rv-code', 'NOV');
check('a code used by a reserve added a moment ago is refused', /NOV is already used/.test(await text('#rv-msg')) && (await disabled('#rv-add')));
await type('#rv-name', '');
await type('#rv-code', '');

// they can be placed in a session straight away
check('the new reserve is in the results pool', !!(await page.$('[data-act=place][data-code=NOV]')));
check('and in the driver codes list', await page.evaluate(() => /NOV[\s\S]*Reserve, NovaR/.test(document.querySelector('details[data-key=codes]').textContent.replace(/\s+/g, ' '))));
await page.click('[data-act=place][data-code=NOV]');
await page.click('[data-act=place][data-code=FAN]');
check('placing them writes their code into the results file', /quali: NOV FAN/.test(await text('#file')), await text('#file'));
check('the results file is valid with them in it', (await text('.panel--raised .badge')) === 'Ready to save');
await page.click('[data-act=status][data-k=provisional]');
await page.click('[data-act=save]');
await page.waitForFunction(() => /^Saved /.test(document.querySelector('#save-status')?.textContent || ''));

// removal is refused while a reserve is in a round, and nothing is asked first
dialogs.length = 0;
await clickDom('[data-act=rv-remove][data-code=NOV]');
await waitToast(/can't be removed/);
check('removing a reserve who is in a round is refused', /Nova Racer is in the results for round 1, so they can't be removed/.test(await text('#toast')), await text('#toast'));
check('without asking for confirmation', dialogs.length === 0);
check('and they are still listed', !!(await rowFor('NOV')), await page.evaluate(() => 'open=' + document.querySelector('details[data-key=reserves]').open + ' rows=' + [...document.querySelectorAll('details[data-key=reserves] .tower .row .num')].map(n => n.textContent).join(',')));

// a reload keeps them, and the saved round that names them still parses
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('#file');
check('after a reload the saved round still has them in it', /quali: NOV FAN/.test(await text('#file')), await text('#file'));
check('and parses cleanly (their codes are known before the round is read)', (await text('.panel--raised .badge')) === 'Ready to save');
check('no "problem, so they are being ignored" notice', !(await page.$$eval('.notice', n => n.some(x => /being ignored/.test(x.textContent)))));
await page.click('details[data-key=reserves] summary');
check('both are still listed after the reload', !!(await rowFor('NOV')) && !!(await rowFor('FAN')));
check('and the Discord name is back', /Discord nova_r/.test(await rowFor('NOV')), await rowFor('NOV'));

// the public results page shows them as reserves
await page.goto(`${BASE}results.html?store=local&${NOW}`, { waitUntil: 'networkidle0' });
await page.click('[data-tab=quali]');
const results = await page.$eval('body', b => b.innerText);
check('the results page names them and marks them as reserves', /Nova Racer/.test(results) && /фанат жидких с 2008/.test(results) && /Reserve/.test(results));
await shot('reserves-results-page');

// take them out of the round, save, then removal works (after a confirmation)
await page.goto(`${BASE}admin.html?store=local&${NOW}`, { waitUntil: 'networkidle0' });
await page.waitForSelector('#file');
await page.click('[data-act=del][data-i="0"]');         // NOV
await page.click('[data-act=del][data-i="0"]');         // FAN
await page.click('[data-act=save]');
await page.waitForFunction(() => /^Saved /.test(document.querySelector('#save-status')?.textContent || ''));
await page.click('details[data-key=reserves] summary');
dialogs.length = 0;
acceptDialogs = false;
await clickDom('[data-act=rv-remove][data-code=NOV]');
check('removing asks first', dialogs.some(d => /Remove Nova Racer \(NOV\)/.test(d)), JSON.stringify(dialogs));
check('and saying no keeps them', !!(await rowFor('NOV')));
acceptDialogs = true;
await clickDom('[data-act=rv-remove][data-code=NOV]');
await waitToast(/Removed Nova Racer/);
check('saying yes removes them', (await rowFor('NOV')) === null);
check('they are gone from the results pool', !(await page.$('[data-act=place][data-code=NOV]')));
check('the count goes down', /3 available/.test(await summary()), await summary());
check('built-in reserves cannot be removed', !(await page.$('[data-act=rv-remove][data-code=XMK]')));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('details[data-key=reserves]');
check('a removal survives a reload', /Reserves\s*3 available/.test(await summary()), await summary());

check('no console errors (demo)', errors.length === 0, errors.join(' | '));

/* ---- logged out against the real backend: can see the panel, cannot add */
const ctx = await browser.createBrowserContext();
const anon = await ctx.newPage();
const anonErrors = [];
anon.on('pageerror', e => anonErrors.push('pageerror: ' + e.message));
anon.on('console', m => { if (m.type() === 'error') anonErrors.push('console: ' + m.text()); });
await anon.goto(`${BASE}admin.html?${NOW}`, { waitUntil: 'networkidle0' });
await anon.waitForSelector('details[data-key=reserves]');
await anon.click('details[data-key=reserves] summary');
await anon.type('#rv-name', 'Someone Else');
check('logged out: Add stays off', await anon.$eval('#rv-add', e => e.disabled));
check('logged out: says why', /Log in with the admin account/.test(await anon.$eval('#rv-msg', e => e.textContent)));
check('logged out: Remove is off for added reserves', await anon.$$eval('[data-act=rv-remove]', b => b.every(x => x.disabled)));
check('logged out: no Discord names are fetched or shown', !(await anon.$$eval('details[data-key=reserves] .tower .row', rows => rows.some(r => /Discord/.test(r.textContent)))));
await ctx.close();
check('no console errors (logged out, real backend)', anonErrors.length === 0, anonErrors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
