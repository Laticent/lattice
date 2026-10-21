/**
 * Integration: the plain `.html` export's load lock, on the real CLI and a real browser
 * (lib/core/export-load-lock.js; npm-plugin threat model §5.4, owner decision 2026-10-18).
 *
 * A deck author may put raw HTML in the deck (design/skill.md §Raw HTML), and the plain export keeps it
 * live. The lock must refuse a REMOTE script, frame or stylesheet there and keep everything local.
 *
 *   DEFAULT        a deck with its own remote <script src>, <iframe> and <link rel=stylesheet>, and an inline
 *                  script → the three remote loads reach a local listener ZERO times; the inline script runs
 *   --allow-remote the same deck → the three reach the listener (the control: the listener can see them, and
 *                  the flag is the way out the changelog tells authors to use)
 *   LOCAL          a script, stylesheet and frame that are the file's own siblings still load under the lock
 *
 * Needs Chromium.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const TIMEOUT = 300000;

let dir;
let server;
let hits;
let H;

before(async () => {
  hits = [];
  server = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'content-type': req.url.endsWith('.js') ? 'text/javascript' : req.url.endsWith('.css') ? 'text/css' : 'text/html' }).end(req.url.endsWith('.js') ? 'window.__remoteScriptRan = true;' : '');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  H = `http://127.0.0.1:${server.address().port}`;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-load-lock-'));
  fs.writeFileSync(path.join(dir, 'local.js'), 'window.__localScriptRan = true;');
  fs.writeFileSync(path.join(dir, 'local.css'), 'body { --local-css: loaded; }');
  fs.writeFileSync(path.join(dir, 'frame.html'), '<!doctype html><title>frame</title><p>local frame</p>');
  fs.writeFileSync(
    path.join(dir, 'deck.md'),
    `---\ntheme: indaco\n---\n\n## Author HTML\n\n<script src="${H}/remote-script.js"></script>\n<iframe src="${H}/remote-frame"></iframe>\n<link rel="stylesheet" href="${H}/remote-style.css">\n<script>window.__inlineRan = true;</script>\n<script src="local.js"></script>\n<link rel="stylesheet" href="local.css">\n<iframe src="frame.html"></iframe>\n\nBody.\n`,
  );
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

// Async on purpose: the render may fetch from the listener in THIS process, which a blocking spawn would starve.
function exportDeck(name, extra = []) {
  const out = path.join(dir, `${name}.html`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), out, '--quiet', ...extra], { cwd: ROOT });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 240000);
    child.on('close', (code) => {
      clearTimeout(timer);
      return code === 0 ? resolve(out) : reject(new Error(`export failed (${code}): ${err}`));
    });
  });
}

async function open(file) {
  hits.length = 0;
  const browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${file}`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 2500));
    const state = await page.evaluate(() => ({ inline: !!window.__inlineRan, local: !!window.__localScriptRan, remote: !!window.__remoteScriptRan, localCss: getComputedStyle(document.body).getPropertyValue('--local-css').trim() }));
    const frames = page.frames().map((f) => f.url());
    return { state, remoteHits: [...new Set(hits.filter((h) => h.startsWith('/remote')))].sort(), frames };
  } finally {
    await browser.close();
  }
}

describe('the plain export load lock, on the CLI and a real browser', () => {
  test('DEFAULT: the deck’s own remote script, frame and stylesheet are refused; its inline and local content still work', { timeout: TIMEOUT }, async () => {
    const file = await exportDeck('default');
    assert.match(fs.readFileSync(file, 'utf8'), /frame-src 'none'/, 'the default export carries the lock');
    const { state, remoteHits } = await open(file);
    assert.deepEqual(remoteHits, [], `a remote load reached the listener: ${remoteHits.join(' ')}`);
    assert.equal(state.remote, false);
    assert.equal(state.inline, true, 'an inline author script still runs');
    assert.equal(state.local, true, 'a sibling script still loads');
    assert.equal(state.localCss, 'loaded', 'a sibling stylesheet still loads');
  });

  test('--allow-remote: the same deck keeps its remote script, frame and stylesheet (the control, and the way out)', { timeout: TIMEOUT }, async () => {
    const file = await exportDeck('allowed', ['--allow-remote']);
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /frame-src 'none'/, '--allow-remote drops the lock');
    const { state, remoteHits } = await open(file);
    assert.deepEqual(remoteHits, ['/remote-frame', '/remote-script.js', '/remote-style.css'], 'the listener must see all three, or the zero above proves nothing');
    assert.equal(state.remote, true);
  });
});
