// LARGE `data:` PHOTOS RIDE THROUGH THE RENDER AS STAND-INS, AND THE OUTPUT DOES NOT MOVE A BYTE.
//
// lib/engine/deferred-urls.js swaps each large `data:` value in a host's `assetUrls` map for a short
// stand-in, and lib/engine/index.js `render` puts the bytes back once at the end. That is a 7.8 s →
// 0.19 s change on a deck with 18 phone photos (engineering/decisions/2026-11-11-deferred-asset-bytes.md),
// and it is only allowed because it changes nothing a reader gets. This file holds that:
//   1. the engine's whole result (html, css, diagnostics) is byte-identical with the stand-ins and
//      without them, across every image-bearing layout family the repo ships;
//   2. none of those renders took the fallback, so (1) is the stand-in path, not the re-render;
//   3. a stand-in a pass changed instead of copying makes `restore` refuse, and the engine's output
//      is still the bytes-in-place render (the fallback's own arm).
// It runs the engine on itself, offline: no clock, network or random input decides a result
// (HARD RULE #32; the nonce only names the stand-ins, and every assertion compares whole outputs).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const DEFER = path.join(ROOT, 'lib/engine/deferred-urls.js');
const ENGINE = path.join(ROOT, 'lib/engine/index.js');

/** A fresh engine whose `deferAssetUrls` is `wrap(original)`, so one process can render both ways. */
function engineWith(wrap) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'lib'))) delete require.cache[k];
  const mod = require(DEFER);
  const original = mod.deferAssetUrls;
  mod.deferAssetUrls = wrap(original);
  const engine = require(ENGINE);
  mod.deferAssetUrls = original;
  return engine;
}

// Eight distinct "photos", each well past the deferral threshold, each with a payload unique enough
// that a swap between two names would change the output.
const NAMES = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
const URLS = Object.fromEntries(NAMES.map((n, i) => [n, `data:image/png;base64,iVBORw0KGgo${String(i).repeat(8)}${'AbCd+/09'.repeat(600)}${n}==`]));
URLS.svgpic = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><text>${'x'.repeat(2000)}</text></svg>`)}`;
// Bodies a pass escapes, refuses or rewrites. These must NOT be deferred (the checker's finding, 2026-11-11): a
// stand-in would hide them from that pass and the restore would paste the raw body back (a raw SVG came out as
// live markup). Long enough to qualify on length alone.
URLS.rawsvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><!--${'x'.repeat(1100)}--></svg>"><img src=x onerror=alert(1)>`;
URLS.parens = `data:image/svg+xml;utf8,${'()'.repeat(600)}`;
URLS.wrapped = `data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'.repeat(10)}\n`.repeat(12);
URLS.badpad = `data:image/png;base64,${'QUJD'.repeat(400)}=A`;

/** Every image destination in `md` names one of the photos, so every layout carries a deferred value. */
function withAssets(md) {
  let i = 0;
  const next = () => NAMES[i++ % NAMES.length];
  return md
    .replace(/(!\[[^\]]*\]\()(?!asset:)[^)\s]+\.(?:png|jpe?g|svg|webp|gif)(\s+"[^"]*")?\)/gi, (_w, pre, title) => `${pre}asset:${next()}${title || ''})`)
    .replace(/(src=")(?!asset:)[^"]+\.(?:png|jpe?g|svg|webp)"/gi, (_w, pre) => `${pre}asset:${next()}"`);
}

// Every committed deck that draws a picture, plus the gallery (one slide per layout) and a deck that
// writes each reference shape the engine resolves: markdown image, background image, `<img>`,
// a CSS `url(asset:…)` in a directive, an SVG value, and a name the map does not hold.
const SHAPES = `---
theme: indaco
---

<!-- _class: content -->

## Every reference shape

![A photo](asset:p0)

<img src="asset:p1" alt="raw img">

![bg right](asset:p2)

![svg](asset:svgpic)

![missing](asset:not-in-the-map)

---

<!-- _class: content -->

## Bodies that are not canonical base64

![raw](asset:rawsvg)

![wrapped](asset:wrapped)

![pad](asset:badpad)

![bg left](asset:parens)

---

<!-- _class: content -->
<!-- _backgroundImage: url(asset:p3) -->

## A background directive

---

<!-- _class: collage -->

## Four up

- ![one](asset:p4)
- ![two](asset:p5)
- ![three](asset:p6)
- ![four](asset:p7)
`;

function decks() {
  const out = [['shapes', SHAPES], ['gallery', withAssets(fs.readFileSync(path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), 'utf8'))]];
  const ex = path.join(ROOT, 'examples');
  for (const f of fs.readdirSync(ex).sort()) {
    if (!f.endsWith('.md') || f === 'README.md') continue;
    const md = fs.readFileSync(path.join(ex, f), 'utf8');
    if (!/!\[|<img\b|asset:/.test(md)) continue;
    out.push([f, withAssets(md)]);
  }
  return out;
}

test('a render with deferred photos is byte-identical to one with the bytes in place, and takes no fallback', () => {
  let fallbacks = 0;
  let deferredRenders = 0;
  const on = engineWith((orig) => (...a) => {
    const d = orig(...a);
    if (!d) return d;
    deferredRenders++;
    return { ...d, restore: (s) => { const r = d.restore(s); if (r === null) fallbacks++; return r; } };
  });
  const off = engineWith(() => () => null);
  const list = decks();
  assert.ok(list.length >= 20, `expected the image-bearing decks, found ${list.length}`);
  for (const [name, md] of list) {
    const a = on.render(md, undefined, { assetUrls: URLS });
    const b = off.render(md, undefined, { assetUrls: URLS });
    assert.equal(a.html, b.html, `${name}: html differs`);
    assert.equal(a.css, b.css, `${name}: css differs`);
    assert.deepEqual(a.diagnostics, b.diagnostics, `${name}: diagnostics differ`);
  }
  assert.equal(deferredRenders, list.length, 'every render deferred its photos');
  assert.equal(fallbacks, 0, 'no render fell back to the bytes-in-place pass');
  // The arm: the shapes deck really does carry the photos, so the comparison above compared them.
  const shapes = on.render(SHAPES, undefined, { assetUrls: URLS }).html;
  for (const n of ['p0', 'p1', 'p2', 'p3', 'p4', 'p7']) assert.ok(shapes.includes(URLS[n]), `${n} reaches the html`);
});

test('the flat style mode and a host size lookup see the same inputs either way', () => {
  const seen = [];
  const imageSize = (url, ref) => {
    seen.push([url, ref]);
    return ref === 'asset:p0' ? { w: 400, h: 300 } : null;
  };
  const on = engineWith((orig) => orig);
  const off = engineWith(() => () => null);
  const a = on.render(SHAPES, undefined, { assetUrls: URLS, imageSize, styles: 'flat' });
  const seenOn = seen.splice(0);
  const b = off.render(SHAPES, undefined, { assetUrls: URLS, imageSize, styles: 'flat' });
  assert.deepEqual(a, b);
  assert.deepEqual(seenOn, seen, 'the host is asked about the URLs it minted, never a stand-in');
});

test('a stand-in a pass changed is refused, and the engine renders the bytes in place', () => {
  const { deferAssetUrls } = require(DEFER);
  const d = deferAssetUrls({ a: URLS.p0, small: 'data:image/png;base64,AAAA', web: 'https://example.com/x.png' });
  assert.equal(d.map.small, 'data:image/png;base64,AAAA', 'a short value passes through');
  assert.equal(d.map.web, 'https://example.com/x.png', 'a non-data value passes through');
  assert.ok(d.map.a.startsWith('data:image/png;base64,') && d.map.a.length < 80, 'the stand-in keeps the header and is short');
  assert.equal(d.restore(`<img src="${d.map.a}">`), `<img src="${URLS.p0}">`);
  assert.equal(d.restore(`x ${encodeURIComponent(d.map.a)} y`), null, 'a percent-encoded stand-in is refused');
  assert.equal(d.restore(d.map.a.slice(0, -1)), null, 'a cut stand-in is refused');
  assert.equal(d.restore('no stand-in here'), 'no stand-in here');
  assert.equal(deferAssetUrls({ a: 'https://x/y.png' }), null, 'nothing to defer → render exactly as before');
  assert.equal(deferAssetUrls(null), null);
  for (const n of ['rawsvg', 'parens', 'wrapped', 'badpad', 'svgpic']) {
    assert.equal(deferAssetUrls({ [n]: URLS[n] }), null, `${n}: a body that is not canonical base64 is never deferred`);
  }

  // The engine's own fallback: a restore that always refuses still yields the bytes-in-place render.
  const refusing = engineWith((orig) => (...a) => {
    const x = orig(...a);
    return x && { ...x, restore: () => null };
  });
  const off = engineWith(() => () => null);
  assert.deepEqual(refusing.render(SHAPES, undefined, { assetUrls: URLS }), off.render(SHAPES, undefined, { assetUrls: URLS }));
});
