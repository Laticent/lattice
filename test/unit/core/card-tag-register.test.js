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

test('lint: a comment-only value is silent (tag: and backdrop: alike)', () => {
  const found = (fm) => lintText(deck(fm)).filter((f) => f.rule === 'unknown-tag' || f.rule === 'unknown-backdrop');
  assert.deepEqual(found(['tag: # todo', 'backdrop: # todo']), []);
});

test('lint: two words on one axis on a slide conflict; one word per axis is clean', () => {
  const conflicts = (cls) => lintText(`---\ntheme: indaco\n---\n\n<!-- _class: cards-grid ${cls} -->\n\n## A\n\n1. B\n   - c\n`)
    .filter((f) => f.rule === 'conflicting-variants').map((f) => f.classToken);
  assert.deepEqual(conflicts('tag-plain tag-none'), ['tag-none']);
  assert.deepEqual(conflicts('tag-small tag-large'), ['tag-large']);
  assert.deepEqual(conflicts('tag-plain tag-large'), []);
});

test('css: list-steps capsule reads the card-tag pair and size, so the register reaches it', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/components/progression/list-steps/list-steps.styles.css'), 'utf8');
  const pill = css.match(/section\.list-steps\.capsule ol > li::before\s*\{([^}]*)\}/);
  assert.ok(pill, 'the capsule pill rule exists');
  assert.match(pill[1], /background:\s*var\(--card-tag-fill/);
  assert.match(pill[1], /color:\s*var\(--card-tag-ink/);
  assert.match(pill[1], /font-size:\s*var\(--card-tag-fs\)/);
  // The categorical cycle sets the pair on the CARD (so a register word on the pill wins),
  // never on the pill itself.
  assert.doesNotMatch(css, /capsule ol > li:nth-child\([^)]*\)::before\s*\{[^}]*background/);
  assert.match(css, /capsule ol > li:nth-child\(8n\+1\)\s*\{\s*--card-tag-fill:\s*var\(--cat-1-fill\)/);
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

/* ── tag-budget: a label fits one line of its tag, for the cards in its row ─────────── */

const budgetDeck = (cls, labels, fm = []) => ['---', 'theme: indaco', ...fm, '---', '', `<!-- _class: ${cls} -->`, '', '## A',
  '', ...labels.flatMap((l) => [`- ${l}`, '  - body']), ''].join('\n');
const overBudget = (...args) => lintText(budgetDeck(...args)).filter((f) => f.rule === 'tag-budget');

test('lint: the one-line budget follows the card count and the tag size', () => {
  const { tagLineBudget } = require(path.join(ROOT, 'lib/authoring/lint-core.js'));
  assert.deepEqual([2, 3, 4].map((n) => tagLineBudget(n, 1)), [49, 33, 24]);
  assert.deepEqual([2, 3, 4].map((n) => tagLineBudget(n, 1.2)), [40, 27, 20]);
  assert.equal(tagLineBudget(6, 1), 16, 'a wider row scales the 4-card figure down');
  const long = 'Why not buy from either shortlisted vendor';   // 42 characters, the owner's screenshot
  assert.equal(overBudget('decision', ['Build', long, 'Why not delay']).length, 1, '3 cards: 33 fit, 42 wraps');
  assert.match(overBudget('decision', ['Build', long, 'Why not delay'])[0].message, /one line holds 33 with 3 cards/);
  assert.equal(overBudget('decision', ['Build', long]).length, 0, '2 cards: 49 fit');
  assert.equal(overBudget('decision tag-large', ['Build', 'x'.repeat(28), 'y']).length, 1, 'tag-large: 27 fit');
  assert.equal(overBudget('decision', ['Build', 'x'.repeat(28), 'y'], ['tag: large']).length, 1, 'the deck tag: size counts');
  assert.equal(overBudget('decision tag-regular', ['Build', 'x'.repeat(28), 'y'], ['tag: large']).length, 0,
    'a slide size word evicts the deck\'s');
});

test('lint: a band gets two lines; axis labels and other layouts are not tags', () => {
  const long = 'Why not buy from either shortlisted vendor';
  assert.equal(overBudget('decision banner-tag', ['Build', long, 'Why not delay']).length, 0, '42 fits two lines of 33');
  assert.equal(overBudget('decision banner-tag', ['Build', 'x'.repeat(67), 'y']).length, 1);
  assert.equal(overBudget('compare-prose axis', ['x'.repeat(60), 'y']).length, 0);
  assert.equal(overBudget('cards-grid', ['x'.repeat(60), 'y']).length, 0);
  // A list item with no body is not a tag.
  assert.equal(lintText(['---', 'theme: indaco', '---', '', '<!-- _class: decision -->', '', '## A', '',
    `- ${'x'.repeat(60)}`, '- y', ''].join('\n')).filter((f) => f.rule === 'tag-budget').length, 0);
});

test('lint: tag-budget reads what renders, not the raw source', () => {
  // A deck `class: decision` is refused by the engine, so a cards-grid slide is not a decision.
  const refused = ['---', 'theme: indaco', 'class: decision', '---', '', '<!-- _class: cards-grid -->', '', '## A', '',
    `- ${'x'.repeat(60)}`, '  - body', '- y', '  - body', ''].join('\n');
  assert.equal(lintText(refused).filter((f) => f.rule === 'tag-budget').length, 0);
  // A link counts by its text.
  assert.equal(overBudget('decision', ['[Build](https://example.com/a/very/long/path/that/is/not/the/label)', 'y', 'z']).length, 0);
  // A lazy continuation line is prose, so the item lifts no tag.
  const lazy = ['---', 'theme: indaco', '---', '', '<!-- _class: decision -->', '', '## A', '',
    `- ${'x'.repeat(60)}`, '  continued prose', '- y', '  - body', ''].join('\n');
  assert.equal(lintText(lazy).filter((f) => f.rule === 'tag-budget').length, 0);
});

test('lint: tag-budget follows the label lift — continuation lines, tab indents, tag-small', () => {
  const { tagLineBudget } = require(path.join(ROOT, 'lib/authoring/lint-core.js'));
  const deckOf = (body) => ['---', 'theme: indaco', '---', '', '<!-- _class: decision -->', '', '## A', '', ...body, ''].join('\n');
  const found = (body) => lintText(deckOf(body)).filter((f) => f.rule === 'tag-budget');
  // A lazy continuation line joins the label the engine lifts, so it counts.
  assert.equal(found(['- Short label', '  and a lazy continuation that runs long', '  - body', '- y', '  - body', '- z', '  - body']).length, 1);
  // A nested list indented by a tab still makes a tag.
  assert.equal(found([`- ${'x'.repeat(40)}`, '\t- body', '- y', '\t- body', '- z', '\t- body']).length, 1);
  // A small tag holds more: 33 / 0.85 = 38 characters with 3 cards.
  assert.equal(tagLineBudget(3, 0.85), 38);
  const small = ['---', 'theme: indaco', '---', '', '<!-- _class: decision tag-small -->', '', '## A', '',
    `- ${'x'.repeat(36)}`, '  - body', '- y', '  - body', '- z', '  - body', ''].join('\n');
  assert.equal(lintText(small).filter((f) => f.rule === 'tag-budget').length, 0);
});
