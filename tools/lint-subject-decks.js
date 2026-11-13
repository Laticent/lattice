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
    file: 'examples/web-images.md',
    rule: 'web-image',
    why: 'the demo deck for web images: it shows the placeholder an image from another site becomes, so every slide that carries one is the point (security spine S1)',
  },
  {
    file: 'examples/styles-device-check.md',
    rule: 'web-image',
    why: 'its "A blocked web image" slide checks the placeholder on each device, so the web image is the point (security spine S1)',
  },
  {
    file: 'examples/plugin-sandbox-tour.md',
    rule: 'web-image',
    why: 'its "clickable task" slides show Mermaid `click` links to a web page; the renderer counts a diagram address as a web reference, so the warning that says so is the point (security spine S2)',
  },
  // `empty-section` (two dividers in a row) became a warning on 2026-11-08
  // (engineering/decisions/2026-11-08-anchor-chrome.md). These decks stack dividers on purpose:
  {
    file: 'lib/components/anchor/divider/divider.gallery.md',
    rule: 'empty-section',
    why: 'the divider\'s own specimen gallery: it shows each variant back to back, so consecutive dividers are the point',
  },
  {
    file: 'examples/divider-numbered.md',
    rule: 'empty-section',
    why: 'it shows a dark and a light numbered divider in a row continuing one count, so the two dividers side by side are the point',
  },
  {
    file: 'examples/deck-logo-canvas.md',
    rule: 'empty-section',
    why: 'it shows the logo on a dark divider and on a `divider light` side by side, one canvas each, so the pair is the point',
  },
  {
    file: 'test/integration/baseline-decks/gallery.md',
    rule: 'empty-section',
    why: 'a long-running baseline gallery (HARD RULE #8): its divider specimens sit together and its PDF page count is a baseline, so restructuring it is a separate graduation commit, not this rule\'s',
  },
  {
    file: 'lib/components/legal/legal.gallery.md',
    rule: 'empty-section',
    why: 'a component specimen gallery: its `divider light` is the gallery\'s lede, not a section, and the gallery has no section rail to mislead',
  },
]);

/** Is this finding on `rel` (a repo-relative path) one its deck is sanctioned to carry? */
function isSubjectFinding(rel, rule) {
  return SANCTIONED_SUBJECT_DECKS.some((d) => d.file === rel && d.rule === rule);
}

module.exports = { SANCTIONED_SUBJECT_DECKS, isSubjectFinding };
