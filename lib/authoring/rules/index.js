// The `deck` ruleset (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §3): every deck lint rule, as a
// Squadra code rule on `lattice-deck`'s tree. One folder per family, one file per rule, its fixtures beside it as
// `<rule>.fixtures.md`, which the build reads (./examples.js) and the browser never loads.
//
// Families join one commit each (the plan's §7 step 4), each with its reference diff at 0 or explained:
// front-matter registers; directives and notes; class tokens and components; cards and lists; inline spans; charts;
// capacity and fit; panes; glyphs; plugins; the rest. Until the first lands, the ruleset holds no rule and lint-core
// still answers every consumer.
//
// Pure and fs-free: the Studio bundles this list.

/** Each family module exports `{ rules }`. */
const FAMILIES = [];

/** Every rule of the ruleset, in family order. */
const RULES = FAMILIES.flatMap((f) => f.rules);

/** The ruleset's name (every rule id is `deck/<name>`) and version. */
const NAME = 'deck';
const VERSION = '1';

module.exports = { NAME, VERSION, RULES };
