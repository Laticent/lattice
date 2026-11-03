---
origin: 3004
priority: P2
recorded: 2026-11-03
area: website
severity: medium
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
deferred: blocked — cause unknown: the Studio's photo measurement, which #3004 does not touch; main's nightly failed the same wait on the iPhone (41044755916)
source: https://github.com/Laticent/lattice/pull/3004
---

# On the iPad Simulator, the Coach sometimes never shows the measured photo verdict for slide 2

why now   — `ios-safari-photo` timed out on the iPad, "timed out after 30000 ms waiting for the Coach photo
            finding on slide 2" (run 41547424678, job 125627180710, at 84b789c), the same wait main's
            nightly failed on the iPhone in run 41044755916. The screenshot shows the Coach listing slide 2's generic
            `THIN-CARD-NO-INK` finding ("A spotlight card at 0% lets the photo show through…"), never replaced
            by the measured verdict ("The text on this photo reads at 1.5:1 (needs 4.5:1)…") that every passing
            run shows within the 30 s. Slide 1's measured verdict did arrive in the same run. So the photo
            measurement for slide 2 did not finish, or its result never reached the Coach, on that run.
where     — docs/src/components/studio/coach/photo-contrast-watch.ts; card-ink-sampler.ts; thin-card-fix.ts;
            docs/scripts/ios-safari/photo-probe.js:270-272 (the wait).
done when — the cause is named (the sampler never ran, ran and failed, or its result was dropped), and the
            slide-2 verdict arrives on the iPad in every one of 5 dispatched runs; or, if the measurement is
            legitimately slow there, the Coach says it is still measuring and the probe waits on that state.
evidence  — five green dispatches of ios-safari-photo on the iPad, and the cause in the PR body.
verify    — platform-suites.yml dispatch, suites=ios-safari-photo; node docs/scripts/ios-safari/probe.selftest.mjs
