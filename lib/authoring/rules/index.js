// The `deck` ruleset: the deck lint rules that have moved out of lib/authoring/lint-core.js into Squadra
// (decision 2026-10-26-squadra-lint-library, design.md §15.2 and §15.3). Every rule here runs on
// `lattice-deck` (lib/authoring/squadra/deck-language.js), carries its own fixtures (a bad example it
// must report, a good one it must not, and for a fixable rule the fixed text), and names the lint-core id
// it replaced in `legacy`. lib/authoring/squadra/deck-rules.js compiles them and hands their findings to
// lint-core in the record every consumer already reads.
//
// Browser-safe like lint-core (no fs): the Studio bundles this folder, so a rule's fixtures are a string
// in its own module rather than a file read at run time.
//
// To migrate a rule: write it here, delete its lint-core detector and call the ruleset where the detector
// was called, and add its id to test/unit/authoring/squadra-migration.test.js, which holds the rule to the
// lint-core detector it replaced on three corpora (design §15.3).

const MODULES = [require('./tag-alias'), require('./say-key-case')];

const RULES = MODULES.map((m) => m.squadraRule);
const EXAMPLES = Object.fromEntries(MODULES.map((m) => [m.file, m.fixtures]));

module.exports = { RULES, EXAMPLES };
