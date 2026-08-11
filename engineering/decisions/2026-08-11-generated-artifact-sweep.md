---
status: shipped
summary: >
  #1547 fixed the generated-from-everything merge-queue hazard for the decision index and
  explicitly did not sweep for others. Swept: every committed artifact behind build:check, by
  replaying the merge the queue performs (base / PR-A / PR-B / fresh, git merge-file, compare
  against a fresh regeneration) rather than by reading code. FIVE aggregates found across THREE
  generators, all with the same trigger — a PR that adds a component: the `count` field in
  components.json and grammar.json, the `**N components · M buckets.**` line in components.md,
  and TWO totals in the §0c split-treatment footer. All five merge CLEAN and land one short,
  and in each artifact the aggregate is the ONLY wrong line — identical to the decision index's
  tally. A sixth (a font count in the marp kit) has the same shape and a trigger that is
  essentially never. Everything else is safe, and the reasons differ: dist/lattice.css is a
  concatenation with no total and merges clean AND correct; the esbuild bundles and
  lattice.min.css CONFLICT, which is loud; capabilities.md and dist/README.md are row-per-input
  tables with no total. The fix removes the aggregates and adds a gate that REPLAYS THE MERGE
  instead of banning a field name, so a future aggregate of any shape fails without anyone
  predicting it. The gate's first cut renamed manifests on disk and broke five unrelated
  assertions under the concurrent test runner; that is recorded rather than deleted.
---

# Sweeping for the rest of the hazard

**#1594.** Follow-on from #1547, which fixed one instance and said in as many
words that it had not looked for others.

## 1. The property, and the test that actually decides it

An artifact is exposed when it is **(a)** generated from *all* of something,
**(b)** committed, and **(c)** byte-gated by `build:check`. The merge queue is
what makes that bite: it rebases onto current `main` and re-runs CI there, so a
PR can be green on its own head and red on a `main` it has never seen — and the
ejection silently clears auto-merge.

The question is *not* "is it generated?" but **does its freshness check assert
anything a single PR cannot be responsible for?** An artifact generated from one
input is fine no matter how large. An artifact carrying a total, a count, or an
ordering over all inputs is not.

**That question was answered by replaying the merge, not by reading code.** For
each candidate, build the four states the queue actually constructs —

| state | what it is |
|---|---|
| `base` | `main`, before either PR |
| `A` | `main`, after PR A merged |
| `B` | PR B's branch, generated before A landed |
| `fresh` | what `build:check` regenerates inside the queue |

— then `git merge-file A base B` and compare against `fresh`. **Clean merge +
different from fresh** is the silent ejection. A conflict is loud and therefore
already handled by HARD RULE #16.

Inputs were **removed** rather than invented, so every byte compared comes from
the real generator over real manifests. For generators that `require()` their
inputs (the esbuild bundles), where hiding a file just breaks the build, two real
source files were **edited** instead — with an exported binding, not a comment,
because a comment is stripped by the minifier and would make the min-bundle arm
trivially clean in all four states.

## 2. What the sweep found

**Five aggregates, three generators, one trigger.** Every one fires on a PR that
adds a component — and in every one, the aggregate is the *only* wrong line,
exactly as the decision index's tally was:

| artifact | the line | generator |
|---|---|---|
| `dist/docs/components.json` | `"count": 61` | `build-docs-portal.js` |
| `dist/docs/grammar.json` | `"count": 61` | `build-docs-portal.js` |
| `dist/docs/components.md` | `**61 components · 13 buckets.**` | `build-docs-portal.js` |
| `…/2026-07-22-structure-derived-split-patterns.md` §0c | `_61 components, all placed …_` | `build-split-treatments.js` |
| the same footer | `… 6 carry it now._` | `build-split-treatments.js` |

Reproduced, with `big-number` and `compare-code` as the two added components:

```
dist/docs/components.md      git merge: CLEAN   vs fresh regeneration: STALE
    line 5:  merged **60 components · 13 buckets.**   fresh **61 components · 13 buckets.**
    1 line(s) differ in total
dist/docs/components.json    git merge: CLEAN   vs fresh regeneration: STALE
    line 297:  merged "count": 60,   fresh "count": 61,
    1 line(s) differ in total
dist/docs/grammar.json       git merge: CLEAN   vs fresh regeneration: STALE
    line 58:   merged "count": 60,   fresh "count": 61,
    1 line(s) differ in total
```

**Two more of the same shape, with a trigger that is essentially never.**
`dist/marp-kit/README.md` carried `fonts/ | 37 files` and `NOTICE.md` carried
`fonts/KaTeX_*.woff2 (20 files)`, both totals over `dist/fonts/`. Two PRs each
adding a font is not a scenario this repo has, but the line is the same line, the
fix is two characters of work, and keeping one known-hazardous aggregate while
deleting five others is not a defensible place to stop. Both are gone; the license
table still names the files by glob, which is what the attribution actually needs.
(Counted as LINES rather than call sites the removals are **seven**: the five above
plus these two.)

## 3. What is safe, and why the reasons differ

Being clear about *which* reason matters, because "it's fine" covers three
different situations:

- **`dist/lattice.css` — no aggregate, merges clean AND correct.** Measured: two
  PRs each editing a different component's `styles.css` produce a clean merge
  byte-equal to a fresh regeneration. The bundle is a concatenation of per-file
  blocks in a deterministic order, and each PR's hunk is exactly its own block.
- **The esbuild bundles and `dist/lattice.min.css` — no aggregate, and they
  CONFLICT.** `dist/lattice-runtime.js`, `dist/lattice-runtime.min.js` and
  `dist/lattice.min.css` all conflicted under two concurrent source edits. That is
  the *loud* failure HARD RULE #16 already covers; a minified bundle is a few very
  long lines, so almost any two concurrent changes collide visibly.
- **`engineering/capabilities.md` — a row-per-input table, no total.** Measured
  with two PRs each adding a tool: clean and correct.
- **`dist/README.md` — a row-per-file table, no total.** Rows land at different
  positions and merge cleanly; two at the same position conflict visibly.
- **`lib/forms/cell/masthead/stage-catalog.generated.js`** and its conformance
  sibling — a sorted array of names, no total, so the row logic above applies.
- **`BACKLOG.md` carries an aggregate (`8 cards need triage`) and is out of
  scope.** It is not in `tools/build.js`, so no PR regenerates it; the nightly
  mirror owns it and auto-merges on its own path.

A structural pass over every `tools/build-*.js` / `derive-*.js` for a `.length` or
`.size` reaching the *output* (rather than the console) found ten candidates and
resolved eight of them as console-only progress lines. That pass is how the §0c
footer and the marp-kit counts were found after the hand-listed candidates in the
issue were already done — worth repeating rather than trusting a reading.

## 4. What shipped

**The five aggregates are deleted, not tolerated.** Per #1547: an aggregate over
every input is the one line two concurrent PRs cannot both be right about, and
letting the gate accept a wrong number ships a stale claim in a committed
artifact. The rows are the record. `components.length` is the count, computed by
whoever wants it; §0c's placement claim survives as a claim (and `checkSplitOracle`
is what actually enforces it, which the number never did).

**A gate that replays the merge rather than banning a field name.**
`test/unit/cli/docs-portal-merge-race.test.js` builds the same four states over a
filtered copy of the real manifest array, merges them, and asserts the result
equals a fresh regeneration. Reintroducing `count: components.length` fails all
three arms. This is deliberately not a "no `count` field" rule: **a hand-kept list
will be defeated** — the token-list background guard was beaten four ways in #1528
before it was replaced by a structural rule — and the next aggregate will not be
called `count`. A fourth arm asserts the fixture is real, so the three cannot pass
vacuously if `loadAll` or a renderer changes shape.

`removed` is the right Keep-a-Changelog category for the JSON fields: `count` was
a top-level key in two published catalogs (`dist/` ships in the tarball), so a
consumer reading it breaks. `components.length` is the replacement, and it was
always the same number.

## 5. The gate's first cut broke the run it was part of

Recorded rather than quietly fixed, because the failure mode is general.

The first version simulated "before this PR" by **renaming two manifests on
disk** around each render. Run alone it passed in about a second. Under
`npm test` it took **five unrelated assertions down with it** — the loudest being
`tag clustering` failing with *"search tag(s) used by exactly one component:
snippet"* — because `node --test` runs test FILES concurrently, so any suite that
reads the component catalog could observe the tree mid-rename.

A gate that corrupts the run it belongs to is worse than the defect it guards, and
the failure it produced pointed at a completely unrelated subsystem. The render
functions are pure over their manifest argument, so the rewrite passes a filtered
array and touches nothing: same four states, same assertion, no filesystem, and
0.4s instead of 1.1s.

## 6. What this does not fix

- **Hand-written counts elsewhere are untouched and are a different problem.**
  `package.json`'s description says "58 layouts"; `capabilities.md` has a curated
  line mentioning "61 components"; `build-split-treatments.js`'s own header quotes
  a §0c title that said 59 when the catalog was 61. None of these is a merge
  hazard — nothing regenerates them, so two PRs cannot disagree about them — but
  each is a number that can go stale silently. Off the path of this change
  (HARD RULE #18), and worth its own card.
- **The gate covers the docs-portal trio only.** Extending it to `dist/lattice.css`
  or the bundles would mean running those generators four times in the unit suite,
  which is minutes, not milliseconds. Their safety is measured here rather than
  pinned, and §1's method is the thing to re-run when a new artifact joins the
  build.
- **Ordering is still asserted byte-exactly by every `--check`,** and this does not
  relax that. It does not need relaxing: two insertions at different positions
  merge cleanly and stay in order, and two at the same position conflict visibly.
  That is the same conclusion #1547 reached for the index rows.
- **Nothing prevents a new generator from shipping a new aggregate.** The gate
  covers three artifacts. The durable protection is the question in §1, asked of
  each new committed artifact.
