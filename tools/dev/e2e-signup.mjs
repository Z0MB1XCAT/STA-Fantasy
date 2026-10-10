// End-to-end check of the REAL Supabase path: join -> pick a team -> save. Uses a throwaway player;
// delete it afterwards:  delete from auth.users where email = 'zz-uitest@players.example.com';
//   node tools/dev/e2e-signup.mjs
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const click = async sel => { await page.waitForSelector(sel); await page.click(sel); await wait(200); };

await page.goto('http://localhost:3000/index.html', { waitUntil: 'load' });
await page.waitForSelector('#btn-join');
console.log('store badge shows demo?  ->', await page.$('.badge--provisional') ? 'YES (bad)' : 'no (good, real backend)');

await click('#btn-join');
console.log('code field present?      ->', await page.$('#a-code') ? 'YES (bad)' : 'no (good)');
await page.type('#a-name', 'zz uitest');
await page.type('#a-pass', 'ui-test-pass-1');
await page.type('#a-team', 'UI Test Racing');
await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), click('#auth-submit')]);
await page.waitForSelector('.userchip');
console.log('logged in as             ->', await page.$eval('.userchip b', e => e.textContent));

await page.goto('http://localhost:3000/team.html', { waitUntil: 'load' });
await page.waitForSelector('#market');
for (const n of ['Don Lucio', 'Swumpy', 'Z0MB1XCAT', 'RicCapricorno', 'Pabl0man334']) await click(`[aria-label="Add ${n}"]`);
await click('[data-act=tab][data-id=constructors]');
for (const n of ['Ferrari', 'Alpine']) await click(`[aria-label="Add ${n}"]`);
await click('[data-act=drs][data-id=DON]');
await click('[data-act=save]');
await wait(1500);
console.log('toast                    ->', await page.$eval('#toast', e => e.textContent).catch(() => '(none)'));
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#squad');
console.log('after reload squad       ->', (await page.$$eval('#squad .dcard__name, #squad .ccard__name', els => els.map(e => e.textContent))).join(', '));
console.log('errors                   ->', errors.length ? errors : 'none');
await browser.close();
