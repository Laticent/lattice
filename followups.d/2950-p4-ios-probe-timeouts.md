---
origin: 2950
priority: P4
recorded: 2026-10-29
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-playground-focus-sync.md §The iOS suites restart a stuck start
deferred: off-path — Studio and Playground behavior the probes test (editor load, the Coach button, focus sync), not the start harness #2961 changes; each needs its own reproduction on the iOS Simulator
---

# Chase the iOS probe timeouts that are not start failures

why now   — three probe steps timed out in iOS Simulator runs after the session had started, so each is a real
            assertion about the app, not the harness (a fourth, the iPad photo measurement, is now issue #2967):
            - the Studio editor's 90 s wait on the iPhone (run 40757556454);
            - the Coach button's 15 s wait on the iPad (run 40693703379);
            - two of four quiet focus-sync taps left uncentered (run 40751811918).
            The Coach sheet's close step also timed out once (run 40793148479); #2961 fixed that one in the probe.
where     — `docs/scripts/ios-safari/studio-probe.js`, `photo-probe.js`, `focus-sync-probe.js`, and the Studio code
            each names.
done when — each is reproduced and fixed, or shown to be the probe's own timing and the probe made robust, with
            the run that shows it passing.
evidence  — per item: the failing run, the cause, and a passing dispatch of the suite after the fix.
verify    — tier 1: self-review with the gates, plus a dispatch of the suite on the fix branch.
