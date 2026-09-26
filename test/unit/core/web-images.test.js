/**
 * A deck's web images stay blocked until the reader chooses to load them (portable-packages trio
 * follow-up 11, owner 2026-09-25). `blockWebImages` (lib/core/remote-ref.js) gives the refusal a
 * face on every surface: each blocked image becomes a drawn placeholder that keeps its address,
 * and everything the content-security policy refuses is counted, so a host can say "this deck
 * loads N images from these sites". `subresourceCspPolicy` lets the chosen origins back in.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { blockWebCss, blockWebImages, webOrigin, webOrigins, WEB_IMAGE_PLACEHOLDER } = require('../../../lib/core/remote-ref.js');

const PH = WEB_IMAGE_PLACEHOLDER;

test('webOrigin: the web origin, or null for anything that is not the web', () => {
  assert.equal(webOrigin('https://Img.Example.com/a.png'), 'https://img.example.com');
  assert.equal(webOrigin('http://x.com:8080/a'), 'http://x.com:8080');
  assert.equal(webOrigin('//cdn.example.com/a.png'), 'https://cdn.example.com');
  assert.equal(webOrigin(' \thttps://x.com/a'), 'https://x.com');
  for (const local of ['a.png', './a.png', '/a.png', 'file:///tmp/a.png', 'data:image/png;base64,AA', 'blob:https://x.com/1', '', null]) {
    assert.equal(webOrigin(local), null, String(local));
  }
});

test('an <img> from the web becomes the placeholder and keeps its address; local ones are untouched', () => {
  const { html, blocked } = blockWebImages('<img src="https://a.com/x.png" alt="x"><img src="local.png"><img src="file:///d/y.png"><img src="data:image/png;base64,AA">');
  assert.equal(html, `<img src="${PH}" alt="x" data-lattice-web-src="https://a.com/x.png"><img src="local.png"><img src="file:///d/y.png"><img src="data:image/png;base64,AA">`);
  assert.deepEqual(blocked, [{ url: 'https://a.com/x.png', origin: 'https://a.com', kind: 'image' }]);
});

test('srcset, video, audio, source and SVG <image> are blocked too', () => {
  const { html, blocked } = blockWebImages(
    '<img srcset="https://b.com/1.png 1x, https://b.com/2.png 2x" src="data:image/png;base64,AA">' +
      '<video src="https://d.com/v.mp4" poster="https://d.com/p.png" controls></video>' +
      '<audio src="https://e.com/a.mp3"></audio>' +
      '<video><source src="https://f.com/v.webm"></video>' +
      '<svg><image href="https://g.com/i.png"/></svg>',
  );
  assert.doesNotMatch(html, /\s(?:src|srcset|poster|href)="https?:/);
  assert.equal(webOrigins(blocked).join(' '), 'https://b.com https://d.com https://e.com https://f.com https://g.com');
  assert.match(html, new RegExp(`<img src="${PH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" data-lattice-web-src="https://b.com/1.png">`));
  assert.match(html, /<video poster="data:image\/svg\+xml[^"]*" controls data-lattice-web-src="https:\/\/d\.com\/v\.mp4">/);
});

test('a web url() in a style attribute or a <style> block becomes the hatch; a local one stays', () => {
  const { html, blocked } = blockWebImages(
    '<div class="lattice-bg" style="background-image:url(&quot;https://c.com/bg.png?a=1&amp;b=2&quot;)"></div>' +
      '<style>.x{background:url(https://s.com/a.png) center}</style>' +
      '<div style="background:url(local.png)"></div>',
  );
  assert.doesNotMatch(html, /c\.com|s\.com/);
  assert.match(html, /style="background-image:repeating-linear-gradient\(135deg, color-mix\(in srgb, var\(--text-muted\)/);
  assert.match(html, /url\(local\.png\)/);
  assert.deepEqual(blocked.map((b) => [b.url, b.kind]), [['https://c.com/bg.png?a=1&b=2', 'css'], ['https://s.com/a.png', 'css']]);
});

test('a code sample that merely SHOWS markup is the author’s text and is left alone', () => {
  const sample = "<p><code>&lt;div style='background:url(https://x.com/a.png)'&gt;</code> and <code>&lt;img src=&quot;https://x.com/b.png&quot;&gt;</code></p>";
  const { html, blocked } = blockWebImages(sample);
  assert.equal(html, sample);
  assert.deepEqual(blocked, []);
});

test('a Mermaid image is counted (the policy refuses it; no rewrite can reach it)', () => {
  const { blocked } = blockWebImages('<pre><code class="language-mermaid">flowchart LR\n  A@{ img: &quot;https://m.com/i.png&quot; }</code></pre>');
  assert.deepEqual(blocked.map((b) => [b.origin, b.kind]), [['https://m.com', 'diagram']]);
});

test('an allowed origin loads; the others stay blocked', () => {
  const src = '<img src="https://a.com/1.png"><img src="https://b.com/2.png"><div style="background:url(https://a.com/bg.png)"></div>';
  const { html, blocked } = blockWebImages(src, ['https://a.com']);
  assert.match(html, /<img src="https:\/\/a\.com\/1\.png">/);
  assert.match(html, /url\(https:\/\/a\.com\/bg\.png\)/);
  assert.deepEqual(webOrigins(blocked), ['https://b.com']);
  assert.equal(blockWebImages(src, ['https://a.com', 'https://b.com']).html, src);
});

test('the rewrite is idempotent, so two surfaces may both apply it', () => {
  const once = blockWebImages('<img src="https://a.com/x.png"><div style="background:url(https://c.com/b.png)"></div>').html;
  const twice = blockWebImages(once);
  assert.equal(twice.html, once);
  assert.deepEqual(twice.blocked, []);
});

test('an address with a quote or an angle bracket cannot break out of the data attribute', () => {
  const { html } = blockWebImages("<img src='https://a.com/x.png?q=\"><script>'>");
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /data-lattice-web-src="https:\/\/a\.com\/x\.png\?q=&quot;&gt;&lt;script&gt;"/);
});

test('the policy lets exactly the chosen origins back in, and nothing shaped otherwise', async () => {
  const { subresourceCspPolicy } = await import('../../../lib/core/subresource-csp.mjs');
  const base = subresourceCspPolicy();
  assert.match(base, /img-src 'self' data: blob:;/);
  const p = subresourceCspPolicy({ webOrigins: ['https://a.com', 'http://b.com:8080', 'https://x.com; script-src *', "https://y.com 'unsafe-inline'", 'javascript:alert(1)', 'https://a.com'] });
  assert.match(p, /img-src 'self' data: blob: https:\/\/a\.com http:\/\/b\.com:8080;/);
  assert.match(p, /media-src 'self' data: blob: https:\/\/a\.com http:\/\/b\.com:8080;/);
  assert.doesNotMatch(p, /script-src|unsafe-inline|javascript|x\.com|y\.com/);
  assert.match(p, /font-src 'self' data:;/, 'fonts and connections stay closed: the choice is about pictures');
  assert.match(p, /connect-src 'self';/);
});

test('the spellings the HTML parser reads as a fetch are blocked too', () => {
  // `/` separates attributes; `&colon;` is a colon; an unquoted style still styles.
  for (const [html, n] of [
    ['<img/src="https://a.com/x.png">', 1],
    ['<img src="https&colon;//a.com/x.png">', 1],
    ['<div style=background:url(https://c.com/bg.png)></div>', 1],
  ]) {
    const out = blockWebImages(html);
    assert.equal(out.blocked.length, n, html);
    assert.doesNotMatch(out.html, /(?:(?<![-\w])src="|url\()https?(?::|&colon;)\/\//, html);
  }
});

test('a font is not a picture: @font-face is left to font-src and not counted', () => {
  const html = '<style>@font-face{font-family:x;src:url("https://f.com/x.woff2")}.a{background:url(https://c.com/a.png)}</style>';
  const { html: out, blocked } = blockWebImages(html);
  assert.match(out, /url\("https:\/\/f\.com\/x\.woff2"\)/);
  assert.deepEqual(webOrigins(blocked), ['https://c.com']);
});

test('blockWebCss swaps a stylesheet\'s web url()s for a page with no policy', () => {
  const { css, blocked } = blockWebCss('.a{background:url(https://c.com/a.png)} .b{background:url(local.png)}', []);
  assert.doesNotMatch(css, /c\.com/);
  assert.match(css, /url\(local\.png\)/);
  assert.equal(blocked.length, 1);
  assert.equal(blockWebCss('.a{background:url(https://c.com/a.png)}', ['https://c.com']).blocked.length, 0);
});

test('an underscore host name can be allowed', async () => {
  const { subresourceCspPolicy } = await import('../../../lib/core/subresource-csp.mjs');
  assert.equal(webOrigin('https://my_host.example/a.png'), 'https://my_host.example');
  assert.match(subresourceCspPolicy({ webOrigins: ['https://my_host.example'] }), /img-src 'self' data: blob: https:\/\/my_host\.example;/);
});
