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

2026-11-12 (#3150) — the container job no longer starts at all: Playwright's image `v1.56.1-noble` ships Node
v22.20.0, and Astro now refuses it ("Node.js v22.20.0 is not supported by Astro! ... >=22.23.4"), so the web server
exits and `firefox-webrtc` fails before any test. Red on `main`'s nightly (run 43017679054) and on both #3150
dispatches (43166338789, 43181352130). The fix is a CI change, so it is the owner's: a `setup-node` step to 22.23.4+
inside the job, a newer Playwright image, or this follow-up's move to the bare runner.

2026-11-13 — the Node half is fixed: the owner picked D1 A on PR #3164's decision card, so `firefox-webrtc` now takes Node 22
through `actions/setup-node`, like every other job in the workflow, and checks it is at least Astro's 22.23.4. The image
tag stays the browser pin. This follow-up's own item, moving the job to the bare runner, is unchanged.
