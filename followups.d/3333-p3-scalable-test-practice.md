---
origin: 3333
priority: P3
recorded: 2026-11-20
area: infra
severity: high
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: large — a practice across the e2e suite, the iOS Simulator suites, local tooling and the use-case layer; it needs its own design note and owner decisions (a CI step is one of them), not a rider on a Present PR
source: https://github.com/Laticent/lattice/pull/3333
---

# A scalable, sustainable, effective test practice for interactive surfaces

```text
  P3 · Make testing the real surface cheap, repeatable and honest, for Present first and every interactive surface after
       why now   — PR #3333 (Present keeps playing) shipped correct code but spent most of its wall clock on testing. The
                   owner asked (2026-11-20) for a practice that scales, stays maintainable and catches what matters. The
                   evidence from that one PR, each item measured there:
                   1. GESTURE-BOUND BEHAVIOR HAD NO CHEAP REAL-SURFACE TEST. WebKit grants the screen wake lock only inside a
                      user gesture, and for a touch only when the finger LIFTS (pointerup/click), not on pointerdown. jsdom
                      could not see it, Playwright's Linux WebKit granted the lock to a scripted click, and only the iOS
                      Simulator suite caught it, three runs apart, each 25-45 min end to end.
                   2. THE TAP RULE FAILED ON CLOCKS NOBODY TESTED. WebKit can stamp touch and mouse events on different
                      clocks; a rule comparing event.timeStamp passed jsdom, Chromium and Playwright WebKit and failed on
                      the owner's iPhone (controls flashed on and off). Reproduced only after the fact, in a unit test that
                      forges the timestamps.
                   3. PLAYWRIGHT WEBKIT ≠ iOS SAFARI. It sends a tap as a bare click with no pointer events, so the first
                      tap rule (pointerup) failed there and passed Chromium; the iOS simulator in turn stretched WebDriver
                      touches into long presses (holds of 406 ms to 25,318 ms on four macOS runs), so the probe failed for
                      the simulator's reasons. Fixed only by opening Present with WebDriver ELEMENT clicks (a real gesture
                      with no hold to stretch) and keeping the guarded touch as the fallback: the order focus-sync already
                      used, which nothing pointed the probe author to.
                   4. STALE LOCAL ARTIFACTS PRODUCED FALSE RESULTS TWICE. Playwright's reuseExistingServer served an old
                      preview build (once a deliberately broken one, from a failing-arm run), and a root `npm run build`
                      left dist/ built from a different tree, so build:check failed for unrelated reasons. Both cost
                      reruns and one nearly produced a false green.
                   5. NO PUBLISHED STATE TO ASSERT ON. Present's "is it delivering / holding / is the lock held / is the
                      screen settling" had to be inferred until the PR added data-beat, data-wake and data-settling; every
                      test that inferred (transport label, rail fill, opacity) measured the wrong window at least once.
                   6. NO PLAYBACK VERBS FOR SETUP. Every probe re-implemented "open Present, go to slide N, press Play" with
                      its own selectors and waits (keepalive probe, present-memory probe, e2e specs, ad-hoc screenshot
                      probes written and deleted during the PR).
                   7. CI THROUGHPUT DOMINATED. Runner queues of 10+ minutes, an all-skipped "ready" run from the
                      draft/ready race (since closed by `npm run pr:ready`, #3342), and iOS suites that run only nightly or
                      by dispatch, so a PR finds out late.
       where     — docs/e2e/** and docs/e2e/studio-fixture.ts (helpers); docs/scripts/ios-safari/** (run.mjs, tap-guard.mjs,
                   probe.selftest.mjs, the per-probe page scripts); docs/playwright.config.ts (reuseExistingServer,
                   webServer); .github/platform-suites.json and platform-suites.yml; lib/use-cases/** (a playback use case);
                   lib/core/present-transport.mjs (the one transport kernel); engineering/testing.md;
                   engineering/decisions/2026-11-06-flaky-tests.md (the F1-F9 shapes this extends)
       done when — a design note (engineering/decisions/, owner-confirmed in one decision round) settles, and the PR(s)
                   after it ship:
                   (a) A TESTABILITY CONTRACT for interactive surfaces: each one publishes its state as data-* attributes
                       or one read-only snapshot (Present: slide, step, playing, holding, settling, wake, caption cue), and
                       tests assert on that, never on inferred visuals. Gated or at least linted for Present.
                   (b) PLAYBACK USE CASES (play, pause, go to slide, play from slide) in lib/use-cases/, running the
                       existing present-transport kernel: a product capability for the Studio chat and `lattice mcp`, and
                       the SETUP path for tests. The rule that keeps it from being tautological is written down: drive the
                       behavior under test through real input (tap, key, element click); use the verbs only to get there
                       and the published state only to read. No test-only copy of any tool (HARD RULE #1).
                   (c) ONE REAL-INPUT HELPER for both Playwright and the iOS driver: element click first, guarded touch
                       (tap-guard hold check, one re-delivery) as the fallback, every attempt named in the result. The
                       keepalive probe's version is promoted out of run.mjs; new probes reuse it. It waits for the
                       surface's READY signal first (the Studio's `window.__latticeRenderMetrics`): two keep-alive runs
                       failed by clicking the pre-hydration skeleton's Present button, which has no handler, a trap
                       sheet-focus-probe.js already knew and nothing pointed the new probe to.
                   (d) A WEBKIT GESTURE LIST in engineering/testing.md (or a gotchas topic): user activation at pointerup
                       not pointerdown, Playwright WebKit's click-only taps, the event-clock mismatch, simulator long
                       presses, wake lock needing a gesture, and which surface can prove each.
                   (e) FRESHNESS GUARDS: a local e2e run refuses to reuse a preview server whose build id is not the
                       working tree's, and build:check names a dist/ built from another tree as that rather than as
                       drift.
                   (f) A DECISION ON iOS COVERAGE PER PR: options with measured cost (e.g. path-gated dispatch of the one
                       suite a diff touches, vs nightly only). This is a CI-contract change, so it is the owner's call.
                   (g) The probe self-test pattern (Playwright WebKit run of the same page script, plus failing arms with
                       the fix broken on purpose) becomes the stated bar for every new iOS probe.
       evidence  — Present migrates first: its e2e and the keepalive probe use the playback verbs for setup and the snapshot
                   for assertions, with their selector-and-wait code removed; one new probe on another surface is written
                   from the helper alone and passes its self-test and a dispatch on the first try; a stale-server run is
                   refused locally; time from push to "iOS verdict on this head" is measured before and after (f)
       verify    — npm run test:e2e on desktop/webkit-phone/gecko for the migrated specs; PROBE=<name> node
                   scripts/ios-safari/probe.selftest.mjs for each migrated probe; a platform-suites dispatch per migrated
                   suite; the design note's decision round recorded in the note
```
