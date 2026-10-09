// The avatars plugin: `!{Ada Okafor, hair=coily, c3}` read, resolved and drawn
// (lib/plugins/avatars/avatars.inline.js), and its integration with team-profile's roster.
// Design: engineering/decisions/2026-10-09-inline-avatars.md.
//
// ORDER MATTERS IN THIS FILE. node --test runs each file in its own process, and the first describe
// block needs the drawings to be ABSENT (a browser before the data script lands). Every later block
// registers them. `pluginData` caches only a hit, so registering after a miss is found.

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { provideData, markDataFailed } = require('../../../lib/plugins/plugin-data.js');
const k = require('../../../lib/plugins/avatars/avatars.inline.js');
const tp = require('../../../lib/components/inventory/team-profile/team-profile.transform.js');

const loadData = () => provideData('avatars', () => require('../../../lib/plugins/avatars/avatars.data.generated.js'));
const roster = (items) => `<section class="team-profile"><div class="cell-stage"><ul><li>Ada Okafor<ul>${items}</ul></li></ul></div></section>`;
const wrap = (items) => roster(items);

describe('avatars — on the runtime path, a roster waits for the drawings', () => {
  test('a valid avatar with no drawings yet holds the roster, then a failed load gives a monogram', () => {
    // A Marp-rendered page: the runtime's transform pass runs BEFORE its data fetch lands. Rebuilding
    // then would make Ada a monogram for good (the rebuilt roster has no `!{…}` left to draw).
    const dom = new JSDOM(`<body>${roster('<li><code>!{Ada Okafor}</code></li><li><code>Sponsor</code></li>')}</body>`);
    tp.applyToDom(dom.window.document);
    assert.equal(dom.window.document.querySelector('.team-roster'), null, 'held while the drawings may arrive');
    markDataFailed('avatars'); // the runtime's fetch failed: stop waiting
    tp.applyToDom(dom.window.document);
    assert.ok(dom.window.document.querySelector('.person-figure--monogram'), 'a monogram once nothing will arrive');
    assert.match(dom.window.document.querySelector('.person-role').textContent, /Sponsor/);
  });
});

describe('avatars — the name picks the face', () => {
  before(loadData);

  test('the same name is the same face, whatever its case and spacing', () => {
    const a = k.read('!{Ada Okafor}');
    const b = k.read('!{ada   OKAFOR }');
    assert.deepEqual(a.traits, b.traits);
    assert.equal(a.c, b.c);
  });

  test('a written trait wins, and pinning one does not reshuffle the others', () => {
    const base = k.read('!{Ada Okafor}');
    const pinned = k.read('!{Ada Okafor, hair=bun, glasses=round}');
    assert.equal(pinned.traits.hair, 'bun');
    assert.equal(pinned.traits.glasses, 'round');
    for (const t of ['skin', 'face', 'eyes', 'nose', 'mouth', 'top']) assert.equal(pinned.traits[t], base.traits[t], t);
  });

  test('traits are picked independently: skin does not decide the tile, the top or the nose', () => {
    // Bare FNV-1a leaked its low bits through `% 8`: the tile equaled `c` + skin for 2000 of 2000
    // names, and skin fixed the top and the nose. With the finalizer every pairing occurs.
    const seen = { c: new Set(), top: new Set(), nose: new Set() };
    let same = 0;
    for (let i = 0; i < 2000; i++) {
      const f = k.read(`!{Person ${i}}`);
      seen.c.add(`${f.traits.skin}|${f.c}`);
      seen.top.add(`${f.traits.skin}|${f.traits.top}`);
      seen.nose.add(`${f.traits.skin}|${f.traits.nose}`);
      if (f.c === `c${f.traits.skin}`) same++;
    }
    assert.equal(seen.c.size, 64);
    assert.equal(seen.top.size, 64);
    assert.equal(seen.nose.size, 32);
    assert.ok(same < 400, `tile equals skin ${same}/2000 times — expected about 250`);
  });

  test('a deep skin tone never defaults to blonde or red hair', () => {
    for (let i = 0; i < 500; i++) {
      for (const skin of ['5', '6', '7', '8']) {
        const f = k.read(`!{P${i}, skin=${skin}}`);
        assert.ok(!['blonde', 'red', 'platinum', 'auburn'].includes(f.traits['hair-color']), `${i} ${skin} ${f.traits['hair-color']}`);
      }
    }
  });

  test('gender is a preset, not a lock', () => {
    for (let i = 0; i < 200; i++) assert.equal(k.read(`!{P${i}, gender=woman}`).traits.beard, 'none');
    assert.equal(k.read('!{Sam Lee, gender=woman, beard=full}').traits.beard, 'full');
    assert.equal(k.read('!{Sam Lee, gender=man, hair=long}').traits.hair, 'long');
  });
});

describe('avatars — reading and drawing', () => {
  before(loadData);

  test('a broken span does not read, and diagnose says why', () => {
    assert.equal(k.read('!{Ada, skin=9}'), null);
    assert.match(k.diagnose('!{Ada, skin=9}'), /"9" is not one of 1, 2/);
    assert.match(k.diagnose('!{Ada, hair=mohawk}'), /mohawk/);
    assert.equal(k.diagnose('!{Ada}'), null);
    assert.equal(k.diagnose('!important'), null);
  });

  test('a space after the brace does not read, and is diagnosed rather than silently left as code', () => {
    assert.equal(k.read('!{ Ada Okafor}'), null);
    assert.match(k.diagnose('!{ Ada Okafor}'), /directly followed by its first value/);
  });

  test('every attribute value is escaped on the string path', () => {
    const html = k.avatarHtml('!{"A<b>&\\"x, y", label="Q<"}');
    assert.ok(html);
    assert.doesNotMatch(html, /<b>/);
    assert.match(html, /aria-label="Q&lt;"/);
    assert.match(html, /data-src="!\{&quot;A&lt;b&gt;&amp;/);
  });

  test('the DOM path builds nodes, never markup', () => {
    const { document } = new JSDOM('').window;
    const el = k.avatarElement(document, '!{"A>B <img src=x onerror=alert(1)>"}');
    assert.ok(el);
    assert.equal(el.querySelectorAll('img').length, 0);
    assert.equal(el.getAttribute('aria-label'), 'A>B <img src=x onerror=alert(1)>');
  });
});

describe('avatars — in a team-profile roster', () => {
  before(loadData);
  const drawn = (text) => k.avatarHtml(text);

  test('an avatar alone on its line is the portrait, hidden because the name is beside it', () => {
    const out = tp.applyToRenderedHtml(wrap(`<li>${drawn('!{Ada Okafor}')}</li><li><code>Sponsor</code></li>`));
    assert.match(out, /<span class="person-figure person-figure--avatar"><span class="lat-avatar"/);
    assert.match(out, /aria-hidden="true"><svg class="lat-avatar-svg"/);
    assert.doesNotMatch(out, /role="img"/);
    assert.match(out, /<span class="person-role">Sponsor<\/span>/);
  });

  test('a note that mentions someone keeps its words and its avatar', () => {
    const out = tp.applyToRenderedHtml(wrap(
      `<li>${drawn('!{Ada Okafor}')}</li><li>Pairs with ${drawn('!{Marcus Vale}')} on the cutover.</li>`));
    assert.match(out, /person-figure--avatar/);
    assert.match(out, /<span class="person-note">Pairs with <span class="lat-avatar"[^>]*role="img"/);
    assert.match(out, /on the cutover\.<\/span>/);
  });

  test('a note BEFORE the portrait line does not steal the portrait', () => {
    const out = tp.applyToRenderedHtml(wrap(
      `<li>Pairs with ${drawn('!{Marcus Vale}')}.</li><li>${drawn('!{Ada Okafor}')}</li>`));
    assert.match(out, /person-figure--avatar"><span class="lat-avatar"[^>]*data-src="!\{Ada Okafor\}"/);
    assert.match(out, /Pairs with/);
  });

  test('two faces on one line are a note, not a portrait that drops the second', () => {
    const out = tp.applyToRenderedHtml(wrap(`<li>${drawn('!{Dee}')} ${drawn('!{Ann}')}</li>`));
    assert.match(out, /person-figure--monogram/);
    assert.match(out, /data-src="!\{Dee\}"/);
    assert.match(out, /data-src="!\{Ann\}"/);
  });

  test('a broken avatar stays literal, as a note — what lint:deck says about it is true', () => {
    const out = tp.applyToRenderedHtml(wrap('<li><code>!{Ada, hair=nope}</code></li><li><code>Sponsor</code></li>'));
    assert.match(out, /<span class="person-note"><code>!\{Ada, hair=nope\}<\/code><\/span>/);
    assert.match(out, /<span class="person-role">Sponsor<\/span>/);
  });

  test('an avatar the plugin is OFF for is a missing portrait: a monogram, never the role', () => {
    const out = tp.applyToRenderedHtml(wrap('<li><code data-lattice-off="avatars">!{Ada Okafor}</code></li><li><code>Sponsor</code></li>'));
    assert.match(out, /<span class="person-initials">AO<\/span>/);
    assert.match(out, /<span class="person-role">Sponsor<\/span>/);
    assert.doesNotMatch(out, /!\{Ada/);
  });

  test('a hostile name survives the runtime re-serialization without injecting markup', () => {
    // applyToDom re-serializes the section. jsdom (like older browsers) leaves `<` and `>` raw inside
    // attribute values, and a `[^>]*` attribute match spliced a live `<img onerror>` out of this name.
    const dom = new JSDOM('<body><section class="team-profile"><div class="cell-stage"><ul><li>Ada<ul><li id="slot"></li></ul></li></ul></div></section></body>');
    const doc = dom.window.document;
    doc.getElementById('slot').appendChild(k.avatarElement(doc, '!{"A>B <img src=x onerror=alert(1)>"}'));
    tp.applyToDom(doc);
    assert.equal(doc.querySelectorAll('img').length, 0);
    const av = doc.querySelector('.person-figure--avatar .lat-avatar');
    assert.ok(av, 'the avatar is the portrait');
    assert.equal(av.getAttribute('aria-hidden'), 'true');
    assert.equal(av.hasAttribute('aria-label'), false);
    assert.equal(av.getAttribute('data-src'), '!{"A>B <img src=x onerror=alert(1)>"}');
  });

  test('idempotent: a second pass over a rebuilt roster changes nothing', () => {
    const once = tp.applyToRenderedHtml(wrap(`<li>${drawn('!{Ada Okafor}')}</li>`));
    assert.equal(tp.applyToRenderedHtml(once), once);
  });
});
