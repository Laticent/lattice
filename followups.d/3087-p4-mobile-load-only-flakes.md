---
origin: 3087
priority: P4
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: large — the WebKit and Gecko items each need their own investigation, and another session owns those projects
source: https://github.com/Laticent/lattice/pull/3087
updated: 2026-11-21, the Chromium flake triage (every Chromium item cleared or owned elsewhere; WebKit, Gecko and iOS stay)
---

# Specs that fail only under full-project load: what is left after the Chromium triage

why now   — A test that fails only under load still fails in CI's merge train (HARD RULE #32). This note began as
            ten-odd mobile and desktop specs that passed alone and failed in full 4-worker runs (PR 3087, PR #3102,
            PR #3228, the docs-perf PR). The Chromium half is now settled; what is still open is listed here.
open      — Chromium items another branch owns, not re-run by the triage:
            - playground-deck-settings.spec.ts:110 (mobile): PR #3278's (see its entry below).
            - fabricate.spec.ts:311 (desktop): #3357.
            - journeys/chart-export.spec.ts:124 (desktop; 1 of 24 under load on main af00ca3, 2026-11-16): #3307.
            WebKit, Gecko and the iOS Simulator: the entries below.
cleared   — 2026-11-21, branch claude/chromium-e2e-flake-triage, on main 450df6d with a fresh `build:e2e`, all three
            Chromium projects (desktop, tablet, mobile), --retries=0, whole spec files: 4 workers x2 (550 passed, 0
            failed), 4 workers x8 (2,199 passed, 1 failed: present-beat, below), and 1 worker x5 (1,369 passed; six
            runs lost a trace file to a concurrent run's cleanup of test-results/, and those six went 30 of 30 when
            re-run alone). Nothing failed alone. Every Chromium item this note listed is stale, at least 10 load runs and
            5 alone runs each with no failure:
            logo-wall-first-visit:74, playground-tab-switch:211, plugin-inline-ui:136, settings-reopen:81,
            collage-lightbox:314, :348, :385 and :483, filo-undo:157, gallery-preview-metamorphic:370, model-spine:155,
            panel-shells:138, stage-window:168, status-pill:24, compose-soft-break:22 and :50, library-voice-spine:140
            and :151, compose-note-motion:260, compose-stress:538, studio-export-offline:114.
            present-beat.spec.ts:49 is the one real load failure: a test timeout with every assertion passing, because
            walking eight slides one fake-clock frame at a time took 55 to 64 s under load against a 60 s limit (shape
            F4). The same branch steps the stretches where nothing is measured in 250 ms chunks: 48 of 48 at 4 workers
            x12, and the measured hold still fails when the product's beat is shortened. Evidence in that PR.
            The earlier fixes (demo-mobile:535, collage-lightbox:348/:385 and model-spine:155 on 2026-11-10;
            compose-soft-break, chart-detail-reveal and lenses-landing on 2026-11-12; demo-mobile:437 and
            library-images-render:152 in the flaky-e2e touch PR) are recorded in those PRs.
also      — 2026-11-10, same PR: collage-lightbox.spec.ts:395 on gecko
            failed once in a 3-worker mixed run and passed 6 of 6 alone at 3 workers.
            Four more from the same PR's full runs on its build (tablet + mobile at 4 workers; webkit-phone, webkit-tablet
            and gecko at 3), recorded nowhere before: back-gesture.spec.ts:183 (webkit-phone), switch-controls.spec.ts:97
            (webkit-tablet) and table-reflow-preview.spec.ts:71 (webkit-tablet; then 8 of 8 at 4 workers). Each failed once in its full run and passed 3 of 3 alone. Not
            compared against main; not investigated.
where     — the specs named above that the "fixed" entry does not name.
done when — each failure is reproduced under full-project load and fixed at its cause, or 10 full
            mobile-project runs on main pass and this file is deleted with that evidence.
evidence  — per spec, runs and outcomes under load, before and after.
verify    — npx playwright test --project=mobile --retries=0, repeated.


2026-11-11 — PR #3140 saw model-spine.spec.ts:155 fail on mobile once, after its fix, while a commit hook ran the unit
            suite beside the e2e run. The 2026-11-21 triage ran it 15 more times (10 under load, 5 alone) on all three
            Chromium projects with no failure, so it is cleared with the rest.
2026-11-17 — the iOS Simulator Studio probe's Menu tap (docs/scripts/ios-safari/run.mjs `deckTapLeavesLibrary`, iPhone)
            opened no menu in about 1 rep in 10 during PR #3278's counts (runs 44052932291, 44052943412, 44052948172),
            with the sheet fix in and without it, so the sheet change does not cause it. The run ended "timed out waiting
            for the Library row". PR #3278 made the probe tap only a Menu React has wired, and log the Menu tap's own
            events on that timeout. Since then it has not come back: 15 of 15 Menu taps opened the menu across runs
            44059959611 and 44135586134. Not fixed, because there is no failing run to read a cause from; the next red
            prints the Menu tap's events in its job log.
2026-11-21 — the WebKit and Gecko rows above, triaged on main 450df6d (one `npm run build:e2e`, --retries=0): each test
            alone on its own project (--workers=1 --repeat-each=5), then under load (--workers=3 --repeat-each=8).
            - switch-controls.spec.ts:97 (webkit-tablet): 5 of 5 alone, 8 of 8 loaded. STALE.
            - table-reflow-preview.spec.ts:47 (the old :71, webkit-tablet): 5 of 5 alone, 8 of 8 loaded. STALE.
            - collage-lightbox.spec.ts:395 (gecko): the test at that line is not tagged `@gecko` today, so all four gecko
              tests in the file ran: 20 of 20 alone, 32 of 32 loaded. STALE.
            - back-gesture.spec.ts:172 (the old :183, webkit-phone): 5 of 5 alone, 1 of 8 RED loaded (the deck-band tap
              left the Library open, back stack `1/1/0`). Load-only, and its fix is the sheet-scrim change in #3278
              (3 in 100 red on main before it, 100 of 100 after); it stays with that PR.
            The three STALE rows close here; back-gesture closes when #3278 lands.
