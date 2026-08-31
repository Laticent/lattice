- **Added: two test-tier arms that find British spellings the dialect map cannot see.**
  `tools/us-english.js` is a list of whole words matched with `\b`, so a listed root
  never fires inside its own longer form — the defect that shipped `neighbouring` past
  a green build. The existing test derives inflections FROM the map, which cannot
  surface a form nobody enumerated. `test/unit/tools/us-english-stem-audit.test.js`
  reads what the tree actually contains: one arm stems every word and fails on any
  landing in a British family the map does not carry, the other fails on a British
  segment inside a `camelCase` or `snake_case` identifier — the case HARD RULE #21
  recorded as riding on review. Five identifiers in `tools/check-ownership.js` had been
  riding it, across 65 sites, and are renamed.
- **What the audit finds on the tree it ships against is nothing, and that is the
  result.** Run against the pre-#1918 tree and map it reports nine real gaps unaided,
  `neighbouring` among them. Against the current tree it reports none. Two open-ended
  derivations it surfaced along the way — `honourable`, `flavourful` — are added to the
  map because the pairs are right and the commit-msg hook should carry them, but both
  occur only in writing *about* the map, so neither was a spelling in house prose.
- **The map and its own two tests are excluded from the corpus.** A British-to-American
  map is a list of British words, so with the machinery in scope all 237 keys are
  present by construction — which let the staleness check, the removed-pair proof and
  the audit's own yield each certify themselves. A fabricated allowlist entry for a word
  appearing nowhere in the repo passed before the exclusion and fails after it.
- **The audit reads tracked `.py` files.** `tools/ascii-preview.py` held a British
  spelling that the build pastes into `quote.docs.md` and `dist/docs/components.md`, so
  it was visible in two generated files while its source sat outside the walk's
  extension list.
