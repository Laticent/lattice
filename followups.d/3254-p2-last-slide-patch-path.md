---
origin: 3254
priority: P2
recorded: 2026-11-17
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §10
deferred: off-path — a speed path, not correctness; #3254 fixed the byte-exactness of scopedResyncPatch, and this one takes the slower whole-source path correctly
source: https://github.com/Laticent/lattice/pull/3254
---

# An edit to the last slide always takes Compose's whole-source resync

```text
  P2 · [no ticket] keep a last-slide edit on the narrow patch path
       why now   — scopedResyncPatch (docs/src/lib/compose/scoped-resync.ts) returns whole() when
                   patch.to > regionEnd. Its comment said that cannot happen; instrumented over the
                   "scoped resync over every deck" corpus it fired 2,222 times. An edit to the LAST
                   slide whose byte diff reaches into the deck's tail (its trailing newline) ends past
                   the run: on '# A\n\na\n\n---\n\n# B\n\nb\n', appending to B gives patch.to 20
                   against a run end of 19. The result is correct; it is the full-source cost, on the
                   slide authors edit most while drafting.
       done when — the run's end includes the doc's tail for the last slide (or the patch is clamped to
                   the run when the tail is unchanged), a last-slide edit stays narrow, and a test pins
                   it: scanned below the whole-source path's on the corpus's last-slide cases.
       evidence  — the comment and the guard at the `patch.to > regionEnd` line; the instrumented count
                   in #3254's PR body.
       verify    — tier 0: npx vitest run src/lib/compose/ from docs/.
```
