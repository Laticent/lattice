/**
 * Integration: what `blockWebImages` and `blockWebCss` (lib/core/remote-ref.js) leave in a deck
 * fetches NOTHING from the web, measured in Chromium (HARD RULE #22: a remote reference is a
 * beacon; HARD RULE #23: a network log, not a claim about a string).
 *
 * A local HTTP server counts what reaches it. Every payload in test/fixtures/web-ref-beacons.js is
 * a spelling a regex scan read differently from the browser, and each fetches its own path, so a
 * hit names the spelling. Three arms:
 *
 *   control         the payload as written                                  → every one fetches
 *   blockWebImages  rewritten IN THE PAGE, with the page's own DOMParser    → 0
 *   blockWebCss     the CSS payloads rewritten, then loaded in a <style>    → 0
 *
 * The control proves the probe can see: a payload that stopped fetching unrewritten would make
 * its zero below meaningless, so the control fails first. `blockWebImages` runs inside Chromium
 * because every caller of it is a browser page, and its parser check uses that page's parser.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');
const { webRefBeacons, asHtml } = require('../../fixtures/web-ref-beacons.js');

const CHROME = resolveChrome();
const SKIP = skipWithoutChrome(CHROME);
const TIMEOUT = 180000;

describe('web references: a rewritten deck fetches nothing', { skip: SKIP, timeout: TIMEOUT }, () => {
  let server;
  let hits;
  let base;
  let browser;
  let bundle;

  test.before(async () => {
    hits = [];
    server = http.createServer((req, res) => {
      hits.push(req.url.slice(1).split('?')[0]);
      res.end('');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    const esbuild = require('esbuild');
    const built = await esbuild.build({
      entryPoints: [path.join(__dirname, '../../../lib/core/remote-ref.js')],
      bundle: true, write: false, format: 'iife', globalName: 'RemoteRef', platform: 'browser', logLevel: 'silent',
    });
    bundle = built.outputFiles[0].text;
    browser = await require('puppeteer').launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  });

  test.after(async () => {
    await browser?.close();
    await new Promise((r) => server?.close(r));
  });

  /** Load each document in its own page, wait for the network to settle, and return the hits. */
  async function fetched(docs) {
    hits.length = 0;
    await Promise.all(docs.map(async (html) => {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.close();
    }));
    return [...new Set(hits)].sort();
  }

  test('control: every payload fetches as written', async () => {
    const payloads = webRefBeacons(base);
    const got = await fetched(payloads.map(asHtml));
    assert.deepEqual(got, payloads.map((p) => p.name).sort());
  });

  test('blockWebImages, run in the page with its own parser, leaves nothing that fetches', async () => {
    const payloads = webRefBeacons(base);
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle });
    const rewritten = await page.evaluate(
      (items) => items.map(({ html, fonts }) => RemoteRef.blockWebImages(html, [], { fonts }).html),
      payloads.map((p) => ({ html: asHtml(p), fonts: p.kind === 'font' || !!p.noPolicy })),
    );
    await page.close();
    assert.deepEqual(await fetched(rewritten), []);
  });

  test('the rewrite is a fixed point: a second pass, or a re-parse of its output, refuses nothing new', async () => {
    // The parser check re-serializes markup it rewrites. If serializing could CREATE a reference
    // the rewrite did not see, the page's own parser would show it here. Measured 2026-10-25 over
    // these rows and 430 decks: none. A diagram reference is counted and left for the policy.
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle });
    const leftover = await page.evaluate((items) => items.flatMap((html) => {
      const first = RemoteRef.blockWebImages(html, [], { fonts: true });
      const doc = new DOMParser().parseFromString(`<!doctype html><body>${first.html}`, 'text/html');
      const again = [RemoteRef.blockWebImages(first.html, [], { fonts: true }), RemoteRef.blockWebImages(doc.body.innerHTML, [], { fonts: true })];
      return again.flatMap((r) => r.blocked.filter((b) => b.kind !== 'diagram').map((b) => b.url));
    }), webRefBeacons(base).map(asHtml));
    await page.close();
    assert.deepEqual(leftover, []);
  });

  test('blockWebCss leaves nothing that fetches', async () => {
    const payloads = webRefBeacons(base).filter((p) => p.kind !== 'html');
    const remoteRef = require('../../../lib/core/remote-ref.js');
    const docs = payloads.map((p) => asHtml({ ...p, text: remoteRef.blockWebCss(p.text).css }));
    assert.deepEqual(await fetched(docs), []);
  });
});
