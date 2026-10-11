// Cuts the five chip badges out of a chip-guide screenshot and writes them as transparent circular WebP images.
//   node tools/dev/make-chips.mjs [path-to-sheet.jpg]      (default: tools/source/chips-sheet.jpg, which git ignores)
// Each badge is found by colour: inside a search box around where the badge sits, the pixels that differ
// from the pastel tile behind it are the badge. The edge pixels are blended with that tile, so the circle
// is clipped slightly inside the edge to leave no pastel fringe.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.resolve(process.argv[2] || path.join(root, 'tools/source/chips-sheet.jpg'));
const outDir = path.join(root, 'images/chips');
fs.mkdirSync(outDir, { recursive: true });

// rough centre of each badge on the 1280x720 sheet (the search box is generous, the code finds the exact circle)
const BADGES = {
  autopilot:  [715, 200],
  limitless:  [913, 204],
  nonegative: [724, 378],
  wildcard:   [920, 382],
  extradrs:   [1106, 383],
};
const SIZE = 128;     // output size in px (the source badges are only ~75px, so more would just be wasted weight)

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setContent(`<canvas id="c"></canvas>`);
const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(src).toString('base64');

const result = await page.evaluate(async (dataUrl, BADGES, SIZE) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.getElementById('c');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const out = {}, report = {};
  for (const [id, [cx, cy]] of Object.entries(BADGES)) {
    const R = 62;                                    // search half-size
    const x0 = cx - R, y0 = cy - R, w = R * 2, h = R * 2;
    const px = ctx.getImageData(x0, y0, w, h).data;
    const at = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    // tile colour = average of the four corners of the search box
    const corners = [at(2, 2), at(w - 3, 2), at(2, h - 3), at(w - 3, h - 3)];
    const bg = [0, 1, 2].map(k => corners.reduce((a, p) => a + p[k], 0) / 4);
    const dist = p => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);
    // the badge is the saturated disc: strongly different from the tile, and not the dark label text below it
    let minX = w, maxX = -1, minY = h, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = at(x, y);
      if (dist(p) > 70 && Math.max(...p) - Math.min(...p) > 60) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const diameter = Math.min(bw, bh);                // the disc is round; the shorter side is the true diameter
    const ccx = x0 + minX + bw / 2, ccy = y0 + minY + bh / 2;
    report[id] = { centre: [Math.round(ccx * 10) / 10, Math.round(ccy * 10) / 10], width: bw, height: bh, bg: bg.map(Math.round) };

    // crop the disc (clipped 1.5px inside its edge), upscale smoothly, transparent outside the circle
    const inset = 1.5;
    const r = diameter / 2 - inset;
    const o = document.createElement('canvas'); o.width = o.height = SIZE;
    const octx = o.getContext('2d');
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
    octx.beginPath(); octx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2); octx.clip();
    const sx = ccx - r, sy = ccy - r;
    octx.drawImage(c, sx, sy, r * 2, r * 2, 0, 0, SIZE, SIZE);
    out[id] = o.toDataURL('image/webp', 0.92);
  }
  return { out, report };
}, dataUrl, BADGES, SIZE);

for (const [id, url] of Object.entries(result.out)) {
  fs.writeFileSync(path.join(outDir, `${id}.webp`), Buffer.from(url.split(',')[1], 'base64'));
  const r = result.report[id];
  console.log(`${id.padEnd(11)} centre ${r.centre.join(', ')}   found ${r.width}x${r.height}px   tile colour rgb(${r.bg.join(',')})`);
}
await browser.close();
console.log(`Wrote ${Object.keys(result.out).length} chips to ${path.relative(root, outDir)}`);
