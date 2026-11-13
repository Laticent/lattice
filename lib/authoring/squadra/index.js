// The Lattice entry to Squadra (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §3, §3.3): lint a deck
// and fix it with the `deck` ruleset on `lattice-deck`'s tree. Every consumer (the Studio, the Playground, Coach,
// `lint:deck`, the CLI, the conformance kinds) reads what these two return, Squadra's `Finding`, as their families
// move off lint-core.
//
//   lintDeck(source, opts)  → Finding[]   rule, severity, span, start/end, location.slide, message, hint, fixes, data
//   fixDeck(source, opts)   → FixResult   Squadra's fix driver with the `edits` engine: { text, applied, skipped,
//                                         passes, remaining }
//
// opts: `vocab` (lint's vocabulary, `buildVocab`; the vocab bridge turns it into the ruleset's), `only` (rule ids or
// globs), `minSeverity`, `safety` (fixDeck: `safe`, the default, `suggested` or `unsafe` with `only`), `path`.
//
// THE RUNTIME, NOT THE COMPILER. The ruleset loads through `@laticent/squadra/runtime`, which keeps a rule only when its
// digest matches the one the build recorded (lib/authoring/rules/verified.generated.json, written by
// tools/build-squadra-stamps.js after it compiled every rule against its fixtures). So this entry ships to the browser
// with no compiler and no fixtures, and a rule the build did not verify is reported as `squadra/rule-refused`, never
// run.
//
// One ruleset per vocabulary object, kept in a WeakMap: it holds no answer, only the loaded rules.
//
// Pure and fs-free, because the Studio bundles it.

const { fix, lint, loadRuleset } = require('@laticent/squadra/runtime');
const { NAME, RULES, VERSION } = require('../rules');
const VERIFIED = require('../rules/verified.generated.json');
const { latticeDeck } = require('./lattice-deck');
const { squadraVocab } = require('./vocab');

const NO_VOCAB = {};
const rulesets = new WeakMap();

/** The `deck` ruleset for a lint vocabulary, loaded against the build's digests. */
function deckRuleset(vocab = NO_VOCAB, { rules = RULES, verified = VERIFIED.digests } = {}) {
  const custom = rules !== RULES || verified !== VERIFIED.digests;
  let rs = custom ? null : rulesets.get(vocab);
  if (!rs) {
    rs = loadRuleset({ name: NAME, version: VERSION, languages: [latticeDeck], rules, vocab: squadraVocab(vocab), verified });
    if (!custom) rulesets.set(vocab, rs);
  }
  return rs;
}

function sourceOf(source, opts) {
  return { path: opts.path ?? 'deck.md', text: String(source ?? ''), language: latticeDeck.id };
}

/** Lint one deck source. */
function lintDeck(source, opts = {}) {
  const rs = opts.ruleset ?? deckRuleset(opts.vocab);
  return lint(rs, [sourceOf(source, opts)], { only: opts.only, minSeverity: opts.minSeverity }).findings;
}

/** Fix one deck source: every finding's first fix at or under `opts.safety`, through the fix driver. */
function fixDeck(source, opts = {}) {
  const rs = opts.ruleset ?? deckRuleset(opts.vocab);
  return fix(rs, sourceOf(source, opts), { safety: opts.safety, only: opts.only });
}

module.exports = { lintDeck, fixDeck, deckRuleset, LANGUAGE: latticeDeck.id };
