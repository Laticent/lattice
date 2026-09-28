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
  assert.match(p, /img-src 'self' data: blob: https:\/\/a\.com https:\/\/\*\.a\.com http:\/\/b\.com:8080 http:\/\/\*\.b\.com:8080;/);
  assert.match(p, /media-src 'self' data: blob: https:\/\/a\.com https:\/\/\*\.a\.com http:\/\/b\.com:8080 http:\/\/\*\.b\.com:8080;/);
  assert.doesNotMatch(p, /script-src|unsafe-inline|javascript|x\.com|y\.com/);
  assert.match(p, /font-src 'self' data:;/, 'fonts and connections stay closed: the choice is about pictures');
  assert.match(p, /connect-src 'self';/);
});

// An allowed image host that answers from a CDN SUBDOMAIN (picsum.photos 302s to
// fastly.picsum.photos) was refused on the redirect hop, since CSP checks every hop: the reader
// tapped "Load" and got an empty panel. Each allowed origin now brings its own subdomains — and
// nothing wider, because a registrable-domain rule would need the public-suffix list.
test('an allowed origin covers its own subdomains, so a CDN redirect is not refused', async () => {
  const { subresourceCspPolicy } = await import('../../../lib/core/subresource-csp.mjs');
  const img = (o) => subresourceCspPolicy({ webOrigins: o }).split(';')[0];
  assert.equal(img(['https://picsum.photos']), "img-src 'self' data: blob: https://picsum.photos https://*.picsum.photos");
  // no sibling and no parent: source.unsplash.com does not admit images.unsplash.com
  assert.doesNotMatch(img(['https://source.unsplash.com']), /images\.unsplash|\*\.unsplash\.com/);
  // an IP literal or a single-label host has no subdomains to add
  assert.equal(img(['http://127.0.0.1:3000', 'http://localhost:5173', 'https://[::1]']), "img-src 'self' data: blob: http://127.0.0.1:3000 http://localhost:5173 https://[::1]");
  // the port travels with the wildcard
  assert.match(img(['http://b.com:8080']), / http:\/\/\*\.b\.com:8080$/);
  // Only what the allowed server REDIRECTS to widens. A subdomain written into the deck itself
  // is its own origin, and the markup layer still placeholders it until the reader allows it.
  const out = blockWebImages('<img src="https://fastly.picsum.photos/a.png"><img src="https://picsum.photos/b.png">', ['https://picsum.photos']);
  assert.deepEqual(out.blocked.map((b) => b.url), ['https://fastly.picsum.photos/a.png']);
});

// The markup rewrite cannot reach three spellings (an escaped url(), an image-set() string, a
// Mermaid img:), which only the policy refuses. A wildcard would let those load from a subdomain
// of an allowed site while the strip still counted them as blocked, so a host whose subdomain the
// render refused keeps its exact origin only. Found by the checker on #2412.
test('a subdomain reference the rewrite cannot reach takes that host\'s wildcard away', async () => {
  const { subresourceCspPolicy, webPolicySig } = await import('../../../lib/core/subresource-csp.mjs');
  const allowed = ['https://picsum.photos'];
  for (const html of [
    '<div style="background-image:image-set(&quot;https://beacon.picsum.photos/x.png&quot; 1x)"></div>',
    '<div style="background-image:u\\72l(https://t.picsum.photos/y.png)"></div>',
  ]) {
    const { blocked } = blockWebImages(html, allowed);
    assert.ok(blocked.some((b) => b.origin.endsWith('.picsum.photos')), `precondition: the scan counts it: ${html}`);
    const img = subresourceCspPolicy({ webOrigins: allowed, blocked }).split(';')[0];
    assert.equal(img, "img-src 'self' data: blob: https://picsum.photos", html);
    assert.notEqual(webPolicySig(allowed, blocked), webPolicySig(allowed, []), 'a patch host sees the change');
  }
  // CSP lets an http: source match https:, so the guard compares HOSTS, never schemes
  assert.equal(subresourceCspPolicy({ webOrigins: ['http://a.com'], blocked: [{ origin: 'https://beacon.a.com' }] }).split(';')[0], "img-src 'self' data: blob: http://a.com");
  // a theme or author stylesheet is scanned too, in every spelling the scanner reads
  const { webRefsInCss } = require('../../../lib/core/remote-ref.js');
  const sheetRefs = webRefsInCss('.x{background:image-set("https://beacon.picsum.photos/a.png" 1x)}', '.y{background:u\\72l(https://t.picsum.photos/b.png)}');
  assert.deepEqual(sheetRefs.map((r) => r.origin), ['https://beacon.picsum.photos', 'https://t.picsum.photos']);
  assert.equal(subresourceCspPolicy({ webOrigins: allowed, blocked: sheetRefs }).split(';')[0], "img-src 'self' data: blob: https://picsum.photos");
  // an unrelated refused origin leaves the wildcard alone
  const other = blockWebImages('<div style="background-image:image-set(&quot;https://evil.example/x.png&quot; 1x)"></div>', allowed);
  assert.match(subresourceCspPolicy({ webOrigins: allowed, blocked: other.blocked }), /https:\/\/\*\.picsum\.photos/);
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
  assert.match(subresourceCspPolicy({ webOrigins: ['https://my_host.example'] }), /img-src 'self' data: blob: https:\/\/my_host\.example https:\/\/\*\.my_host\.example;/);
});
