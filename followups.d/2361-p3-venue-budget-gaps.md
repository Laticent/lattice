---
origin: 2361
priority: P3
recorded: 2026-09-27
---

# Venue rows that know `compact`

why now   — found by the checker on PR #2410. The per-venue rows (`venueCapacity`) are measured on
            the bare component, so they do not know `compact`: a five-pair `q-and-a compact` slide
            fits at 1x, but lint's venue row says 4. Lint no longer claims a 1x clip there (it drops
            the claim for a slide its `withCompact` budget holds), but at a venue it still quotes
            the bare count. (The original item — measure `compare-code` and `obligation-matrix` per
            venue — shipped in #2410: 20/17/15/13 lines per pane, 19/16/14/11 under an eyebrow;
            7/6/6/5 rows.)
where     — tools/calibrate-capacity.js (`--variant compact` already works), the q-and-a and
            cards-stack manifests (`venueCapacity.variants.compact`), lint-core `scaleCapacityFor`
            (it reads a variant row when the slide carries the token — so this may need only the
            measured rows).
done when — `venue: huddle` + a five-pair `q-and-a compact` slide is judged by a measured compact
            row, pinned by a unit test.
evidence  — the calibration runs at 1 / l / xl / 2xl.
verify    — tier 0: the unit test plus `npm run lint:deck:all`.
