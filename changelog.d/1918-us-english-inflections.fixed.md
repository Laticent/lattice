- **The house dialect map now carries the inflections of the roots it already listed
  (HARD RULE #21).** `tools/us-english.js` is keyed on whole words and matched with `\b`, so
  a listed root does not cover its own longer forms — the entry for a root cannot fire inside
  that root's `-ing` form. 58 pairs are added: the `-our` `-ing`/`-ed` forms, the `-ise`
  `-ing` forms, the real `-isation` nouns with their plurals, and the doubled-consonant and
  `-ment` forms. Eleven occurrences in tracked prose are corrected in the same change.
- **This matters more than a dictionary top-up, because the gap was load-bearing.** The
  repo-wide sweep that justified deleting the `checkUsEnglish` ratchet ran on the list
  *without* these entries, so it reported zero on a tree that still held them. Re-measured
  with the completed map, in the old ratchet's own scan scope and excluding the dictionary
  and the frozen archive: **130 British spellings across 76 files.** No gate now sees them.
  The sweep is not attempted here — it collides with the change that just landed, and several
  of the files carry committed PDFs — but the number is recorded so the decision to delete
  the ratchet can be revisited against what is actually in the tree.
- **A structural test asserts the shape rather than the contents.** Every `-ise` and `-our`
  root must carry its `-ing` inflection, with a one-entry exception table for the single
  derived form that is not a word. Nobody catches the next omission by reading 228 pairs.
- **A stemmer was tested for this job and belongs in a different seat.** As the MATCHER it
  fails twice over: stemming collapses 25 of the pairs (`modelled`/`modeled` both reduce to
  `model`, and the doubled consonant *is* the whole signal), and a stem-keyed matcher flags
  seven correctly-spelled American words — `modeled`, `labeled`, `canceled`, `traveler`,
  `fulfillment`, `enrollment`, `analyses` — as British. A warning that corrects correct
  spelling is one people stop reading. It also cannot produce the suggestion, which is the
  map's whole product. As an AUDITOR over the safe families it earns its place: run against
  the pre-change map it rediscovers the gap unaided, and it found four forms this change's
  hand pass had missed — `recognisable`, `analyser`, `colourable`, `prioritiser` — two of
  them live in tracked prose and fixed here.
