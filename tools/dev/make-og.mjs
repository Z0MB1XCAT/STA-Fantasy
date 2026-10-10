// Renders the 1200x630 link-preview image (what Discord shows when someone pastes the link).
//   node tools/dev/make-og.mjs      (needs the dev server running: node serve.mjs)
import puppeteer from 'puppeteer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,100..125,600..900;1,100..125,700..900&family=Titillium+Web:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { margin: 0; width: 1200px; height: 630px; background: #0e0f13; color: #f3f2ee; font-family: 'Titillium Web', sans-serif; overflow: hidden; position: relative; }
  .stripe { position: absolute; left: 72px; right: 72px; top: 72px; height: 16px; background: linear-gradient(#f04a37,#f04a37) 0 0/100% 4px no-repeat, linear-gradient(#f04a37,#f04a37) 0 9px/100% 7px no-repeat; clip-path: polygon(0 0,100% 0,calc(100% - 16px) 100%,0 100%); }
  .logo { position: absolute; left: 72px; top: 128px; width: 104px; height: 104px; border-radius: 50%; overflow: hidden; }
  .logo img { position: absolute; left: -21%; top: -21%; width: 142%; height: 142%; }
  h1 { position: absolute; left: 72px; top: 260px; margin: 0; font-family: Archivo; font-weight: 900; font-stretch: 125%; font-style: italic; font-size: 108px; line-height: .95; letter-spacing: -0.02em; text-transform: uppercase; }
  h1 span { color: #5cc6f2; }
  p { position: absolute; left: 76px; top: 476px; margin: 0; font-size: 34px; color: #b3b9c5; font-weight: 600; }
  .car { position: absolute; right: -40px; bottom: 34px; width: 640px; opacity: .95; }
  .road { position: absolute; left: 0; right: 0; bottom: 0; height: 70px; background: #111217; }
</style></head><body>
  <div class="stripe"></div>
  <div class="logo"><img src="http://localhost:3000/images/league-logo.png"></div>
  <h1>STA <span>Fantasy</span></h1>
  <p>Pick your team. Beat the league.</p>
  <div class="road"></div>
  <img class="car" src="http://localhost:3000/images/teams/2026alpinecarright.avif">
</body></html>`;

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(root, 'images/app/og.png') });
await browser.close();
console.log('wrote images/app/og.png');
