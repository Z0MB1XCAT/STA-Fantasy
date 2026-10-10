// Opens a rival's team from the standings (demo data) and screenshots it.  node tools/dev/rival-shot.mjs [width]
import puppeteer from 'puppeteer';
const width = Number(process.argv[2] || 1440);
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width, height: 900 });
await page.goto('http://localhost:3000/index.html?rounds=tests/fixtures/rounds&store=local&demo=1&now=2026-11-04T12:00:00Z', { waitUntil: 'load' });
await page.waitForSelector('[data-player]');
await page.click('[data-player]');
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: `temporary screenshots/rival-${width}.png` });
console.log('dialog open:', await page.$eval('#rival', d => d.open), '| errors:', errors.length ? errors : 'none');
await browser.close();
