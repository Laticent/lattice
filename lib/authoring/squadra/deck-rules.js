// The `deck` ruleset inside lint-core (decision 2026-10-26-squadra-lint-library, design.md §15.4): the rules
// that have migrated to Squadra run here, on `lattice-deck`, and their findings come back in the record every
// consumer of lint-core already reads. This file is the legacy-shape adapter the bridge's notes promised
// would land with the first migrated rule.
//
// THE RECORD. A Squadra finding becomes `{ slide, rule, severity, classToken, line, message, fix }`, with
// `rule` the lint-core id the rule names in `legacy`, so `'tag-alias'` comparisons keep matching while
// `deck/tag-alias` is the Squadra id. A rule passes what lint-core's record carried and a span cannot say in
// its `data`: the slide number as lint-core counted it, the `line` text consumers anchor on, `classToken`,
// `didYouMean`. Without them the adapter falls back to the finding's location and the trimmed text of its
// span's first line.
//
// THE FIX. A `safe` fix whose edits stay on one line becomes `replaceLine`, the whole line rewritten, so
// lint-core's `applyFix` (the Studio's and the Playground's quick fix) and the bridge's fix path ("Fix all",
// `lint:deck --fix`, through the driver's checks) apply it with no new code. It is only offered when that line
// is the one `applyFix` will find from the record's `line`; otherwise the finding keeps its report and offers
// no fix, because a fix that cannot land would read as a refusal in the Fix-all notice. A fix that spans lines
// waits for the bridge to read Squadra fixes directly.
//
// WHERE IT RUNS. lint-core calls `deckRuleFindings(source, id)` where each migrated detector used to be
// called, on the same text the detector read (front matter folded, heading splits baked), so the slide numbers
// and the order of findings are the ones the detector produced. One lint per source text, memoized, however
// many migrated rules ask.
//
// The ruleset compiles once, on first use: every rule's fixtures run then (design §8), and a rule whose
// examples fail is refused, which throws here, because a deck rule that cannot prove itself must fail the
// build, not drop out of the Studio silently.
//
// Pure and fs-free like lint-core, because the Studio bundles it.

const { compileRuleset, lint } = require('@laticent/squadra');
const { latticeDeck, LANGUAGE } = require('./deck-language');
const { RULES, EXAMPLES } = require('../rules');

let ruleset = null;

/** The compiled `deck` ruleset (strict: a refused rule throws). */
function deckRuleset() {
  if (!ruleset) ruleset = compileRuleset({ name: 'deck', version: '1', languages: [latticeDeck], rules: RULES, examples: EXAMPLES });
  return ruleset;
}

/** The lint-core ids that have moved to Squadra. */
const MIGRATED = new Set(RULES.map((r) => r.legacy));

/** The line holding `offset` in `text`: `[from, to)`, `to` at its `\n` (or the end). */
function lineOf(text, offset) {
  const from = text.lastIndexOf('\n', offset - 1) + 1;
  const nl = text.indexOf('\n', offset);
  return { from, to: nl < 0 ? text.length : nl };
}

/** A safe one-line fix as the line it leaves, or null. */
function replaceLineOf(text, finding, line) {
  const f = finding.fixes.find((x) => x.safety === 'safe' && Array.isArray(x.edits) && x.edits.length);
  if (!f || line == null) return null;
  const at = lineOf(text, f.edits[0].from);
  if (f.edits.some((e) => e.from < at.from || e.to > at.to || e.text.includes('\n'))) return null;
  const old = text.slice(at.from, at.to);
  // `applyFix` finds the line by its trimmed text; a fix it would put on another line is no fix.
  if (old.trim() !== String(line).trim()) return null;
  let out = old;
  for (const e of [...f.edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from - at.from) + e.text + out.slice(e.to - at.from);
  return out.replace(/\r$/, '');
}

/** One Squadra finding as lint-core's record. */
function toLegacy(text, finding) {
  const d = finding.data || {};
  const firstLine = text.slice(finding.span.from, finding.span.to).split('\n')[0].trim();
  const line = d.line !== undefined ? d.line : firstLine;
  const slide = typeof d.slide === 'number' ? d.slide : typeof finding.location?.slide === 'number' ? finding.location.slide : 0;
  const out = {
    slide,
    rule: finding.legacy || finding.rule,
    severity: finding.severity,
    ...(d.classToken !== undefined ? { classToken: d.classToken } : {}),
    line,
    message: finding.message,
    ...(finding.hint ? { fix: finding.hint } : {}),
  };
  const replaceLine = replaceLineOf(text, finding, line);
  if (replaceLine != null) {
    out.autofixable = true;
    out.replaceLine = replaceLine;
    if (d.didYouMean) out.didYouMean = d.didYouMean;
  }
  return out;
}

let memo = { text: null, findings: [] };

/** Every finding the `deck` ruleset makes on `source`, as lint-core records. */
function allDeckRuleFindings(source) {
  const text = String(source ?? '');
  if (memo.text !== text) {
    const res = lint(deckRuleset(), [{ path: 'deck.md', text, language: LANGUAGE }]);
    memo = { text, findings: res.findings.map((f) => toLegacy(text, f)) };
  }
  return memo.findings;
}

/** The findings of the migrated rule `id` (its lint-core id), in document order. */
function deckRuleFindings(source, id) {
  return allDeckRuleFindings(source).filter((f) => f.rule === id || (f.rule.startsWith('squadra/') && id === FIRST));
}
// Squadra's own findings (a rule that threw or passed its budget) ride with the first migrated rule, so they are
// reported once per lint and never dropped.
const FIRST = RULES[0].legacy;

module.exports = { deckRuleFindings, allDeckRuleFindings, deckRuleset, toLegacy, MIGRATED };
