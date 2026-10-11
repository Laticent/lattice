const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const k = require('../../../lib/components/imagery/collage/collage.transform');

const img = (name, extra = '') => `<img src="file:///${name}.jpg" alt="${name}"${extra} />`;
const section = (items, cls = 'collage') =>
  `<section class="${cls}" data-orientation="landscape"><p><code>Eyebrow</code></p>\n<h2>Title</h2>\n<p><code>Sub</code></p>\n<p>Description.</p>\n<ul>\n${items.map((i) => `<li>${i}</li>`).join('\n')}\n</ul></section>`;
const FOUR = [img('a') + ' <code>hero</code>', img('b') + ' <code>top</code>', img('c') + ' <code>3:2</code>', img('d')];

test('parseHints: hero, one focal word, one ratio, in one comma list', () => {
  assert.deepEqual(k.parseHints('hero'), { hero: true, focal: null, ratio: null });
  assert.deepEqual(k.parseHints('Hero, Bottom'), { hero: true, focal: 'bottom', ratio: null });
  assert.deepEqual(k.parseHints('3:2'), { hero: false, focal: null, ratio: 1.5 });
});

test('parseHints is all or nothing: one bad word, a repeat or a silly ratio refuses the span', () => {
  for (const bad of ['hero, wat', 'top, bottom', 'hero, hero', '0:2', '2:0', '1:100000', '3:2, 4:5', 'hero,', '', ', ,']) {
    assert.equal(k.parseHints(bad), null, JSON.stringify(bad));
  }
});

test('structure: a photo list becomes flat tiles in written order inside one .collage-fit', () => {
  const out = k.applyToRenderedHtml(section(FOUR));
  assert.equal((out.match(/class="collage-fit"/g) || []).length, 1);
  assert.deepEqual([...out.matchAll(/alt="(\w)"/g)].map((m) => m[1]), ['a', 'b', 'c', 'd']);
  assert.ok(out.includes('<li class="collage-tile" data-hero="1"><img'));
  assert.ok(out.includes('<li class="collage-tile" style="--collage-focal:50% 0%"><img'));
  assert.ok(!/<code>(hero|top|3:2)<\/code>/.test(out), 'a valid hint span is consumed, not drawn as a pill');
  assert.ok(out.includes('data-collage-ratio="1.5000"'));
  // the chrome above the list is untouched
  assert.ok(out.includes('<p><code>Eyebrow</code></p>') && out.includes('<h2>Title</h2>') && out.includes('<p>Description.</p>'));
});

test('structure: an unknown hint word leaves the span in place, so it renders as the ordinary pill', () => {
  const out = k.applyToRenderedHtml(section([img('a') + ' <code>shiny</code>', img('b'), img('c'), img('d')]));
  assert.ok(out.includes('<code>shiny</code>'));
  assert.ok(!out.includes('data-hero'));
});

test('structure: a list that is not a photo list is left alone', () => {
  const plain = section(['Just words', 'More words']);
  assert.equal(k.applyToRenderedHtml(plain), plain);
});

test('structure: only sections with the collage class are touched', () => {
  const other = section(FOUR, 'content');
  assert.equal(k.applyToRenderedHtml(other), other);
});

test('structure is idempotent', () => {
  const once = k.applyToRenderedHtml(section(FOUR));
  assert.equal(k.applyToRenderedHtml(once), once);
});

test('structure works inside a frame stage cell', () => {
  const staged = `<section class="collage"><div class="cell-stage"><ul><li>${img('a')}</li><li>${img('b')}</li><li>${img('c')}</li><li>${img('d')}</li></ul></div></section>`;
  const out = k.applyToRenderedHtml(staged);
  assert.ok(/<div class="cell-stage"><div class="collage-fit">/.test(out));
});

test('optionsFromClass reads the slide classes', () => {
  assert.deepEqual(k.optionsFromClass('collage'), { order: 'free', fit: 'tight', composition: 'beside' });
  assert.deepEqual(k.optionsFromClass('collage ordered fill above'), { order: 'ordered', fit: 'fill', composition: 'above' });
  assert.equal(k.optionsFromClass('collage bleed').composition, 'bleed');
});

test('stamp: known sizes pack, one grid-area per tile, tracks as minmax(0, Nfr)', () => {
  const s = k.applyToRenderedHtml(section(FOUR));
  const out = k.stampSection(s, [0.5625, 0.8, 1.5, 1], k.optionsFromClass('collage'), 'landscape');
  assert.ok(out.includes('data-collage="packed"'));
  assert.ok(/--collage-ar:\d+\.\d{4};grid-template-columns:(minmax\(0,\d+\.\d{3}fr\) ?)+;grid-template-rows:/.test(out));
  assert.equal((out.match(/grid-area:\d+\/\d+\/\d+\/\d+/g) || []).length, 4);
  assert.ok(/data-hero="1" style="grid-area:/.test(out));
  assert.ok(/style="grid-area:[\d/]+;--collage-origin:[\d%]+ [\d%]+;--collage-focal:50% 0%"/.test(out), 'a tile keeps its own focal value after the grid-area');
});

test('stamp: the ratio hint sizes a photo whose file could not be read', () => {
  const s = k.applyToRenderedHtml(section(FOUR));
  const out = k.stampSection(s, [0.5625, 0.8, null, 1], k.optionsFromClass('collage'), 'landscape');
  assert.ok(out.includes('data-collage="packed"'));
});

test('stamp: an unreadable photo with no ratio hint falls back to the even grid', () => {
  const s = k.applyToRenderedHtml(section(FOUR));
  const out = k.stampSection(s, [0.5625, null, 1.5, 1], k.optionsFromClass('collage'), 'landscape');
  assert.ok(out.includes('data-collage="fallback"'));
  assert.equal((out.match(/grid-area:/g) || []).length, 4);
});

test('stamp: more than six photos falls back to the even grid', () => {
  const eight = Array.from({ length: 8 }, (_v, i) => img(`p${i}`));
  const s = k.applyToRenderedHtml(section(eight));
  const out = k.stampSection(s, new Array(8).fill(1), k.optionsFromClass('collage'), 'landscape');
  assert.ok(out.includes('data-collage="fallback"'));
});

test('stamp is idempotent and does nothing to an unstructured section', () => {
  const s = k.applyToRenderedHtml(section(FOUR));
  const once = k.stampSection(s, [0.5625, 0.8, 1.5, 1], k.optionsFromClass('collage'), 'landscape');
  assert.equal(k.stampSection(once, [1, 1, 1, 1], k.optionsFromClass('collage'), 'landscape'), once);
  const raw = section(FOUR);
  assert.equal(k.stampSection(raw, [1, 1, 1, 1], k.optionsFromClass('collage'), 'landscape'), raw);
});

test('stamp is deterministic', () => {
  const s = k.applyToRenderedHtml(section(FOUR));
  const a = k.stampSection(s, [0.5625, 0.8, 1.5, 1], k.optionsFromClass('collage'), 'landscape');
  const b = k.stampSection(s, [0.5625, 0.8, 1.5, 1], k.optionsFromClass('collage'), 'landscape');
  assert.equal(a, b);
});

test('HARD RULE #22: alt text, hint words and file names never reach a style attribute', () => {
  const evil = `x;}</style><img onerror=alert(1)>`;
  const items = [
    `<img src="file:///a.jpg" alt="${evil.replace(/</g, '&lt;').replace(/>/g, '&gt;')}" /> <code>${evil.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`,
    img('b'), img('c'), img('d'),
  ];
  const out = k.stampSection(k.applyToRenderedHtml(section(items)), [1, 1, 1, 1], k.optionsFromClass('collage'), 'landscape');
  const styles = [...out.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(styles.length > 0);
  for (const s of styles) {
    assert.ok(/^[\w\s:;.,%/()-]*$/.test(s), `style carries only numbers and table constants: ${s}`);
    assert.ok(!/onerror|alert|<|>/.test(s));
  }
});

test('live path: structures, measures the photos, packs once, and is idempotent', () => {
  const dom = new JSDOM(`<!doctype html><body>${section([
    img('a', ' data-w="900" data-h="1600"') + ' <code>hero</code>',
    img('b', ' data-w="800" data-h="1000"'),
    img('c', ' data-w="1500" data-h="1000"'),
    img('d', ' data-w="1000" data-h="1000"'),
  ])}</body>`);
  const { window } = dom;
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { get() { return Number(this.getAttribute('data-w')) || 0; } });
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', { get() { return Number(this.getAttribute('data-h')) || 0; } });
  Object.defineProperty(window.HTMLImageElement.prototype, 'complete', { get() { return true; } });
  k.applyToDom(window.document);
  const list = window.document.querySelector('ul.collage-list');
  assert.equal(list.getAttribute('data-collage'), 'packed');
  assert.match(list.getAttribute('style'), /grid-template-columns:/);
  assert.equal(list.querySelectorAll(':scope > li[style*="grid-area"]').length, 4);
  const before = window.document.body.innerHTML;
  k.applyToDom(window.document);
  assert.equal(window.document.body.innerHTML, before);
});

test('live path and engine path pick the same layout for the same sizes', () => {
  const sizes = [[900, 1600], [800, 1000], [1500, 1000], [1000, 1000]];
  const html = section(sizes.map(([w, h], i) => img(`p${i}`, ` data-w="${w}" data-h="${h}"`)));
  const engine = k.stampSection(k.applyToRenderedHtml(html), sizes.map(([w, h]) => w / h), k.optionsFromClass('collage'), 'landscape');
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const { window } = dom;
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { get() { return Number(this.getAttribute('data-w')) || 0; } });
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', { get() { return Number(this.getAttribute('data-h')) || 0; } });
  Object.defineProperty(window.HTMLImageElement.prototype, 'complete', { get() { return true; } });
  k.applyToDom(window.document);
  const list = window.document.querySelector('ul.collage-list');
  assert.ok(engine.includes(list.getAttribute('style')), 'the grid tracks match');
  const engineAreas = [...engine.matchAll(/grid-area:([\d/]+)/g)].map((m) => m[1]);
  const liveAreas = [...list.querySelectorAll(':scope > li')].map((li) => /grid-area:([\d/]+)/.exec(li.getAttribute('style'))[1]);
  assert.deepEqual(liveAreas, engineAreas);
});
