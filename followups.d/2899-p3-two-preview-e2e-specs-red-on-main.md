---
origin: 2899
priority: P3
recorded: 2026-10-25
area: website
severity: medium
swimlane: engineering/decisions/2026-09-01-preview-remote-subresource-posture.md
source: https://github.com/Laticent/lattice/pull/2899
---

# Two nightly preview specs fail on desktop Chromium: the kpi pill ground and the remote-subresource placeholder count

why now   — found while running the preview specs for #2899 on a fresh `build:e2e`. Neither deck has a list item or
            uses the Studio patch path, and #2899 changes neither surface; these specs run nightly, not per PR.
            - `playground-kpi-pill.spec.ts` (burgundy light, indaco dark, carbone light): the pill ground computes
              to `color(srgb … / 0.1)`, and the spec requires an opaque ground.
            - `preview-remote-subresource.spec.ts`: 2 `repeating-linear-gradient` placeholders where it expects 1,
              likely the spec trailing #2871's new remote-reference tokenizer (now both spans are caught).
where     — docs/e2e/playground-kpi-pill.spec.ts, docs/e2e/preview-remote-subresource.spec.ts and the code each pins.
done when — each spec is green on `main`, by fixing the defect it found or by correcting an expectation that a later
            change made stale, with the reason recorded.
evidence  — the two specs passing on `desktop`.
verify    — cd docs && npx playwright test e2e/playground-kpi-pill.spec.ts e2e/preview-remote-subresource.spec.ts --project=desktop
