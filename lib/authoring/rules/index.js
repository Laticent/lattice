// The `deck` ruleset (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §3): every deck lint rule, as a
// Squadra code rule on `lattice-deck`'s tree. One folder per family; a rule is a file, or a row of its family's table
// when the family's rules share one shape (front-matter/). Fixtures sit beside them as `<rule>.fixtures.md`, which the
// build reads (./examples.js) and the browser never loads.
//
// Families join one commit each (the plan's §7 step 4), each with its reference diff at 0 or explained:
// front-matter registers; directives and notes; class tokens and components; cards and lists; inline spans; charts;
// capacity and fit; panes; glyphs; plugins; the rest. No consumer reads these until step 5: lint-core still answers
// every one, and the rules here are held to it by `npm run squadra:reference-diff`.
//
// Pure and fs-free: the Studio bundles this list.

/** Each family module exports `{ rules }`. */
const FAMILIES = [require('./front-matter')];

/** Every rule of the ruleset, in family order. */
const RULES = FAMILIES.flatMap((f) => f.rules);

/** The ruleset's name (every rule id is `deck/<name>`) and version. */
const NAME = 'deck';
const VERSION = '1';

module.exports = { NAME, VERSION, RULES };
