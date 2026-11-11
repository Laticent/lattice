---
origin: 2772
priority: P2
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md
source: https://github.com/Laticent/lattice/pull/2772
deferred: off-path — neither gap reaches an author today: `meta` is embedded, so it is always among the resolved plugins, and `--meta-cut` is the cut's own switch (step 6)
---

# Two lint gaps step 1 left, for the steps that reach them.

Step 2 built the door and moved every pane marker reader onto `parsePaneMarker` (the census prints `0 wait for the door`).
Of the three gaps step 1 left, step 2 closed the one an author could hit: `meta-not-own-line` now reports a record
indented under a list item (the scan reads its nesting from the deck model). Two stay:

- `HOST_REGISTERS` lost the meta field names, so `checkMetaClaims` is the only guard against a plugin register named like
  a metadata field, and it guards only when `meta` is among the plugins resolved (always, for a real render; not for a
  harness that resolves a subset).
- `tools/lint-deck.js` has no `--meta-cut` flag for `legacy-directive-comment`: step 6, which turns the rule on.

```text
  P2 · [no ticket] Close the two step-1 lint gaps left after step 2.
       why now   — a plugin harness and the cut each need their guard.
       where     — lib/plugins/resolve.js; tools/lint-deck.js; design §9 step 6
       done when — each gap has a failing-then-passing test.
       evidence  — the tests.
       verify    — tier 1: lint rules, no export bytes.
```
