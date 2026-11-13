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

/** The list-of-strings fields of a lint vocabulary, each as a sorted array. */
function squadraVocab(vocab) {
  const out = {};
  for (const [key, v] of Object.entries(vocab ?? {})) {
    const list = v instanceof Set ? [...v] : Array.isArray(v) ? v : null;
    if (list && list.every((x) => typeof x === 'string')) out[key] = [...list].sort();
  }
  return out;
}

module.exports = { squadraVocab };
