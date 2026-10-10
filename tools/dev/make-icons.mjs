// Renders the phone/home-screen icons.  node tools/dev/make-icons.mjs
// Uses the league logo (images/league-logo.png) when it exists, otherwise images/app/icon.svg.
// The logo's white margin is detected and cropped away automatically.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const logoPath = path.join(root, 'images/league-logo.png');
const hasLogo = fs.existsSync(logoPath);
const svg = fs.readFileSync(path.join(root, 'images/app/icon.svg'), 'utf8');

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();

let logoUrl = null;
if (hasLogo) {
  // works for PNG or JPEG content regardless of the file extension
  await page.setContent(`<img id="l" src="data:image/*;base64,${fs.readFileSync(logoPath).toString('base64')}">`);
  logoUrl = await page.evaluate(async () => {
    const img = document.getElementById('l');
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const light = (a, b) => { const d = x.getImageData(a, b, 1, 1).data; return d[3] < 20 || d[0] + d[1] + d[2] > 700; };
    let m = 0; while (m < W / 2 && light(m, H >> 1)) m++;           // white/transparent margin on the left
    const size = W - 2 * m;
    const o = document.createElement('canvas'); o.width = o.height = size;
    const ox = o.getContext('2d');
    ox.beginPath(); ox.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ox.clip();
    ox.drawImage(c, m, m, size, size, 0, 0, size, size);
    return o.toDataURL('image/png');
  });
}

const art = size => logoUrl
  ? `<div style="width:${size}px;height:${size}px;background:#0c0d11;display:grid;place-items:center"><img src="${logoUrl}" style="width:${Math.round(size * 0.88)}px;height:${Math.round(size * 0.88)}px"></div>`
  : svg.replace('<svg ', `<svg width="${size}" height="${size}" `);

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-64.png', 64]]) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${art(size)}</body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  await page.screenshot({ path: path.join(root, 'images/app', name), omitBackground: !logoUrl });
  console.log(`wrote images/app/${name}${logoUrl ? ' (from league logo)' : ''}`);
}
await browser.close();
