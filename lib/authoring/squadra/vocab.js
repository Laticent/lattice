// The vocab bridge: lint's vocabulary (`buildVocab`, lib/authoring/lint.js, built from the component manifests and
// the register tables) as a Squadra ruleset vocabulary, `name → string[]` (decision 2026-11-13 §3).
//
// Squadra's vocabulary is lists of names, because a rule declares the lists it reads (`reads.vocab`) and the
// verified stamp hashes each one. So every field of the lint vocabulary that is a list of strings (a Set or an array)
// crosses as a sorted array, and the sort makes the stamp independent of the order a manifest loaded in. The
// structured fields (`capacity`, `paneSpec`, `exclusiveAxes`, the register axes) do not cross yet: they join as the
// families that read them move, in whatever list shape those rules need, so the stamp hashes what a rule reads and
// nothing it does not.
//
// Pure: the Studio builds its vocabulary from the same manifests and passes it in.

// EXCEPT a register's names, which keep their authored order. The order is the register's own (a code constant, the
// default first, never a manifest's load order, so the stamp stays stable), and two things read it: a rule's hint lists
// the names in it ("Use one of: framed, quiet, hero, bleed"), and the did-you-mean picks the FIRST name at the best edit
// distance, so sorting a register's names moved a typo's suggestion to a different word.
const ORDERED = new Set([
  'finishNames', 'modeNames', 'claimNames', 'stampStyleNames', 'toneStyleNames',
  'ruleNames', 'eyebrowNames', 'headlineNames',
  'cornersNames', 'liftNames', 'splitNames', 'inlineCodeNames', 'venueNames', 'presetNames', 'paceNames',
  'deliveryNames', 'colorModeNames',
]);

/** The list-of-strings fields of a lint vocabulary, each as an array: sorted, or a register's names in their order. */
function squadraVocab(vocab) {
  const out = {};
  for (const [key, v] of Object.entries(vocab ?? {})) {
    const list = v instanceof Set ? [...v] : Array.isArray(v) ? v : null;
    if (list && list.every((x) => typeof x === 'string')) out[key] = ORDERED.has(key) ? [...list] : [...list].sort();
  }
  return out;
}

module.exports = { squadraVocab, ORDERED };
