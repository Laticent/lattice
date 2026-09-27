---
origin: 2335
priority: P3
recorded: 2026-09-27
---

# `cards-stack` drifts from the modifier-effects oracle

why now   — a full `npm run check:modifier-effects` run (the checker on #2335's branch) reports
            `cards-stack` gaining `card-row` over the committed oracle, so the editor's `_class:`
            completion is out of step with what the render measures. Found by #2335's checker and not
            touched by it: that branch changes only the `chart-marks` probe.
where     — lib/core/modifier-effects.generated.json; tools/check-modifier-effects.js
done when — the drift is explained (a real effect → bless it; a probe artifact → fix the probe) and a
            full run reports no `cards-stack` drift
