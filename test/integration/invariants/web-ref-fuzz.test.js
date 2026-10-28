/**
 * Integration: a small seeded slice of the web-reference fuzz (test/fixtures/web-ref-fuzz.js) fetches
 * NOTHING after `blockWebImages` / `blockWebCss` (lib/core/remote-ref.js), measured in Chromium
 * against a loopback server (HARD RULE #22; HARD RULE #23: a network log, not a claim about a string).
 *
 * The published run is `node tools/fuzz-web-refs.mjs --count 100000` in Chromium, WebKit and
 * Firefox; this slice keeps the generator, the harness and the scanners agreeing on every PR. Two arms:
 *
 *   coverage  a share of the inputs must fetch AS WRITTEN. A generator that stopped producing
 *             fetching inputs would make the zero below mean nothing.
 *   held      after the rewrite, no request reaches the server, none is unattributed, nothing hangs.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');
const F = require('../../helpers/web-ref-fuzz.js');

const CHROME = resolveChrome();
const SKIP = skipWithoutChrome(CHROME);
const SEED = 20261026;
const COUNT = 600;

describe('web references: a seeded fuzz slice fetches nothing once rewritten', { skip: SKIP, timeout: 300000 }, () => {
  test(`seed ${SEED}, ${COUNT} inputs`, async () => {
    // Acquire in order and release whatever was acquired: a server left listening after a failed bundle keeps
    // node:test from ever exiting, which holds a CI shard until its timeout.
    let server;
    let browser;
    try {
      server = await F.startServer();
      const bundle = await F.bundleRemoteRef();
      browser = await require('puppeteer').launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      await F.loadPage(page, bundle, server.home);
      const r = await F.runFuzz({ page, openPage: () => browser.newPage(), bundle, home: server.home, hits: server.hits, base: server.base, seed: SEED, count: COUNT });
      // measured at this seed: about 5% of CSS inputs and 25% of HTML inputs fetch as written. Each kind has its
      // own floor, because the HTML half alone would clear a single one if every CSS input stopped fetching.
      const [css, cssRan] = r.controlByKind.css;
      const [html, htmlRan] = r.controlByKind.html;
      assert.ok(css >= cssRan * 0.03, `only ${css}/${cssRan} CSS inputs fetch as written`);
      assert.ok(html >= htmlRan * 0.15, `only ${html}/${htmlRan} HTML inputs fetch as written`);
      // any request at all after the rewrite fails, including one pinned on no input (a leak that does not
      // reproduce alone is moved to `bent`, and would otherwise pass here)
      assert.equal(r.rewrittenRequests, 0, `${r.rewrittenRequests} requests after the rewrite; leaks ${JSON.stringify(r.leaks.map((l) => l.name))}`);
      assert.deepEqual(r.leaks.map((l) => `${l.name} via ${l.via}`), []);
      assert.deepEqual(r.bent, []);
      assert.deepEqual(r.unattributed, []);
      assert.deepEqual(r.errors, []);
      assert.deepEqual(r.hung, []);
    } finally {
      await browser?.close();
      await server?.close();
    }
  });
});
