/**
 * `sample:<name>` — the one way a deck names Lattice's sample art (lib/samples/).
 *
 * Three things are pinned here:
 *   1. The grammar and the resolver (lib/core/remote-ref.js `sampleName`,
 *      lib/core/bg-image.js `resolveAssetUrl`): a well-formed name resolves into the
 *      folder the host passes; a malformed one resolves to nothing.
 *   2. Every engine path that paints a picture honors it — an image slide, a section
 *      background, a prose image, a logo-wall mark, a team-profile portrait, a video
 *      poster and a deck logo. Each of these used to resolve on its own, which is how
 *      the Studio ended up showing placeholders.
 *   3. Every `sample:` reference the repo ships names a file that exists. The Studio's
 *      insert templates named `logo-1.svg` and `portrait.jpg`, which existed nowhere,
 *      and no gate noticed.
 *
 * engineering/decisions/2026-10-07-sample-images.md
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const bg = require('../../../lib/core/bg-image');
const remoteRef = require('../../../lib/core/remote-ref');
const engine = require('../../../lib/engine');
const { isGeneratedMirror } = require('../../helpers/generated-mirrors.js');

const ROOT = path.join(__dirname, '../../..');
const SAMPLES_DIR = path.join(ROOT, 'lib', 'samples');
const S = 'https://site.test/playground/v/abc/samples/';

describe('sample: — grammar and resolver', () => {
  test('a well-formed name resolves into the samples folder, whatever the deck base', () => {
    assert.equal(bg.resolveAssetUrl('sample:logo-acme.svg', 'file:///deck/', S), `${S}logo-acme.svg`);
    assert.equal(bg.resolveAssetUrl('sample:photo-wide.jpg', undefined, 'file:///pkg/lib/samples/'), 'file:///pkg/lib/samples/photo-wide.jpg');
  });

  test('without a samples folder the reference passes through untouched', () => {
    assert.equal(bg.resolveAssetUrl('sample:logo-acme.svg', 'file:///deck/'), 'sample:logo-acme.svg');
  });

  test('a malformed name never resolves, and counts as remote', () => {
    for (const bad of ['sample:../secret.svg', 'sample:a/b.svg', 'sample://evil.test/x.svg', 'sample:..svg', 'sample:', 'sample:.hidden']) {
      assert.equal(bg.resolveAssetUrl(bad, 'file:///deck/', S), bad, bad);
      assert.equal(remoteRef.isRemoteUrl(bad), true, bad);
    }
  });

  test('a well-formed name is local: it can only load our own art', () => {
    assert.equal(remoteRef.isRemoteUrl('sample:portrait-ada.svg'), false);
    assert.equal(remoteRef.sampleName('sample:portrait-ada.svg'), 'portrait-ada.svg');
  });

  test('a plain relative path still resolves against the deck base', () => {
    assert.equal(bg.resolveAssetUrl('ada.svg', 'file:///deck/', S), 'file:///deck/ada.svg');
  });
});

describe('sample: — every engine path that paints a picture', () => {
  const render = (md) => engine.render(md, 'indaco', { samplesUrl: S }).html;

  test('an image slide background', () => {
    assert.match(render('<!-- _class: image -->\n\n## T\n\n![bg](sample:photo-wide.svg)\n'), new RegExp(`url\\('${S}photo-wide\\.svg'\\)`));
  });

  test('a section background on any other slide', () => {
    assert.match(render('## T\n\n![bg](sample:photo-pano.svg)\n'), new RegExp(`${S}photo-pano\\.svg`));
  });

  test('a prose image', () => {
    assert.match(render('## T\n\n![A](sample:photo-square.svg)\n'), new RegExp(`src="${S}photo-square\\.svg"`));
  });

  test('a logo-wall mark', () => {
    assert.match(render('<!-- _class: logo-wall -->\n\n## T\n\n- ![Acme](sample:logo-acme.svg)\n- ![Globex](sample:logo-globex.svg)\n'), new RegExp(`${S}logo-acme\\.svg`));
  });

  test('a team-profile portrait', () => {
    assert.match(render('<!-- _class: team-profile -->\n\n## T\n\n- Ada Okafor\n  - ![](sample:portrait-ada.svg)\n  - `Sponsor`\n'), new RegExp(`class="person-photo" src="${S}portrait-ada\\.svg"`));
  });

  test('a video poster', () => {
    assert.match(render('<!-- _class: video -->\n\n## T\n\n- https://www.youtube.com/watch?v=dQw4w9WgXcQ\n- sample:video-poster.svg `poster`\n'), new RegExp(`${S}video-poster\\.svg`));
  });

  test('a deck logo', () => {
    assert.match(render('---\nlogo: sample:logo-acme-mark.svg\n---\n\n## T\n'), new RegExp(`src="${S}logo-acme-mark\\.svg"`));
  });

  test('no `sample:` survives a render that has a samples folder', () => {
    const out = render('<!-- _class: image -->\n\n## T\n\n![bg](sample:photo-wide.svg)\n\n---\n\n## U\n\n![A](sample:photo-tall.svg)\n');
    assert.doesNotMatch(out, /sample:/);
  });
});

describe('sample: — the post-transform pass touches style attributes only', () => {
  const S2 = 'file:///pkg/lib/samples/';
  test('a style url() on a real tag resolves, quoted, bare or spaced', () => {
    for (const style of ["background:url('sample:photo-wide.svg')", 'background:url(sample:photo-wide.svg)', 'background:url( sample:photo-wide.svg )']) {
      assert.match(bg.resolveInlineImageSrcs(`<a class="video-poster" style="${style}"></a>`, undefined, S2), /photo-wide\.svg/);
      assert.doesNotMatch(bg.resolveInlineImageSrcs(`<a style="${style}"></a>`, undefined, S2), /sample:/, style);
    }
  });

  test('text, code and other attributes keep what the author wrote', () => {
    const html = [
      '<p>Text url(sample:photo-pano.jpg)</p>',
      "<p><code>url('sample:photo-square.jpg')</code></p>",
      '<pre><code>background: url(sample:photo-wide.jpg);\n</code></pre>',
      '<a href="https://x.test/?u=url(sample:photo-wide.jpg)">x</a>',
      '<div title="url(sample:photo-wide.jpg)"></div>',
    ].join('');
    assert.equal(bg.resolveInlineImageSrcs(html, undefined, S2), html);
  });

  test('a deck that teaches the syntax renders its code sample verbatim', () => {
    const out = engine.render("## T\n\nWrite `url('sample:photo-wide.svg')`.\n\n```\nbackground: url(sample:photo-wide.svg);\n```\n", 'indaco', { samplesUrl: S2 }).html;
    assert.doesNotMatch(out, /file:\/\/\/pkg/);
  });
});

describe('sample: — the preview counts the site itself as allowed', () => {
  test('withOwnOrigin adds the page origin once, and only an http(s) one', () => {
    assert.deepEqual(remoteRef.withOwnOrigin(['https://a.test'], 'https://site.test'), ['https://a.test', 'https://site.test']);
    assert.deepEqual(remoteRef.withOwnOrigin(['https://site.test'], 'https://site.test'), ['https://site.test']);
    assert.deepEqual(remoteRef.withOwnOrigin([], 'null'), []);
    assert.deepEqual(remoteRef.withOwnOrigin([], undefined), []);
  });

  test('a staged sample is no longer hatched as a web image; a third-party one still is', () => {
    const html = engine.render('<!-- _class: team-profile -->\n\n## T\n\n- Ada\n  - ![](sample:portrait-ada.svg)\n- Bo\n  - ![](https://tracker.test/p.svg)\n', 'indaco', { samplesUrl: S }).html;
    const shown = remoteRef.blockWebImages(html, remoteRef.withOwnOrigin([], 'https://site.test'));
    assert.deepEqual(shown.blocked.map((b) => b.origin), ['https://tracker.test']);
    assert.match(shown.html, new RegExp(`${S}portrait-ada\\.svg`));
  });
});

describe('sample: — exports carry the picture', () => {
  test('Export to Marp (CLI) copies a sample into the bundle and rewrites the reference', () => {
    const os = require('node:os');
    const { localizeAssets, localizeFrontMatter } = require('../../../tools/export-marp');
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'marp-sample-'));
    const deckDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));
    const copied = new Map();
    const log = console.log;
    console.log = () => {};
    let body;
    let fm;
    try {
      body = localizeAssets('![bg](sample:photo-wide.svg)\n\n![](sample:../escape.svg)\n', deckDir, dest, copied).body;
      fm = localizeFrontMatter('logo: sample:logo-acme-mark.svg\n', deckDir, dest, copied);
    } finally {
      console.log = log;
    }
    assert.match(body, /!\[bg\]\(assets\/photo-wide\.svg\)/);
    assert.match(body, /sample:\.\.\/escape\.svg/, 'a malformed name copies nothing');
    assert.match(fm, /logo: assets\/logo-acme-mark\.svg/);
    assert.deepEqual(fs.readdirSync(path.join(dest, 'assets')).sort(), ['logo-acme-mark.svg', 'photo-wide.svg']);
  });

  test('the HTML player embeds a logo-wall mark instead of shipping the hatch', async () => {
    const { inlineUrlMedia } = await import('../../../lib/export/inline-url-media.mjs');
    const html = `<span class="logo-mark" style="--logo-mask:url('${S}logo-acme.svg')"></span>`;
    const out = await inlineUrlMedia(html, {
      baseUrl: S, origins: ['https://site.test'],
      fetchDataUri: async () => ({ dataUri: 'data:image/svg+xml;base64,AAAA', bytes: 3 }),
    });
    assert.match(out.html, /--logo-mask:url\('data:image\/svg\+xml;base64,AAAA'\)/);
    assert.deepEqual(remoteRef.blockWebImages(out.html, []).blocked, []);
  });

  test('the engine string-valued --background-image is still not read as a picture', async () => {
    const { inlineUrlMedia } = await import('../../../lib/export/inline-url-media.mjs');
    let fetched = 0;
    const html = `<div style="--background-image:&quot;url(\\&quot;${S}x.svg\\&quot;)&quot;"></div>`;
    const out = await inlineUrlMedia(html, { baseUrl: S, origins: ['https://site.test'], fetchDataUri: async () => { fetched++; return { dataUri: 'data:,', bytes: 1 }; } });
    assert.equal(fetched, 0);
    assert.equal(out.html, html);
  });
});

describe('sample: — every reference the repo ships names a real file', () => {
  const have = new Set(fs.readdirSync(SAMPLES_DIR));
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0')
    .filter((f) => /\.(md|json|js|mjs|ts|tsx|code-snippets)$/.test(f))
    .filter((f) => !/^(engineering\/decisions\/|CHANGELOG\.md|changelog|node_modules\/|dist\/)/.test(f))
    .filter((f) => !f.endsWith('sample-images.test.js'))
    .filter((f) => !isGeneratedMirror(f));
  const REF = /sample:([A-Za-z0-9][A-Za-z0-9._-]*\.(?:svg|png|jpe?g|webp|gif))/g;

  test('lib/samples/ holds only pictures', () => {
    for (const f of have) if (f !== 'README.md') assert.match(f, /\.(svg|png|jpe?g|webp|gif)$/, f);
  });

  test('no shipped `sample:` reference points at a missing file', () => {
    const missing = [];
    for (const f of tracked) {
      let src;
      try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
      if (src.indexOf('sample:') === -1) continue;
      for (const m of src.matchAll(REF)) if (!have.has(m[1])) missing.push(`${f}: sample:${m[1]}`);
    }
    assert.deepEqual(missing, []);
  });

  test('every insert template in a component manifest shows real pictures, not invented paths', () => {
    const { loadAll } = require('../../../lib/components');
    const bad = [];
    for (const m of loadAll()) {
      for (const [field, md] of [['skeleton', m.skeleton], ['sample', m.sample]]) {
        if (typeof md !== 'string') continue;
        for (const [, target] of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
          if (/^(https?:|data:)/.test(target)) continue;
          if (!target.startsWith('sample:') || !have.has(target.slice(7))) bad.push(`${m.name}.${field}: ${target}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });
});
