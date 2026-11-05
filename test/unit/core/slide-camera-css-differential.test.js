/**
 * THE PICTURE CAMERA'S CSS READER (security spine; followups.d/3024): lib/core/slide-camera.mjs reads every `url(…)` it
 * absolutizes, inlines or swaps with `cssRefSpans`, the renderer's reader, and no longer with its own regexes (frozen in
 * tools/segno-legacy/slide-camera-css.mjs).
 *
 * Over the 193 shipped stylesheets the two agree on every address the camera fetches, and the absolutized sheet differs
 * only inside comments, where the old regex rewrote a `url(…)` written as prose. The fixes are pinned below, each with the
 * legacy reader as the failing arm. The browser oracle (an escaped `u\72l(` and an escaped address drawn by Chromium) is
 * test/integration/export/slide-camera.test.js.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const REMOTE = /^(?:file|blob|https?):/i;
const BASE = 'https://site.test/deck/';
const shipped = () => execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !f.startsWith('dist/')).map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('slide camera: the shared CSS reader against the regexes it replaced', async () => {
  const camera = await import('../../../lib/core/slide-camera.mjs');
  const legacy = await import('../../../tools/segno-legacy/slide-camera-css.mjs');
  const remoteNew = (css) => camera.cssUrlSpans(css).map((s) => s.value).filter((v) => REMOTE.test(v));
  const corpus = shipped();

  test('the corpus is the shipped stylesheets', () => {
    assert.ok(corpus.length >= 150, `found ${corpus.length} stylesheets`);
  });

  test('every shipped sheet: the same addresses noted, and the same absolutized CSS outside comments', () => {
    let changedInComments = 0;
    for (const [name, css] of corpus) {
      assert.deepEqual(new Set(remoteNew(css)), new Set(legacy.remoteCssUrls(css)), name);
      const was = legacy.absolutizeCssUrls(css, BASE);
      const is = camera.absolutizeCssUrls(css, BASE);
      if (was !== is) changedInComments++;
      assert.equal(noComments(is), noComments(was), name);
    }
    // The old regex rewrote five `url(…)`s written as prose in a comment; the reader leaves a comment as written.
    assert.ok(changedInComments <= 10, `${changedInComments} sheets changed only inside comments`);
  });

  test('a computed background layer reads the same address', () => {
    for (const layer of ['url("https://x.test/a.png")', 'url("file:///tmp/a%20b.png")', 'url("data:image/png;base64,AAAA")', 'linear-gradient(red, blue)', 'none']) {
      assert.equal(camera.layerUrl(layer), legacy.layerUrl(layer), layer);
    }
    // A quote inside the address: Chromium serializes it escaped, and the reader decodes it, so the drawn-size pass finds the
    // picture's data under its real address. The old pattern returned the escaped text, which no data key matched.
    assert.equal(camera.layerUrl('url("https://x.test/a\\"b.png")'), 'https://x.test/a"b.png');
    assert.equal(legacy.layerUrl('url("https://x.test/a\\"b.png")'), 'https://x.test/a\\"b.png', 'the failing arm');
  });

  test('an escaped `u\\72l(` is a url, as the browser reads it (the legacy reader missed it)', () => {
    const css = '.a{background:u\\72l(https://x.test/a.png)}';
    assert.deepEqual(remoteNew(css), ['https://x.test/a.png']);
    assert.deepEqual(legacy.remoteCssUrls(css), [], 'the failing arm: the old regex sees nothing');
    assert.equal(camera.absolutizeCssUrls('.a{background:u\\72l(a.png)}', BASE), '.a{background:url("https://site.test/deck/a.png")}');
    assert.equal(legacy.absolutizeCssUrls('.a{background:u\\72l(a.png)}', BASE), '.a{background:u\\72l(a.png)}', 'the failing arm');
  });

  test('a url( inside a comment or a string is not one', () => {
    assert.deepEqual(remoteNew('/* url(https://x.test/a.png) */ .a{content:"url(https://x.test/b.png)"}'), []);
    assert.deepEqual(legacy.remoteCssUrls('/* url(https://x.test/a.png) */'), ['https://x.test/a.png'], 'the old regex read the comment');
  });

  test('a font face split by unicode-range: its sources are read as the browser reads them', () => {
    const css = '@font-face{font-family:E;src:u\\72l(https://x.test/e.woff2) /* url(https://x.test/c.woff2) */;unicode-range:U+1F300-1F5FF}';
    assert.deepEqual([...camera.unusedRangeFaceUrls(css, 'plain text')], ['https://x.test/e.woff2']);
    assert.deepEqual([...camera.unusedRangeFaceUrls(css, '\u{1F389}')], [], 'a character in range keeps the face');
    // The failing arm: the old pattern skipped the escaped source and read the one in the comment.
    assert.deepEqual(legacy.remoteCssUrls(css), ['https://x.test/c.woff2']);
  });

  test('a bad url token is never fetched by the browser, so it is not noted', () => {
    assert.deepEqual(remoteNew('.a{background:url(https://x.test/a b.png)}'), []);
  });

  test('a fragment, a scheme and `data:` are left as written by the absolutizer', () => {
    const css = '.a{fill:url(#p1);mask:url(data:image/svg+xml,x);b:url(https://x.test/a.png)}';
    assert.equal(camera.absolutizeCssUrls(css, BASE), css);
  });

  test('an address spelled with an escape is swapped by its span; a plain one by its text, as before', () => {
    const data = new Map([['https://x.test/a.png', 'data:image/png;base64,QQ==']]);
    const plain = '.a{background:url("https://x.test/a.png")}';
    const escaped = '.a{background:url(https\\3a //x.test/a.png)}';
    assert.equal(camera.urlSwap(data)(plain), '.a{background:url("data:image/png;base64,QQ==")}');
    assert.equal(camera.urlSwap(data, true)(plain), '.a{background:url("data:image/png;base64,QQ==")}', 'the span pass leaves a swapped url alone');
    assert.equal(camera.urlSwap(data, true)(escaped), '.a{background:url("data:image/png;base64,QQ==")}');
    assert.equal(camera.urlSwap(data)(escaped), escaped, 'without the flag, the literal pass cannot find it');
    // An escaped address that holds a shorter address's text gets its own picture, not the shorter one's spliced inside it.
    const two = new Map([['https://x.test/a.png', 'data:A'], ['https://x.test/a.png?v=1', 'data:B']]);
    assert.equal(camera.urlSwap(two, true)('.a{background:url(https://x.test/a.png?v\\3d 1)}'), '.a{background:url("data:B")}');
    // The span pass writes a quoted url; a quote or backslash in the data is percent-encoded so the string stays closed.
    const odd = new Map([['https://x.test/a.png', 'data:text/plain,"\\']]);
    assert.equal(camera.urlSwap(odd, true)(escaped), '.a{background:url("data:text/plain,%22%5C")}');
  });
});
