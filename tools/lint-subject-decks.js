/**
 * lint-subject-decks — the decks whose lint warning IS their subject, and the one rule each is
 * exempt from.
 *
 * A demo deck that shows what a chart does with a mistyped value has to carry the mistyped value,
 * so the rule that names it fires by design. Coaching the deck to fix it would delete what it
 * demonstrates. Each entry exempts ONE deck from ONE rule; every other rule still applies.
 *
 * Read, never repeated (HARD RULE #1), by every consumer that would otherwise fail on it:
 *   - tools/lint-deck.js (`--strict`, so `lint:deck:all` in CI and the pre-commit hook)
 *   - test/unit/components/lint-deck.test.js (the lint-clean corpus test, which also fails on a
 *     stale entry: a sanctioned rule that no longer fires on its deck)
 *   - tools/score-variance.js (the craft-variance corpus, which assumes lint-clean decks)
 *
 * The typed-glyph decks have their own list, SANCTIONED_GLYPH_DECKS in tools/check-ownership.js,
 * because the ownership gate also counts their glyphs against a budget.
 */
const SANCTIONED_SUBJECT_DECKS = Object.freeze([
  {
    file: 'examples/chart-malformed-numbers.md',
    rule: 'chart-value-malformed',
    why: 'the demo deck for followups.d/2609-p2: it shows a chart drawing no value for `--5`, `(840` and `1,2,3`, so the warning is the point',
  },
  {
    file: 'examples/bg-split-ratio.md',
    rule: 'bg-ratio-unread',
    why: 'the demo deck for followups.d/2739-p4: it shows `![bg left:40%]` keeping its panel at the layout\'s own share, so the note that the ratio is not read is the point',
  },
]);

/** Is this finding on `rel` (a repo-relative path) one its deck is sanctioned to carry? */
function isSubjectFinding(rel, rule) {
  return SANCTIONED_SUBJECT_DECKS.some((d) => d.file === rel && d.rule === rule);
}

module.exports = { SANCTIONED_SUBJECT_DECKS, isSubjectFinding };
