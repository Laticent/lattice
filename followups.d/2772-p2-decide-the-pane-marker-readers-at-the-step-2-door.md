---
origin: 2772
priority: P2
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md
source: https://github.com/Laticent/lattice/pull/2772
---

# Step 2 owes: move the six `door` readers, and three small gaps the census does not cover.

The reader decision is made (design §5.4.1): all six pane marker readers move at the door, and the census marks them `door`.
Building it is step 2 work, not done here. When the door lands, the census must show no `door` row.

Three smaller gaps from step 1 stay open:

- `meta-not-own-line` misses a record indented under a list item.
- `HOST_REGISTERS` lost the meta field names, so `checkMetaClaims` is the only guard when `meta` is among the plugins resolved.
- `tools/lint-deck.js` has no `--meta-cut` flag for `legacy-directive-comment`.

```text
  P2 · [no ticket] Build `parsePaneMarker` and the door, move the six `door` readers, close the three gaps.
       why now   — each is a place the typed record would be invisible to.
       where     — design §5.4.1; test/unit/core/meta-readers-census.test.js
       done when — the census prints `0 wait for the door`.
       evidence  — the census test output.
       verify    — tier 2: shared kernel, exported bytes.
```
