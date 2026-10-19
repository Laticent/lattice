---
origin: 2772
priority: P2
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md
source: https://github.com/Laticent/lattice/pull/2772
---

# Move the 22 readers that stayed onto the door at step 2.

Step 1 moved 20 of the 42 hand-rolled comment readers onto `lib/core/meta-record.mjs`. The other 22 are listed with a reason
in `test/unit/core/meta-readers-census.test.js`. The pane marker readers (`pane-spec.js`, `panes.js`, `PresentOverlay.tsx`,
`pane-pages.ts`, `pane-probe.ts`, `pane-model.ts`) move with the step 2 door (design note §5.4). The rest need a helper the
scan does not offer: a character span per comment (`prose-budgets.js`, `review-core.js`, `marp-bundle-math.js`, `Editor.tsx`,
`rename.js`) or an "unsure" answer (`liveTrackDirective`). Also: `meta-not-own-line` misses a record indented under a list
item; `HOST_REGISTERS` lost the meta field names, so `checkMetaClaims` is the only guard when `meta` is among the plugins
resolved; `tools/lint-deck.js` has no `--meta-cut` flag for `legacy-directive-comment`.

```text
  P2 · [no ticket] Decide each stayed reader at step 2: migrate it, or keep it with the reason updated.
       why now   — each is a place the typed record would be invisible to.
       where     — the census test names every file.
       done when — the census shows no `stays` that the door could serve.
       evidence  — the census test output.
       verify    — tier 1 independent checker.
```
