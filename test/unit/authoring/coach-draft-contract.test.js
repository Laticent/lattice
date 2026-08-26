/**
 * Contract on a DRAFT, end to end through the REAL linter.
 *
 * Why this file exists, separately from the scorecard's own unit tests: the decision
 * record and PR #1877 rest on a measured claim — that `Contract`'s 0.0% variance across
 * the committed corpus is an artifact of `lint:deck:all --strict` gating that corpus
 * lint-clean, and that on the population the Studio Coach actually scores (a draft,
 * re-scored per keystroke) the category discriminates. The evidence quoted for that was a
 * live Studio session whose artifact was not kept, which under HARD RULE #23 is a surface
 * without an artifact — a reviewer opening the PR could not check it.
 *
 * So the readings are pinned here instead, against `lintText` + `reviewText` + `scoreDeck`
 * rather than hand-built finding objects. That closes the gap the scorecard unit tests
 * cannot: they inject `{ rule: 'x', severity: 'warning' }` directly, so nothing there
 * notices if the real linter stops classifying a half-typed class name as a WARNING or an
 * unterminated comment as an ERROR — at which point the documented numbers silently stop
 * describing the shipped behavior.
 *
 * These two drafts are literal keystroke states of writing the deck below, not adversarial
 * constructions: you cannot type `comparison` without passing through `compar`, and an
 * unterminated comment is what exists between typing `<!--` and typing `-->`.
 */

const test = require('node:test');
const assert = require('node:assert');

const { lintText, buildVocab } = require('../../../lib/authoring/lint');
const { reviewText } = require('../../../lib/authoring/review-core');
const { scoreDeck } = require('../../../lib/authoring/scorecard');
const { loadAll } = require('../../../lib/components');

const comps = loadAll();
const bucketOf = (n) => comps.find((c) => c.name === n)?.bucket ?? null;
const densityOf = (n) => comps.find((c) => c.name === n)?.density ?? null;
const vocab = buildVocab();

const HEAD = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# Q3 plan\n\nWhere we are.\n';
const SLIDE = '## Revenue held at plan\n\nThe quarter closed on target.\n';

const score = (src) => {
  const lint = lintText(src, vocab) || [];
  const review = reviewText(src, { bucketOf, densityOf });
  const card = scoreDeck({ source: src, lintFindings: lint, reviewFindings: review });
  return { lint, contract: card.categories.find((c) => c.key === 'contract').score, craft: card.craft.score };
};

test('a finished, lint-clean draft reads Contract 100', () => {
  const r = score(`${HEAD}\n---\n\n<!-- _class: content -->\n\n${SLIDE}`);
  assert.deepEqual(r.lint, [], 'the reference draft must be lint-clean');
  assert.equal(r.contract, 100);
  assert.equal(r.craft, 100);
});

test('a half-typed class name is a WARNING and reads Contract 93', () => {
  const r = score(`${HEAD}\n---\n\n<!-- _class: compar -->\n\n${SLIDE}`);
  assert.deepEqual(
    r.lint.map((f) => [f.rule, f.severity]),
    [['unknown-class', 'warning']],
    'the real linter must still classify this as a warning — the 93 depends on it',
  );
  assert.equal(r.contract, 93, 'the reading quoted in the decision record and on the live Coach');
});

test('an unterminated comment is an ERROR and reads Contract 71', () => {
  const r = score(`${HEAD}\n---\n\n<!-- _class: content\n\n${SLIDE}`);
  assert.deepEqual(
    r.lint.map((f) => [f.rule, f.severity]),
    [['unterminated-comment', 'error']],
    'the real linter must still classify this as an error — the 71 depends on it',
  );
  assert.equal(r.contract, 71, 'the reading quoted in the decision record and on the live Coach');
});

test('Contract separates these draft states — it is not a constant off the corpus', () => {
  const clean = score(`${HEAD}\n---\n\n<!-- _class: content -->\n\n${SLIDE}`).contract;
  const warned = score(`${HEAD}\n---\n\n<!-- _class: compar -->\n\n${SLIDE}`).contract;
  const errored = score(`${HEAD}\n---\n\n<!-- _class: content\n\n${SLIDE}`).contract;
  assert.ok(errored < warned && warned < clean, `${errored} < ${warned} < ${clean}`);
  // The whole point of the correction: the spread on a draft is wide, where the committed
  // corpus shows exactly zero spread (100 on all 198).
  assert.ok(clean - errored >= 25, `a draft must move Contract materially (moved ${clean - errored})`);
});

test('and Craft moves with it, so the draft signal reaches the grade', () => {
  const clean = score(`${HEAD}\n---\n\n<!-- _class: content -->\n\n${SLIDE}`).craft;
  const errored = score(`${HEAD}\n---\n\n<!-- _class: content\n\n${SLIDE}`).craft;
  assert.ok(errored < clean, `Craft must fall with Contract (${errored} vs ${clean})`);
});
