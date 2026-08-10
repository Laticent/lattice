---
status: superseded
superseded-by: 2026-08-09-issue-priority-triage.md
summary: What a 138-card manual triage actually produced, after an adversarial trio deleted the rest of it. The classification is gone — superseded within days and wrong in places; what survives is the error shape every mistake shared. Sixteen falsifiable claims were checked by a checker, a red team and an inversion; the ones that broke ALL broke the same way — a state was read off one artifact and asserted about something that lived somewhere else (KNOWN_DIRECTIVES for a surface in finish-generate.ts, a git log -S hit for a fix attribution, a rendered README for front-matter state, a card's text for what the code does). Three concrete outputs justified the exercise and none of them needed the classification - #1524 (checkLineEndingBoundaries and SANCTIONED_EOL_BOUNDARIES are documented as shipped in nine places including CLAUDE.md and a "## What shipped" heading, and exist nowhere, which is the real reason #1388 recurred), #1550 (coverWindow's balanced-chunking fix is unguarded — reverting it passes 5773 tests), and the finding that bucket-gallery drift is watched only by the nightly tier after recurring three times. The queue axis itself was the wrong axis: it grew 12% during the sweep, the repo already had a mirror workflow that was failing on a push permission, and the machine-readable priority labels the board consumes were left empty while the same classification was written into prose.
---

# What a manual triage produced, once the trio was done with it

**Date:** 2026-08-04 (audited 2026-08-10)
**Status:** superseded as a triage by
[`2026-08-09-issue-priority-triage.md`](2026-08-09-issue-priority-triage.md).
Kept only for the verification discipline below.

---

## Why this note is 90% shorter than it was

It began as a full classification of all 138 open issues at `7b8a219`. Three
adversarial passes — an independent checker, a red team, and a Munger inversion
— then established that the classification was:

- **superseded** within five days by the note named above, against a queue that
  had grown to 156;
- **wrong in places that mattered**, including its own headline arithmetic, two
  of its three "worse than filed" findings, and the worked example its central
  lesson rested on;
- **perishable by construction** — `main` moved 40 commits while it was being
  written and reviewed.

Deleting it was the right call. What follows is the residue that survived all
three lenses, plus the three defects the exercise actually found.

---

## 1 · The error shape

Sixteen falsifiable claims were checked. **Every one that broke, broke the same
way:**

> A state was read off one artifact and asserted about something that lived
> somewhere else.

Not carelessness — each reading was correct about the thing it read. The failure
was in the inference, and it repeated across six independent claims:

| claim | what was read | what was asserted | why it failed |
|---|---|---|---|
| **#669** — "the author surface never shipped" | `KNOWN_DIRECTIVES` has no `backdrop` key | the feature is unshipped | the surface is `finish-override:` → `backdrop:`; it carries all three ratified axes (`finish-generate.ts:75`) and the old form is lint-retired (`lint-core.js:2323`). The table read was accurate and irrelevant |
| **#1246** — "fixed by `aa2ca691`" | a `git log -S` hit | that commit fixed it | `-S` counts occurrence-delta, so a **moved line** registers. `aa2ca69~1` already read `strict`; the fix was `33c7806`, a day earlier. Two prior notes made the same inference |
| **#1310** — "70 of 357 empty rows" | the *rendered* `README.md` | front-matter state | the pattern also matched hand-written prose bullets. True figure 59 of 346 — and the retraction then misdiagnosed the cause by inspection rather than re-running |
| **#577** — "the ratchet was raised" | a card's title (a **count**) vs. a source constant (a **budget**) | discipline was slipping | different quantities. The budget was *lowered* 1336 → 1307 to pin it to the count |
| **#1324** — "87 failures, a cliff not a flake" | one contaminated run | suite behavior | ~49 concurrent Chromium processes; idle re-run = 0 failures. The same invalidation standard had been applied, correctly, to a different run three rows earlier |
| **#1349** — "still broken" | an unchanged regex | behavior | the fix normalized the *input* rather than loosening the pattern, deliberately — a `\r?\n` pattern cannot match a lone CR. Grep-for-pattern was the wrong instrument |

### The corrective

Three rules, each cheap, each of which would have killed at least two of the six:

1. **State the command beside the number.** Four of these die on contact with
   *show your method* — the missing `\]\(.*\.md\)` filter, the `git log -L` on
   the budget, the concurrent load on the vitest run.
2. **A `git log -S` hit is not a fix attribution.** It says a line changed, not
   that behavior did. Bisect the value.
3. **Re-read state immediately before publishing it.** Six errors were correct
   readings of a tree that had since moved.

This belongs next to HARD RULE #23, which already says a verification claim
names its surface and carries an artifact from it. The gap these six fell
through is narrower and worth naming separately: **the artifact was real, and it
was an artifact of the wrong thing.**

---

## 2 · The three defects the exercise actually found

None of them needed the classification, and all three outlived it.

### #1524 — a gate documented as shipped in nine places, that does not exist

`checkLineEndingBoundaries` and `SANCTIONED_EOL_BOUNDARIES` are cited in
`CLAUDE.md:456` (the row instructing every agent to consult them before adding a
markdown ingest), in `.gitattributes`, in `CHANGELOG.md` (*"The list is a GATE,
not a comment"*), under a **`## What shipped`** heading in
`2026-08-04-line-endings-lf-boundaries.md`, and in four source comments.

```
$ grep -rn "SANCTIONED_EOL_BOUNDARIES\|checkLineEndingBoundaries" tools/check-ownership.js
(no output)
```

`build:check` passes because there is nothing to run. **This is why #1388
recurred** — #1349 was fixed at eight ingests by #1357 and returned at the
ninth, and the gate meant to prevent exactly that was never written. The
original diagnosis ("the file wasn't in the allowlist") was itself an instance
of §1: it asserted the *contents* of a list without opening it.

**A `## What shipped` heading is a claim, and nothing in the tree checks it.**
Worth auditing the other five `SANCTIONED_*` allowlists for the same shape.

### #1550 — a fix that is real, and unguarded

Reverting #1194's `evenGroups` chunker, scoped to `coverWindow`, passes **5773
tests** including the blocking `test:integration:pr` tier. Every
`carousel.test.js` fixture sits at a `perPage` where balanced and greedy agree —
which the card had predicted in writing and asked for a guard against.

### Bucket-gallery drift is watched only by the nightly tier

`ci.yml` runs `test:integration:pr`, which excludes `test/integration/components/`
— where the gallery-vs-manifest content compare lives. `build:bucket-galleries:check`
is called by no workflow. The class recurred **three times** (#684 → #1188 →
#1197); all three were closed here as clean, and the gate gap went unnoticed
until the red team looked.

---

## 3 · The queue axis was the wrong axis

The sweep's own framing — *"nothing closes cards"* — did not survive measurement.

| | claimed | measured |
|---|---|---|
| closed in the 18h window | 22 | **14** |
| filed in the same window | 23 | **31** |
| net | +1 | **+17 (+12%)** |

The 22 folded in the sweep's own closes, which were timestamped *after* the
window ended; arrivals were undercounted by eight. **Arrival rate dominates, and
the queue grew during the triage.**

Two things were sitting in plain sight the whole time, both cheaper than the
sweep and both fixed by someone else within days:

- **`.github/workflows/sync-backlog.yml` already existed**, running on every
  issue event plus a daily cron. It was failing at the push step —
  `github-actions[bot]` has never authored a commit in this repo — which its own
  header comment and `engineering/workflow.md` both warn about. One permission,
  and the mirror self-heals forever. (Fixed in #1443.)
- **The board's `area:` / `type:` / `priority:` labels were left empty** while
  the identical classification was written into prose. 42% of the queue carried
  no priority axis, so *"work the queue by priority"* addressed under 60% of it.
  The successor pass had to redo that labeling.

**The lesson is not "triage harder."** It is that a queue has a machine-readable
state the board, the mirror, the swimlanes and the triage gate all consume, and
prose in `engineering/decisions/` is not it. Status belongs in issues; this
folder is for design.

---

## What was left behind, deliberately

The full 471-line classification, the per-card tables, and the nine closure
rationales are in this file's git history (`584fafc` and earlier) and in the
GitHub comment threads of the cards themselves. They are not reproduced here
because they were a snapshot of one afternoon, and the note they are superseded
by covers the same queue five days later with the labels actually applied.
