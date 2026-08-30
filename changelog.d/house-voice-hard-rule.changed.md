- **New HARD RULE #30 — house voice.** Everything we write *about* the work — a chat
  reply, an issue, a PR body, a commit message, a `changelog.d/` fragment, a doc, a code
  comment — is active voice with a named actor, plain words with any term of art defined
  on first use, and leads with the answer. Deliberately no word budget: a number gets a
  real explanation amputated to hit it. The contract is `engineering/house-style.md`;
  `design/editorial.md` keeps the words *on a slide*, which is a different surface with
  different rules.
- **HARD RULE #21 now says out loud that it covers the surfaces no gate can reach.** The
  US-English ratchet scans tracked files, so a chat reply, an issue body, a PR
  description and a commit message were never in its scope — 21 British spellings had
  ridden into the last 300 commit messages under a green build.
- **The commit-msg hook warns on British spellings.** It prints the American form and
  exits 0, never blocking: a commit message legitimately quotes British-spelled text, and
  HARD RULE #14 forbids `--no-verify` as the escape from a false positive. It reads the
  same 170-pair dictionary the build gate enforces, now extracted to `tools/us-english.js`
  so the hook and the gate cannot drift apart.
- `US_ENGLISH_BUDGET` lowered 1291 → 1285, the measured count. The backlog had been burned
  down below the pin without anyone lowering it, and six units of slack on a ratchet is six
  free British spellings.
- **`.claude/**` is now inside the US-English scan.** The repo walk skipped it as a hidden
  directory, so 14 tracked prose files — the agent roster cards and workflow scripts, which
  are house instructions an agent reads and copies the voice of — were governed by nothing.
  They measured zero British spellings on the way in, so the budget did not move and this
  is a floor rather than a backlog.
