---
origin: 3563
priority: P1
recorded: 2026-11-27
area: inventory
severity: medium
swimlane: engineering/decisions/2026-09-25-panes-two-components-one-slide.md
deferred: off-path — the list manifest's `adapt.capacity` values; this PR only moved the calibration probe deck to `@meta{}` records
source: https://github.com/Laticent/lattice/pull/3563
---

# list declares adapt capacities above what the calibration measures

why now   — `node tools/calibrate-capacity.js list` reports two declared values over the measured
            ceiling, on overflow, with 14 words per element: `tall` (`@size portrait`) declares hard 7
            against a ceiling of 3, and `square` (`@size square`) declares hard 7 against a ceiling of 6. The same
            two findings appear on clean `main` (89405b4), so the cut did not cause them; it surfaced
            while re-running the tool after its probe deck moved to records. The adapt lint therefore
            stays quiet on a portrait list that clips.
where     — lib/components/inventory/list/list.manifest.json (`adapt.capacity.tall` and
            `adapt.capacity.square`); or the list layout at that size, if the ceiling fell because of a regression
            rather than a stale number.
done when — `node tools/calibrate-capacity.js list` exits 0, with each declared `hard` at or below its
            measured ceiling, or the manifest says why a size is exempt.
evidence  — the tool's before and after output, on the same machine.
verify    — rerun the tool; render a portrait list at the new hard count and look at it.
