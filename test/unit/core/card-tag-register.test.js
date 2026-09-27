/**
 * The `tag:` register — the look of every card tag (lib/core/resolve-card-tag.js).
 *
 *   1. the kernel sorts words onto the color and size axes and drops what it does not know;
 *   2. BOTH render paths stamp the tokens (the engine here, the real runtime bundle below)
 *      and a slide's word evicts the deck's on its own axis only;
 *   3. the linter warns on an unknown word, a doubled axis, and a placement word that has not
 *      shipped yet, and the per-slide classes are a closed vocabulary;
 *   4. the CSS sets the register's pair on the TAG ITSELF, so it beats a component's native
 *      pair (decision's categorical cycle, set on its cards) without a selector contest.
 *
 * engineering/decisions/2026-09-27-card-tag-register.md §3.3, §6 phase 2.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const {
  CARD_TAG_TOKENS, parseCardTag, cardTagClasses, readCardTag,
  isCardTagColorToken, isCardTagSizeToken,
} = require(path.join(ROOT, 'lib/core/resolve-card-tag.js'));
const { lintText } = require(path.join(ROOT, 'lib/authoring/lint.js'));

const DECISION = '<!-- _class: decision -->\n\n## One\n\n- Build\n  - Owns it.\n- Buy\n  - Rents it.';
const deck = (fm, body) =>
  ['---', 'theme: indaco', ...fm, '---', '', body || `${DECISION}\n\n---\n\n## Two\n\nMore prose.`].join('\n');
const classesOf = (fm, body) => {
  const doc = new JSDOM(latticeEngine.createEngine().render(deck(fm, body)).html).window.document;
  return [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/).filter(Boolean));
};

test('kernel: words sort onto two axes; order and case do not matter', () => {
  assert.deepEqual(cardTagClasses('plain large'), ['tag-plain', 'tag-large']);
  assert.deepEqual(cardTagClasses('Large, PLAIN'), ['tag-plain', 'tag-large']);
  assert.deepEqual(cardTagClasses('small'), ['tag-small']);
  assert.deepEqual(cardTagClasses('none'), ['tag-none']);
});

test('kernel: unknown words stamp nothing; a second word on a filled axis is dropped', () => {
  const p = parseCardTag('plain none band huge');
  assert.equal(p.color, 'plain');
  assert.deepEqual(p.duplicate, ['none']);
  assert.deepEqual(p.unknown, ['band', 'huge']);
  assert.deepEqual(cardTagClasses('band'), [], 'placement words are not shipped yet, so they stamp nothing');
  assert.deepEqual(cardTagClasses(''), []);
  assert.equal(readCardTag('theme: indaco'), null);
});

test('kernel: every token sits on exactly one axis', () => {
  for (const t of CARD_TAG_TOKENS) {
    assert.ok(isCardTagColorToken(t) !== isCardTagSizeToken(t), t);
  }
  assert.equal(isCardTagColorToken('tag-bordered'), false, 'the inline-pill shape word is not a register token');
});

test('engine: stamps the tokens on every slide, and nothing without the key', () => {
  const on = classesOf(['tag: plain large']);
  const off = classesOf([]);
  assert.ok(on.length >= 2);
  for (const cls of on) assert.ok(cls.includes('tag-plain') && cls.includes('tag-large'), cls.join(' '));
  for (const cls of off) assert.ok(!cls.some((c) => CARD_TAG_TOKENS.includes(c)), cls.join(' '));
});

test('engine: a slide\'s word evicts the deck\'s on its own axis only', () => {
  const body = `${DECISION}\n\n---\n\n<!-- _class: decision tag-color -->\n\n## Two\n\n- A\n  - b\n\n---\n\n<!-- _class: tag-small -->\n\n## Three\n\nProse.`;
  const [one, two, three] = classesOf(['tag: plain large'], body);
  assert.ok(one.includes('tag-plain') && one.includes('tag-large'), one.join(' '));
  // color replaced, size kept
  assert.ok(two.includes('tag-color') && !two.includes('tag-plain') && two.includes('tag-large'), two.join(' '));
  // size replaced, color kept
  assert.ok(three.includes('tag-small') && !three.includes('tag-large') && three.includes('tag-plain'), three.join(' '));
});

test('lint: an unknown word, a doubled axis and a not-yet placement word warn; a clean value is silent', () => {
  const found = (fm) => lintText(deck(fm)).filter((f) => f.rule === 'unknown-tag');
  assert.equal(found(['tag: plain large']).length, 0);
  assert.equal(found(['tag: "none small" # quiet']).length, 0);
  assert.equal(found(['tag: huge']).length, 1);
  assert.equal(found(['tag: plain none']).length, 1);
  const later = found(['tag: band']);
  assert.equal(later.length, 1);
  assert.match(later[0].message, /not available yet/);
});

test('lint: `tag-*` classes are a closed vocabulary', () => {
  const unknown = (cls) => lintText(`---\ntheme: indaco\n---\n\n<!-- _class: decision ${cls} -->\n\n## A\n\n- B\n  - c\n`)
    .filter((f) => f.rule === 'unknown-class').map((f) => f.classToken);
  assert.deepEqual(unknown('tag-plain tag-large'), []);
  assert.deepEqual(unknown('tag-color tag-regular'), []);
  assert.deepEqual(unknown('tag-huge'), ['tag-huge']);
});

test('css: the register re-points tokens only, and sets the pair on the tag itself', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.card-tag.css'), 'utf8');
  assert.match(css, /section\.tag-small\s*\{\s*--card-tag-scale:\s*0\.85;\s*\}/);
  assert.match(css, /section\.tag-large\s*\{\s*--card-tag-scale:\s*1\.2;\s*\}/);
  // The pair is declared on the tag (pseudo-element / lifted strong), not on the card, so it
  // beats decision's per-card pair by being the element's own value.
  const plain = css.match(/((?:section\.tag-plain[^{,]*,\s*)+section\.tag-plain[^{]*)\{([^}]*)\}/);
  assert.ok(plain, 'a tag-plain rule exists');
  assert.match(plain[1], /li::before/);
  assert.match(plain[1], /li > strong:first-child/);
  assert.match(plain[2], /--card-tag-fill:\s*var\(--bg\)/);
  assert.match(plain[2], /--card-tag-ink:\s*var\(--text-body\)/);
  const none = css.match(/((?:section\.tag-none[^{,]*,\s*)+section\.tag-none[^{]*)\{([^}]*)\}/);
  assert.ok(none, 'a tag-none rule exists');
  assert.match(none[2], /--card-tag-fill:\s*transparent/);
  assert.match(none[2], /--card-tag-ink:\s*var\(--text-secondary\)/);
});

/* ── The runtime's own mirror, from a baked block (the export path) ──────────────────── */

const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));

function renderRuntimeBaked(deckSource, markup) {
  const bundle = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  // CONTENT, not mtime: the size axis list is the fingerprint of the register in the bundle.
  assert.ok(/"small", *"regular", *"large"/.test(bundle),
    'dist/lattice-runtime.js predates the card-tag register — run `npm run runtime:build` and re-run.');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${markup}${frontMatterBlock(deckSource)}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  dom.window.fetch = () => Promise.reject(new Error('baked: no fetch expected'));
  const el = dom.window.document.createElement('script');
  el.textContent = bundle;
  dom.window.document.body.appendChild(el);
  return new Promise((r) => setTimeout(() => r(dom.window.document), 1000));
}

test('runtime: stamps the tokens from a baked block, and evicts per axis', async () => {
  const markup = '<section class="content"><h2>One</h2></section>'
    + '<section class="content tag-none"><h2>Two</h2></section>';
  const on = await renderRuntimeBaked(deck(['tag: plain large']), markup);
  const off = await renderRuntimeBaked(deck([]), markup);
  const [a, b] = [...on.querySelectorAll('section')].map((s) => s.className.split(/\s+/));
  assert.ok(a.includes('tag-plain') && a.includes('tag-large'), a.join(' '));
  assert.ok(b.includes('tag-none') && !b.includes('tag-plain') && b.includes('tag-large'), b.join(' '));
  const offCls = [...off.querySelectorAll('section')].map((s) => s.className).join(' | ');
  assert.ok(!/tag-(plain|large)/.test(offCls), `control: ${offCls}`);
});
