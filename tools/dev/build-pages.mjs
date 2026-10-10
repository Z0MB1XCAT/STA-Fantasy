// Writes the HTML shells (and 404.html) from one template so their <head> never drifts apart.
//   node tools/dev/build-pages.mjs
//   SITE_URL=https://you.github.io/stafantasy node tools/dev/build-pages.mjs   (adds absolute link-preview image)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const DESC = 'Fantasy racing for the STA league. Pick 5 drivers and 2 constructors, play your chips and climb the table.';

const pages = [
  ['index.html', 'STA Fantasy', 'home', DESC],
  ['team.html', 'My team', 'team', 'Build your STA Fantasy team before the Friday deadline.'],
  ['drivers.html', 'Drivers', 'drivers', 'Prices, points and form for every driver and constructor in the STA league.'],
  ['results.html', 'Results', 'results', 'Race results and fantasy points for every round of the STA league.'],
  ['rules.html', 'How it works', 'rules', 'Scoring, transfers, chips and prices for STA Fantasy.'],
  ['admin.html', 'Enter results', 'admin', 'Results entry for the STA Fantasy admin.'],
];

const head = (title, desc, { noindex = false } = {}) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title === 'STA Fantasy' ? title : `${title} | STA Fantasy`}</title>
  <meta name="description" content="${desc}">${noindex ? '\n  <meta name="robots" content="noindex">' : ''}
  <meta name="theme-color" content="#0a0b0e">
  <meta name="color-scheme" content="dark">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="STA Fantasy">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">${SITE_URL ? `
  <meta property="og:image" content="${SITE_URL}/images/app/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="STA Fantasy">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="images/app/favicon-64.png" type="image/png">
  <link rel="apple-touch-icon" href="images/app/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,100..125,600..900;1,100..125,700..900&family=Titillium+Web:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/app.css">
</head>`;

const tpl = (title, script, desc) => `${head(title, desc, { noindex: script === 'admin' })}
<body>
  <a class="skip" href="#app">Skip to content</a>
  <div id="site-header"></div>
  <main id="app" class="wrap"></main>
  <div id="site-footer"></div>
  <script type="module" src="js/pages/${script}.js"></script>
</body>
</html>
`;

for (const [file, title, script, desc] of pages) fs.writeFileSync(path.join(root, file), tpl(title, script, desc));

// GitHub Pages serves this for any missing URL, possibly from a nested path, so links are resolved at runtime.
// GitHub serves 404.html at whatever path was requested, so its assets need absolute URLs.
const abs = SITE_URL ? `${SITE_URL}/` : '/';
fs.writeFileSync(path.join(root, '404.html'), `${head('Page not found', DESC, { noindex: true }).replace(/href="(manifest|images|css)/g, `href="${abs}$1`)}
<body>
  <main class="wrap" style="min-height:70vh;display:grid;place-content:center;text-align:center;gap:14px">
    <p class="shead__title" style="font-size:clamp(3rem,10vw,6rem);color:var(--brand)">404</p>
    <h1 class="h1">Off the track</h1>
    <p class="muted">That page does not exist. It may have moved, or the link is wrong.</p>
    <p><a class="btn btn--red" href="${abs}">Back to STA Fantasy</a></p>
  </main>
</body>
</html>
`);

fs.writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify({
  name: 'STA Fantasy',
  short_name: 'STA Fantasy',
  description: DESC,
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  background_color: '#0e0f13',
  theme_color: '#0a0b0e',
  icons: [
    { src: 'images/app/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'images/app/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'images/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');
console.log(`Wrote ${pages.map(p => p[0]).join(', ')}, 404.html and manifest.webmanifest${SITE_URL ? ` (link previews point at ${SITE_URL})` : ' (set SITE_URL for the link-preview image)'}`);
