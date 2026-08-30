- **New HARD RULE #30 — house voice.** Everything we write *about* the work — a chat
  reply, an issue, a PR body, a commit message, a `changelog.d/` fragment, a doc, a code
  comment — is active voice with a named actor, plain words with any term of art defined
  on first use, and leads with the answer. Deliberately no word budget: a number gets a
  real explanation amputated to hit it. The contract is `engineering/house-style.md`;
  `design/editorial.md` keeps the words *on a slide*, which is a different surface with
  different rules.
- **The British-spelling backlog is swept — 1285 spellings across 406 files** in one
  mechanical pass. Overwhelmingly prose: comments, docs, manifest text, strings and test
  names. It is not purely prose, though — a handful of internal identifiers were renamed
  (`cancelled`→`canceled` in UI code, `GREY`→`GRAY`, `offences`→`offenses`), and 34
  shipped decks changed slide-visible words, so 49 committed PDFs were rebuilt with them.
- **Breaking for contributors: `checkUsEnglish` is deleted.** The repo-wide scan, the
  `US_ENGLISH_BUDGET` ratchet, its self-exempt list and its revision ledger are all gone
  from `tools/check-ownership.js` (-93 lines), and `build:check` no longer walks every
  tracked file looking for spellings. A gate that needed 1285 standing exceptions to stay
  green was more machinery than the problem; from zero, a regression is one visible word
  in a diff. HARD RULE #21 is discipline now.
- **What replaces it is ~30 lines.** The commit-msg hook warns on British spellings from
  `tools/us-english.js` and never blocks — a message may quote British-spelled text, and
  HARD RULE #14 forbids `--no-verify` as the escape. It covers the surface that measured
  real drift: 21 British spellings in the last 300 commit messages, every one under a
  green build.
- **71 British spellings remain in living prose, none of them a backlog:** ~39 are the
  `progress-centre` Form cell (tracked in #578), 15 are external strings a US-English pass
  must never touch, 4 sit in a lockfile, 3 cite a dated `engineering/decisions/` filename,
  and the rest are deliberate mentions in tests and rules.
- **Fixed three defects the sweep itself caused**, each found by review rather than by any
  gate: `ci.yml` compared CI conclusions against `canceled`, a value GitHub never emits
  (its enum is `cancelled`), leaving two allowlists dead and their branches inverted; the
  world basemap stopped resolving the OECD's real legal name, so a map region silently
  dropped; and an intent-search synonym key became unreachable while double-scoring its
  own stem, with the one test guarding it reduced to `X.toEqual(X)`.
