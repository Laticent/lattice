/**
 * BOTH RENDER PATHS HONOR `guards: strict`, AND THEY AGREE (HARD RULE #1).
 *
 * A SEPARATE FILE FROM resolve-guards.test.js because these are different claims.
 * That one pins the kernel's decisions; this one pins that the decisions are
 * actually WIRED. A kernel returning the right answer into a call site nobody
 * added is the defect shape `inline-code-register-paths.test.js` exists for, and
 * `corners:` — the register this one was modeled on — has no such test, which is
 * a gap rather than a precedent.
 *
 * It matters more for this register than for a cosmetic one. `corners:` landing on
 * one path only makes a slide's corner disagree between the PDF and the exported
 * HTML. `guards:` landing on one path only means one of them REMOVES TEXT the
 * other keeps, from the same source, with no signal that the two differ.
 *
 * EVERY CASE CARRIES ITS CONTROL: each arm renders the same deck twice — once
 * strict, once with the key absent — and asserts the difference, because "no
 * guards token" is trivially true of a document that never had one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const { guardsEnabled } = require(path.join(ROOT, 'lib/core/resolve-guards.js'));

const deck = (fm, body) =>
  ['---', 'theme: indaco', ...fm, '---', '', body || '# Deck\n\nSome prose.\n\n---\n\n## Two\n\nMore prose.'].join('\n');

const sectionsOf = (fm, body) => {
  const doc = new JSDOM(latticeEngine.createEngine().render(deck(fm, body)).html).window.document;
  return [...doc.querySelectorAll('section')];
};
const classesOf = (fm, body) => sectionsOf(fm, body).map((s) => s.className.split(/\s+/).filter(Boolean));

test('the engine stamps guards-strict on every slide, and nothing without the key', () => {
  const withKey = classesOf(['guards: strict']);
  const without = classesOf([]);

  assert.ok(withKey.length >= 2, 'expected a multi-slide deck');
  assert.equal(withKey.length, without.length, 'the key must not change the slide count');

  for (const cls of withKey) assert.ok(cls.includes('guards-strict'), `missing on ${cls.join(' ')}`);
  for (const cls of without) assert.ok(!cls.some((c) => c.startsWith('guards-')),
    `a deck without the key must be byte-identical to one written before the register: ${cls.join(' ')}`);
});

test('guards: loose is the baseline and stamps no token', () => {
  for (const cls of classesOf(['guards: loose'])) {
    assert.ok(!cls.some((c) => c.startsWith('guards-')), `loose stamped ${cls.join(' ')}`);
  }
});

test('an unknown value does not silently enable trimming', () => {
  // The failure this guards against: `guards: strictt` resolving to the baseline is
  // fine; resolving to STRICT would trim text the author never asked to have cut.
  for (const cls of classesOf(['guards: strictt'])) {
    assert.ok(!cls.includes('guards-strict'), `a typo enabled trimming: ${cls.join(' ')}`);
  }
});

test('a per-slide guards-loose evicts the deck-wide token rather than sitting beside it', () => {
  // Both rules land at the same specificity, so side-by-side would let CSS source
  // order decide whether this slide keeps its text. The engine must EVICT.
  const body = '# One\n\nProse.\n\n---\n\n<!-- _class: guards-loose -->\n\n## Two\n\nProse.';
  const [first, second] = classesOf(['guards: strict'], body);

  assert.ok(first.includes('guards-strict'), 'the deck token must reach an ordinary slide');
  assert.ok(second.includes('guards-loose'), 'the slide keeps its own opt-out');
  assert.ok(!second.includes('guards-strict'),
    'the deck token must be evicted, not appended beside the opt-out');
});

test('the kernel agrees with what the engine stamped — one answer, not two', () => {
  // `guardsEnabled` is what a render path asks at trim time. If it disagreed with
  // the class the engine wrote, the register would be decorative.
  const body = '# One\n\nProse.\n\n---\n\n<!-- _class: guards-loose -->\n\n## Two\n\nProse.';
  const [first, second] = classesOf(['guards: strict'], body);

  assert.equal(guardsEnabled(first), true);
  assert.equal(guardsEnabled(second), false);
  assert.equal(guardsEnabled(classesOf([])[0]), false);
});

/**
 * ── THE RUNTIME'S OWN MIRROR ────────────────────────────────────────────────
 *
 * Everything above runs through the ENGINE. The runtime keeps its own copy of the
 * deck-register mirror, and the two are wired by hand in two files — so a register
 * added to one and not the other is not a hypothetical: `inline-code:` shipped
 * exactly that way, and the bug was found only because a test booted the real
 * bundle. This arm is that test for `guards:`.
 *
 * Boots the REAL `dist/lattice-runtime.js` over marp-core-shaped markup with the
 * front matter BAKED into the document, which is the shape an export carries
 * (`lib/core/marp-bundle.js`) and the path where the runtime is the only
 * implementation present.
 */

const fs = require('node:fs');
const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));

function renderRuntimeBaked(deckSource, markup) {
  const block = frontMatterBlock(deckSource);
  assert.ok(block, 'anti-vacuity: the baked block must be non-empty, or this is not the baked path');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${markup}${block}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  dom.window.fetch = () => Promise.reject(new Error('baked: no fetch expected'));
  const el = dom.window.document.createElement('script');
  el.textContent = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  dom.window.document.body.appendChild(el);
  return new Promise((r) => setTimeout(() => r(dom.window.document), 1000));
}

const marpShaped = () => '<section class="content"><h2>Two</h2><p>More prose.</p></section>';

test('the RUNTIME stamps guards-strict from a baked block, engine nowhere in the picture', async () => {
  const on = await renderRuntimeBaked(deck(['guards: strict']), marpShaped());
  const off = await renderRuntimeBaked(deck([]), marpShaped());

  const clsOn = [...on.querySelectorAll('section')].map((s) => s.className);
  const clsOff = [...off.querySelectorAll('section')].map((s) => s.className);

  assert.ok(clsOn.length, 'anti-vacuity: the runtime must have left sections in place');
  assert.ok(clsOn.every((c) => c.split(/\s+/).includes('guards-strict')),
    `the runtime's own mirror did not stamp the token: ${clsOn.join(' | ')}`);
  assert.ok(clsOff.every((c) => !/\bguards-/.test(c)),
    `control: a deck without the key must stay clean, got ${clsOff.join(' | ')}`);
});
