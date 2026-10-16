---
status: shipped
summary: >
  The nightly player-contrast sweep took 2 h 02 min in CI because it exported and audited all
  280 decks in `examples/` one at a time. It now audits the 75 component galleries, 3 at a time,
  and on a weekday only the galleries a change since the last green run could have moved. A full
  75-gallery sweep measured 15 min on a 4-core sandbox, 28,124 text runs and 44 known sub-AA
  findings. The selector is the smaller win than it looked: over the 12 days to 2026-10-16 a
  shared path (`lib/core`, `lib/base`, `package.json`, `lattice.js`) changed on 11, so the daily
  run would have been the full set on 11 of 12 days. The galleries and the pool carry the saving.
builds-on: 2026-08-24-player-contrast-oracle-stability.md
---

# The player-contrast sweep runs on the galleries, in parallel, on what changed

**Owner ruling, 2026-10-16.** After the sweep was measured at about two hours a night, the owner
asked for three changes: run it on the component galleries, run only the decks whose components
or themes changed since the last green night with a full sweep weekly, and run several decks in
parallel inside the job.

## 1. What changed

| Before | After |
|---|---|
| 280 decks in `examples/`, one at a time | the 75 galleries at `lib/components/<bucket>/<name>/<name>.gallery.md` |
| every deck every night | weekdays: the galleries a diff since the last green run could move; Sunday: all 75 |
| `spawnSync` export, one browser | async export, `--concurrency N\|auto` workers, one browser each (`auto` = cores minus one, at most four) |
| baseline keyed by 285 example findings | baseline keyed by 44 gallery findings, blessed from scratch |
| a baseline row for an unopened deck read as "fixed" | a sweep scores only the decks it opened; a bless rewrites only those |

## 2. Measurements (4-core sandbox, 2026-10-16)

| | Time | Notes |
|---|---|---|
| CI nightly step, 280 examples, serial | **2 h 02 min** | run 116, 16:20Z to 18:23Z |
| 13 galleries, serial | 422 s (32 s a gallery) | projects to about 41 min for 75 |
| the same 13, 3 workers | 157 s (12 s a gallery) | **2.7x** faster |
| all 75 galleries, 3 workers, `--bless` | **901 s (15 min)** | 28,124 runs, 44 findings |

A deck costs about 16 s to export and 8 s to audit; the export is a child process, which is why
a pool of exports overlaps. The CI runner has not been timed on the new corpus: the first
nightly after merge will, and the step prints its scope in the report.

**Parallel does not add noise.** Serial against 3 workers over 13 galleries: 4,956 runs, the
sub-AA set identical, no run crossing the AA line, 32 runs (0.6%) differing by more than the
0.05 band. A second serial run of the five decks that held those 32 differed on the same 32. They
are run-to-run variation on animated slides (a `quadrant` label reads 11.5 on one run and 21.0 on
the next) and all sit far above AA, where the baseline holds no row.

**Against the fresh baseline.** A second full sweep (899 s) read 28,124 runs, 44 known, **0 new, 0
worse, 0 fixed**: the pooled run reproduces the pooled bless. A sweep of 3 galleries read 822 runs,
44 known, 0 new, 0 worse, **0 fixed**; unscoped, the same sweep would have called the 41 rows of
the 72 galleries it did not open fixed (pinned by the `diffBaseline scoped` unit arms).

## 3. Why the selector is conservative, and what it saves

`tools/player-contrast-select.js` classifies each changed path by the first rule that matches:
a path that cannot change a player (docs, tests, notes, CI config, `examples/`, the `lib/`
directories nothing in the export reads) selects nothing; a path under a gallery's own folder
selects that gallery; a theme selects the galleries on it or on its dark or light partner; anything
else selects every gallery. **The default is "everything", so an unclassified path costs a full
sweep and can never cost a missed regression.**

The `lib/` list of non-render directories (`concepts`, `conformance`, `diagnostics`, `exemplars`,
`helpers`, `playground`, `tokens`) comes from tracing the files 15 galleries' exports opened
(a Node `fs` and `require` hook over `lattice.js --player`) and grepping every importer of each.
The trace also showed what the export does read: 187 files in `lib/core`, plus `lib/base`,
`lib/engine`, `lib/plugins`, `lib/packages`, `lib/authoring`, `lib/transformers`, `lib/samples`
(image assets) and the built `dist/lattice.css`.

**What it saves, measured.** Replaying the selector over the first-parent commits of `origin/main`
by day for the last 12 days with commits: 1 day selected nothing, 0 selected a subset, 11 selected
all 75. Per merge, over 60 merges: 35 nothing, 0 subset, 25 all. The repo merges 5 to 30 PRs a day
and nearly every day one of them touches `lib/core`, `lib/base`, `lattice.js` or `package.json`.
So the weekday run is usually the full set at 15 min, not a subset; the weekly Sunday sweep is
the same sweep on a day the selector would have run it anyway. Both are still worth having: a
quiet day (a docs-only day, a weekend) costs seconds.

## 4. What the selector cannot see

* **A component whose CSS leaks into another component's gallery.** Changing `cards` does not
  reopen a gallery that embeds a `cards` grid. Galleries are meant to be isolated (HARD RULE #8);
  the Sunday sweep is the backstop.
* **Themes that no gallery uses.** Every component gallery is on `indaco`, so a change to
  `cuoio` selects nothing. The per-PR palette sweep and the nightly palette matrix cover the other
  themes; the old example decks (`token-contrast/<theme>`) did touch them here, and that
  coverage is gone from this sweep.
* **Composed decks.** `examples/` held real mixes of finishes, registers and components that no
  gallery has. They are out of this sweep by the ruling. `examples/` is not unguarded: it is
  rendered by the golden-diff and the regression gate. Auditing them for contrast again would be
  a separate, owner-sized decision (a weekly job at about two hours).

## 5. The "last green run" marker

The nightly job as a whole is not a usable signal: the committed-golden arm is knowingly red, and
run 116 concluded `success` anyway. The marker is therefore this arm's own pass: when the sweep
finishes with `failed=false` on `main`, the step saves the commit SHA to the Actions cache under
`player-contrast-green-<run id>`; the next run restores the newest one by prefix. A missing marker,
an evicted cache or a SHA the checkout cannot reach means a full sweep. A branch dispatch reads
`main`'s marker and never writes one, so proving the change on a branch cannot move `main`'s
window.

## 6. The baseline was re-keyed once, from scratch

The old 285 rows named example decks that this sweep no longer opens; carrying them through the
new scoped bless would have left them in the file for good. The file was emptied and blessed
from a clean 75-gallery sweep (44 findings, 0 held), so its diff is the whole transition. It is
the one bless in this repo made on a branch, and it is safe only because every row is new: the
ratchet rule (never write a ratio down) has nothing to compare against. After the merge it
returns to being blessed on `main`.

## 7. Follow-ups

* `tools/conformance-render.js` (#2729) has its own `changedComponents`, a regex over component
  paths. When that lands, share one classification between the two (HARD RULE #15). It was not
  stacked here (#17).
* The 44 findings by gallery: `heatmap` 24, `diagram` 10, `split-panel` 4, `flowchart` 3, `citation-card` 2, `regulatory-update` 1. They are baselined as known, as before, and tracked in #1745.
