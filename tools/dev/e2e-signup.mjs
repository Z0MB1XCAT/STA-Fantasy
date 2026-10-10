// End-to-end check of the REAL backend: join -> pick a team -> save -> rename -> reload.
// Uses a throwaway player; delete it afterwards (Supabase SQL):
//   delete from auth.users where email = 'zz-uitest@players.example.com';
//   node tools/dev/e2e-signup.mjs
//   BASE=https://z0mb1xcat.github.io/STA-Fantasy/ node tools/dev/e2e-signup.mjs
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3000/';
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const click = async sel => { await page.waitForSelector(sel); await page.click(sel); await wait(200); };

await page.goto(BASE + 'index.html', { waitUntil: 'load' });
await page.waitForSelector('#btn-join');
console.log('site                     ->', BASE);
console.log('store badge shows demo?  ->', await page.$('.badge--provisional') ? 'YES (bad)' : 'no (good, real backend)');

await click('#btn-join');
await page.type('#a-name', 'zz uitest');
await page.type('#a-pass', 'ui-test-pass-1');
await page.type('#a-team', 'UI Test Racing');
await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), click('#auth-submit')]);
await page.waitForSelector('.userchip');
console.log('logged in as             ->', await page.$eval('.userchip b', e => e.textContent));

await page.goto(BASE + 'team.html', { waitUntil: 'load' });
await page.waitForSelector('#market');
for (const n of ['Don Lucio', 'Swumpy', 'Z0MB1XCAT', 'RicCapricorno', 'Pabl0man334']) await click(`[aria-label="Add ${n}"]`);
await click('[data-act=tab][data-id=constructors]');
for (const n of ['Ferrari', 'Alpine']) await click(`[aria-label="Add ${n}"]`);
await click('[data-act=drs][data-id=DON]');
await click('[data-act=save]');
await wait(1500);
console.log('save dock                ->', await page.$eval('.savedock b', e => e.textContent).catch(() => '(none)'));

await click('[data-act=rename]');
await page.$eval('#rn-input', e => (e.value = ''));
await page.type('#rn-input', 'Renamed Racing');
await click('#rn-form button[type=submit]');
await wait(1500);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#squad');
console.log('team name after reload   ->', await page.$eval('h1', e => e.textContent));
console.log('squad after reload       ->', (await page.$$eval('#squad .dcard__name, #squad .ccard__name', els => els.map(e => e.textContent))).join(', '));
console.log('errors                   ->', errors.length ? errors : 'none');
await browser.close();
