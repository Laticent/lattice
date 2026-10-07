---
origin: 2573
priority: P3
recorded: 2026-10-07
area: docs
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2573
---

# Drive /segno's grammar box on WebKit and Firefox

why now   — #2573 verified the /segno playground's worker wiring (one request in flight, a reply
            to every request, the caps) on Chromium only, and graded its confidence "high" on that
            floor alone. Finding 4's guard (`w === worker`) is correct by reading, not by a run on
            the engines where a reply from a terminated worker can arrive.
where     — docs/e2e/segno-playground.spec.ts (the 13-step drive at 1440/820/390, committed with
            twin titles: `@gecko` runs on `desktop` + `gecko`, `@webkit-tablet` on `webkit-tablet`).
            Neither engine is installed in the sandbox; run it through the Studio E2E nightly's
            `spec` input (engineering/development.md § e2e).
done when — the 13 steps pass at all three widths on WebKit and Firefox, or a failure is fixed.
evidence  — the spec's per-step table per engine (its `segno-steps-<width>` attachments).
verify    — tier 0 gates; tier 1 if the run finds a bug.
