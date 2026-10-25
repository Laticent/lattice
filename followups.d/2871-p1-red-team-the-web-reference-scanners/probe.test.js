// Per-payload probe of `blockWebImages` (lib/core/remote-ref.js) in Chromium: for each payload, does
// it fetch as written (control) and does it still fetch after the rewrite (a leak)? A copy of
// test/integration/invariants/web-ref-beacon.test.js that reports each payload instead of
// asserting the set. See README.md in this folder.
//
//   node --test followups.d/2871-p1-red-team-the-web-reference-scanners/probe.test.js
//   PAYLOADS=/abs/path/payloads.js   a module exporting { webRefBeacons(base), asHtml(p) }
//   REF=main                         probe origin/main's remote-ref.js instead of the working tree's
const { test, describe } = require('node:test');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const { resolveChrome, skipWithoutChrome } = require(path.join(ROOT, 'test/helpers/chrome.js'));
const { webRefBeacons, asHtml } = require(process.env.PAYLOADS || path.join(ROOT, 'test/fixtures/web-ref-beacons.js'));
const OUT = process.env.OUT || path.join(os.tmpdir(), 'web-ref-probe.json');
const CHROME = resolveChrome();
const SKIP = skipWithoutChrome(CHROME);

/** The entry to bundle: the working tree's remote-ref.js, or origin/main's (with its one dependency). */
function entry() {
  if (process.env.REF !== 'main') return path.join(ROOT, 'lib/core/remote-ref.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-ref-main-'));
  for (const f of ['remote-ref.js', 'media-sources.js']) {
    fs.writeFileSync(path.join(dir, f), execFileSync('git', ['show', `origin/main:lib/core/${f}`], { cwd: ROOT }));
  }
  return path.join(dir, 'remote-ref.js');
}

describe('web-reference probe', { skip: SKIP, timeout: 600000 }, () => {
  let server;
  let base;
  let browser;
  let bundle;
  const hits = [];

  test.before(async () => {
    server = http.createServer((req, res) => {
      hits.push(req.url.slice(1).split('?')[0]);
      res.end('');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    const esbuild = require('esbuild');
    const built = await esbuild.build({ entryPoints: [entry()], bundle: true, write: false, format: 'iife', globalName: 'RemoteRef', platform: 'browser', logLevel: 'silent' });
    bundle = built.outputFiles[0].text;
    browser = await require('puppeteer').launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  });

  test.after(async () => {
    await browser?.close();
    await new Promise((r) => server?.close(r));
  });

  /** Load each document in its own page and return the names that reached the server. */
  async function fetched(docs) {
    hits.length = 0;
    await Promise.all(
      docs.map(async (html) => {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
        await page.close();
      }),
    );
    return new Set(hits.map((h) => h.split('/')[0]));
  }

  test('each payload: control, then rewritten', async () => {
    const payloads = webRefBeacons(base);
    const control = await fetched(payloads.map(asHtml));
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle });
    const rewritten = await page.evaluate(
      (items) =>
        items.map(({ html, fonts }) => {
          try {
            const t = performance.now();
            const out = RemoteRef.blockWebImages(html, [], { fonts }).html;
            return { html: out, ms: performance.now() - t };
          } catch (e) {
            return { html: '', err: String(e), ms: 0 };
          }
        }),
      payloads.map((p) => ({ html: asHtml(p), fonts: p.kind === 'font' || !!p.noPolicy })),
    );
    await page.close();
    const after = await fetched(rewritten.map((r) => r.html));
    const rows = payloads.map((p, i) => ({ name: p.name, control: control.has(p.name), leak: after.has(p.name), ms: Math.round(rewritten[i].ms), err: rewritten[i].err }));
    fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
    // A payload counts only when its control fetched: one that never fetches proves nothing.
    for (const r of rows) console.log(`${r.control ? 'fetches' : 'inert  '}  ${r.leak ? 'LEAK' : 'held'}  ${r.ms} ms  ${r.name}${r.err ? `  error: ${r.err}` : ''}`);
  });
});
