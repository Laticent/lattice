---
origin: 2376
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2376
---

# list and code declare pane budgets above what the calibration measures

why now   — `node tools/calibrate-capacity.js --all --pane side|stack` on clean `main` (900f6eb)
            reports three budgets over their measured ceiling, all on OVERFLOW: list side hard 6
            against a ceiling of 3, list stack hard 4 against 3, code stack hard 8 against 6. The
            lint that warns an author past a pane budget therefore stays quiet on a list pane that
            clips. Found while re-measuring the chart budgets; not caused by that PR, which touches
            neither component.
where     — lib/components/inventory/list/list.manifest.json and lib/components/code/code/code.manifest.json (`pane.budget`); or the
            list/code pane layout, if the ceilings fell because of a regression rather than a
            stale budget — bisect before lowering.
done when — the calibration reports every declared pane budget within its measured ceiling, and
            the manifest notes quote the new figures.
evidence  — the calibration rows before/after; a bisect result if the ceiling moved.
verify    — tier 0 if it is a stale number; tier 1 checker if a layout regressed.
