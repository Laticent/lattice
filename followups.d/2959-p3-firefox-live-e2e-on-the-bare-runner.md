---
origin: 2959
priority: P3
recorded: 2026-10-29
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §5
deferred: large — moving the Firefox arm back into the e2e job means proving the permission fix on the bare runner and retiring a nightly job, a CI change of its own
source: https://github.com/Laticent/lattice/pull/2959
---

# Run the Firefox live-session spec on the bare runner, not in a container

```text
  P3 · [no ticket] fold the firefox-webrtc nightly job back into the e2e job
       why now   — on the bare GitHub runner Firefox gathered only its default address and the
                   lookup failed ("failed to find default addresses"), so filo-live.spec.ts runs
                   in Firefox in its own nightly job, firefox-webrtc, inside Playwright's container.
                   With the profile granting the microphone and camera permission
                   (permissions.default.microphone/camera = 1) it passes there: 2 of 2, run
                   40897540574. Whether that grant alone fixes the bare runner was never tried.
       where     — docs/e2e/filo-live.spec.ts (the CI skip); .github/workflows/studio-e2e-nightly.yml
       done when — a bare-runner Firefox run of filo-live is green and the container job is gone,
                   or the decision note says why the container stays.
       evidence  — the run link.
       verify    — tier 1 checker, because it touches CI.
```
