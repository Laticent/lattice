- **New HARD RULE #30 — house voice.** Everything we write *about* the work — a chat
  reply, an issue, a PR body, a commit message, a `changelog.d/` fragment, a doc, a code
  comment — is active voice with a named actor, plain words with any term of art defined
  on first use, and leads with the answer. Deliberately no word budget: a number gets a
  real explanation amputated to hit it. The contract is `engineering/house-style.md`;
  `design/editorial.md` keeps the words *on a slide*, which is a different surface with
  different rules.
- **The British-spelling backlog is gone — 1285 spellings across 406 files, swept to
  zero** in one mechanical pass. Comments, docs, manifest prose, strings and test names
  only: no CSS custom property, class name, camelCase identifier or deck-author-facing
  surface carried a British spelling, so nothing renames and no deck changes.
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
- **Eight British spellings remain, on purpose:** four citations of a dated
  `engineering/decisions/` filename and four inside `docs/package-lock.json`. Neither is
  text we author. The one internal identifier still UK-spelled, the `progress-centre`
  Form cell, is tracked separately in #578.
