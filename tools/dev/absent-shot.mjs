// Finds a demo player with a no-show in a scored round and screenshots the greyed-out views.
//   node tools/dev/absent-shot.mjs
import puppeteer from 'puppeteer';
const Q = 'rounds=tests/fixtures/rounds-prov&store=local&demo=1&now=2026-11-02T12:00:00Z';
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1440, height: 1000 });
let who = null;
for (const name of ['Maya', 'Dex', 'Sol', 'Rhea', 'Kai', 'Nova', 'Jules', 'Ines', 'Tobi', 'Wren']) {
  await page.goto(`http://localhost:3000/team.html?${Q}&as=${name}`, { waitUntil: 'load' });
  await page.waitForSelector('#squad');
  if (await page.$('.dcard--absent')) { who = name; break; }
}
console.log('player with a no-show:', who || 'none found');
if (who) {
  await page.screenshot({ path: 'temporary screenshots/absent-team.png', clip: { x: 0, y: 300, width: 1440, height: 700 } });
  await page.goto(`http://localhost:3000/index.html?${Q}&as=${who}`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 4500));
  console.log('home lineup greyed tiles:', (await page.$$('.lineup__cell.is-absent')).length);
  const tile = await page.$('.lineup');
  if (tile) await tile.screenshot({ path: 'temporary screenshots/absent-home.png' });
}
await page.goto(`http://localhost:3000/results.html?${Q}#r3`, { waitUntil: 'load' });
await page.waitForSelector('[data-tab=fantasy]');
await page.click('[data-tab=fantasy]');
await new Promise(r => setTimeout(r, 500));
console.log('results fantasy tab absent rows:', (await page.$$('.row--absent')).length);
await page.screenshot({ path: 'temporary screenshots/absent-results.png', fullPage: true });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
