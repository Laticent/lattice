
// `asset:<name>` — a photo the person added to the Studio Library (engineering/decisions/
// 2026-10-12-library-media-assets.md). Sibling of sample-images.test.js: `sample:` resolves
// against a folder URL, `asset:` against a name → URL map the host mints (a `blob:` object URL in
// the Studio). The grammar lives in remote-ref.js `assetName`; the resolver in bg-image.js.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const bg = require('../../../lib/core/bg-image');
const remoteRef = require('../../../lib/core/remote-ref');
const engine = require('../../../lib/engine');

const B = 'blob:https://site.test/';
const URLS = { hero: `${B}1111`, 'team-photo': `${B}2222`, logo: `${B}3333`, a: `${B}a`, b: `${B}b`, c: `${B}c`, d: `${B}d` };

describe('asset: — grammar and resolver', () => {
  test('a well-formed name resolves through the host map', () => {
    assert.equal(bg.resolveAssetUrl('asset:hero', 'file:///deck/', undefined, URLS), URLS.hero);
    assert.equal(bg.resolveAssetUrl('asset:team-photo', undefined, undefined, URLS), URLS['team-photo']);
  });

  test('the name is case-insensitive, because the library only stores lowercase', () => {
    assert.equal(bg.resolveAssetUrl('asset:Hero', undefined, undefined, URLS), URLS.hero);
  });

  test('without a map the reference passes through untouched (the CLI, a gallery)', () => {
    assert.equal(bg.resolveAssetUrl('asset:hero', 'file:///deck/'), 'asset:hero');
  });

  test('a name the map does not hold becomes the drawn missing-image stand-in, never a dead scheme', () => {
    assert.equal(bg.resolveAssetUrl('asset:gone', undefined, undefined, URLS), remoteRef.WEB_IMAGE_PLACEHOLDER);
    assert.equal(bg.resolveAssetUrl('asset:gone', undefined, undefined, {}), remoteRef.WEB_IMAGE_PLACEHOLDER);
  });

  test('a malformed reference never resolves and counts as remote; with a map it is the stand-in, without one it is untouched', () => {
    for (const bad of ['asset:../secret', 'asset:a/b', 'asset://evil.test/x', 'asset:a.b', 'asset:', 'asset:-lead', 'asset:a b']) {
      assert.equal(bg.resolveAssetUrl(bad, 'file:///deck/', undefined, URLS), remoteRef.WEB_IMAGE_PLACEHOLDER, bad);
      assert.equal(bg.resolveAssetUrl(bad, 'file:///deck/', undefined, undefined), bad, bad);
      assert.equal(remoteRef.isRemoteUrl(bad), true, bad);
    }
  });

  test('a well-formed reference is local: it can only load the author’s own file', () => {
    assert.equal(remoteRef.isRemoteUrl('asset:hero'), false);
    assert.equal(remoteRef.assetName('asset:Hero'), 'hero');
    assert.equal(remoteRef.assetName('asset:../x'), null);
  });

  test('a hostile map cannot be used to smuggle a value: inherited keys and non-strings are "missing"', () => {
    const map = Object.create({ hero: 'https://evil.test/x.png' });
    assert.equal(bg.resolveAssetUrl('asset:hero', undefined, undefined, map), remoteRef.WEB_IMAGE_PLACEHOLDER);
    assert.equal(bg.resolveAssetUrl('asset:hero', undefined, undefined, { hero: 42 }), remoteRef.WEB_IMAGE_PLACEHOLDER);
    // `__proto__` cannot even reach the map: a name may not start with `_`, so it is malformed.
    assert.equal(bg.resolveAssetUrl('asset:__proto__', undefined, undefined, {}), remoteRef.WEB_IMAGE_PLACEHOLDER);
    assert.equal(remoteRef.isRemoteUrl('asset:__proto__'), true);
    assert.equal(bg.resolveAssetUrl('asset:constructor', undefined, undefined, {}), remoteRef.WEB_IMAGE_PLACEHOLDER);
  });

  test('sample: and relative paths are unaffected by a map', () => {
    assert.equal(bg.resolveAssetUrl('sample:logo-acme.svg', undefined, 'https://s.test/', URLS), 'https://s.test/logo-acme.svg');
    assert.equal(bg.resolveAssetUrl('ada.svg', 'file:///deck/', undefined, URLS), 'file:///deck/ada.svg');
  });
});

describe('asset: — every engine path that paints a picture', () => {
  const render = (md, assetUrls = URLS) => engine.render(md, 'indaco', { assetUrls }).html;

  test('an image slide background', () => {
    assert.match(render('<!-- _class: image -->\n\n## T\n\n![bg](asset:hero)\n'), new RegExp(`url\\('${B}1111'\\)`));
  });

  test('a section background on any other slide', () => {
    assert.match(render('## T\n\n![bg](asset:hero)\n'), new RegExp(`${B}1111`));
  });

  test('a prose image', () => {
    assert.match(render('## T\n\n![A](asset:hero)\n'), new RegExp(`src="${B}1111"`));
  });

  test('a collage photo list: every photo resolves, so the packer is never handed a dead scheme', () => {
    const out = render('<!-- _class: collage -->\n\n## T\n\n- ![One](asset:a)\n- ![Two](asset:b)\n- ![Three](asset:c)\n- ![Four](asset:d)\n');
    for (const k of ['a', 'b', 'c', 'd']) assert.match(out, new RegExp(`${B}${k}"`), k);
    assert.doesNotMatch(out, /asset:/);
  });

  test('a logo-wall mark', () => {
    assert.match(render('<!-- _class: logo-wall -->\n\n## T\n\n- ![Acme](asset:logo)\n- ![Globex](asset:hero)\n'), new RegExp(`${B}3333`));
  });

  test('a team-profile portrait', () => {
    assert.match(render('<!-- _class: team-profile -->\n\n## T\n\n- Ada Okafor\n  - ![](asset:hero)\n  - `Sponsor`\n'), new RegExp(`class="person-photo" src="${B}1111"`));
  });

  test('a deck logo', () => {
    assert.match(render('---\nlogo: asset:logo\n---\n\n## T\n'), new RegExp(`${B}3333`));
  });

  test('no `asset:` survives a render that has a map, found or not', () => {
    const out = render('<!-- _class: image -->\n\n## T\n\n![bg](asset:hero)\n\n---\n\n## U\n\n![A](asset:gone)\n');
    assert.doesNotMatch(out, /asset:/);
    assert.match(out, /data:image\/svg\+xml/, 'the missing one is the drawn stand-in');
  });

  test('without a map nothing is rewritten (the CLI keeps what the author wrote)', () => {
    assert.match(engine.render('## T\n\n![A](asset:hero)\n', 'indaco').html, /asset:hero/);
  });

  test('a non-object map is no map at all', () => {
    for (const bad of ['x', 7, [], null]) {
      assert.match(render('## T\n\n![A](asset:hero)\n', bad), /asset:hero/, String(bad));
    }
  });
});

describe('asset: — an empty alt is filled from the photo description', () => {
  const ALTS = { hero: 'The team on the roof', a: 'First', b: 'Second', c: 'Third', d: 'Fourth', logo: 'Acme mark' };
  const render = (md, assetAlts = ALTS) => engine.render(md, 'indaco', { assetUrls: URLS, assetAlts }).html;

  test('an empty alt on a prose image takes the description', () => {
    assert.match(render('## T\n\n![](asset:hero)\n'), /alt="The team on the roof"/);
  });

  test('an alt the author wrote is never replaced', () => {
    const out = render('## T\n\n![My own words](asset:hero)\n');
    assert.match(out, /alt="My own words"/);
    assert.doesNotMatch(out, /The team on the roof/);
  });

  test('a collage tile sees the description, so its lightbox caption and narration do too', () => {
    const out = render('<!-- _class: collage -->\n\n## T\n\n- ![](asset:a)\n- ![](asset:b)\n- ![](asset:c)\n- ![](asset:d)\n');
    for (const alt of ['First', 'Second', 'Third', 'Fourth']) assert.match(out, new RegExp(`alt="${alt}"`), alt);
  });

  test('a description is escaped as text, never read as markup or as a new attribute', () => {
    const out = render('## T\n\n![](asset:hero)\n', { hero: '"><img src=x onerror=alert(1)> & <b>bold</b> [x](y)' });
    // Exactly one image tag, and once its quoted values are removed it carries no `onerror` or stray attribute.
    const tags = [...out.matchAll(/<img\b((?:"[^"]*"|[^>"])*)>/g)].map((m) => m[1]);
    assert.equal(tags.length, 1);
    const names = [...tags[0].replace(/"[^"]*"/g, '""').matchAll(/\s([a-z-]+)=/g)].map((m) => m[1]);
    assert.ok(!names.includes('onerror') && !names.includes('x'), names.join(','));
    assert.match(out, /alt="&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt; &amp; &lt;b&gt;bold&lt;\/b&gt; \[x\]\(y\)"/);
  });

  test('a background directive is not an empty alt', () => {
    assert.doesNotMatch(render('<!-- _class: image -->\n\n## T\n\n![bg](asset:hero)\n'), /The team on the roof/);
  });

  test('a name with no description, a missing photo and a non-string value leave alt empty', () => {
    for (const alts of [{}, { hero: 42 }, { hero: '' }, Object.create({ hero: 'inherited' })]) {
      assert.doesNotMatch(render('## T\n\n![](asset:hero)\n', alts), /alt="[^"]/, JSON.stringify(alts));
    }
    assert.doesNotMatch(render('## T\n\n![](asset:gone)\n'), /The team on the roof/);
  });

  test('without a map the render is byte-identical to one with a map and no descriptions', () => {
    const md = '## T\n\n![A](asset:hero)\n\n![](asset:logo)\n';
    assert.equal(render(md, null), render(md, {}));
    assert.equal(engine.render(md, 'indaco', { assetUrls: URLS }).html, render(md, null));
  });

  test('a sample: image and a non-asset image are never touched', () => {
    const out = engine.render('## T\n\n![](sample:logo-acme.svg)\n\n![](https://x.test/a.png)\n', 'indaco', { samplesUrl: 'https://s.test/', assetUrls: URLS, assetAlts: ALTS }).html;
    assert.doesNotMatch(out, /The team on the roof|Acme mark/);
  });

  test('a non-object alt map is no map', () => {
    for (const bad of ['x', 7, [], null]) assert.doesNotMatch(render('## T\n\n![](asset:hero)\n', bad), /alt="[^"]/, String(bad));
  });
});

describe('asset: — the post-transform pass touches style attributes only', () => {
  test('a style url() on a real tag resolves, quoted, bare or spaced', () => {
    for (const style of ["background:url('asset:hero')", 'background:url(asset:hero)', 'background:url( asset:hero )']) {
      assert.match(bg.resolveInlineImageSrcs(`<a class="video-poster" style="${style}"></a>`, undefined, undefined, URLS), /1111/, style);
    }
  });

  test('text, code and other attributes keep what the author wrote', () => {
    const html = [
      '<p>Text url(asset:hero)</p>',
      "<p><code>url('asset:hero')</code></p>",
      '<pre><code>background: url(asset:hero);\n</code></pre>',
      '<a href="https://x.test/?u=url(asset:hero)">x</a>',
      '<div title="url(asset:hero)"></div>',
    ].join('');
    assert.equal(bg.resolveInlineImageSrcs(html, undefined, undefined, URLS), html);
  });

  test('a deck that teaches the syntax renders its code sample verbatim', () => {
    const out = engine.render("## T\n\nWrite `![](asset:hero)`.\n\n```\n![](asset:hero)\n```\n", 'indaco', { assetUrls: URLS }).html;
    assert.doesNotMatch(out, /blob:/);
  });
});

describe('asset: — the preview does not hatch a Library photo as a web image', () => {
  test('a blob: asset is local; a third-party image beside it still is blocked', () => {
    const html = engine.render('## T\n\n![A](asset:hero)\n\n![B](https://tracker.test/p.png)\n', 'indaco', { assetUrls: URLS }).html;
    const shown = remoteRef.blockWebImages(html, remoteRef.withOwnOrigin([], 'https://site.test'));
    assert.deepEqual(shown.blocked.map((b) => b.origin), ['https://tracker.test']);
    assert.match(shown.html, new RegExp(`${B}1111`));
  });

  test('an unresolved reference left in the markup is not counted as a web image', () => {
    // No map was supplied, so `asset:hero` survives to the preview's blocker. It is local, so it
    // must not be hatched and counted as a network fetch (a "web images blocked" notice).
    const html = engine.render('## T\n\n![A](asset:hero)\n', 'indaco').html;
    assert.deepEqual(remoteRef.blockWebImages(html, []).blocked, []);
  });
});
