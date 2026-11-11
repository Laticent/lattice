/**
 * Integration: an `@video{…}` record in a deck written by hand in the copy-and-go Marp kit (dist/marp-kit), rendered by REAL
 * marp-cli with the kit's own config and opened in real Chromium.
 *
 * WHAT IT PROVES. The kit's `engine` reads the records from markdown-it's tokens (lib/plugins/video/shared/video-marp-engine.js)
 * and the runtime draws them with the video plugin's own kernels (video-marp-dom.js): the poster figure and, on a `video` slide,
 * the layout's card, the same output the engine gives. And it proves the address rule (spec/LPM.md §10) holds on this route: the
 * runtime draws a span only when its exact text is a record the MARKDOWN holds, so
 *   · a span inside `[data-lattice-plugin]` is never drawn, even when the same record is in the Markdown and still owed (slide 4
 *     holds it, and slide 3's plugin span comes first in the page, so only the plugin guard keeps it from taking that draw);
 *   · a span the page carries but the Markdown never wrote as a record (raw HTML here, a plugin's output in the Studio) stays code;
 *   · a hostile address yields no link to its host, and the page asks the network for nothing.
 * The VS Code preview's channel (the saved deck file) is the same drawing code fed by `drawnRecords`; its unit tests pin it, and it
 * was driven in the real editor for the PR that added it (the preview is not something this tier boots: marp-kit-render.test.js
 * says why).
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { marpCli } = require('../../helpers/marp-cli');

const ROOT = path.join(__dirname, '..', '..', '..');
const KIT = path.join(ROOT, 'dist', 'marp-kit');
const OUT = path.join(ROOT, '.scratch', 'marp-kit-video');
const TIMEOUT = 300000;
const RUNTIME_TAGS = '<!-- markdownlint-disable MD033 -->\n<script src="mermaid-v11-min.js"></script>\n<script src="lattice-dagre-min.js"></script>\n<script src="lattice-runtime-min.js"></script>\n';

const DECK = `---
marp: true
theme: cuoio
footer: Acme confidential
---

<!-- _class: video -->

## The clip

The tour every new customer sees.

\`@video{"https://youtu.be/dQw4w9WgXcQ", title="The <b>tour</b>"}\`

---

<!-- _class: video -->

## Hostile addresses

\`@video{"https://www.tiktok.com/@u/video/1234567?x=)[Open](https://evil.example/"}\`

\`@video{"https://evil.example/x"}\`

---

## Where a record stays code

A sentence with \`@video{"https://youtu.be/dQw4w9WgXcQ"}\` in the middle.

<div data-lattice-plugin="probe"><p><code>@video{"https://vimeo.com/76979871", title="In a list"}</code></p></div>

<p><code>@video{"https://youtu.be/bbbbbbbbbbb"}</code></p>

\`\`\`
\`@video{"https://youtu.be/dQw4w9WgXcQ"}\`
\`\`\`

---

## A record alone in a list item

- \`@video{"https://vimeo.com/76979871", title="In a list"}\`

---

<!-- _class: video -->

## The last slide is a video

\`@video{"https://youtu.be/dQw4w9WgXcQ", title="Last"}\`

${RUNTIME_TAGS}`;

const MARP = marpCli();

function marp(args, cwd) {
  const env = { ...process.env, CHROME_NO_SANDBOX: '1' };
  if (!env.CHROME_PATH) {
    try { env.CHROME_PATH = require('puppeteer').executablePath(); } catch { /* marp-cli finds its own */ }
  }
  if (!MARP.ok) return { status: null, stdout: '', stderr: MARP.reason };
  return MARP.run([...args], { cwd, encoding: 'utf8', env, timeout: TIMEOUT });
}

describe('an @video record in a hand-written Marp kit deck — real marp-cli, real Chromium', () => {
  let skip = null;
  let browser;
  let page;
  let html = '';
  const offsite = [];

  before(async () => {
    if (!MARP.ok) { skip = MARP.reason; return; }
    if (!fs.existsSync(path.join(KIT, 'marp.config.cjs'))) { skip = 'dist/marp-kit is not built (npm run build)'; return; }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.cpSync(KIT, OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'video.md'), DECK);
    const m = marp(['video.md', '--config-file', 'marp.config.cjs', '--allow-local-files', '--html', '-o', 'out.html'], OUT);
    assert.equal(m.status, 0, `marp failed:\n${m.stdout}\n${m.stderr}`);
    html = fs.readFileSync(path.join(OUT, 'out.html'), 'utf8');
    browser = await require('puppeteer').launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().startsWith('file:') || req.url().startsWith('data:')) return req.continue();
      offsite.push(req.url());
      return req.abort();
    });
    await page.goto(require('node:url').pathToFileURL(path.join(OUT, 'out.html')).href, { waitUntil: 'networkidle0' });
    // A signal, not a duration (HARD RULE #32): the runtime marks the root once it has run its first pass.
    await page.waitForFunction(() => document.documentElement.dataset.latticeRuntime === 'loaded', { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('figure[data-lattice-media="video"]').length >= 2, { timeout: 60000 });
  });
  after(async () => { if (browser) await browser.close(); });

  test('the engine handed the records over in one inert block, read from the Markdown', (t) => {
    if (skip) return t.skip(skip);
    const blocks = html.match(/<script type="application\/lattice-video-records">[^<]*<\/script>/g) || [];
    assert.equal(blocks.length, 1, 'one block');
    // The block's text, by position: it is the engine's own fixed block, so no tag pattern is needed to find its body.
    const records = JSON.parse(blocks[0].slice(blocks[0].indexOf('>') + 1, blocks[0].lastIndexOf('</script>')));
    // Every record SPAN the Markdown holds, in order (the page decides which draws): the raw-HTML spans are not Markdown spans.
    assert.equal(records.length, 6, JSON.stringify(records)); // a fenced block holds no span
    assert.ok(records[0].includes('dQw4w9WgXcQ'));
    assert.ok(!records.some((r) => r.includes('bbbbbbbbbbb')), 'a span written as raw HTML is not a record');
    assert.ok(html.indexOf('application/lattice-video-records') > html.lastIndexOf('</section>'), 'the block sits after every slide');
  });

  test('a record on a video slide draws the poster figure inside the layout card, linked to the watch page', async (t) => {
    if (skip) return t.skip(skip);
    const s1 = await page.$eval('section[id="1"]', (s) => ({
      card: !!s.querySelector('.video-card > .video-head h2'),
      figure: s.querySelector('.video-card figure.video-embed[data-lattice-media="video"]')?.dataset.provider,
      href: s.querySelector('figure a.video-poster')?.getAttribute('href'),
      caption: s.querySelector('figcaption')?.textContent,
      // The title's markup stays text: no element the author's `<b>` would have made.
      captionBold: s.querySelectorAll('figcaption b').length,
      code: [...s.querySelectorAll('code')].map((c) => c.textContent),
    }));
    assert.deepEqual(s1, {
      card: true,
      figure: 'youtube',
      href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      caption: 'The <b>tour</b>',
      captionBold: 0,
      code: [],
    });
  });

  test('a hostile address draws no link to its host', async (t) => {
    if (skip) return t.skip(skip);
    const hosts = await page.$$eval('a[href^="http"]', (as) => as.map((a) => new URL(a.getAttribute('href')).hostname));
    assert.deepEqual(hosts.filter((h) => h === 'evil.example' || h.endsWith('.evil.example')), []);
    for (const h of hosts) assert.match(h, /(^|\.)(youtube\.com|tiktok\.com|vimeo\.com)$/, h);
    assert.equal(await page.$$eval('a', (as) => as.filter((a) => a.textContent === 'Open').length), 0, 'the injected "[Open](…)" link does not exist');
    assert.deepEqual(await page.$eval('section[id="2"]', (s) => [...s.querySelectorAll('code')].map((c) => c.textContent)), ['@video{"https://evil.example/x"}'], 'the unknown host stays code');
  });

  test('a span the Markdown did not write as a record, or one inside a plugin subtree, stays code', async (t) => {
    if (skip) return t.skip(skip);
    const s3 = await page.$eval('section[id="3"]', (s) => ({
      figures: s.querySelectorAll('figure').length,
      inPlugin: s.querySelector('[data-lattice-plugin] code')?.textContent.startsWith('@video{'),
      rawHtml: [...s.querySelectorAll('p > code')].some((c) => c.textContent.includes('bbbbbbbbbbb')),
      runningText: [...s.querySelectorAll('p code')].some((c) => c.closest('p').textContent.startsWith('A sentence with')),
      fenced: !!s.querySelector('pre code'),
    }));
    assert.deepEqual(s3, { figures: 0, inPlugin: true, rawHtml: true, runningText: true, fenced: true });
  });

  test('a record alone in a list item draws in the item, as the engine nests it', async (t) => {
    if (skip) return t.skip(skip);
    assert.equal(await page.$eval('section[id="4"]', (s) => s.querySelector('li > figure[data-lattice-media="video"]')?.dataset.provider), 'vimeo');
  });

  test('a video card on the LAST slide leaves the deck footer outside the card (red team, 2026-11-10)', async (t) => {
    if (skip) return t.skip(skip);
    const last = await page.$eval('section[id="5"]', (s) => ({
      card: !!s.querySelector('.video-card figure'),
      footerInCard: !!s.querySelector('.video-card footer'),
      footer: s.querySelector('footer')?.textContent.trim(),
    }));
    assert.deepEqual(last, { card: true, footerInCard: false, footer: 'Acme confidential' });
  });

  test('the page asks the network for nothing', (t) => {
    if (skip) return t.skip(skip);
    assert.deepEqual(offsite, []);
  });
});

/**
 * THE VS CODE CHANNEL, emulated: the same marp-cli page with the records block removed, the preview's <meta> in <head> and a
 * <base> naming the deck file, served over HTTP so the runtime can read the saved Markdown the way the preview lets it. This is a
 * stand-in for Marp for VS Code (the real editor was driven for the PR that added the channel, engineering/decisions/
 * 2026-10-16-media-plugins.md §9); what it pins is the ORDER: the records arrive after the first pass has laid every slide out,
 * and the card must still be built over the slide as the host wrote it, with one copy of the slide's chrome (checker, 2026-11-10).
 */
describe('the VS Code channel: records from the saved deck, after the first pass', () => {
  let skip = null;
  let browser;
  let page;
  let server;
  const offsite = [];

  before(async () => {
    if (!MARP.ok) { skip = MARP.reason; return; }
    const out = path.join(OUT, 'out.html');
    if (!fs.existsSync(out)) { skip = 'the marp-cli render above did not run'; return; }
    const http = require('node:http');
    server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
      const file = path.join(OUT, rel);
      if (!file.startsWith(OUT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200);
      res.end(fs.readFileSync(file));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const vsc = fs.readFileSync(out, 'utf8')
      .replace(/<script type="application\/lattice-video-records">[^<]*<\/script>/, '')
      .replace('<head>', `<head><base href="${origin}/video.md"><meta id="vscode-markdown-preview-data" data-settings="{}">`);
    fs.writeFileSync(path.join(OUT, 'vsc.html'), vsc);
    browser = await require('puppeteer').launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    page.on('request', (req) => { if (!req.url().startsWith(origin) && !req.url().startsWith('data:')) offsite.push(req.url()); });
    await page.goto(`${origin}/vsc.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('figure[data-lattice-media="video"]').length >= 2, { timeout: 60000 });
  });
  after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
  });

  test('the late records draw, and the card is composed once, over the slide as the host wrote it', async (t) => {
    if (skip) return t.skip(skip);
    const s1 = await page.$eval('section[id="1"]', (s) => ({
      cards: s.querySelectorAll('.video-card').length,
      stages: s.querySelectorAll('.cell-stage').length,
      rails: s.querySelectorAll('.marker-rail').length,
      title: s.querySelector('h2')?.parentElement?.className,
      figure: s.querySelector('.video-card figure[data-lattice-media="video"]')?.dataset.provider,
    }));
    assert.deepEqual(s1, { cards: 1, stages: 1, rails: 1, title: 'video-head', figure: 'youtube' });
  });

  test('it read only the deck and its own files', (t) => {
    if (skip) return t.skip(skip);
    assert.deepEqual(offsite, []);
  });
});
