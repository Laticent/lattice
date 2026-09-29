/**
 * An exported `--html` / `--fluid` page draws its plots on a machine that is not the exporter's.
 *
 * The CLI page used to link a plugin's library by its absolute path on the exporting machine
 * (`<script src="file:///…/node_modules/function-plot/dist/function-plot.js">`). The PDF is
 * captured there, so it was right; but `--html` and `--fluid` hand the page itself to a reader,
 * and on their machine that path does not exist — each plot showed its JSON config instead.
 * (Recorded after #2439; fixed by `payloadScript` in lib/plugins/hydrate-script.js.)
 *
 * "Another machine" is modeled honestly rather than by a move alone, since an absolute path
 * still resolves after a move on the same machine: the page is copied to a fresh directory and
 * loaded with every request OUTSIDE that directory refused.
 *
 * The same holds for MATH (followups.d/2439): the page linked KaTeX's stylesheet by its
 * `file://` path in node_modules, so a moved `--html`, `--fluid` or `--read` export lost all 20
 * KaTeX faces and set its math in Times. The sheet is now inlined with its fonts as `data:` URIs,
 * and the second describe below holds every face loading with the link's path refused.
 *
 * Slow tier: CLI exports and a Chromium launch.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..', '..');
const TIMEOUT = 300000;
const DECK = '---\ntheme: indaco\n---\n\n# Two plots\n\n---\n\n## The square\n\n```functionplot\n' +
  '{ "data": [{ "fn": "x^2" }], "xAxis": { "domain": [-3, 3] }, "yAxis": { "domain": [0, 9] } }\n```\n\n---\n\n' +
  '## The sine\n\n```functionplot\n{ "data": [{ "fn": "sin(x)" }], "xAxis": { "domain": [-6, 6] } }\n```\n';

describe('a moved --html / --fluid export still draws its plots', () => {
  let browser;
  let dir;
  test.before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-moved-export-'));
    fs.writeFileSync(path.join(dir, 'deck.md'), DECK);
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  });
  test.after(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  for (const flags of [[], ['--fluid']]) {
    const label = flags.length ? flags.join(' ') : 'plain --html';
    test(`${label}: every plot draws with nothing outside the page's own directory reachable`, { timeout: TIMEOUT }, async () => {
      const out = path.join(dir, `out${flags.join('')}.html`);
      const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), path.join(dir, 'deck.md'), out, ...flags, '--quiet'], {
        cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT,
      });
      assert.equal(r.status, 0, `export failed:\n${r.stderr}`);
      const html = fs.readFileSync(out, 'utf8');
      assert.doesNotMatch(html, /<script[^>]*\ssrc="file:/, 'the page links no script by a file:// path');

      const moved = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-moved-to-'));
      try {
        const target = path.join(moved, 'shared.html');
        fs.copyFileSync(out, target);
        const allowed = pathToFileURL(moved).href;
        const refused = [];
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const url = req.url();
          if (url.startsWith(allowed) || url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') req.continue();
          else {
            refused.push(url);
            req.abort();
          }
        });
        await page.goto(pathToFileURL(target).href, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(
          () => !document.querySelector('[data-lattice-hydrate][data-lattice-settle="pending"], [data-lattice-hydrate][data-lattice-settle="hydrating"]'),
          { timeout: 20000 },
        );
        const plots = await page.evaluate(() => [...document.querySelectorAll('[data-lattice-hydrate="function-plot"]')].map((el) => ({
          state: el.getAttribute('data-lattice-settle'),
          svg: Boolean(el.querySelector('svg')),
        })));
        await page.close();
        assert.equal(plots.length, 2, 'both plot placeholders are on the page');
        for (const p of plots) assert.deepEqual(p, { state: 'rendered', svg: true }, `a plot did not draw; refused requests: ${refused.join(', ') || '(none)'}`);
      } finally {
        fs.rmSync(moved, { recursive: true, force: true });
      }
    });
  }
});

const MATH_DECK = '---\ntheme: indaco\n---\n\n# Math\n\n---\n\n## Display math\n\n$$\n' +
  '\\int_0^1 \\frac{x^2}{\\sqrt{1+x^3}}\\,dx = \\frac{2}{3}\\left(\\sqrt{2}-1\\right)\n$$\n\n' +
  'Inline: $e^{i\\pi} + 1 = 0$ and $\\sum_{k=1}^{n} k$.\n';

describe('a moved --html / --fluid / --read export still sets its math in KaTeX', () => {
  let browser;
  let dir;
  test.before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-moved-math-'));
    fs.writeFileSync(path.join(dir, 'math.md'), MATH_DECK);
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  });
  test.after(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  for (const flags of [[], ['--fluid'], ['--read']]) {
    const label = flags.length ? flags.join(' ') : 'plain --html';
    test(`${label}: every KaTeX face loads with nothing outside the page's own directory reachable`, { timeout: TIMEOUT }, async () => {
      const out = path.join(dir, `math${flags.join('')}.html`);
      const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), path.join(dir, 'math.md'), out, ...flags, '--quiet'], {
        cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT,
      });
      assert.equal(r.status, 0, `export failed:\n${r.stderr}`);
      const html = fs.readFileSync(out, 'utf8');
      assert.doesNotMatch(html, /<link[^>]*\shref="file:[^"]*katex/, 'the page links no KaTeX stylesheet by a file:// path');

      const moved = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-moved-math-to-'));
      try {
        const target = path.join(moved, 'shared.html');
        fs.copyFileSync(out, target);
        const allowed = pathToFileURL(moved).href;
        const refused = [];
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const url = req.url();
          if (url.startsWith(allowed) || url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') req.continue();
          else {
            refused.push(url);
            req.abort();
          }
        });
        await page.goto(pathToFileURL(target).href, { waitUntil: 'load', timeout: 60000 });
        const faces = await page.evaluate(async () => {
          const katex = [...document.fonts].filter((f) => /KaTeX/.test(f.family));
          await Promise.all(katex.map((f) => f.load().catch(() => {})));
          return { total: katex.length, loaded: katex.filter((f) => f.status === 'loaded').length, math: document.querySelectorAll('.katex').length };
        });
        await page.close();
        assert.ok(faces.math >= 3, 'the math is on the page');
        assert.ok(faces.total >= 20, `KaTeX's faces are declared in the page itself (got ${faces.total})`);
        assert.equal(faces.loaded, faces.total, `every KaTeX face loads; refused requests: ${refused.join(', ') || '(none)'}`);
        assert.deepEqual(refused, [], 'the page asked for nothing outside its own directory');
      } finally {
        fs.rmSync(moved, { recursive: true, force: true });
      }
    });
  }

  test('a deck without math carries no KaTeX stylesheet at all', { timeout: TIMEOUT }, () => {
    fs.writeFileSync(path.join(dir, 'plain.md'), '---\ntheme: indaco\n---\n\n# No math here\n');
    const out = path.join(dir, 'plain.html');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), path.join(dir, 'plain.md'), out, '--quiet'], { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(r.status, 0, r.stderr);
    const html = fs.readFileSync(out, 'utf8');
    // (The engine sheet's KaTeX LAYOUT rules name the families, so the test is for a FACE.)
    assert.doesNotMatch(html, /katex\.min\.css|id="lattice-katex"|@font-face\s*\{[^}]*KaTeX_/);
  });
});
