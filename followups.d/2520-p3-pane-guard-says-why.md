---
origin: 2520
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2520
---

# Say why when Compose refuses an edit that would merge two panes

why now   — `paneMarkerGuard` (PR 2520) refuses any edit that would leave a pane slide with fewer
            pane markers. Turning a paragraph in the first pane into a `###` is one: the new heading
            would start a pane and fold the second. The refusal is silent, so the author sees a
            formatting command do nothing (found by PR 2520's third review).
where     — docs/src/lib/compose/pane-model.ts `paneMarkerGuard`; the notice kernel is
            docs/src/lib/notify.ts.
done when — a refused edit shows one short notice naming the reason (e.g. "A ### here would start a
            new pane"), at most once per edit, and the refusal itself is unchanged.
evidence  — a vitest arm on the guard, plus tools/screenshot.js of the notice at 1440 and 390.
verify    — tier 0 gates, because the refusal logic does not change, only its message.
