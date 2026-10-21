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
  assert.ok(out.includes('<li class="collage-tile" data-hero="1" data-label="a"><img'));
  assert.ok(out.includes('<li class="collage-tile" data-label="b" style="--collage-focal:50% 0%"><img'));
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
  assert.ok(/data-hero="1" data-label="a" style="grid-area:/.test(out));
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

// What the engine does to author text before it reaches the markup: all four characters.
const escHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('HARD RULE #22: alt text, hint words and file names never reach a style attribute or break out of an attribute', () => {
  const evil = 'x;}</style><img onerror=alert(1)>" onmouseover="alert(2)';
  const items = [
    `<img src="file:///a.jpg" alt="${escHtml(evil)}" /> <code>${escHtml(evil)}</code>`,
    img('b'), img('c'), img('d'),
  ];
  const out = k.stampSection(k.applyToRenderedHtml(section(items)), [1, 1, 1, 1], k.optionsFromClass('collage'), 'landscape');
  const styles = [...out.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(styles.length > 0);
  for (const s of styles) {
    assert.ok(/^[\w\s:;.,%/()-]*$/.test(s), `style carries only numbers and table constants: ${s}`);
    assert.ok(!/onerror|alert|<|>/.test(s));
  }
  const doc = new JSDOM(`<body>${out}</body>`).window.document;
  const attrNames = new Set([...doc.querySelectorAll('*')].flatMap((el) => el.getAttributeNames()));
  assert.ok(!attrNames.has('onmouseover') && !attrNames.has('onerror'), `the quote in the alt text did not open a new attribute: ${[...attrNames]}`);
  assert.equal(doc.querySelectorAll('img').length, 4, 'no injected element');
  assert.ok(out.includes('data-label="x;}&lt;/style&gt;&lt;img onerror=alert(1)&gt;&quot; onmouseover=&quot;alert(2)"'), 'the label carries the alt text still escaped');
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

// ── a collage never splits across slides ────────────────────────────────────────────────
const path = require('node:path');
const fs = require('node:fs');
const ss = require('../../../lib/core/structural-split');
const { loadAll } = require('../../../lib/components');
const { createEngine } = require('../../../lib/engine');

const MANIFESTS = loadAll(path.join(__dirname, '..', '..', '..', 'lib', 'components'));
const CAPACITY = ss.splitCapacityFrom(MANIFESTS);
const engine = createEngine();

const photoDeck = (size, cls, n = 6) => `---
theme: indaco
${size ? `size: ${size}\n` : ''}---

<!-- _class: ${cls} -->

\`Eyebrow\`

## ${n} photographs.

${Array.from({ length: n }, (_v, i) => `- ![Photo ${i + 1}](photo-${i + 1}.jpg)`).join('\n')}
`;

const splitRun = (md) => {
  const out = engine.render(md, 'indaco', { preview: true });
  return ss.structuralSplit(out.html, { deckSource: md, width: out.width, height: out.height, capacity: CAPACITY });
};

test('the collage declares no capacity axis (a declared axis that is missing from the DOM still splits)', () => {
  const m = MANIFESTS.find((x) => x.name === 'collage');
  assert.ok(m, 'collage manifest loads');
  assert.equal(m.capacity, undefined, 'no capacity block');
  assert.equal(m.adapt?.capacity, undefined, 'no adapt.capacity block');
  assert.equal(CAPACITY.collage, undefined, 'splitCapacityFrom keeps only components that can split');
});

test('six photos on a portrait, a square and a story deck stay ONE slide', () => {
  for (const size of ['portrait', 'square', 'story']) {
    const r = splitRun(photoDeck(size, 'collage'));
    assert.equal(r.applies, true, `${size}: the split gate is open for this box`);
    assert.equal(r.changed, 0, `${size}: a collage is not split`);
    assert.equal(ss.splitTopLevelSections(r.html).length, 1, `${size}: one slide`);
  }
});

test('failing arm: the same six-bullet list in a splittable component DOES split on a portrait deck', () => {
  const r = splitRun(photoDeck('portrait', 'inventory'));
  assert.ok(r.changed >= 1, 'the control splits, so the collage result above is not a vacuous pass');
});

test('the collage hides the page number with the doubled-class arms', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'components', 'imagery', 'collage', 'collage.styles.css'), 'utf8');
  // Both arms yield to `with-pagination`, which wins over every opt-out (lib/core/pagination.js).
  assert.match(css, /section\.collage\.collage:not\(\.with-pagination\)::after\s*\{\s*content:\s*none;\s*\}/, 'the pagination pseudo is suppressed at doubled-class specificity');
  assert.match(css, /section\.collage\.collage:not\(\.with-pagination\)\s*>\s*\.lat-pagination\s*\{\s*display:\s*none;\s*\}/, 'the page-number element is hidden');
});

test('the description is a plain paragraph under the header rule: no hairline above it, no bottom-aligned gap', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'components', 'imagery', 'collage', 'collage.styles.css'), 'utf8');
  // The shared below-note rule (base.modifiers.css) hairlines any paragraph that follows a block, so the
  // paragraph that follows the masthead needs an override that out-ranks it.
  assert.match(css, /section\.collage\.collage\.collage\s*>\s*\.cell-masthead\s*\+\s*p::before\s*\{\s*content:\s*none;\s*\}/, 'the second hairline is suppressed');
  // `align-self: end` pushed it to the bottom of its grid row and left a gap under the header rule.
  const beside = css.match(/> p \{\s*grid-column: 1;\s*grid-row: 2;\s*align-self: (\w+);/);
  assert.ok(beside, 'the beside-layout paragraph rule is present');
  assert.equal(beside[1], 'start', 'the description sits straight under the header');
});

test('bleed takes the whole slide: no header or footer, a stretched grid, a translucent card holding the title and the description', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'components', 'imagery', 'collage', 'collage.styles.css'), 'utf8');
  assert.match(css, /section\.collage\.bleed > header,\s*section\.collage\.bleed > footer\s*\{\s*display:\s*none;\s*\}/, 'the header and footer are off');
  assert.match(css, /section\.collage\.bleed \.collage-list\s*\{\s*--collage-h:\s*100cqh;\s*--collage-w:\s*100cqw;\s*\}/, 'the grid is stretched to the slide, not kept at its own shape');
  assert.match(css, /section\.collage\.bleed > \.cell-masthead,\s*section\.collage\.bleed > p\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--bg\) \d+%, transparent\)/, 'the card is translucent');
  assert.match(css, /section\.collage\.bleed\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*fit-content\(50%\);[^}]*padding:\s*0 0 0 var\(--frame-x\);/, 'the text is a one-column grid pinned to the top edge at the frame inset');
  assert.doesNotMatch(css, /section\.collage\.bleed > p\s*\{\s*display:\s*none;/, 'the description is shown on bleed, not hidden');
  assert.match(css, /section\.collage\.bleed > p\s*\{\s*padding-block:\s*var\(--sp-md\);/, 'a description alone keeps the card padding');
  assert.match(css, /section\.collage\.bleed\.bleed\.bleed > \.cell-masthead \+ p\s*\{[^}]*grid-row:\s*2;/, 'the description is the second row of the same card');
  const { STAGE_ASPECT } = require('../../../lib/components/imagery/collage/collage.pack');
  assert.equal(STAGE_ASPECT.landscape.bleed, 16 / 9, 'the bleed estimate is the slide itself, so no bands are left');
});

// ── lint rules (lib/authoring/lint-core.js) ─────────────────────────────────────────────
const lintCore = require('../../../lib/authoring/lint-core');

const VOCAB = { names: new Set(['collage']), modifiers: new Set(['ordered', 'fill', 'above', 'bleed', 'mirror']) };
const lintCollage = (body) => lintCore.lintTextWith(`---\nmarp: true\ntheme: indaco\n---\n\n<!-- _class: collage -->\n\n## T\n\n${body}\n`, VOCAB);
const rules = (res) => res.map((f) => f.rule);
const six = Array.from({ length: 6 }, (_v, i) => `- ![Photo ${i + 1}](p${i + 1}.jpg)`).join('\n');

test('lint: a clean four-to-six photo collage raises nothing from the collage rules', () => {
  assert.deepEqual(rules(lintCollage(six)).filter((r) => r.startsWith('collage-')), []);
});

test('lint: collage-count warns below four and above six', () => {
  assert.ok(rules(lintCollage('- ![A](a.jpg)\n- ![B](b.jpg)')).includes('collage-count'));
  const seven = `${six}\n- ![Seventh](p7.jpg)`;
  assert.ok(rules(lintCollage(seven)).includes('collage-count'));
});

test('lint: collage-alt warns on a photo with no alt text', () => {
  assert.ok(rules(lintCollage(six.replace('![Photo 1]', '![]'))).includes('collage-alt'));
});

test('lint: collage-bg warns on background syntax', () => {
  assert.ok(rules(lintCollage(six.replace('![Photo 1]', '![bg]'))).includes('collage-bg'));
});

test('lint: collage-hint names an unknown hint word and accepts the real ones', () => {
  assert.ok(rules(lintCollage(six.replace('(p1.jpg)', '(p1.jpg) `shiny`'))).includes('collage-hint'));
  assert.ok(rules(lintCollage(six.replace('(p1.jpg)', '(p1.jpg) `hero, top, 3:2`'))).every((r) => r !== 'collage-hint'));
});

test('lint hint grammar agrees with the transform: the same words are valid in both', () => {
  const words = ['hero', 'top', 'bottom', 'left', 'right', 'center', '3:2', '16:9', 'hero, top', 'hero, 3:2, left',
    'shiny', 'top, bottom', '0:2', '2:0', '1:1001', 'hero,', 'hero, hero', '3:2, 4:5', 'Hero'];
  for (const w of words) {
    const lintBad = rules(lintCollage(six.replace('(p1.jpg)', `(p1.jpg) \`${w}\``))).includes('collage-hint');
    assert.equal(lintBad, k.parseHints(w) === null, `\`${w}\`: lint and transform disagree`);
  }
});

test('stamp: still packs when `_focus` has added lat-focus / lat-recede to the tile classes', () => {
  const s = k.applyToRenderedHtml(section(FOUR))
    .replace('<li class="collage-tile" data-hero="1"', '<li class="collage-tile lat-recede" data-hero="1"')
    .replace(/<li class="collage-tile" data-label="b"/, '<li class="collage-tile lat-focus" data-label="b"');
  assert.ok(s.includes('lat-recede') && s.includes('lat-focus'));
  const out = k.stampSection(s, [0.5625, 0.8, 1.5, 1], k.optionsFromClass('collage'), 'landscape');
  assert.ok(out.includes('data-collage="packed"'), 'the grid is stamped');
  assert.equal((out.match(/grid-area:\d+\/\d+\/\d+\/\d+/g) || []).length, 4, 'every tile is placed');
  assert.ok(out.includes('class="collage-tile lat-recede"') && out.includes('class="collage-tile lat-focus"'), 'the focus classes survive');
});

test('a tile is named by its alt text, so the Present Guide can land on it', () => {
  const out = k.applyToRenderedHtml(section(FOUR));
  assert.deepEqual([...out.matchAll(/<li class="collage-tile"[^>]*data-label="(\w)"/g)].map((m) => m[1]), ['a', 'b', 'c', 'd']);
  const tricky = k.applyToRenderedHtml(section([`<img src="file:///x.jpg" alt="Tan &amp; &quot;grained&quot; calf" />`, img('b'), img('c'), img('d')]));
  assert.ok(tricky.includes('data-label="Tan &amp; &quot;grained&quot; calf"'), 'an escaped alt stays escaped in the attribute');
});

// ── the readers: article projection, narration ──────────────────────────────────────────
async function renderedSections(md) {
  const { html } = await engine.render(`---\ntheme: indaco\n---\n\n${md}`);
  return [...new JSDOM(`<body>${html}</body>`).window.document.querySelectorAll('article > section')];
}
const COLLAGE_MD = '<!-- _class: collage -->\n\n`The atelier`\n\n## Hand-lasted.\n\n`Four photographs`\n\nEach pair starts as a last.\n\n- ![Tall derby, apron toe](https://example.com/a.jpg) `hero`\n- ![Black macro](https://example.com/b.jpg)\n- ![Wingtip brogue](https://example.com/c.jpg)\n- ![Suede chelsea](https://example.com/d.jpg)\n';

test('article projection: every photo is re-hosted, in written order, with its alt', async () => {
  const { projectDeckToProse } = await import('../../../lib/transformers/prose-projection.mjs');
  const { articleHtml } = projectDeckToProse(await renderedSections(COLLAGE_MD));
  const imgs = [...articleHtml.matchAll(/<img src="([^"]+)" alt="([^"]*)"/g)].map((m) => m[2]);
  assert.deepEqual(imgs, ['Tall derby, apron toe', 'Black macro', 'Wingtip brogue', 'Suede chelsea']);
  assert.ok(articleHtml.indexOf('Each pair starts') < articleHtml.indexOf('<figure'), 'the description precedes the photos');
  assert.ok(!articleHtml.includes('collage-list'), 'no raw packed grid leaks into the article');
});

test('narration: the prose is spoken, then each photo by its alt text, one sentence apiece', async () => {
  const { projectDeckToSpeech } = await import('../../../lib/transformers/prose-projection.mjs');
  const [said] = projectDeckToSpeech(await renderedSections(COLLAGE_MD));
  assert.ok(said.includes('Each pair starts as a last.'));
  assert.ok(said.endsWith('Tall derby, apron toe. Black macro. Wingtip brogue. Suede chelsea.'), said);
});

test('narration: a collage with no alt text speaks only its prose', async () => {
  const { projectDeckToSpeech } = await import('../../../lib/transformers/prose-projection.mjs');
  const [said] = projectDeckToSpeech(await renderedSections(COLLAGE_MD.replace(/!\[[^\]]*\]/g, '![]')));
  assert.ok(said.includes('Each pair starts as a last.') && !said.includes('Photographs'));
});

// ── regressions an independent checker reproduced ────────────────────────────────────────
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { stampCollage } = require('../../../lib/core/collage-stamp');

function pngFile(dir, name, w, h) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); buf.write('IHDR', 12, 'ascii'); buf.writeUInt32BE(w, 16); buf.writeUInt32BE(h, 20);
  fs.writeFileSync(path.join(dir, name), buf);
}

test('stampCollage reads deck-relative photos from the deck folder, not from the working directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collage-deck-'));
  fs.mkdirSync(path.join(dir, 'shoes'));
  for (const [n, w, h] of [['a', 900, 1600], ['b', 800, 1000], ['c', 1500, 1000], ['d', 1000, 1000]]) pngFile(path.join(dir, 'shoes'), `${n}.png`, w, h);
  const html = section(['a', 'b', 'c', 'd'].map((n) => `<img src="shoes/${n}.png" alt="${n}" />`));
  const structured = k.applyToRenderedHtml(html);
  assert.notEqual(process.cwd(), dir, 'the test runs from somewhere else');
  const withBase = stampCollage(structured, pathToFileURL(dir + path.sep).href);
  assert.ok(withBase.includes('data-collage="packed"'), 'resolved against the deck folder');
  const without = stampCollage(structured);
  assert.ok(without.includes('data-collage="fallback"'), 'without a base the relative path is not found from here');
});

test('structure: a loose list (blank lines between bullets) builds the same collage', () => {
  const loose = section(FOUR.map((i) => `<p>${i}</p>`));
  const tight = section(FOUR);
  assert.equal(k.applyToRenderedHtml(loose), k.applyToRenderedHtml(tight));
});

test('live path: three passes stamp the tiles once, and a failed photo does not burn the 4 s cap', () => {
  const dom = new JSDOM(`<!doctype html><body>${section([
    img('a', ' data-w="900" data-h="1600"'), img('b', ' data-w="800" data-h="1000"'),
    img('c', ' data-w="0" data-h="0"'), img('d', ' data-w="1000" data-h="1000"'),
  ])}</body>`);
  const { window } = dom;
  const proto = window.HTMLImageElement.prototype;
  Object.defineProperty(proto, 'naturalWidth', { get() { return Number(this.getAttribute('data-w')) || 0; } });
  Object.defineProperty(proto, 'naturalHeight', { get() { return Number(this.getAttribute('data-h')) || 0; } });
  Object.defineProperty(proto, 'complete', { get() { return true; } }); // the broken one is complete too, with width 0
  k.applyToDom(window.document);
  k.applyToDom(window.document);
  k.applyToDom(window.document);
  const tile = window.document.querySelector('ul.collage-list > li');
  assert.equal((tile.getAttribute('style').match(/grid-area:/g) || []).length, 1, 'one grid-area, not one per pass');
  assert.equal(window.document.querySelector('ul.collage-list').getAttribute('data-collage'), 'fallback', 'the unreadable photo (no ratio hint) falls back to the even grid, immediately');
});

test('css: an unstamped list shows an even grid, and only a list being measured is hidden', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'components', 'imagery', 'collage', 'collage.styles.css'), 'utf8');
  assert.ok(!/data-collage="pending"\]\s*\{\s*visibility:\s*hidden/.test(css), 'pending is not hidden');
  assert.match(css, /data-collage="measuring"\]\s*\{\s*visibility:\s*hidden/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test('lint: collage-tail, collage-hero-dup, and `*` bullets count', () => {
  assert.ok(rules(lintCollage(six.replace('(p1.jpg)', '(p1.jpg) `hero` a caption'))).includes('collage-tail'));
  assert.ok(rules(lintCollage(six.replace('(p1.jpg)', '(p1.jpg) a caption'))).includes('collage-tail'));
  assert.ok(rules(lintCollage(six.replace('(p1.jpg)', '(p1.jpg) `hero`').replace('(p2.jpg)', '(p2.jpg) `hero`'))).includes('collage-hero-dup'));
  const starred = six.replace(/^- /gm, '* ');
  assert.deepEqual(rules(lintCollage(starred)).filter((r) => r.startsWith('collage-')), [], 'six `*` bullets are a valid collage');
  assert.ok(rules(lintCollage('* ![A](a.jpg)\n* ![B](b.jpg)')).includes('collage-count'), 'two `*` bullets are counted');
});

// ── bleed packs for the slide's real aspect (#2641 P4) ───────────────────────────────────
// A bleed grid is stretched to the slide, so whatever the layout leaves empty becomes crop at each
// photo's edges. The table's 16:9 / 1:1 / 9:16 is wrong for a 4:3, 4:5 or phone-height canvas.
const DEMO_ASPECTS = [1600 / 2400, 3200 / 2000, 1, 3200 / 1200]; // the demo deck's tall, wide, square, pano
const bleedPlan = (orientation, slideAspect) =>
  k.planStamp(DEMO_ASPECTS, [null, null, null, null], [false, false, false, false], k.optionsFromClass('collage bleed'), orientation, slideAspect);

test('bleed: a measured slide aspect steers the packer; the table is the fallback', () => {
  const { stageAspectEstimate } = require('../../../lib/components/imagery/collage/collage.pack');
  assert.equal(stageAspectEstimate({ orientation: 'landscape', composition: 'bleed' }), 16 / 9);
  assert.equal(stageAspectEstimate({ orientation: 'landscape', composition: 'bleed', slideAspect: 4 / 3 }), 4 / 3);
  assert.equal(stageAspectEstimate({ orientation: 'landscape', composition: 'beside', slideAspect: 4 / 3 }), 1.41, 'only a bleed collage fills the slide');
  for (const bad of [0, -1, NaN, Infinity, 0.1, 9, undefined, '1.5']) {
    assert.equal(stageAspectEstimate({ orientation: 'landscape', composition: 'bleed', slideAspect: bad }), 16 / 9, `${bad} is a bad measurement, not a canvas`);
  }
});

test('bleed on a 4:3 deck crops far less when it packs for 4:3 than for the 16:9 default', () => {
  // `result.empty` is the share of the stage the layout leaves empty, which a bleed stretch turns into crop.
  const guessed = bleedPlan('landscape', undefined).result;
  const real = bleedPlan('landscape', 4 / 3).result;
  const cropFor = (r, slide) => 1 - Math.min(r.ar / slide, slide / r.ar);
  assert.ok(cropFor(guessed, 4 / 3) > 0.25, `packed for 16:9, a 4:3 slide crops ${(100 * cropFor(guessed, 4 / 3)).toFixed(1)}%`);
  assert.ok(cropFor(real, 4 / 3) < 0.06, `packed for 4:3 it crops ${(100 * cropFor(real, 4 / 3)).toFixed(1)}%`);
  assert.ok(Math.abs(real.empty - cropFor(real, 4 / 3)) < 1e-9, '`empty` IS the bleed crop');
});

test('bleed with no slide aspect, and a collage that is not bleed, are unchanged', () => {
  const none = bleedPlan('landscape', undefined);
  const sixteenNine = bleedPlan('landscape', 16 / 9);
  assert.equal(none.listStyle, sixteenNine.listStyle, 'the table default for landscape IS 16:9');
  const plain = (a) => k.planStamp(DEMO_ASPECTS, [null, null, null, null], [false, false, false, false], k.optionsFromClass('collage'), 'landscape', a);
  assert.equal(plain(4 / 3).listStyle, plain(undefined).listStyle, 'a beside collage ignores the slide aspect');
});

test('stampSection and stampCollage pass the slide aspect through', () => {
  const s = k.applyToRenderedHtml(section([img('a'), img('b'), img('c'), img('d')], 'collage bleed'));
  const guessed = k.stampSection(s, DEMO_ASPECTS, k.optionsFromClass('collage bleed'), 'landscape');
  const real = k.stampSection(s, DEMO_ASPECTS, k.optionsFromClass('collage bleed'), 'landscape', 4 / 3);
  assert.notEqual(guessed, real, 'the 4:3 slide gets its own grid');
  const { stampCollage } = require('../../../lib/core/collage-stamp');
  assert.ok(typeof stampCollage === 'function' && stampCollage.length === 3, 'the CLI stamp takes the slide aspect as its third argument');
});

test('bleed pays more for empty space than a plain collage does, and a plain collage is unchanged', () => {
  const { packCollage } = require('../../../lib/components/imagery/collage/collage.pack');
  let seed = 11;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const menu = [0.5625, 0.667, 0.75, 1, 1.333, 1.5, 1.778, 2, 2.667];
  let plain = 0;
  let bleed = 0;
  let floor = 1;
  const N = 120;
  for (let i = 0; i < N; i++) {
    const set = Array.from({ length: 4 + Math.floor(rnd() * 3) }, () => menu[Math.floor(rnd() * menu.length)]);
    plain += packCollage(set, { stageAspect: 16 / 9 }).empty;
    const b = packCollage(set, { stageAspect: 16 / 9, bleed: true });
    bleed += b.empty;
    floor = Math.min(floor, b.ratio);
  }
  assert.ok(bleed / N < 0.6 * (plain / N), `mean crop ${(100 * bleed / N).toFixed(1)}% vs ${(100 * plain / N).toFixed(1)}% plain`);
  assert.ok(floor > 0.04, 'the cut is not bought with a sliver of a photo');
  const same = packCollage(DEMO_ASPECTS, { stageAspect: 16 / 9 });
  assert.deepEqual(packCollage(DEMO_ASPECTS, { stageAspect: 16 / 9, bleed: false }), same, 'bleed:false is the old scoring');
});
