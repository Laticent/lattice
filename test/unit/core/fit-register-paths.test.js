/**
 * BOTH RENDER PATHS HONOR `fit: trim`, AND THEY AGREE (HARD RULE #1).
 *
 * A SEPARATE FILE FROM resolve-fit.test.js because these are different claims.
 * That one pins the kernel's decisions; this one pins that the decisions are
 * actually WIRED. A kernel returning the right answer into a call site nobody
 * added is the defect shape `inline-code-register-paths.test.js` exists for, and
 * `corners:` — the register this one was modeled on — has no such test, which is
 * a gap rather than a precedent.
 *
 * It matters more for this register than for a cosmetic one. `corners:` landing on
 * one path only makes a slide's corner disagree between the PDF and the exported
 * HTML. `fit:` landing on one path only means one of them REMOVES TEXT the
 * other keeps, from the same source, with no signal that the two differ.
 *
 * EVERY CASE CARRIES ITS CONTROL: each arm renders the same deck twice — once
 * trim, once with the key absent — and asserts the difference, because "no
 * fit token" is trivially true of a document that never had one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const { trimEnabled } = require(path.join(ROOT, 'lib/core/resolve-fit.js'));

const deck = (fm, body) =>
  ['---', 'theme: indaco', ...fm, '---', '', body || '# Deck\n\nSome prose.\n\n---\n\n## Two\n\nMore prose.'].join('\n');

const sectionsOf = (fm, body) => {
  const doc = new JSDOM(latticeEngine.createEngine().render(deck(fm, body)).html).window.document;
  return [...doc.querySelectorAll('section')];
};
const classesOf = (fm, body) => sectionsOf(fm, body).map((s) => s.className.split(/\s+/).filter(Boolean));

test('the engine stamps fit-trim on every slide, and nothing without the key', () => {
  const withKey = classesOf(['fit: trim']);
  const without = classesOf([]);

  assert.ok(withKey.length >= 2, 'expected a multi-slide deck');
  assert.equal(withKey.length, without.length, 'the key must not change the slide count');

  for (const cls of withKey) assert.ok(cls.includes('fit-trim'), `missing on ${cls.join(' ')}`);
  for (const cls of without) assert.ok(!cls.some((c) => c.startsWith('fit-')),
    `a deck without the key must be byte-identical to one written before the register: ${cls.join(' ')}`);
});

test('fit: heal is the baseline and stamps no token', () => {
  for (const cls of classesOf(['fit: heal'])) {
    assert.ok(!cls.some((c) => c.startsWith('fit-')), `heal stamped ${cls.join(' ')}`);
  }
});

test('an unknown value does not silently enable trimming', () => {
  // The failure this guards against: `fit: trimm` resolving to the baseline is fine;
  // resolving to TRIM would cut text the author never asked to have cut.
  for (const cls of classesOf(['fit: trimm'])) {
    assert.ok(!cls.includes('fit-trim'), `a typo enabled trimming: ${cls.join(' ')}`);
  }
});

test('the retired guards: spelling stamps nothing (renames decision D2)', () => {
  // Control: the same deck with `fit: trim` does stamp, so "nothing" is not vacuous.
  assert.ok(classesOf(['fit: trim'])[0].includes('fit-trim'));
  for (const cls of classesOf(['guards: strict'])) {
    assert.ok(!cls.some((c) => c.startsWith('guards-') || c.startsWith('fit-')), `guards: strict stamped ${cls.join(' ')}`);
  }
});

test('a per-slide fit-heal evicts the deck-wide token rather than sitting beside it', () => {
  // Both rules land at the same specificity, so side-by-side would let CSS source
  // order decide whether this slide keeps its text. The engine must EVICT.
  const body = '# One\n\nProse.\n\n---\n\n<!-- _class: fit-heal -->\n\n## Two\n\nProse.';
  const [first, second] = classesOf(['fit: trim'], body);

  assert.ok(first.includes('fit-trim'), 'the deck token must reach an ordinary slide');
  assert.ok(second.includes('fit-heal'), 'the slide keeps its own opt-out');
  assert.ok(!second.includes('fit-trim'),
    'the deck token must be evicted, not appended beside the opt-out');
});

test('the kernel agrees with what the engine stamped — one answer, not two', () => {
  // `trimEnabled` is what a render path asks at trim time. If it disagreed with
  // the class the engine wrote, the register would be decorative.
  const body = '# One\n\nProse.\n\n---\n\n<!-- _class: fit-heal -->\n\n## Two\n\nProse.';
  const [first, second] = classesOf(['fit: trim'], body);

  assert.equal(trimEnabled(first), true);
  assert.equal(trimEnabled(second), false);
  assert.equal(trimEnabled(classesOf([])[0]), false);
});

/**
 * ── THE RUNTIME'S OWN MIRROR ────────────────────────────────────────────────
 *
 * Everything above runs through the ENGINE. The runtime keeps its own copy of the
 * deck-register mirror, and the two are wired by hand in two files — so a register
 * added to one and not the other is not a hypothetical: `inline-code:` shipped
 * exactly that way, and the bug was found only because a test booted the real
 * bundle. This arm is that test for `fit:`.
 *
 * Boots the REAL `dist/lattice-runtime.js` over marp-core-shaped markup with the
 * front matter BAKED into the document, which is the shape an export carries
 * (`lib/export/marp-bundle.js`) and the path where the runtime is the only
 * implementation present.
 */

const fs = require('node:fs');
const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));

/**
 * The bundle is a BUILD ARTIFACT, so this arm silently tests stale code when
 * `dist/lattice-runtime.js` predates the register. That is not hypothetical — it
 * produced one confusing failure while this test was being written, where the
 * source had the register and the bundle did not. Fail loudly and name the fix.
 *
 * CONTENT, NOT MTIME. The first version of this guard compared modification
 * times, and a rebase rewrites a source file's mtime without changing a byte of
 * it — so it went red on a tree whose bundle was perfectly current. A timestamp
 * is not the claim; "does the built bundle actually contain this register?" is,
 * and it is immune to checkout order, rebases and clock skew alike.
 */
function assertBundleFresh() {
  const bundle = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  assert.ok(bundle.includes('fit-trim'),
    `dist/lattice-runtime.js does not carry the fit register, so this arm would ` +
    `test stale code. Run \`npm run runtime:build\` (or \`npm run build\`) and re-run.`);
}

function renderRuntimeBaked(deckSource, markup) {
  assertBundleFresh();
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

test('the RUNTIME stamps fit-trim from a baked block, engine nowhere in the picture', async () => {
  const on = await renderRuntimeBaked(deck(['fit: trim']), marpShaped());
  const off = await renderRuntimeBaked(deck([]), marpShaped());
  const old = await renderRuntimeBaked(deck(['guards: strict']), marpShaped());

  const clsOn = [...on.querySelectorAll('section')].map((s) => s.className);
  const clsOff = [...off.querySelectorAll('section')].map((s) => s.className);
  const clsOld = [...old.querySelectorAll('section')].map((s) => s.className);

  assert.ok(clsOn.length, 'anti-vacuity: the runtime must have left sections in place');
  assert.ok(clsOn.every((c) => c.split(/\s+/).includes('fit-trim')),
    `the runtime's own mirror did not stamp the token: ${clsOn.join(' | ')}`);
  assert.ok(clsOff.every((c) => !c.split(/\s+/).some((t) => t.startsWith('fit-'))),
    `control: a deck without the key must stay clean, got ${clsOff.join(' | ')}`);
  assert.ok(clsOld.every((c) => !c.split(/\s+/).some((t) => t.startsWith('fit-') || t.startsWith('guards-'))),
    `the retired guards: spelling must stamp nothing in the runtime either, got ${clsOld.join(' | ')}`);
});
