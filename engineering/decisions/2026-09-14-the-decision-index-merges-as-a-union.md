---
status: shipped
summary: >
  `engineering/decisions/README.md` is the repo's highest-churn shared region — roughly half
  of all merged PRs rewrite it — and its conflicts are not rare the way the generator's own
  docblock claimed. Rows sort date-descending, so two notes written the same day into the
  same status group are ALWAYS immediate neighbors and always conflict. A two-line
  `merge=union` driver resolves it, the existing deliberately-weak `--check` accepts the
  result, and the one case union gets wrong fails loudly against that same gate.
---

# The decision index merges as a union

#1547 fixed the SILENT half of this file's merge-queue problem: it deleted the `_N notes_`
tally (an aggregate two concurrent PRs cannot both be right about) and relaxed the row-order
assertion. It left the visible half — a textual conflict — on the grounds that it was rare.
That was the wrong read, and this note is the measurement that corrects it.

## 1. How much churn, measured

Windows taken off `origin/main` at `df36705b`, by intersecting `git rev-list -n N` with the
path's own rev-list (a bare `git log -n N -- <path>` limits AFTER filtering and gives 100%,
which is how an earlier draft of this measurement got it wrong):

| window | `decisions/README.md` | `changelog.d/` | `CHANGELOG.md` |
|---|---|---|---|
| last 100 commits | 44 (44%) | 89 (89%) | 1 (1%) |
| last 200 commits | 91 (45%) | 175 (87%) | 2 (1%) |
| last 300 commits | 150 (50%) | 257 (85%) | 14 (4%) |

`CHANGELOG.md` at 1% is the shape *after* #1593 moved entries into per-PR fragments. The
decision index is where `CHANGELOG.md` was. Adjacent merged pairs where BOTH rewrote the
index: **79 of 299 (26%)**, with 45 runs of three. Mean churn per touching commit is
**+29 / −0 lines** — pure insertion into a shared block.

## 2. The conflict rule, reproduced

Five shapes, each built as two real branches off `main` and merged:

| case | result |
|---|---|
| two notes dated tomorrow, adjacent filenames, same group | CONFLICT |
| two notes dated tomorrow, **far-apart** filenames, same group | CONFLICT |
| different dates AND different status groups | clean |
| both dated **today**, both `proposed` | CONFLICT |
| same date, with an existing active note sorting **between** them | clean |

**The rule is: two rows conflict exactly when no existing row sorts strictly between them.**
Filename distance is irrelevant. Rows sort date-descending then filename, so a note carrying
today's date sorts above every existing note in its group — which makes two same-day notes in
the same group immediate neighbors by construction, not by luck. That is the ordinary shape of
two concurrent decision-doc PRs, and it is why `tools/build-decisions-index.js`'s docblock
calling it "the RARE case … neighbors among ~380" was wrong. The docblock is corrected in the
same commit as this note.

The Active group holds 176 of 551 notes, so the "something already sorts between them" escape
is the exception rather than the rule.

## 3. Why union, and not the changelog.d treatment

Three other shapes were costed before this one was chosen, and the choice was the human's
(CLAUDE.md's second filter, row 2 — this changes a gate every PR runs):

- **Stop committing the index.** Certain, no server-side unknown — but ~8 doc pointers move,
  two arms in `test/unit/tools/uncommitted-steps.test.js` explicitly pin the step as PR-owned
  and would have to be rewritten, and `build:check --exclude-uncommitted` would then SKIP it,
  so which CI job covers the gate changes.
- **Assemble at release only** — the literal `changelog.d` choice (#1593 picked release-time
  assembly deliberately). It removes the per-PR write, but leaves the index stale between
  releases, and it is a pick-list CLAUDE.md tells agents to grep.
- **Leave it** and pay one rebase per racing PR.

`merge=union` is two lines, moves no doc, changes no CI job or step, and rewrites no test.

## 4. Why it is correct here, and where it is not

Every row is unique to one note, and the block's ORDER is not asserted — #1547 weakened
`--check` to verify per-note correctness rather than byte-identity, precisely so two decision
PRs could share the merge queue. So a union-merged index is legal by construction. Verified by
merging two real branches with the driver in place: both rows present, `--check` green.

**Inside the block, a wrong union fails loudly.** If two branches change the SAME note's status,
union keeps both of that note's rows. Measured: the note file itself still conflicts — a real
semantic conflict, correctly surfaced and NOT suppressed by the driver, which only covers
`README.md` — and `--check` then refuses with `2 entries in the index — it must appear exactly
once`. That class of wrong merge hits the gate every PR already runs.

**Outside the block it does not, and a review caught the first draft of this note claiming
otherwise.** A merge driver applies to a whole file; `parseIndex` reads only the text between the
sentinels, which sit at lines 130 and 695. The 129 lines of hand-written prose above the block —
the Convention section, the status-lifecycle table, the `ROW_CAP` guidance — are therefore under
union with no gate behind them, and two PRs rewording the same prose line would merge clean with
both sentences committed back to back. Reproduced with `git merge-file --union`: exit 0, no
conflict, both sentences present.

The exposure is small and the failure is visible rather than corrupting. Of the 150 commits in the
last 300 on `main` that touch this file, **4 changed any line that is not an index row**, and two
of those would additionally have to hit the same line in parallel. A duplicated sentence reads as
an obvious editing mistake in the PR diff; a wrong code merge would not. (An independent checker
measured this as 18 of 165 using a looser definition that counts heading and blank-line shifts —
worth knowing that the number moves with the method. Either way the prose is near-static while the
block churns.)

If that ever stops being acceptable, the fix is §3's first option applied narrowly: move the
generated block into its own file so the driver covers only generated content. The claim to avoid
repeating is the first draft's — that the status case was "the one case union gets wrong". An
incomplete safety proof is worse than a stated limit.

## 5. What is not verified

**Whether GitHub's merge queue honors the driver server-side.** `merge=union` is a built-in
low-level git driver and needs no `merge.*.driver` config, but every measurement in this note
was taken with local `git merge`, and nothing in this sandbox can exercise GitHub's own merge
machinery. The next two decision-doc PRs that race will settle it. If it turns out not to be
honored, the cost of having tried is two lines in `.gitattributes` and this note, and the
fallback is §3's first option.
