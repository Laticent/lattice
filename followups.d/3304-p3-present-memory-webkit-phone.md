---
origin: 3304
priority: P3
recorded: 2026-11-22
area: website
severity: low
swimlane: docs/src/components/studio/read-aloud.ts
deferred: blocked — #3394 (34b68e4) fixed the cause on main; #3304 rebases only on a real conflict (HARD RULE #16), so the exclusion goes when #3304 next rebases or after it merges
source: https://github.com/Laticent/lattice/pull/3304
---
# Drop the webkit-phone exclusion from the present-frame memory spec

why now   — #3304's present-frame-memory.spec.ts skips webkit-phone because of the Voice-off bug. The flake desk
            reported (2026-11-22) that #3394 merged its root fix as 34b68e4 (the empty-provider guard in voice-model.js
            prepareSelectedVoice) and added a nightly iOS keepalive probe, so the exclusion is no longer needed.
where     — docs/e2e/present-frame-memory.spec.ts on #3304 (the test near line 67 that is not tagged @webkit-phone);
            the swimlane file is where #3394's Voice-off fix landed (prepareSelectedVoice).
done when — the spec runs on webkit-phone with no exclusion and passes.
evidence  — a green webkit-phone run of the spec, plus the HARD RULE #34 arms (failing arm, --repeat-each=10,
            --workers=4 --repeat-each=5).
verify    — the e2e spec on webkit-phone (Playwright installs WebKit itself).
