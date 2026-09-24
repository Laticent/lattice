/**
 * Unit tests for the `video` component: provider detection
 * (lib/core/video-providers.mjs), the transform kernel
 * (lib/components/imagery/video/video.transform.js), and the build-time oEmbed
 * resolver (tools/fetch-video-oembed.js) with an injected fetcher (no network).
 *
 * Contract: a `video` section's bare video-URL bullet becomes a static
 * <figure class="video-embed"> — a poster (author `poster` override, else a
 * placeholder) that LINKS to the canonical URL, a play badge, a provider label,
 * a QR to the same URL, and an optional caption. Never an iframe. The consumed
 * <li> are removed. See engineering/decisions/2026-07-02-video-component.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { detectProvider } = require('../../../lib/core/video-providers.mjs');
const video = require('../../../lib/components/imagery/video/video.transform');
const { findTopLevelH2 } = require('../../../lib/core/top-level-h2');
const { resolveOembed, videoUrlsFromDeck } = require('../../../tools/fetch-video-oembed');

const li = (inner) => `<li>${inner}</li>`;
const codeKey = (v, k) => `${v} <code>${k}</code>`;
const section = (body, cls = 'video') => `<section class="${cls}">${body}</section>`;

describe('detectProvider', () => {
  test('YouTube — watch, youtu.be, shorts all canonicalize to the same watch URL', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      const p = detectProvider(u);
      assert.equal(p.key, 'youtube');
      assert.equal(p.id, 'dQw4w9WgXcQ');
      assert.equal(p.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      assert.match(p.oembedUrl, /youtube\.com\/oembed/);
    }
  });

  test('Vimeo resolves id + oembed', () => {
    const p = detectProvider('https://vimeo.com/1084537');
    assert.equal(p.key, 'vimeo');
    assert.equal(p.id, '1084537');
    assert.match(p.oembedUrl, /vimeo\.com\/api\/oembed\.json/);
  });

  test('TikTok keeps the authored URL as the watch target', () => {
    const u = 'https://www.tiktok.com/@scout2015/video/6718335390845095173';
    const p = detectProvider(u);
    assert.equal(p.key, 'tiktok');
    assert.equal(p.url, u);
    assert.match(p.oembedUrl, /tiktok\.com\/oembed/);
  });

  test('Instagram detects but has NO public oEmbed (author a poster)', () => {
    const p = detectProvider('https://www.instagram.com/reel/CxYzAbCdEfg/');
    assert.equal(p.key, 'instagram');
    assert.equal(p.oembedUrl, null);
  });

  test('non-video URL → null; empty → null', () => {
    assert.equal(detectProvider('https://example.com/x'), null);
    assert.equal(detectProvider(''), null);
    assert.equal(detectProvider(null), null);
  });
});

describe('video transform', () => {
  test('builds a poster link + caption; consumes the list; never an iframe. QR is opt-in.', () => {
    const body =
      '<h2>Watch the tour.</h2><ul>' +
      li('<a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">yt</a>') +
      li(codeKey('Scan to watch', 'caption')) +
      li(codeKey('poster.jpg', 'poster')) +
      '</ul>';
    const out = video.applyToRenderedHtml(section(body));
    assert.match(out, /<figure class="video-embed" data-provider="youtube">/);
    assert.match(out, /class="video-poster"[^>]*href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
    assert.match(out, /background-image:url\('poster\.jpg'\)/);
    assert.match(out, /Watch on YouTube/);
    assert.match(out, /<figcaption>Scan to watch<\/figcaption>/);
    assert.doesNotMatch(out, /<ul>|<li>/); // list consumed
    assert.doesNotMatch(out, /<iframe/i); // never an embed
    // QR is an OPT-IN variant: absent without `qr`, present with it.
    assert.doesNotMatch(out, /video-qr/);
    const withQr = video.applyToRenderedHtml(section(body, 'video qr'));
    assert.match(withQr, /video-qr/);
    assert.match(withQr, /<svg/); // QR encoded only under `qr`
  });

  test('no poster → placeholder tile (still links)', () => {
    const html = section('<h2>Clip.</h2><ul>' + li('https://www.tiktok.com/@x/video/6718335390845095173') + '</ul>');
    const out = video.applyToRenderedHtml(html);
    assert.match(out, /video-poster is-placeholder/);
    assert.match(out, /Watch on TikTok/);
  });

  test('idempotent — a second pass is a no-op', () => {
    const html = section('<h2>x</h2><ul>' + li('https://youtu.be/dQw4w9WgXcQ') + '</ul>');
    const once = video.applyToRenderedHtml(html);
    const twice = video.applyToRenderedHtml(once);
    assert.equal(twice, once);
  });

  test('no recognizable video URL → untouched (lint flags it at authoring)', () => {
    const html = section('<h2>x</h2><ul>' + li('just some text') + '</ul>');
    assert.equal(video.applyToRenderedHtml(html), html);
  });

  test('a duplicate URL elsewhere is not the one consumed (position-based removal)', () => {
    // The payload bullet is removed by span; a later bare mention stays put.
    const html = section(
      '<h2>x</h2><ul>' +
        li('https://www.youtube.com/watch?v=dQw4w9WgXcQ') +
        li('see also <code>note</code>') +
        '</ul>'
    );
    const out = video.applyToRenderedHtml(html);
    assert.match(out, /<figure class="video-embed"/);
    assert.match(out, /note/); // the non-payload bullet survives
  });

  // The title stays IN the card. `video` is conformance:"strict" and runs above
  // mastheadLift, whose h2 lift is depth-aware for a strict component: a nested
  // h2 stays put, a top-level one goes to the band. So the pin is "no top-level
  // h2 survives the rebuild", in every composition.
  for (const cls of ['video', 'video gallery', 'video companion', 'video companion qr']) {
    test(`${cls}: one .video-card root, the title nested in it`, () => {
      const out = video.applyToRenderedHtml(section(
        '<h2>Watch the tour.</h2><p>Ninety seconds.</p><ul>' + li('https://youtu.be/dQw4w9WgXcQ') + '</ul>', cls));
      const inner = out.replace(/^<section[^>]*>/, '').replace(/<\/section>$/, '');
      assert.match(inner, /^<div class="video-card">[\s\S]*<\/div>$/);
      assert.equal(findTopLevelH2(inner), null, 'a top-level h2 would be lifted into the masthead band');
      assert.match(inner, /<div class="video-(head|lead)"><h2>Watch the tour\.<\/h2>/);
      assert.match(inner, /Ninety seconds\./);
    });
  }

  test('the running header and footer survive every composition', () => {
    // `companion` rebuilt its section from the h2 + lead alone and dropped both,
    // so a deck-level `header:` and a slide's `_footer:` vanished from it.
    const body = '<header>Deck · video</header><h2>x</h2><p>lead</p><ul>' +
      li('https://youtu.be/dQw4w9WgXcQ') + '</ul><footer>Slide footer</footer>';
    for (const cls of ['video', 'video gallery', 'video companion']) {
      const out = video.applyToRenderedHtml(section(body, cls));
      assert.match(out, /^<section[^>]*><header>Deck · video<\/header><div class="video-card">/, cls);
      assert.match(out, /<\/div><footer>Slide footer<\/footer><\/section>$/, cls);
    }
  });
});

describe('oEmbed resolver (injected fetcher — no network)', () => {
  test('resolves title + thumbnail for a provider with oEmbed', async () => {
    const stub = async () => ({ title: 'Never Gonna Give You Up', thumbnail_url: 'https://i.ytimg.com/x.jpg' });
    const r = await resolveOembed('https://www.youtube.com/watch?v=dQw4w9WgXcQ', stub);
    assert.equal(r.provider, 'youtube');
    assert.equal(r.title, 'Never Gonna Give You Up');
    assert.equal(r.thumbnailUrl, 'https://i.ytimg.com/x.jpg');
  });

  test('Instagram → null (no public oEmbed), never calls the fetcher', async () => {
    let called = false;
    const r = await resolveOembed('https://www.instagram.com/reel/Cx/', async () => { called = true; return {}; });
    assert.equal(r, null);
    assert.equal(called, false);
  });

  test('a failed fetch resolves to null, never throws', async () => {
    const r = await resolveOembed('https://vimeo.com/1084537', async () => { throw new Error('network'); });
    assert.equal(r, null);
  });

  test('videoUrlsFromDeck pulls the bare video bullets, deduped', () => {
    const src = [
      '## x',
      '- https://www.youtube.com/watch?v=abc123',
      '- Scan to watch `caption`',
      '- https://www.youtube.com/watch?v=abc123',
      '- not a video',
    ].join('\n');
    const urls = videoUrlsFromDeck(src);
    assert.deepEqual(urls, ['https://www.youtube.com/watch?v=abc123']);
  });
});

test('video: a running header does not shift which bullets are consumed', () => {
  // The consumed bullets are found by offset in the section's inner HTML, so the
  // header has to come off AFTER they are removed, or the URL bullet survives as
  // a stray line of text under the poster.
  const out = video.applyToRenderedHtml(section(
    '<header>Deck · video</header><h2>x</h2><ul><li>https://vimeo.com/1084537</li>' +
    '<li>A caption <code>caption</code></li></ul><footer>f</footer>', 'video gallery'));
  assert.doesNotMatch(out.replace(/href="[^"]*"/g, ''), /vimeo\.com\/1084537/);
  assert.doesNotMatch(out, /<ul>|<li>/);
});

test('video: an eyebrow authored above the title rides into the card with it', () => {
  // With the title in the card, the masthead no longer lifts the eyebrow beside
  // it. `companion` rebuilt from the title and lead alone and dropped it; the
  // other compositions left it loose above the head.
  for (const [cls, head] of [['video companion', 'video-lead'], ['video gallery', 'video-head'], ['video', 'video-head']]) {
    const out = video.applyToRenderedHtml(section(
      '<p><code>Onboarding</code></p><h2>x</h2><p>lead</p><ul>' + li('https://youtu.be/dQw4w9WgXcQ') + '</ul>', cls));
    assert.match(out, new RegExp(`<div class="${head}"><p><code>Onboarding</code></p><h2>x</h2>`), cls);
  }
});

test('video: a subtitle label under the title stays its next sibling, in the card', () => {
  // `section h2 + p:has(> code:only-child)` styles the subtitle only while it
  // directly follows the h2. Left outside the head it rendered as a code chip.
  for (const [cls, head] of [['video companion', 'video-lead'], ['video gallery', 'video-head'], ['video', 'video-head']]) {
    const out = video.applyToRenderedHtml(section(
      '<h2>x</h2><p><code>A subtitle</code></p><p>lead</p><ul>' + li('https://youtu.be/dQw4w9WgXcQ') + '</ul>', cls));
    assert.match(out, new RegExp(`<div class="${head}"><h2>x</h2><p><code>A subtitle</code></p>`), cls);
    assert.match(out, /<p>lead<\/p>/, `${cls}: the lead survives`);
  }
});
