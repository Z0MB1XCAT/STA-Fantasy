import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Puppeteer lives in a sibling project (shared install); fall back to it if not local.
let puppeteer;
try {
  puppeteer = (await import('puppeteer')).default;
} catch {
  const shared = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../MyWebsite/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js');
  puppeteer = (await import(pathToFileURL(shared).href)).default;
}

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'temporary screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function nextIndex() {
  const files = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
  const nums = files.map(f => {
    const m = f.match(/^screenshot-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3];
const width = parseInt(process.argv[4] || '1440', 10);
const height = parseInt(process.argv[5] || '900', 10);
const fullPage = process.argv[6] !== 'viewport';
const waitMs = parseInt(process.argv[7] || '2600', 10);

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width, height });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
await page.goto(url, { waitUntil: 'load', timeout: 45000 });
await new Promise(r => setTimeout(r, waitMs));

const idx = nextIndex();
const name = `screenshot-${idx}${label ? '-' + label : ''}.png`;
const outPath = path.join(outDir, name);
await page.screenshot({ path: outPath, fullPage });
await browser.close();

console.log(outPath);
