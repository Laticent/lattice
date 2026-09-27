---
origin: 2399
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2399
---

# The inventory bucket gallery drifted from its manifests

```text
why now   — test/integration/components/bucket-galleries.test.js "inventory: source .md matches manifests" is red on main since #2399, which changed a manifest's pairs guidance ("Four; five with compact." became "Five; six is the ceiling.") without rebuilding the generated gallery. The per-PR integration job does not run components/, so only the nightly sees it.
where     — lib/components/inventory/inventory.gallery.md (generated): `npm run build:bucket-galleries`, then rebuild its PDFs.
done when — the bucket-galleries test passes on main.
evidence  — the test's output, before and after.
verify    — tier 0 gates.
```

Found 2026-09-27 by the full integration tier on the portable-packages continuation branch, and
reproduced on a clean checkout of origin/main (68b8b88). Not fixed there: it is a gallery
regeneration (HARD RULE #8 keeps gallery content out of a feature PR), off that PR's path.
