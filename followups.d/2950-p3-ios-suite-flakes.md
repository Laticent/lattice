---
origin: 2950
priority: P3
recorded: 2026-10-28
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-21-playground-focus-sync.md §The iOS suites restart a stuck start
deferred: blocked — the done-when is 10 nightly runs, which only time produces; the probe timeouts need runs to reproduce
---

# Confirm the iOS suites' start restart over 10 nightlies, and chase their probe timeouts

why now   — `main`'s nightly failed on an iOS suite on each of its first three days with them (runs 40307494617,
            40485085426, 40674748940), every time because safaridriver never created a session. The fix that answers
            that with one full restart (reboot, Safari relaunch, safaridriver restart) is merged, but one dispatch is
            not a trend.
where     — `docs/scripts/ios-safari/run.sh` and `run.mjs`; the nightly `platform-suites.yml` runs on `main`.
done when — 10 consecutive nightly runs on `main` with no iOS job ending in "no session after two starts" or
            "session not created". Separately, the three probe timeouts seen in PR runs on 2026-10-28 are either
            reproduced and fixed or shown to come from the PR under test: the Studio editor's 90 s wait on the
            iPhone (run 40757556454), the Coach button's 15 s wait on the iPad (run 40693703379), and two of four
            quiet focus-sync taps left uncentered (run 40751811918). Also on #2961's own run 40789969437 (iPad,
            session started first time): `photo: timed out after 30000 ms waiting for the Coach photo finding on
            slide 2`. Its screenshot shows the Coach holding slide 2's instant `thin-card-no-ink` wording ("A
            spotlight card at 0% lets the photo show through…") with no measured ratio and no fix button, after slide
            1's fix had landed. So the measurement in `photo-contrast-watch.ts` (#2942) never arrived, a possible
            product bug on iPad Safari rather than a harness flake; the same step passed on both devices in two other
            runs.
evidence  — the list of the 10 nightly run ids with each iOS job's result, and how many of them logged
            "no session on start 1 of 2" (each one is a failure the restart absorbed).
verify    — tier 1: self-review with the gates; read the nightly logs, not only the job color.
