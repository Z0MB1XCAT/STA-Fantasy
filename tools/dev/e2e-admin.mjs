// Drives admin.html: paste a mixed-alias finishing order, mark a DNF, pick fastest lap, read the generated file.
//   node tools/dev/e2e-admin.mjs   (with node serve.mjs running)

import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:3000/admin.html?store=local&now=2026-10-16T21:00:00Z', { waitUntil: 'load' });
await page.waitForSelector('#paste');

const click = async sel => { await page.click(sel); await new Promise(r => setTimeout(r, 150)); };
const fileText = () => page.$eval('#file', e => e.textContent);

// round 1, mark provisional (already default), Short Quali: mix codes, names, simgrid usernames, a numbered line
await page.type('#paste', 'KAM\n2. jengaaboi\nSantipopelka13\nIceman\nDon Lucio\nSWU\nz0mb1xcat DNF');
await click('[data-act=paste]');
console.log('after paste quali  ->', JSON.stringify((await fileText()).split('\n').filter(l => l.startsWith('quali'))));
console.log('paste message      ->', await page.$eval('[role=status].hint', e => e.textContent));

// Feature tab: tap-to-place three drivers, then mark one DNF and set fastest lap
await click('[data-act=tab][data-k=feature]');
for (const code of ['JEN', 'KAM', 'ICE']) await click(`[data-act=place][data-code=${code}]`);
await click('[data-act=mark][data-i="2"][data-m=dnf]');
await page.select('#fl', 'JEN');
console.log('feature + fastest  ->', JSON.stringify((await fileText()).split('\n').filter(l => /^(feature|fastest)/.test(l))));

// a reserve can be placed so the order is right; drivers in no session show as absent (greyed, 0 pts)
console.log('reserve in pool    ->', !!(await page.$('[data-act=place][data-code=XMK]')));
console.log('absent preview rows->', await page.$$eval('.row--absent', r => r.length));

// full text + validity badge
console.log('--- generated file ---\n' + await fileText());
console.log('valid badge        ->', await page.$eval('.panel--raised .badge', e => e.textContent.trim()));
console.log('points preview rows->', await page.$$eval('section.panel:last-of-type .tower:first-of-type .row', r => r.length));
console.log('errors             ->', errors.length ? errors : 'none');
await browser.close();
