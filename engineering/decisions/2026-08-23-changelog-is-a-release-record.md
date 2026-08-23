---
status: shipped
summary: >
  `CHANGELOG.md` was 382,512 tokens, of which 99.7% sat under `## Unreleased` — because
  1.0.0 shipped on 2026-08-09 from a hand-written section WITHOUT rolling that section into
  it, so an accumulated development log kept growing under a heading that says "next
  release". The log moves to `changelog/pre-release-archive.md` verbatim and the file drops
  to 1,373 tokens (99.64%). The pending `changelog.d/` fragments deliberately STAY: they
  carry the `### Removed` entries and the `**Breaking:**` marker, so the computed bump is
  unchanged at `major` (1.0.0 → 2.0.0, measured both sides). The issue's own hypothesis —
  merge the 42 duplicate category blocks — was measured and REFUTED at 99 tokens, 0.026%.
  Recorded at equal length: the FIRST version of this change was built on a false premise
  ("zero tags, nothing published") produced by running `git tag` in a sandbox clone that
  never fetched tags. It re-baselined the version to 0.9.0 and archived the fragments too,
  which would have downgraded the next release from 2.0.0 to 1.1.0 and deadlocked the
  publish phase against the existing `v1.0.0` tag. The adversarial trio caught it; nothing
  else would have.
---

# The changelog is a release record, not a development log

**#1735**, the read side of #1593. The write side stopped every PR appending to one shared
region; this side asks what that region should have contained.

## 1. What the file was

Measured on `main`, `o200k_base` over the real bytes — not estimated, because a byte-length
estimate of the gotchas index was once off by ~2x and that is why the tokenizer is used here
at all.

| | tokens | share |
|---|---:|---:|
| `CHANGELOG.md` whole | **382,512** | |
| `## Unreleased` body | 381,344 | **99.7%** |
| `## 1.0.0` + tail | 736 | 0.2% |
| preamble | 429 | 0.1% |

Two `##` headings in 18,487 lines, so "shard by release" was never available: it yields two
files, one still 381k tokens.

**Why the file is shaped like that.** 1.0.0 was tagged and released on 2026-08-09 from the
hand-written `## 1.0.0` section — *without* rolling `## Unreleased` into it. The roll is what
normally empties that section, so it never emptied; it simply kept accumulating. The 18,382
lines are neither released history nor a coherent set of pending release notes. They are a
development log that no release ever consumed.

## 2. The hypothesis the issue carried, and why it is wrong

#1735 proposed that merging the duplicate category blocks "might be most of the win on its
own." It is the cheapest and safest candidate, so it was priced first.

**It saves 99 tokens — 0.026% of the file.** There are 40 `###` headings where 7 distinct
ones exist. Merging them deletes 33 heading LINES; the 1,339 entries underneath — p50 234
tokens each, 381,193 in total — are the file.

The intuition behind it is sound and general, which is why it is worth recording as refuted
rather than dropped. On the decisions index, markup really WAS 42% of the cost (the filename
rendered twice per row) and squeezing it was right. Here there is no markup layer. **A
restructure that does not move content cannot move the number** — a one-line test worth
applying before pricing anything else.

## 3. THE PREMISE FAILURE — recorded because it is the most useful thing here

The first version of this change opened by asserting: *"The repo had never released: zero
tags, nothing published."* Every downstream decision followed from it.

**It was false.** `v1.0.0` has been tagged since 2026-08-09 and a non-draft GitHub Release
has been public since the same day.

```
$ git ls-remote --tags origin
5979ae9743a74b90ebafd464be94d7ec46fb6b9b	refs/tags/v1.0.0
$ GET /repos/SlideWright/lattice/releases
tag: v1.0.0 | draft: false | prerelease: false | published: 2026-08-09T14:54:53Z
```

**How the error was made.** `git tag --list` was run inside a sandbox whose clone never
fetched tags. It printed nothing, and nothing was treated as ground truth. That is precisely
the failure HARD RULE #23 exists to prevent — a claim about the real world verified against a
stand-in — committed by a change whose own commit message cited #23 approvingly.

**What it produced.** All of the following shipped in the first draft and were wrong:

| | |
|---|---|
| re-baseline `package.json` 1.0.0 → 0.9.0 | 1.0.0 was already correct |
| "the `## 1.0.0` section is a draft that never shipped" | it is the published release body, 56/56 lines verbatim |
| archive the 106 pending fragments with the log | removes the `### Removed` entries and the `**Breaking:**` marker |
| "archiving is bump-neutral by construction" | measured: `main` computes **major → 2.0.0**, the draft computed **minor → 1.1.0** |

The mechanical end state was worse than a wrong number. `tools/release.js` refuses to cut a
version whose tag exists, so the documented `--bump=major` would have passed phase 1 —
merging the release commit, consuming every fragment, emptying `## Unreleased` — and then
**aborted in phase 2** against `v1.0.0`, leaving `main` carrying a release commit that can
never be tagged.

A guard added mid-review to catch the version mistake was wrong for the same reason: it keyed
on `!git tag --list`, and CI checks out with `fetch-tags: true`, so it was **inert exactly
where releases are cut** and fired only in the tagless sandbox that created the illusion.

**Nothing else caught this.** Lint, 6,965 unit tests, `build:check`, the integration tier,
CodeQL and the full CI workflow were all green on the false version. Two independent review
lenses read the diff and did not question it either — the Munger inversion reasoned *from*
the premise and produced (correct, useful) findings inside it. Only the red team refused to
take `git tag` as evidence and queried the remote. That is the argument for HARD RULE #25's
top rung in one paragraph: the trio is not three chances at the same question, it is the only
lens that attacks the premise rather than the implementation.

## 4. What shipped

- **`changelog/pre-release-archive.md`** — the `## Unreleased` body, verbatim, byte-for-byte.
  Frozen: wording and order preserved, repeated category headings included.
- **`CHANGELOG.md`** — **382,512 → 1,373 tokens (99.64%)**. Preamble, an empty
  `## Unreleased`, and the real published `## 1.0.0` notes, which stay where they are because
  they are history rather than a draft.
- **The 106 `changelog.d/` fragments STAY pending.** This is the load-bearing choice, and it
  is what makes the change version-neutral.
- **`package.json` is untouched at 1.0.0.**

**The bump, measured on both sides in a real worktree:**

| | fragments | level | next |
|---|---:|---|---|
| `origin/main` | 105 | `major` | 1.0.0 → **2.0.0** |
| this change | 106 | `major` | 1.0.0 → **2.0.0** |

## 5. What this costs

**The archived entries will not appear in the next release's notes.** That is a real loss and
it is deliberate, not a side effect. Two things make it defensible:

- They were not reaching a reader anyway. `fitReleaseBody` caps the GitHub body at 125,000
  characters; the assembled notes were 1,707,058, so **92.7% was already discarded** — 1,234
  of 20,143 lines survived.
- The recent, well-written record of what actually landed is the 106 fragments, and those are
  untouched.

**What it does NOT cost is the version.** That distinction — notes change, bump does not — is
the whole reason the fragments stay.

## 6. A guard was weakened, then restored, and the restoration is the lesson

`test/unit/release/changelog-integrity.test.js` reports any column-0 paragraph in
`## Unreleased`. The first draft put a curated announcement there with an authored lede, so
the rule was "widened" to *prose is damage only once an entry has begun*.

**Measured, that widening was a rout.** Seven orphan shapes went from caught to uncaught — a
section opening with a table, a blockquote, an indented line, a fence, two consecutive
headings — and worst, **damage appended at the END of the section**, the likeliest
concatenation site and the one the file's own docblock names, was silently excused. One of
the uncaught shapes silently downgrades a release: a first bullet that loses its `- ` in a
conflict stops matching `hasBreakingMarker`, so a breaking change ships as a minor.

The fixture written to pin the widening **tested a different shape than its own comment
described**, and would have failed if written as described. A guard whose anti-rot fixture
certifies a property the code does not have is worse than no fixture.

What ships instead: the detector is back at original strength, and authored prose is named
one line at a time in `SANCTIONED_UNRELEASED_PROSE` — this repo's `SANCTIONED_*` idiom, which
fails both ways. **The list is currently empty**, which is the healthy state. Two arms were
added beyond the original: each sanctioned line must appear **exactly once** (keeping both
sides of a conflict duplicates it rather than removing it), and the same detector now runs
over the **assembled** body — `## Unreleased` plus every pending fragment — because that is
the text that becomes the public Release body, and until now the guard had no jurisdiction
over it at all.

## 7. Two adjacent holes the same review found

- **`fragmentProblems` accepted a fragment that opens with prose** and buries a bullet below
  it (`some`, not "the first line"). The assembler splices that prose in under `### Changed`
  ahead of the section's first bullet — exactly the position the orphan check has to treat as
  authored. Two gates each passing left a live path for free prose into published release
  notes. Now the first non-blank line must be a bullet.
- **`tools/marp-inventory.mjs` regressed to a false verdict.** Its `history` and
  `PHANTOM_EXEMPT` rules are anchored to `^CHANGELOG\.md$`, so the archive — the same frozen
  prose, moved — became the repo's only "actionable REMOVE" (0 → 1 actionable, 48 → 76 phantom
  lines). The US-English exemption had been updated for exactly this reason and the others
  were not swept. Restored to 0 actionable / 39 files / 48 lines.

## 8. Where this sits relative to Changesets (#1437)

`2026-08-09-changesets-multi-package-release.md` is `status: proposed` and plans to retire
`tools/changelog.js`'s versioning role and **replace the `v<x.y.z>` tag scheme** with
per-package `@scope/name@x.y.z`. This change deepens what that record proposes to remove.
Recorded rather than resolved, exactly as `2026-08-11-changelog-fragments.md` §7 did for the
write side — dropping that mitigation here would repeat a mistake this repo has already
written down once.

One correction to that record's framing, now that the history is established: its case rests
on *"there is no published version history to reconcile, no consumer pinned to a tag scheme."*
**A published 1.0.0 tag and GitHub Release already exist**, so that window closed on
2026-08-09, before this change. npm is still clean (`@workwel/lattice` 404s), which is the
part of the argument that survives. Its slice 1 also says to "close `## Unreleased` under the
dated `## 1.0.0`" and to convert the pending fragment pile; the first is discharged
differently here (a separate archive file) and the second is untouched by design.

## 9. What this does NOT do

- **No generated index over the archive.** Priced at 1,339 rows / 140-character gists =
  **29,388 tokens**, row p50 21 — inside the per-row budget and grep-first per rule 1's
  restated form. Declined on rule 3: don't map what `grep` gives free, and an archive of prose
  entries is what ripgrep already answers.
- **No merge of the duplicate category blocks.** §2 — 99 tokens, and in the archive it would
  reorder frozen history to get them.
- **The published 1.0.0 release is not corrected.** Its notes describe two palettes and 25
  layouts; the engine now ships 14 palettes and 61 components. Off-path here (HARD RULE #18) —
  logged, not swept in.
- **No `--version=<literal>` for `tools/release.js`.** Proposed by the inversion as the
  durable answer to encoding a target version as bump arithmetic. It is a good idea and it is
  not needed by this change any more, since the version is untouched.
