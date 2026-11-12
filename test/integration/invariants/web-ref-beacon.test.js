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
const path = require('node:path');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');
const { openListener } = require('../../helpers/request-log.js');
const { webRefBeacons, asHtml } = require('../../fixtures/web-ref-beacons.js');

const CHROME = resolveChrome();
const SKIP = skipWithoutChrome(CHROME);
const TIMEOUT = 180000;

describe('web references: a rewritten deck fetches nothing', { skip: SKIP, timeout: TIMEOUT }, () => {
  let log;
  let base;
  let browser;
  let bundle;

  // A browser that navigates to a payload asks for the site's icon too; that is not a payload. `Connection: close`
  // ends each socket once it is answered, so `drained()` can see every connection end while the browser stays open.
  const handle = (req, res, record) => {
    if (req.url !== '/favicon.ico') record(req.url.slice(1).split('?')[0]);
    res.setHeader('Connection', 'close');
    res.end('');
  };

  test.before(async () => {
    log = await openListener({ handle });
    base = log.H;
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
    await log?.close();
  });

  /** The payloads Chromium fetches when unrewritten: a row only another engine fetches (`onlyIn`) is not expected. */
  const fireable = (origin) => webRefBeacons(origin).filter((p) => !p.onlyIn);

  /** Open each document in its own page as a frame (`srcdoc`), the way a preview frame loads it, and return the pages. */
  async function open(docs) {
    return Promise.all(docs.map(async (html) => {
      const page = await browser.newPage();
      // The browser's preload scanner reads a document ahead of its parser, and `setContent` (document.write) does not use it.
      // `load`, not `networkidle0`: the host has no subresources, and `networkidle0` is a 500 ms quiet period, a duration
      // that timed out at 30 s with sixty pages opening at once on a loaded runner.
      await page.setContent('<!doctype html><div id="root"></div>', { waitUntil: 'load' });
      await page.evaluate((doc) => new Promise((resolve) => {
        const f = document.createElement('iframe');
        f.onload = () => resolve();
        f.srcdoc = doc;
        document.getElementById('root').appendChild(f);
      }), html);
      return page;
    }));
  }

  /**
   * Load `docs` and return what reached the listener, waiting on signals, never a quiet period (HARD RULE #32;
   * test/helpers/request-log.js). `expect` names the hits a control arm must see: the wait ends once every one has
   * landed. An absence arm (`expect` empty) runs a WITNESS instead: the unrewritten payloads, against a second
   * listener, opened only after the rewritten pages have loaded. Once the witness has heard every fireable payload,
   * any fetch the rewritten pages were going to make has had at least that long to land. Then every page closes and
   * the log is drained, so a request already on the wire is counted.
   */
  async function fetched(docs, expect = []) {
    log.reset();
    const pages = await open(docs);
    if (expect.length) {
      const heard = await log.until((h) => expect.every((n) => h.includes(n)));
      assert.ok(heard, `the control never heard ${expect.filter((n) => !log.hits.includes(n)).join(' ')}`);
    } else {
      const witness = await openListener({ handle });
      try {
        const want = fireable(witness.H);
        pages.push(...(await open(want.map(asHtml))));
        const heard = await witness.until((h) => want.every((p) => h.includes(p.name)));
        assert.ok(heard, `the unrewritten witness never heard ${want.filter((p) => !witness.hits.includes(p.name)).map((p) => p.name).join(' ')}, so a zero proves nothing`);
      } finally {
        await Promise.all(pages.map((p) => p.close()));
        await witness.close();
      }
    }
    await Promise.all(pages.map((p) => (p.isClosed() ? null : p.close())));
    await log.drained();
    return [...new Set(log.hits)].sort();
  }

  test('control: every payload fetches as written', async () => {
    // a row only another engine fetches (`onlyIn`) cannot be expected of this one
    const payloads = fireable(base);
    const got = await fetched(payloads.map(asHtml), payloads.map((p) => p.name));
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
