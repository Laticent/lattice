---
origin: 3457
priority: P1
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — did not reproduce (44 of 44 green on webkit-phone, including 4 workers with CPU load, both variants paired at 2 workers, and a full 289-test run); needs the failing run's trace
source: https://github.com/Laticent/lattice/pull/3457
---

# share-narration-rate-limit.spec.ts:48 timed out waiting for the download on webkit-phone

why now   — the meta desk saw it once on 2026-11-22: `page.waitForEvent('download', 240 s)` timed out after "Download
            webpage", during a full 287-test webkit-phone run on main 2676373. The command center handed it over under
            HARD RULE #33.
where     — docs/e2e/share-narration-rate-limit.spec.ts:48; the export path is narration-bake.ts (3 attempts, 45 s
            patience each) over voice-scheduler.js (2 retries per request, AIMD up to the cap of 6).
measured  — click to download: 32 s alone, 54–93 s at --workers=4, 48–107 s with 4 CPU-burning loops added, 32 s and
            40 s inside a full webkit-phone run, 20 of 20 with both variants running together (--workers=2
            --repeat-each=10 -g 'rides out a rate limit'), the pairing the failing run had. Request latency rose only from ~200 to ~350 ms under load (slowest
            request 1.6 s). The export cannot refuse on 429s alone: a sentence needs 9 refusals and the mock sends 6.
            So 240 s needs a real stall that load alone does not produce.
done when — the cause is shown from the failing run's trace (or a repro that turns red), fixed at its root, with the
            HARD RULE #34 evidence. No longer timeout, no retry.
evidence  — the 2026-11-22 run's trace is gone (a later run cleared docs/test-results); its log shows only the
            'Retry-After exposed' variant timed out, in parallel with its sibling. Needs a nightly failure's trace.
verify    — the #34 runs on webkit-phone.
