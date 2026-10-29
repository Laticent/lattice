---
origin: 2950
priority: P4
recorded: 2026-10-29
area: website
severity: high
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
deferred: off-path — Studio and Playground behavior the probes test (photo-contrast measurement, editor load, focus sync), not the start harness #2961 changes; each needs its own reproduction on the iOS Simulator
---

# Chase the iOS probe timeouts that are not start failures

why now   — four probe steps timed out in iOS Simulator runs after the session had started, so each is a real
            assertion about the app, not the harness:
            - the photo-contrast measurement for slide 2 never replaced the instant `thin-card-no-ink` wording on the
              iPad, 30 s after slide 1's fix landed (branch dispatch 40789969437, job 123172584409; its screenshot
              shows the unmeasured wording and no fix button). It passed on the iPad in the next two runs, then
              failed the same way in `ios-safari-photo`'s first run (40806304171, job 123227060215): 2 of the iPad's
              4 photo runs, so likely a real bug rather than probe timing. Code:
              `docs/src/components/studio/coach/photo-contrast-watch.ts` (#2942). A possible product bug on iPad Safari.
            - the Studio editor's 90 s wait on the iPhone (run 40757556454);
            - the Coach button's 15 s wait on the iPad (run 40693703379);
            - two of four quiet focus-sync taps left uncentered (run 40751811918).
            The Coach sheet's close step also timed out once (run 40793148479); #2961 fixed that one in the probe.
where     — `docs/scripts/ios-safari/photo-probe.js`, `studio-probe.js`, `focus-sync-probe.js`, and the Studio code
            each names.
done when — each is reproduced and fixed, or shown to be the probe's own timing and the probe made robust, with
            the run that shows it passing.
evidence  — per item: the failing run, the cause, and a passing dispatch of the suite after the fix.
verify    — tier 1: self-review with the gates, plus a dispatch of the suite on the fix branch.
