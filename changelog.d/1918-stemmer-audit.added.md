- **Added: a stemming audit that finds British spellings the dialect map cannot
  see.** `tools/us-english.js` is a list of whole words matched with `\b`, so a
  listed root never fires inside its own longer form — the defect that shipped
  `neighbouring` past a green build. The existing test derives inflections FROM the
  map, which cannot surface a form nobody enumerated; the new
  `test/unit/tools/us-english-stem-audit.test.js` reads what the tree actually
  contains, stems every word, and fails on any word landing in a British family the
  map does not carry. Run against the pre-#1918 tree and map it rediscovers
  `neighbouring` and eight more gaps unaided. Two open-ended derivations it found in
  the current tree — `honourable`, `flavourful` — are now in the map, and
  `NOT_ENGLISH_FORMS` moves to `tools/us-english.js` so both instruments agree on
  what is a word. `-hood` and `-ness` stay outside what stemming can reduce, and the
  audit says so rather than implying a proof of zero.
