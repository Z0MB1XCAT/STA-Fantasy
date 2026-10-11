// Proves the "Netlify is down, go to GitHub Pages" worker in a real browser.
// It serves this folder on a pretend host (localhost:3100), lets Chrome install sw.js, then pauses the host
// (503, like a paused project) and switches it off (connection refused), and checks where page loads end up.
// Needs internet: a working redirect ends on the live GitHub Pages site.
//   node tools/dev/e2e-fallback.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 3100;
const HOST = `http://localhost:${PORT}`;
const BACKUP = 'https://z0mb1xcat.github.io/STA-Fantasy/';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

let paused = false;
const server = http.createServer((req, res) => {
  if (paused) { res.writeHead(503, { 'Content-Type': 'text/html' }); res.end('<h1>Site not available</h1>'); return; }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<h1>Not found</h1>'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(PORT, r));

let failed = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const land = async url => { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('   (goto:', e.message.split('\n')[0] + ')')); return page.url(); };

// 1. first visit while the host is healthy: the page loads and the worker installs
await land(`${HOST}/index.html?sw=1`);
await page.evaluate(() => navigator.serviceWorker.ready.then(r => r.active?.state));
const registered = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
check('worker installed on the main host', registered);

// 2. healthy host: pages load normally
let url = await land(`${HOST}/results.html`);
check('healthy host: stays on the main host', url.startsWith(HOST), url);

// 3. project paused: the host answers 503
paused = true;
url = await land(`${HOST}/results.html`);
check('paused host (503): sent to the same page on GitHub Pages', url.startsWith(BACKUP + 'results.html'), url);
const title = await page.title();
check('and the backup page really loaded', /STA Fantasy/i.test(title), title);

// 4. host comes back: back to normal
paused = false;
url = await land(`${HOST}/team.html`);
check('host back up: stays on the main host again', url.startsWith(HOST), url);

// 5. host switched off entirely (connection refused)
await new Promise(r => server.close(r));
url = await land(`${HOST}/rules.html`);
check('host unreachable: sent to GitHub Pages', url.startsWith(BACKUP + 'rules.html'), url);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
