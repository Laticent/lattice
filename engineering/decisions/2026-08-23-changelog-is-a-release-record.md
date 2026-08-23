---
status: shipped
summary: >
  `CHANGELOG.md` was 382,512 tokens, of which 99.7% sat under `## Unreleased` — and the
  repo had never released, so that section was a development log wearing a version
  history's heading. The issue's own hypothesis (merge the 42 duplicate category blocks)
  was measured and REFUTED: it saves 99 tokens, 0.026%, because merging headings removes
  33 heading LINES while the 1,339 entries beneath them are the file. What shipped instead
  splits the two jobs the file was doing: `changelog/pre-release-archive.md` takes the
  pre-release log verbatim, and `CHANGELOG.md` becomes the release record, opening with a
  curated 1.0.0 announcement grouped by capability. 382,512 → 2,199 tokens (99.43%). The
  release pipeline was the hazard and it was measured, not assumed: the bump is driven by
  the 106 pending fragments, not by the archived body, so archiving could not change it —
  but the package was already AT 1.0.0 with zero tags, making 1.0.0 unreachable by any
  bump, so the version is re-baselined to 0.9.0 and the first cut takes an explicit
  `--bump=major`.
---

# The changelog is a release record, not a development log

**#1735**, the read side of #1593. The write side stopped every PR appending to one
shared region; this side asks what that region should have contained.

## 1. What the file actually was

Measured on `main`, `o200k_base` over the real bytes — not estimated, because a
byte-length estimate of the gotchas index was off by ~2x and that lesson is the
reason the tokenizer is used here at all.

| | tokens | share |
|---|---:|---:|
| `CHANGELOG.md` whole | **382,512** | |
| `## Unreleased` body | 381,344 | **99.7%** |
| `## 1.0.0` + tail | 736 | 0.2% |
| preamble | 429 | 0.1% |

Two `##` headings in 18,487 lines. So "shard by release" was never available: it
yields two files, one of which is still 381k tokens. And the `## 1.0.0` section —
the only thing that looked like a version history — was 736 tokens of a draft that
had never shipped.

**The repo had zero git tags.** Nothing had ever been released. `## Unreleased` was
therefore accurate in the narrowest sense and misleading in every useful one: it was
the entire development history of the project, filed under a heading that says "this
is what the next release announces."

## 2. The hypothesis the issue carried, and why it is wrong

#1735 proposed that merging the duplicate category blocks "might be most of the win
on its own." It is the cheapest and safest candidate, so it was priced first.

**It saves 99 tokens — 0.026% of the file.** There are 40 `###` headings in
`## Unreleased` where 7 distinct ones exist (15 Fixed, 12 Changed, 7 Added, 3 Removed,
Security, Deprecated, and an `Earlier (Unreleased)` tail). Merging them deletes 33
heading LINES. The 1,339 entries underneath — p50 234 tokens each, 381,193 in total —
are the file, and no heading arrangement touches them.

This is worth recording because the intuition behind it is sound and general: on the
decisions index, markup really WAS 42% of the cost (the filename rendered twice per
row) and squeezing it was the right move. Here there is no markup layer to squeeze.
The content is the cost. **A restructure that does not move content cannot move the
number**, and that is a one-line test worth applying before pricing anything else.

Recorded as refuted rather than quietly dropped, so it is not re-proposed.

## 3. What the release pipeline actually depended on

This is the part with teeth, and the fear stated in the issue turned out to be
misplaced for a reason worth knowing.

`tools/changelog.js` picks the semver bump from the `###` category headings inside
`## Unreleased` (`Removed` or a `**Breaking:**` bullet → major; `Added`/`Changed`/
`Deprecated` → minor; `Fixed`/`Security` → patch). So moving those headings looks like
it changes what version ships.

**It could not, and the measurement says why.** `--bump` reads `## Unreleased` **plus
every pending fragment** as one body, and there were **106 pending fragments**
including two `.removed.` and a `**Breaking:**` bullet. The bump computed from the
fragments ALONE is `major` — identical to the bump computed from the whole file. The
18,382 archived lines contributed nothing the fragments did not already contribute.
Archiving them was provably bump-neutral before a byte moved.

**A second measurement mattered more.** `fitReleaseBody` caps the GitHub Release body
at 125,000 characters. The assembled notes were **1,707,058 characters**, so the
release already discarded **92.7%** of them, keeping 1,234 of 20,143 lines. The
archived material was not losing a reader it currently reaches; it had no reader. The
truncation guard had quietly become the normal path.

## 4. The real hazard was the version, and it was hiding

`package.json` said `1.0.0`. There were no tags. So the first release, computed from a
`major` bump, would have shipped **2.0.0** — the world's first sight of Lattice would
be version 2, with no 1.x ever existing, while a `## 1.0.0` section sat in the file
calling itself the "Initial public release."

Every bump level was wrong from 1.0.0: major → 2.0.0, minor → 1.1.0, patch → 1.0.1.
**1.0.0 was unreachable.** Nothing in the repo would have caught this; it is only
visible if you ask what the first release actually prints, which is not a question the
gates ask.

The version is re-baselined **1.0.0 → 0.9.0**. Nothing was ever published under 1.0.0,
so there is no consumer to walk back, and `--bump=major` now lands exactly on 1.0.0.

## 5. What shipped

- **`changelog/pre-release-archive.md`** — the `## Unreleased` body verbatim, the 106
  pending fragments grouped by their filename category, and the superseded `## 1.0.0`
  draft. 430,143 tokens. Frozen: entries keep their wording and their order, including
  the repeated category headings each fold appended, because a correction to history
  belongs in a new entry.
- **`CHANGELOG.md`** — 382,512 → **2,199 tokens (99.43% smaller)**. It opens with the
  1.0.0 announcement, grouped by capability (`### Engine`, `### Components`, `### Theme`,
  `### Accessibility`, …) rather than by Keep-a-Changelog category, because it is an
  announcement rather than a diff. The shape is inherited from the superseded draft; every
  fact in it is re-grounded against what actually ships (61 components / 13 buckets, 32
  palettes, 7 named canvases), because the draft still described two palettes and 25
  layouts.
- **The npm tarball's `CHANGELOG.md` drops ~1.5 MB → 9.4 kB.** `changelog/` is not in
  `package.json` `files`, so the archive is repo-only.

## 6. The one thing a reader will get wrong

**`--bump auto` is wrong for exactly one release, and it fails quietly.**

`computeBump` recognizes no level in `### Engine` or `### Theme`, so it falls through to
whatever the pending fragments say — `patch` with none, `minor` today. **Never `major`.**
From 0.9.0 that ships 0.9.1 or 0.10.0 and steps over 1.0.0 without erroring.

The first cut therefore takes an explicit level, and the `=` is not optional when
running the script by hand: `arg()` matches `--bump=<level>`, and the spaced form
`--bump major` is parsed as boolean `true` and rejected. (Verified: `--bump major` →
`error: --bump must be auto|patch|minor|major (got "true")`; `--bump=major` →
`0.9.0 → 1.0.0`.) The `release` workflow already interpolates the `=` form, so
dispatching it with `bump: major` is enough.

After 1.0.0 the assembler writes real `### Added` / `### Fixed` headings and `auto` is
correct again — permanently. This is a one-release exception, documented in three places
a release runner actually reads: the `CHANGELOG.md` preamble, `RELEASE.md`, and here.

## 7. A guard was widened, and the widening is itself pinned

`test/unit/release/changelog-integrity.test.js` asserted that every paragraph in
`## Unreleased` begins with a list marker. Its target is real: a conflict resolved by
concatenation leaves an orphan paragraph — the middle of a sentence from a draft that
lost — and that shipped three times before the test existed.

A curated announcement legitimately has a lede, so the test now fails. The rule is
**not** relaxed to "prose is allowed"; it is sharpened to **"prose is damage once an
entry has begun."** A lede precedes the first bullet of its section; an orphan follows
one. Every heading resets that state, so a genuine orphan under a later heading is still
reported rather than excused as that section's lede.

Widening a guard is how a guard dies, so the damage it exists for is now pinned as a
fixture in the same file: a concatenated stale draft after an entry, and trailing prose
after an entry under a fresh heading, both asserted to still be reported.

## 8. What this does NOT do

- **No generated index over the archive.** Priced at 1,339 rows / 140-character gists =
  **29,388 tokens**, row p50 21 — well inside the per-row budget, and grep-first per the
  restated rule 1. It was still declined: rule 3 says don't map what `grep` gives free,
  and an archive of prose entries is exactly what ripgrep already answers. An index here
  would be a second territory over a corpus nobody is routed to.
- **No merge of the duplicate category blocks.** §2 — it buys 99 tokens, and in the
  archive it would reorder frozen history to do it.
- **`## 1.0.0` is not preserved in place.** It never shipped, so it is a draft, not
  history; it is archived under its own heading and superseded.
