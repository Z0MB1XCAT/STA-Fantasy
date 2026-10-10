// Production audit: every page against the REAL backend (console errors and warnings, failed requests,
// missing alt text, unlabeled buttons, horizontal overflow on phones).   node tools/dev/audit.mjs
// Live site:  BASE=https://z0mb1xcat.github.io/STA-Fantasy/ node tools/dev/audit.mjs
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3000/';
const pages = ['index', 'team', 'league', 'drivers', 'results', 'rules', 'admin', '404'];
const browser = await puppeteer.launch({ headless: 'new' });
let problems = 0;

for (const width of [1440, 390, 360]) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  for (const p of pages) {
    const logs = [];
    page.removeAllListeners('console'); page.removeAllListeners('pageerror'); page.removeAllListeners('requestfailed'); page.removeAllListeners('response');
    page.on('console', m => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => logs.push('pageerror: ' + e.message));
    page.on('requestfailed', r => logs.push('request failed: ' + r.url()));
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/404.html') && !(p === '404' && r.url().includes('nope'))) logs.push(`HTTP ${r.status()}: ${r.url()}`); });
    await page.goto(BASE + (p === '404' ? '404.html' : p + '.html'), { waitUntil: 'networkidle0', timeout: 45000 }).catch(e => logs.push('nav: ' + e.message));
    await new Promise(r => setTimeout(r, 1200));
    const checks = await page.evaluate(w => ({
      overflow: document.documentElement.scrollWidth > w ? document.documentElement.scrollWidth : 0,
      imgNoAlt: [...document.images].filter(i => !i.hasAttribute('alt')).length,
      unlabeled: [...document.querySelectorAll('button, a[href]')].filter(b => !(b.textContent.trim() || b.getAttribute('aria-label') || b.getAttribute('title'))).length,
      h1: document.querySelectorAll('h1').length,
      title: document.title,
    }), width);
    const bad = [...logs];
    if (checks.overflow) bad.push(`overflow: page is ${checks.overflow}px wide`);
    if (checks.imgNoAlt) bad.push(`${checks.imgNoAlt} images without alt`);
    if (checks.unlabeled) bad.push(`${checks.unlabeled} unlabeled buttons/links`);
    if (checks.h1 !== 1) bad.push(`${checks.h1} h1 elements`);
    if (width === 1440 || bad.length) console.log(`${String(width).padEnd(5)} ${p.padEnd(8)} "${checks.title}" ${bad.length ? '\n   - ' + bad.join('\n   - ') : 'ok'}`);
    problems += bad.length;
  }
  await page.close();
}
await browser.close();
console.log(problems ? `${problems} problem(s)` : 'No problems found');
