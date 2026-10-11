// Runs sw.js in a sandbox with a pretend host that is healthy, paused, unreachable or serving its own 404,
// and checks that page loads are sent to the GitHub Pages copy only when the host is really down.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const BACKUP = 'https://z0mb1xcat.github.io/STA-Fantasy/';

/** Loads sw.js as if it were running on `origin`; `host(url)` decides what the pretend host answers. */
function loadWorker(origin, host) {
  const listeners = {};
  const calls = [];
  const self = {
    location: new URL('/sw.js', origin),
    registration: { scope: origin + '/' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting() {}, clients: { claim() {} },
  };
  const sandbox = {
    self, URL, Response, console,
    fetch: async (input) => {
      const url = new URL(typeof input === 'string' ? input : input.url, self.location).href;
      calls.push(url);
      return host(url);
    },
  };
  vm.runInNewContext(source, sandbox);
  /** Simulates the browser loading a page; resolves to the response the worker answers with, or null if it stays out of it. */
  async function navigate(urlPath, init = {}) {
    const request = { url: origin + urlPath, mode: 'navigate', method: 'GET', ...init };
    let answer = null;
    listeners.fetch({ request, respondWith: p => { answer = p; } });
    return answer ? await answer : null;
  }
  return { navigate, calls, listeners };
}

const ok = (body = 'page') => ({ ok: true, status: 200, type: 'basic', body });
const fail = status => ({ ok: false, status, type: 'basic' });
const MAIN = 'https://sta-fantasy.netlify.app';

test('healthy host: the page is passed straight through', async () => {
  const w = loadWorker(MAIN, () => ok('real page'));
  const res = await w.navigate('/results.html');
  assert.equal(res.body, 'real page');
  assert.equal(w.calls.length, 1);
});

test('host paused (503): redirected to the same page on GitHub Pages, query string kept', async () => {
  const w = loadWorker(MAIN, () => fail(503));
  const res = await w.navigate('/results.html?round=3');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), BACKUP + 'results.html?round=3');
});

test('home page goes to the backup home page', async () => {
  const w = loadWorker(MAIN, () => fail(503));
  assert.equal((await w.navigate('/')).headers.get('location'), BACKUP);
});

test('host refusing connections: redirected', async () => {
  const w = loadWorker(MAIN, () => { throw new TypeError('Failed to fetch'); });
  const res = await w.navigate('/team.html');
  assert.equal(res.headers.get('location'), BACKUP + 'team.html');
});

test('host-level "site not found" 404 (the site itself is gone): redirected', async () => {
  const w = loadWorker(MAIN, url => (url.endsWith('/data/season.json') ? fail(404) : fail(404)));
  const res = await w.navigate('/index.html');
  assert.equal(res.headers.get('location'), BACKUP + 'index.html');
});

test('our own 404 page on a healthy host is left alone', async () => {
  const w = loadWorker(MAIN, url => (url.endsWith('/data/season.json') ? ok('{}') : fail(404)));
  const res = await w.navigate('/no-such-page');
  assert.equal(res.status, 404);
});

test('a redirect issued by the host itself is passed through', async () => {
  const w = loadWorker(MAIN, () => ({ ok: false, status: 0, type: 'opaqueredirect' }));
  const res = await w.navigate('/old.html');
  assert.equal(res.type, 'opaqueredirect');
});

test('only page loads are touched: images, scripts and data requests are ignored', async () => {
  const w = loadWorker(MAIN, () => fail(503));
  assert.equal(await w.navigate('/js/shell.js', { mode: 'cors' }), null);
  assert.equal(await w.navigate('/data/season.json', { mode: 'same-origin' }), null);
  assert.equal(await w.navigate('/team.html', { method: 'POST' }), null);
});

test('on the backup site itself the worker stays out of the way (no redirect loop)', async () => {
  const w = loadWorker('https://z0mb1xcat.github.io', () => fail(503));
  assert.equal(await w.navigate('/STA-Fantasy/results.html'), null);
});

test('the backup address matches js/config.js', () => {
  const cfg = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
  assert.equal(cfg.match(/FALLBACK_SITE\s*=\s*'([^']+)'/)[1], BACKUP);
  assert.ok(source.includes(`const BACKUP = '${BACKUP}'`));
});
