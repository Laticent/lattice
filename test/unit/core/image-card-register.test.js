/**
 * The `image-card:` register — the text card on every image slide (lib/core/resolve-image-card.js).
 *
 *   1. the kernel sorts words onto six axes, maps each to the class image.styles.css paints,
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
const { IMAGE_CARD_REGISTER, imageCardClasses, imageCardDeckTokens } = require(path.join(ROOT, 'lib/core/resolve-image-card.js'));
const { TOKENS: IMAGE_CARD_TOKENS, parse: parseImageCard, read: readImageCard, tokenAxis: imageCardTokenAxis } = IMAGE_CARD_REGISTER;
const { lintText } = require(path.join(ROOT, 'lib/authoring/lint.js'));

const IMAGE = (cls = '') => `<!-- _class: image spotlight ${cls} -->\n\n## A photo.\n\nWords.\n\n![bg](sample:photo-wide.svg)`;
const deck = (fm, slides) => ['---', 'theme: indaco', ...fm, '---', '', slides.join('\n\n---\n\n')].join('\n');
const classesOf = (fm, slides) => {
  const doc = new JSDOM(latticeEngine.createEngine().render(deck(fm, slides)).html).window.document;
  return [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/).filter(Boolean));
};

test('kernel: words map to the classes the image CSS paints; order and case do not matter', () => {
  assert.deepEqual(imageCardClasses('top-right soft light sm compact'), ['image-card-top-right', 'image-card-soft', 'image-card-light', 'image-card-sm', 'image-card-compact']);
  assert.deepEqual(imageCardClasses('Compact, LG center'), ['image-card-center', 'image-card-lg', 'image-card-compact']);
  assert.deepEqual(imageCardClasses('bottom dark clear'), ['image-card-bottom', 'image-card-clear', 'image-card-dark']);
  assert.deepEqual(imageCardClasses('top'), ['image-card-top']);
  assert.deepEqual(imageCardClasses('bottom band soft'), ['image-card-bottom', 'image-card-soft', 'image-card-band']);
});

test('kernel: the backing is a 0–100% level — four names, and every other 5% step as `NN%`', () => {
  assert.deepEqual(imageCardClasses('65% light'), ['image-card-65', 'image-card-light']);
  assert.deepEqual(imageCardClasses('bottom band 5%'), ['image-card-bottom', 'image-card-5', 'image-card-band']);
  assert.equal(parseImageCard('65 soft').unknown[0], '65', 'a bare number is not a word; the percent sign is');
  assert.equal(parseImageCard('55%').unknown[0], '55%', '55 and 80 are the names `sheer` and `soft`');
  const css = fs.readFileSync(path.join(ROOT, 'lib/components/imagery/image/image.styles.css'), 'utf8');
  const levels = IMAGE_CARD_REGISTER.AXES.find((a) => a.axis === 'backing').tokens.filter((t) => /^image-card-\d+$/.test(t));
  assert.equal(levels.length, 17, 'every 5% step from 5 to 95 except the two a name already holds');
  // The translucent-card rules name every level outright: an attribute prefix (`[class^="image-card-"]`)
  // would also match the placement and size classes.
  const hairline = css.match(/section\.image\[data-img-composition="spotlight"\]:is\(([^)]*)\) \.image-text \{ box-shadow: var\(--img-hairline\); \}/);
  assert.ok(hairline, 'the hairline rule is where this test expects it');
  const shadowless = css.match(/section\.image\[data-img-composition="spotlight"\]((?::not\(\.[\w-]+\))+) \{ --_card-shadow: none; \}/);
  assert.ok(shadowless, 'the solid-card text-shadow rule is where this test expects it');
  for (const t of levels) {
    const pct = Number(t.slice('image-card-'.length));
    assert.ok(css.includes(`.${t} { --_card-mix: ${pct}%; --_card-alpha: ${pct / 100}; }`), `image.styles.css paints ${t}`);
    assert.ok(hairline[1].split(/,\s*/).includes(`.${t}`), `the hairline rule names ${t}`);
    assert.ok(shadowless[1].includes(`:not(.${t})`), `the solid-card text-shadow rule excludes ${t}`);
  }
});

test('kernel: a deck `regular` stamps nothing; unknown and doubled words are reported, not stamped', () => {
  assert.deepEqual(imageCardClasses('regular'), [], 'no deck-wide compact is the same as regular');
  assert.deepEqual(imageCardClasses('float'), [], 'a deck `float` is the default shape, so it stamps nothing');
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

test('kernel: every class sits on exactly one axis, and every class is a declared image variant', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/components/imagery/image/image.manifest.json'), 'utf8'));
  for (const t of IMAGE_CARD_TOKENS) {
    assert.ok(imageCardTokenAxis(t), t);
    // `image-card-5` … `image-card-95` are declared by VARIANT_DECL_IGNORE, not one by one (see check-ownership.js).
    assert.ok(/^image-card-\d+$/.test(t) || manifest.variants.includes(t), `${t} is not an image variant`);
    assert.ok(t.startsWith('image-card-'), `${t} is the card's own class, not a shared word`);
  }
  const all = IMAGE_CARD_REGISTER.AXES.flatMap((a) => a.tokens);
  assert.equal(new Set(all).size, all.length, 'no class on two axes');
});

test('kernel: deck classes ride image slides only, and never an axis the slide fills', () => {
  const deckTokens = ['image-card-top-right', 'image-card-soft', 'image-card-compact'];
  assert.deepEqual(imageCardDeckTokens(['content'], deckTokens), [], 'a non-image slide has no card');
  assert.deepEqual(imageCardDeckTokens(['image', 'spotlight'], deckTokens), deckTokens);
  assert.deepEqual(imageCardDeckTokens(['image', 'image-card-bottom-left'], deckTokens), ['image-card-soft', 'image-card-compact']);
  assert.deepEqual(imageCardDeckTokens(['image', 'image-card-regular'], deckTokens), ['image-card-top-right', 'image-card-soft'], 'image-card-regular opts out of compact');
  assert.deepEqual(imageCardDeckTokens(['image', 'image-card-float'], ['image-card-bottom', 'image-card-band']), ['image-card-bottom'], 'image-card-float opts out of a deck-wide band');
  assert.deepEqual(imageCardDeckTokens(['content', 'tint-corner'], ['image-card-bottom', 'image-card-band']), [], 'a band never rides a non-image slide');
  assert.deepEqual(imageCardDeckTokens(['image', 'image-card-top-right', 'image-card-soft', 'image-card-compact'], deckTokens), [], 'idempotent');
});

test('engine: stamps the classes on image slides only, and nothing without the key', () => {
  const slides = [IMAGE(), '<!-- _class: content tint-corner at-bl -->\n\n## Prose.\n\nWords.'];
  const [img, prose] = classesOf(['image-card: top-right sheer compact'], slides);
  for (const c of ['image-card-top-right', 'image-card-sheer', 'image-card-compact']) assert.ok(img.includes(c), img.join(' '));
  assert.ok(!img.includes('compact') && !img.includes('at-tr'), `the deck's words stamp the card's own classes only: ${img.join(' ')}`);
  assert.ok(!prose.some((c) => c.startsWith('image-card-')), prose.join(' '));
  assert.ok(prose.includes('at-bl'), 'the tint keeps its own placement');
  const [plain] = classesOf([], slides);
  assert.ok(!plain.some((c) => IMAGE_CARD_TOKENS.includes(c)), plain.join(' '));
});

test('engine: a slide\'s class evicts the deck\'s word on its own axis only', () => {
  const [a, b, c] = classesOf(['image-card: top-right soft sm compact'], [IMAGE('image-card-bottom-left'), IMAGE('image-card-lg image-card-regular'), IMAGE()]);
  assert.ok(a.includes('image-card-bottom-left') && !a.includes('image-card-top-right') && a.includes('image-card-soft') && a.includes('image-card-sm'), a.join(' '));
  assert.ok(b.includes('image-card-lg') && !b.includes('image-card-sm') && !b.includes('image-card-compact') && b.includes('image-card-top-right'), b.join(' '));
  assert.ok(c.includes('image-card-top-right') && c.includes('image-card-compact'), c.join(' '));
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
    + '<section class="image spotlight image-card-bottom-left"><h2>Two</h2></section>'
    + '<section class="content"><h2>Three</h2></section>';
  const doc = await renderRuntimeBaked(deck(['image-card: top-right soft compact'], ['## x']), markup);
  const [a, b, c] = [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/));
  assert.ok(a.includes('image-card-top-right') && a.includes('image-card-soft') && a.includes('image-card-compact'), a.join(' '));
  assert.ok(b.includes('image-card-bottom-left') && !b.includes('image-card-top-right') && b.includes('image-card-soft'), b.join(' '));
  assert.ok(!c.includes('image-card-top-right') && !c.includes('image-card-compact'), c.join(' '));
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
    .filter((f) => f.rule === 'conflicting-variants' || f.rule === 'image-card-renamed');
  assert.deepEqual(found, []);
});

test('lint: two card placements on one image slide conflict, now that the card has its own classes', () => {
  const found = lintText(deck([], [IMAGE('image-card-top-left image-card-bottom')])).filter((f) => f.rule === 'conflicting-variants');
  assert.equal(found.length, 1);
});

/* ── image-card-renamed: the old classes, an error with a fix (rule 5 of the renames note) ── */

const { applyAllFixes } = require(path.join(ROOT, 'lib/authoring/lint-core.js'));
const { buildVocab } = require(path.join(ROOT, 'lib/authoring/lint.js'));
const renamed = (src) => lintText(src).filter((f) => f.rule === 'image-card-renamed');
const SLIDE = (cls) => `<!-- _class: ${cls} -->\n\n## A photo.\n\nWords.\n\n![bg](sample:photo-wide.svg)`;

test('lint image-card-renamed: every old card class is an error that names its new class', () => {
  const pairs = [
    ['card-solid', 'image-card-solid'], ['card-soft', 'image-card-soft'], ['card-sheer', 'image-card-sheer'],
    ['card-clear', 'image-card-clear'], ['card-o65', 'image-card-65'], ['card-o5', 'image-card-5'],
    ['ink-light', 'image-card-light'], ['ink-dark', 'image-card-dark'], ['card-sm', 'image-card-sm'],
    ['card-md', 'image-card-md'], ['card-lg', 'image-card-lg'], ['card-regular', 'image-card-regular'],
    ['card-float', 'image-card-float'], ['band', 'image-card-band'],
    ['at-tl', 'image-card-top-left'], ['at-top', 'image-card-top'], ['at-tr', 'image-card-top-right'],
    ['at-center', 'image-card-center'], ['at-bl', 'image-card-bottom-left'], ['at-bottom', 'image-card-bottom'],
    ['at-br', 'image-card-bottom-right'],
  ];
  for (const [from, to] of pairs) {
    const f = renamed(deck([], [SLIDE(`image spotlight ${from}`)]));
    assert.equal(f.length, 1, from);
    assert.equal(f[0].severity, 'error', from);
    assert.ok(f[0].message.includes(`'${to}'`), `${from}: ${f[0].message}`);
    assert.ok(f[0].replaceLine.includes(` ${to} `), from);
    assert.equal(lintText(deck([], [SLIDE(`image spotlight ${from}`)])).filter((x) => x.rule === 'unknown-class').length, 0, `${from} is reported once, not twice`);
  }
});

test('lint image-card-renamed: `at-*` stays a tint placement off an image slide', () => {
  assert.deepEqual(renamed(deck([], [SLIDE('content tint-corner at-tl')])), []);
  assert.deepEqual(renamed(deck([], [SLIDE('content at-tr')])), [], 'not an image slide: lint cannot say it meant the card');
  assert.deepEqual(renamed(deck([], [SLIDE('image split tint-corner at-tr')])), [], 'a split slide has no card to move');
  assert.equal(renamed(deck([], [SLIDE('content card-soft ink-light')])).length, 2, 'the card-only words are wrong on any slide');
  assert.equal(renamed(deck([], [SLIDE('image spotlight card-o55')])).length, 0, 'a level no class ever painted has no new name');
});

// Beside a tint, `at-*` still places the tint, but on main it moved the card too. The fix ADDS the card's own word,
// so the tint keeps its corner and the card keeps the one it had.
test('lint image-card-renamed: beside a tint, `at-*` is a warning whose fix adds the card placement', () => {
  const [own] = renamed(deck([], [SLIDE('image spotlight tint-corner at-tl')]));
  assert.equal(own.severity, 'warning');
  assert.ok(own.replaceLine.includes('tint-corner at-tl image-card-top-left'), own.replaceLine);
  // The deck's `class: tint-corner` claims a slide's `at-*` just as the slide's own tint does: no rename that strips it.
  const [deckTint] = renamed(deck(['class: tint-corner'], [SLIDE('image spotlight at-tr')]));
  assert.equal(deckTint.severity, 'warning');
  assert.ok(deckTint.replaceLine.includes('at-tr image-card-top-right'), deckTint.replaceLine);
  assert.deepEqual(renamed(deck([], [SLIDE('image spotlight tint-corner at-tr image-card-top-left')])), [], 'the card already has its own placement');
  // Two placements: the stylesheet picked the card's corner, so lint names the choice and does not make it.
  const two = renamed(deck([], [SLIDE('image spotlight tint-corner at-tl tint-edge at-bottom')]));
  assert.equal(two.length, 2);
  assert.ok(two.every((f) => f.severity === 'warning' && !f.autofixable && !f.replaceLine));
  // `band` is no tint word: beside a tint it is still the card's, an error with a rename.
  const band = renamed(deck([], [SLIDE('image statement tint-edge at-bottom band')]));
  assert.deepEqual(band.map((f) => [f.classToken, f.severity]), [['band', 'error'], ['at-bottom', 'warning']]);
  assert.ok(band[0].replaceLine.includes('tint-edge at-bottom image-card-bottom image-card-band'), band[0].replaceLine);
});

test('lint image-card-renamed: `compact` on a card slide is a warning whose fix keeps the card tight', () => {
  const [f] = renamed(deck([], [SLIDE('image spotlight compact')]));
  assert.equal(f.severity, 'warning');
  assert.match(f.fix, /image-card-compact/);
  assert.deepEqual(renamed(deck([], [SLIDE('image spotlight compact image-card-compact')])), []);
  assert.deepEqual(renamed(deck([], [SLIDE('content compact')])), []);
  assert.deepEqual(renamed(deck([], [SLIDE('image clean compact')])), [], 'a clean slide sets its words beside the photo: no card');
  const [auto] = renamed(deck([], [SLIDE('image compact')]));
  assert.equal(auto.severity, 'info', 'with no composition named, lint cannot see whether the photo gets a card');
  assert.ok(auto.replaceLine.includes('compact image-card-compact'));
});

test('lint image-card-renamed: --fix rewrites a whole old slide, and the result lints clean', () => {
  const vocab = buildVocab();
  const before = deck(['image-card: top-right soft'], [
    SLIDE('image spotlight at-bottom band card-o65 ink-light card-sm compact'),
    '<!-- _class: content tint-corner at-tl -->\n\n## Prose.\n\nWords.',
    SLIDE('image statement at-tr card-clear'),
  ]);
  const after = applyAllFixes(before, vocab);
  // --fix also writes each slide's settings as an @meta record (lint-core's meta migration, #3429).
  assert.ok(after.includes('<!-- @meta{layout=image, class=spotlight image-card-bottom image-card-band image-card-65 image-card-light image-card-sm compact image-card-compact} -->'), after);
  assert.ok(after.includes('<!-- @meta{layout=content, class=tint-corner at-tl} -->'), 'the tint slide keeps its at-tl');
  assert.ok(after.includes('<!-- @meta{layout=image, class=statement image-card-top-right image-card-clear} -->'), after);
  assert.ok(after.includes('image-card: top-right soft'), 'the deck line keeps its words');
  assert.deepEqual(renamed(after), []);
  assert.equal(applyAllFixes(after, vocab), after, 'a second --fix changes nothing');
});
