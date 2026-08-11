---
status: shipped
summary: >
  `CHANGELOG.md` `## Unreleased` is one shared region every PR appends to at the top, so
  two PRs in flight always edit the same lines — and under a merge queue that is not a
  conflict you resolve once but an EJECTION, which silently clears auto-merge. Seven in one
  evening across five PRs, every resolution the same mechanical "keep both entries". Fixed
  with per-PR fragments (`changelog.d/<slug>.<category>.md`), the news-fragment pattern:
  two PRs never write the same file. The CATEGORY IS IN THE FILENAME rather than in front
  matter, which is what keeps the release bump trustworthy — deriving it is a readdir no
  prose can confuse, and a typo is a filename matching nothing (a loud gate failure) rather
  than an entry silently binned out of the bump. Assembly happens at RELEASE time, not build
  time, and that is the load-bearing choice: a build-time assembly would make CHANGELOG.md a
  generated-from-everything committed artifact byte-gated by build:check, which is the OTHER
  merge-queue hazard (#1594 / #1547) — trading a visible conflict for a silent ejection.
  Fragments also land in scope for the US-English gate, which CHANGELOG.md is exempt from,
  so #1366's new-entry half closes as a side effect. Two costs recorded: a same-named
  fragment on two branches still conflicts (rare, and it is one file), and on this pre-1.0
  corpus a category that already has an older `###` heading gets a second one above it until
  the first release roll.
---

# One changelog entry, one file

**#1593.** Not a defect in any change — a structural property of a shared append
region meeting a merge queue. The same shape #1547 fixed for the decision index,
failing the other way round: visibly, and therefore judged tolerable, right up
until somebody counted.

## 1. The shape, and the number that changed the call

Every PR appends to `## Unreleased`, at the top, in the same place. Two PRs in
flight therefore edit the same region. Git raises an ordinary conflict, which is
why #1556 argued the hazard was acceptable here: nothing merges wrongly, and
HARD RULE #16 already says to resolve it mechanically and force-with-lease
silently.

That reasoning holds. What it missed is that **under a merge queue the conflict
is not a conflict — it is an ejection**, and an ejection *silently clears
auto-merge*. The PR goes green again and merges nothing, with no notification
saying so. Measured over one evening shipping five PRs:

| PR | ejections | what landed in the gap |
|---|---|---|
| #1566 | 6 | 3 sibling PRs, 3 unrelated (#1568, #1573, #1561/#1580) |
| #1560 | 1 | a sibling |

**Seven, every one a `MERGE_CONFLICT` on `CHANGELOG.md`.** #1566 needed six
cycles across about four hours for a change whose content stopped moving after
the second. The cost is not the conflict; it is that the resolution is
*mechanical every time* — always "keep both entries", never a judgment call —
and it scales with how busy the repo is. Rote work repeated seven times in an
evening is a process defect.

## 2. What shipped

`changelog.d/<slug>.<category>.md`, the news-fragment pattern (towncrier,
changesets). One file per PR, so two PRs never touch the same one. Contract in
`../../changelog.d/README.md`; the four options the issue listed and why the
others lost are §4.

**The category lives in the FILENAME, not in front matter.** This is the part
worth arguing, because front matter is this repo's idiom everywhere else
(decision notes, theme manifests). The release bump is derived from the
category, so the derivation is the thing that must not break:

- from a filename, deriving the bump is a **directory listing**. No parser, no
  prose, nothing a 400-word entry can confuse.
- a **typo is a filename that matches no pattern** — a loud gate failure naming
  the file. Under front matter the same typo is an unrecognized field, and the
  honest default for an unrecognized field is to skip it: an entry silently
  dropped out of the bump, in a release that cannot be re-cut.

That is the same reasoning that put `verify()`'s row definition in one place in
#1547 — the format is defined once, in `tools/changelog.js`, and
`checkChangelogFragments` only surfaces what that module reports. The assembler
and the gate cannot drift into disagreeing about what a valid fragment is.

**Reading is unified; writing is not.** `--bump`, `--notes` and `--check` all
read `## Unreleased` **plus** every pending fragment as one body, so the bump is
correct while the entries are still loose files and no caller had to learn about
fragments. Only `tools/release.js` writes: assemble → roll → delete, in the
commit it already cuts, serialized behind the existing `release` concurrency
group.

**The block lands at the TOP of `## Unreleased`.** A first cut appended each
fragment to the matching `### Category` heading wherever it already was, to
avoid emitting two `### Added` in one section. On this corpus that put a
brand-new entry about 1,700 lines down, inside a year-old `### Changed`: the
pre-1.0 `## Unreleased` is an accumulated log with several `###` blocks and an
`### Earlier (Unreleased)` tail, not one release's worth of notes. Newest-first
is how every hand-appended entry landed and how the file reads, so that is where
the block goes; one heading per category is then true by construction, because
the whole block is emitted in one pass.

**The gate fails both ways**, the `SANCTIONED_*` idiom: a malformed fragment
errors (unparseable name, a heading, no bullet, a conflict marker, CR endings, a
BOM), and a **missing `changelog.d/`** errors too — the empty-scan guard #1535
and #1547 both needed, because a gate that scans nothing is also a claim.

## 3. Why assembly is at RELEASE time, and not at build time

This is the load-bearing choice and it is easy to get backwards.

The obvious design is to regenerate `CHANGELOG.md` from the fragments on every
`npm run build`, so the file on disk is always current. **That would recreate
the exact hazard this fixes, in its worse form.** `CHANGELOG.md` would become an
artifact generated from *all* of `changelog.d/`, committed, and byte-gated by
`build:check` — (a), (b) and (c) of #1594's property. Every PR adding a fragment
would restale every other in-flight PR's copy, and the merge queue would eject
them on a *gate failure* rather than a conflict: silent instead of visible,
which is strictly worse than what we started with.

So nothing regenerates `CHANGELOG.md` per PR. It is a frozen ledger between
releases, and the release — one actor, serialized — is the only writer.

## 4. The options that lost

The issue listed four. Recorded so the call is not re-litigated:

- **(2) a `.gitattributes` union merge driver.** Cheap, but it only fixes
  *local* rebases — the merge queue performs its own merge and would need the
  same config, and a union merge happily interleaves two entries mid-paragraph,
  producing exactly the orphaned-paragraph damage
  `test/unit/release/changelog-integrity.test.js` exists to catch.
- **(3) append at the bottom of `## Unreleased`.** Reduces same-position
  collisions without eliminating them, and inverts the reading order of a file
  humans read top-down.
- **(4) document the cost and accept it.** The floor, and nearly free. It
  shipped anyway — `../workflow.md` § Changelog entries carries the
  seven-ejection table — because the next agent should understand *why* the
  fragment directory exists. It is not sufficient on its own: knowing that seven
  ejections are coming does not make them cheaper.

## 5. What this costs, and what it does not fix

- **Two branches that pick the same fragment filename still conflict.** The
  slug is free-form and by convention carries the issue number, so this needs
  two branches for the same issue. When it happens it is one small file, and it
  is a *visible* conflict — the failure mode this replaces was seven of them per
  evening on an 18,000-line file.
- **A second `### Added` on this corpus.** Until the first release roll empties
  `## Unreleased`, a category that already has an older `###` heading further
  down gets a fresh one above it. Cosmetic, in a section that already carries
  several, and self-clearing.
- **`CHANGELOG.md` is not migrated.** The 18,000 committed lines stay where they
  are; the ledger below `## Unreleased` is history and history does not move.
  Only new entries are fragments.
- **#1366 closes only for new entries.** `CHANGELOG.md` stays exempt from the
  US-English gate (past entries are frozen history, like the decision docs), but
  a fragment is ordinary repo prose in the enforced scope — so from here a new
  entry is gate-visible, which is the half of #1366 that was actually costing
  anything. The frozen backlog inside `CHANGELOG.md` is untouched and still
  unscanned.
- **Nothing forces a fragment to exist.** HARD RULE #10 says to write one; no
  gate can tell a user-visible change from an internal one, so this stays
  discipline, exactly as it was when the entry went in `CHANGELOG.md`.

## 6. Verification

- 33 unit tests in `test/unit/release/changelog-fragments.test.js`, covering
  reading, all eight gate arms (including the missing-directory guard and the
  missing-README guard), assembly, and the bump each category produces.
- Two of them drive the **live** `changelog.d/`: it is clean, and every fragment
  in it survives into the assembled notes. A fragment that assembled into
  nowhere would be an entry deleted from disk by the release and shipped
  nowhere; that is the failure this scheme could introduce, so it is pinned
  against the real directory rather than a fixture.
- One drives the full **assemble → roll** the release performs, asserting the
  fragment lands in the *dated* section and the fresh `## Unreleased` comes out
  empty, so the next release cannot re-ship it.
- `npm run release:dry` on the real tree reports
  `18380 lines from ## Unreleased + 1 changelog.d/ fragment(s)` and previews the
  fragment at the head of the notes.
- `npm run lint`, `npm test`, `npm run build:check`, `npm run lint:deck:all` and
  the integration tier pass.
