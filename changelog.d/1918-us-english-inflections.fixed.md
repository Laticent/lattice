- **The house dialect map now carries the inflections of the roots it already listed
  (HARD RULE #21).** `tools/us-english.js` is keyed on whole words and matched with `\b`, so
  a listed root does not cover its own longer forms — the entry for a root cannot fire inside
  that root's `-ing` form. 65 pairs are added, taking the map from 170 to 235, and fourteen
  occurrences across twelve files are corrected.
- **What the gap actually cost, stated carefully.** 66 British spellings across 45 files were
  invisible to the old map — not because the 2026-08 sweep failed, but because no entry
  existed that could match them. A single doubled-consonant form accounts for 35 of the 66.
  This is **not** the remainder HARD RULE #21 records as deliberate — data we must keep
  accepting, a lockfile, dated filenames, mentions in tests and in the rule itself. Those
  were seen, judged and kept, and the rule is explicit that a pass must never touch an
  external string. The two sets are disjoint, and the rule declines to restate a running
  total on purpose: the tool that measured the original 71 was deleted with the ratchet, so
  a fresh count needs a fresh instrument. This entry does not restate one either.
- **A stemmer was tested for this job and belongs in a different seat.** As the MATCHER it
  fails twice: stemming collapses 25 of the pairs to identical stems — for the doubled-consonant
  family the American and British forms reduce to the same word, and that doubling *is* the
  signal, so a stem-keyed matcher
  cannot see that family at all — and it flags the American form of every one of those 25 as
  British, telling writers to correct spelling that is already correct. It also cannot produce
  the suggestion, which is the map's whole product. As an AUDITOR over the families whose
  stems do not collapse it earns its place: run against the pre-change map it rediscovers the
  gap unaided, and it found four forms this change's hand pass had missed — `recognisable`,
  `analyser`, `colourable`, `prioritiser` — two of them live in tracked prose and fixed here.
- **A structural test asserts the shape rather than the contents**, across the three axes the
  map enumerates mechanically: every `-ise` root carries its `-ing`, every `-our` root its
  `-ing`, every `-isation` noun its plural. Open-ended derivations (`honourable`,
  `neighbourhood`) are deliberately not claimed. Nobody catches the next omission by reading
  235 pairs.
