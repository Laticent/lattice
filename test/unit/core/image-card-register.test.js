/**
 * The `image-card:` register — the text card on every image slide (lib/core/resolve-image-card.js).
 *
 *   1. the kernel sorts words onto five axes, maps each to the class image.styles.css paints,
 *      and drops what it does not know;
 *   2. BOTH render paths (the engine here, the real runtime bundle below) stamp the classes on
 *      IMAGE slides only, and a slide's class evicts the deck's word on its own axis only;
 *   3. the linter warns on an unknown word and a doubled axis.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const {
  IMAGE_CARD_TOKENS, IMAGE_CARD_AXES, parseImageCard, imageCardClasses, readImageCard,
  imageCardTokenAxis, imageCardDeckTokens,
} = require(path.join(ROOT, 'lib/core/resolve-image-card.js'));
const { lintText } = require(path.join(ROOT, 'lib/authoring/lint.js'));

const IMAGE = (cls = '') => `<!-- _class: image spotlight ${cls} -->\n\n## A photo.\n\nWords.\n\n![bg](sample:photo-wide.svg)`;
const deck = (fm, slides) => ['---', 'theme: indaco', ...fm, '---', '', slides.join('\n\n---\n\n')].join('\n');
const classesOf = (fm, slides) => {
  const doc = new JSDOM(latticeEngine.createEngine().render(deck(fm, slides)).html).window.document;
  return [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/).filter(Boolean));
};

test('kernel: words map to the classes the image CSS paints; order and case do not matter', () => {
  assert.deepEqual(imageCardClasses('top-right soft light sm compact'), ['at-tr', 'card-soft', 'ink-light', 'card-sm', 'compact']);
  assert.deepEqual(imageCardClasses('Compact, LG center'), ['at-center', 'card-lg', 'compact']);
  assert.deepEqual(imageCardClasses('bottom dark clear'), ['at-bottom', 'card-clear', 'ink-dark']);
  assert.deepEqual(imageCardClasses('top'), ['at-top']);
});

test('kernel: a deck `regular` stamps nothing; unknown and doubled words are reported, not stamped', () => {
  assert.deepEqual(imageCardClasses('regular'), [], 'no deck-wide compact is the same as regular');
  const p = parseImageCard('top-left top sm huge soft solid');
  assert.equal(p.placement, 'top-left');
  assert.equal(p.size, 'sm');
  assert.equal(p.backing, 'soft');
  assert.deepEqual(p.duplicate, ['top', 'solid']);
  assert.deepEqual(p.unknown, ['huge']);
  assert.deepEqual(imageCardClasses(''), []);
  assert.equal(readImageCard('theme: indaco\nimage: https://example.test/og.png'), null, 'Marp `image:` is not this key');
  assert.equal(readImageCard('image-card: top-right'), 'top-right');
});

test('kernel: every class sits on exactly one axis, and every class is a declared image variant or compact', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/components/imagery/image/image.manifest.json'), 'utf8'));
  for (const t of IMAGE_CARD_TOKENS) {
    assert.ok(imageCardTokenAxis(t), t);
    assert.ok(t === 'compact' || manifest.variants.includes(t), `${t} is not an image variant`);
  }
  const all = Object.values(IMAGE_CARD_AXES).flatMap((a) => Object.values(a));
  assert.equal(new Set(all).size, all.length, 'no class on two axes');
});

test('kernel: deck classes ride image slides only, and never an axis the slide fills', () => {
  const deckTokens = ['at-tr', 'card-soft', 'compact'];
  assert.deepEqual(imageCardDeckTokens(['content'], deckTokens), [], 'at-* would move a tint on a non-image slide');
  assert.deepEqual(imageCardDeckTokens(['image', 'spotlight'], deckTokens), deckTokens);
  assert.deepEqual(imageCardDeckTokens(['image', 'at-bl'], deckTokens), ['card-soft', 'compact']);
  assert.deepEqual(imageCardDeckTokens(['image', 'card-regular'], deckTokens), ['at-tr', 'card-soft'], 'card-regular opts out of compact');
  assert.deepEqual(imageCardDeckTokens(['image', 'at-tr', 'card-soft', 'compact'], deckTokens), [], 'idempotent');
});

test('engine: stamps the classes on image slides only, and nothing without the key', () => {
  const slides = [IMAGE(), '<!-- _class: content tint-corner at-bl -->\n\n## Prose.\n\nWords.'];
  const [img, prose] = classesOf(['image-card: top-right sheer compact'], slides);
  for (const c of ['at-tr', 'card-sheer', 'compact']) assert.ok(img.includes(c), img.join(' '));
  assert.ok(!prose.includes('at-tr') && !prose.includes('compact') && !prose.includes('card-sheer'), prose.join(' '));
  const [plain] = classesOf([], slides);
  assert.ok(!plain.some((c) => IMAGE_CARD_TOKENS.includes(c)), plain.join(' '));
});

test('engine: a slide\'s class evicts the deck\'s word on its own axis only', () => {
  const [a, b, c] = classesOf(['image-card: top-right soft sm compact'], [IMAGE('at-bl'), IMAGE('card-lg card-regular'), IMAGE()]);
  assert.ok(a.includes('at-bl') && !a.includes('at-tr') && a.includes('card-soft') && a.includes('card-sm'), a.join(' '));
  assert.ok(b.includes('card-lg') && !b.includes('card-sm') && !b.includes('compact') && b.includes('at-tr'), b.join(' '));
  assert.ok(c.includes('at-tr') && c.includes('compact'), c.join(' '));
});

/* ── The runtime's own mirror, from a baked block (the export path) ──────────────────── */

const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));

function renderRuntimeBaked(deckSource, markup) {
  const bundle = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  assert.ok(bundle.includes('image-card'),
    'dist/lattice-runtime.js predates the image-card register — run `npm run runtime:build` and re-run.');
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

test('runtime: stamps image slides only from a baked block, and evicts per axis', async () => {
  const markup = '<section class="image spotlight"><h2>One</h2></section>'
    + '<section class="image spotlight at-bl"><h2>Two</h2></section>'
    + '<section class="content"><h2>Three</h2></section>';
  const doc = await renderRuntimeBaked(deck(['image-card: top-right soft compact'], ['## x']), markup);
  const [a, b, c] = [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/));
  assert.ok(a.includes('at-tr') && a.includes('card-soft') && a.includes('compact'), a.join(' '));
  assert.ok(b.includes('at-bl') && !b.includes('at-tr') && b.includes('card-soft'), b.join(' '));
  assert.ok(!c.includes('at-tr') && !c.includes('compact'), c.join(' '));
});

/* ── lint ────────────────────────────────────────────────────────────────────────────── */

test('lint: an unknown word and a doubled axis warn; a clean value does not', () => {
  const rules = (v) => lintText(deck([`image-card: ${v}`], [IMAGE()])).filter((f) => f.rule === 'unknown-image-card');
  assert.equal(rules('top-right soft').length, 0);
  assert.equal(rules('upper-left').length, 1);
  assert.equal(rules('top bottom').length, 1);
  assert.equal(lintText(deck(['image-card: top-right'], [IMAGE()])).filter((f) => f.rule === 'unknown-key').length, 0);
});

test('lint: two tints on one slide are not an image-card placement conflict', () => {
  const found = lintText(deck([], ['<!-- _class: content tint-corner at-tl tint-edge at-bottom -->\n\n## Prose.\n\nWords.']))
    .filter((f) => f.rule === 'conflicting-variants');
  assert.deepEqual(found, []);
});
