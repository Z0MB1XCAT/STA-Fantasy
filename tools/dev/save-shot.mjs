// Screenshots what a player sees on My team (no scrolling) before and after changing their team,
// on desktop and phone, to check the save button can't be missed.
//   node tools/dev/save-shot.mjs [label]   (with node serve.mjs running)
import puppeteer from 'puppeteer';

const label = process.argv[2] || 'now';
const Q = 'rounds=tests/fixtures/rounds&store=local&demo=1&now=2026-11-04T12:00:00Z&as=Maya';
const browser = await puppeteer.launch({ headless: 'new' });
const errors = [];

// scroll to the middle first, like a thumb would, so the pinned dock isn't in the way
const tap = async el => { await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await el.click(); };

async function run(name, viewport) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  await page.setViewport(viewport);
  await page.goto(`http://localhost:3000/team.html?${Q}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:3000/team.html?${Q}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: `temporary screenshots/save-${label}-${name}-1-loaded.png` });

  // swap a driver: remove the first one, add the cheapest one not in the squad
  await tap(await page.$('#squad [data-act=remove]'));
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: `temporary screenshots/save-${label}-${name}-2-incomplete.png` });
  const add = await page.$$('#market [data-act=add]:not([disabled])');
  await tap(add.at(-1));
  await new Promise(r => setTimeout(r, 300));
  const drsSet = await page.$('#squad [data-act=drs][aria-pressed=true]');
  if (!drsSet) await tap(await page.$('#squad [data-act=drs]'));
  await page.evaluate(() => scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: `temporary screenshots/save-${label}-${name}-3-unsaved.png` });

  const btn = await page.$('[data-act=save]');
  const vis = btn && await btn.evaluate(b => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && !b.disabled; });
  console.log(`${name}: save button visible without scrolling and enabled: ${vis}`);
  if (btn && vis) {
    await btn.click();
    await new Promise(r => setTimeout(r, 900));
    await page.screenshot({ path: `temporary screenshots/save-${label}-${name}-4-saved.png` });
  }
  await page.close();
}

await run('desktop', { width: 1440, height: 900 });
await run('phone', { width: 390, height: 844, isMobile: true, hasTouch: true });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
