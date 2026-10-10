// Screenshots the League page and the "not racing" heads-up (demo data, round 4 open, KAM and FAZ out).
//   node tools/dev/league-shot.mjs   (with node serve.mjs running)
import puppeteer from 'puppeteer';

const Q = 'rounds=tests/fixtures/rounds&store=local&demo=1&now=2026-11-04T12:00:00Z';
const B = 'http://localhost:3000/';
const out = name => `temporary screenshots/${name}.png`;
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
const where = () => `${page.url().split('?')[0]}, ${page.viewport()?.width}px`;
page.on('pageerror', e => errors.push(`${e.message.split('\n')[0]} (${where()})`));
page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} (${where()})`); });
const settle = () => new Promise(r => setTimeout(r, 900));

await page.setViewport({ width: 1440, height: 1000 });
await page.goto(`${B}league.html?${Q}`, { waitUntil: 'networkidle0' });
await settle();
console.log('league cards:', (await page.$$('.tcard')).length, 'rounds in strip:', (await page.$$('.rchip')).length);
await page.screenshot({ path: out('league-desktop'), fullPage: true });

await page.type('#q', 'maya');
await settle();
console.log('cards after searching "maya":', (await page.$$('.tcard')).length);

await page.goto(`${B}index.html?${Q}&as=Maya`, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 4200));
const notice = await page.$('.notice--flag');
console.log('home notice:', notice ? await notice.evaluate(e => e.innerText.replace(/\s+/g, ' ')) : 'none');
await page.screenshot({ path: out('notracing-home'), clip: { x: 0, y: 0, width: 1440, height: 1000 } });

await page.goto(`${B}team.html?${Q}&as=Maya`, { waitUntil: 'networkidle0' });
await settle();
console.log('team greyed cards:', (await page.$$('.dcard--absent')).length, 'market marks:', (await page.$$('#market .mark--dnf')).length);
await page.screenshot({ path: out('notracing-team'), fullPage: false });

await page.goto(`${B}admin.html?${Q}`, { waitUntil: 'networkidle0' });
await page.click('[data-act=round][data-id="4"]');
await settle();
console.log('admin status:', await page.$eval('[data-act=status][aria-pressed=true]', e => e.textContent), 'file:', JSON.stringify(await page.$eval('#file', e => e.textContent)));
await page.click('[data-act=out][data-code=PAB]');
await settle();
console.log('after tapping PAB:', JSON.stringify(await page.$eval('#file', e => e.textContent)));
const panel = await page.$('[aria-label="Drivers not racing"]');
await panel.evaluate(e => e.closest('section').scrollIntoView());
await page.screenshot({ path: out('notracing-admin') });

await page.setViewport({ width: 900, height: 700 });
await page.goto(`${B}league.html?${Q}`, { waitUntil: 'networkidle0' });
await page.screenshot({ path: out('nav-900'), clip: { x: 0, y: 0, width: 900, height: 80 } });

await page.goto('about:blank');   // switching to a phone viewport reloads the page; don't cut that reload off
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(`${B}league.html?${Q}`, { waitUntil: 'networkidle0' });
await settle();
console.log('phone sideways scroll:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
await page.screenshot({ path: out('league-phone'), fullPage: true });

await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
await page.goto(`${B}league.html?${Q}`, { waitUntil: 'networkidle0' });
await page.screenshot({ path: out('tabbar-360'), clip: { x: 0, y: 740 - 80, width: 360, height: 80 } });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
