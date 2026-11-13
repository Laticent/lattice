/**
 * Integration: an `@video{…}` record in an Export-to-Marp bundle, through the real tool.
 *
 * Marp runs none of Lattice's markdown-it rules, so the bundle rewrites a record that is its own paragraph into a plain Markdown link
 * (lib/plugins/video/shared/video-marp-export.js). This drives the real artifact: tools/export-marp.js, `marp` from the registry with the
 * bundle's own config, then the page in Chromium. It holds three things a unit test on the string cannot: Marp reads the link as the
 * rewrite intends, a hostile address or title adds no second link and no markup, and a record the engine leaves as code stays code.
 *
 * Local runs skip when the pinned marp-cli is not installed (test/helpers/marp-cli.js); CI fails instead (marp-kit-render.test.js explains why).
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { skipUnlessCI } = require('../../helpers/chrome');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { marpCli } = require('../../helpers/marp-cli');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXPORT_CLI = path.join(ROOT, 'tools', 'export-marp.js');
const OUT = path.join(ROOT, '.scratch', 'marp-video-link');
const TIMEOUT = 300000;

const DECK = `---
marp: true
theme: indaco
---

<!-- _class: video -->

## The clip

\`@video{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", title="The <b>tour</b> *now*"}\`

---

<!-- _class: video -->

## Hostile addresses

\`@video{"https://www.tiktok.com/@u/video/1234567?x=)[Open](https://evil.example/"}\`

\`@video{"https://evil.example&sol;.instagram.com/p/X/"}\`

---

<!-- _class: content -->

## In running text

A sentence with \`@video{"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}\` in the middle.

---

## Alone in a list item

- \`@video{"https://vimeo.com/76979871", title="Listed"}\`
`;

// The pinned, locked marp-cli (test/helpers/marp-cli.js): no registry fetch inside a test.
const MARP = marpCli();

function marp(args, cwd, timeout = TIMEOUT) {
  const env = { ...process.env, CHROME_NO_SANDBOX: '1' };
  if (!env.CHROME_PATH) {
    try { env.CHROME_PATH = require('puppeteer').executablePath(); } catch { /* marp-cli finds its own */ }
  }
  if (!MARP.ok) return { status: null, stdout: '', stderr: MARP.reason };
  return MARP.run([...args], { cwd, encoding: 'utf8', env, timeout });
}

describe('an @video record in an Export-to-Marp bundle — real marp-cli, real Chromium', () => {
  let skip = null;
  let browser;
  let page;
  let md = '';

  before(async () => {
    const probe = marp(['--version'], ROOT, 90000);
    if (probe.status !== 0) {
      const reason = `no marp-cli to run (exit ${probe.status}): ${String(probe.stderr || '').slice(0, 300)}`;
      if (process.env.CI) throw new Error(`[marp-video-link] ${reason}`);
      skip = reason;
      return;
    }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'video.md'), DECK);
    const r = spawnSync(process.execPath, [EXPORT_CLI, path.join(OUT, 'video.md'), path.join(OUT, 'out'), '--no-agent'], { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(r.status, 0, `export-marp failed:\n${r.stdout}\n${r.stderr}`);
    const bundle = path.join(OUT, 'out', 'video');
    md = fs.readFileSync(path.join(bundle, 'video.md'), 'utf8');
    const m = marp(['video.md', '--config-file', 'marp.config.cjs', '--allow-local-files', '-o', 'out.html'], bundle);
    assert.equal(m.status, 0, `marp failed:\n${m.stdout}\n${m.stderr}`);
    browser = await require('puppeteer').launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => (req.url().startsWith('file:') ? req.continue() : req.abort()));
    await page.goto(require('node:url').pathToFileURL(path.join(bundle, 'out.html')).href, { waitUntil: 'networkidle0' });
    // A signal, not a duration (HARD RULE #32): the runtime marks the root once its first pass has run.
    await page.waitForFunction(() => document.documentElement.dataset.latticeRuntime === 'loaded', { timeout: 60000 });
  });
  after(async () => { if (browser) await browser.close(); });

  test('the record became a link to the watch page, and its title is text', async (t) => {
    const why = skipUnlessCI(Boolean(skip), skip);
    if (why) return t.skip(why);
    const links = await page.$$eval('a[href*="youtube.com/watch"]', (as) => as.map((a) => ({ href: a.getAttribute('href'), text: a.textContent, kids: a.children.length })));
    assert.equal(links.length, 1, JSON.stringify(links));
    assert.equal(links[0].href, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(links[0].text, 'The <b>tour</b> *now*', 'the title is literal text');
    assert.equal(links[0].kids, 0, 'and made no element');
  });

  test('a hostile address adds no second link and moves no link to another host', async (t) => {
    const why = skipUnlessCI(Boolean(skip), skip);
    if (why) return t.skip(why);
    // The PARSED host decides where a click goes, not the text of the href: the engine keeps `evil.example&sol;.instagram.com` as one
    // (unresolvable) Instagram-suffixed host, and so must the bundle.
    const hosts = await page.$$eval('a[href^="http"]', (as) => as.map((a) => new URL(a.getAttribute('href')).hostname));
    assert.deepEqual(hosts.filter((h) => h === 'evil.example' || h.endsWith('.evil.example')), []);
    for (const h of hosts) assert.match(h, /(^|\.)(youtube\.com|tiktok\.com|instagram\.com|vimeo\.com)$/, h);
    assert.equal(await page.$$eval('a', (as) => as.filter((a) => a.textContent === 'Open').length), 0, 'the injected "[Open](…)" link does not exist');
  });

  test('a record the export left as code (alone in a list item) draws the poster: the config hands it to the runtime from the Markdown', async (t) => {
    const why = skipUnlessCI(Boolean(skip), skip);
    if (why) return t.skip(why);
    assert.ok(md.includes('- `@video{"https://vimeo.com/76979871"'), 'the export left the list-item record as written');
    await page.waitForFunction(() => !!document.querySelector('li > figure[data-lattice-media="video"]'), { timeout: 60000 });
    assert.equal(await page.$eval('li > figure[data-lattice-media="video"] a.video-poster', (a) => a.getAttribute('href')), 'https://vimeo.com/76979871');
  });

  test('a record in running text stays code, as the engine prints it', async (t) => {
    const why = skipUnlessCI(Boolean(skip), skip);
    if (why) return t.skip(why);
    assert.ok(md.includes('A sentence with `@video{'), 'the bundle source keeps the span');
    assert.equal(await page.$$eval('code', (cs) => cs.filter((c) => c.textContent.startsWith('@video{')).length), 1);
  });
});
