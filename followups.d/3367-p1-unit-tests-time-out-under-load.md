---
origin: 3367
priority: P1
recorded: 2026-11-21
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: blocked — what is left (G1) waits on the owner's decision about the docs vitest pool or worker count, a change to the test contract (CLAUDE.md, decisions the owner makes, row 2)
source: https://github.com/Laticent/lattice/pull/3398#issuecomment-7074021849
---

# Heavy Studio unit tests run past the 20 s hang guard when the box is under load

why now   — `npx vitest run src/lib/compose src/components/studio` (docs/) passes alone but fails 27 to 109 tests when a
            4-worker Playwright run shares the 4-core box. The flake desk (session_015KSkL4YsxynRbn58Xd9Yhb) gave the set to
            the session that found it and agreed three groups. Two are fixed in #3398; this item is the third.
            - G2, fixed (#3398, `docs/src/test/orphan-guard.ts`): a timed-out test's leftover work landed on the next
              test's page (about 10 collateral failures on an empty body).
            - G3, fixed (#3398, `docs/src/test/corpus.ts`): five tests each swept the whole shipped corpus; now one test
              per deck. Two corpus-wide tests stay whole because neither nears 20 s: `scoped-resync`'s "scoped resync
              over every deck" (its own 600 s limit) and `raw-block`'s "opens every deck" (cheap). Split them too if G1's
              answer is "unit tests share the box".
            - G1, OPEN: about 90 whole-Studio jsdom tests do real CPU work (about 10 re-renders of StudioShell each),
              1-4 s alone and 20-43 s under load, past the 20 s `testTimeout`. They wait on nothing, so no test-side fix
              exists short of less coverage or a bigger timeout, and the flake desk ruled out the bigger timeout.
              `engineering/decisions/2026-08-23-jsdom-suite-timeout-budget.md` already measured that the work cannot be
              cheaply cut.
            - G4, fixed (#3398): two Studio test files raced a product timer. `studio.editor-hold` raced the 6 s
              first-slide backstop (`FIRST_SLIDE_BACKSTOP_MS`); `studio.controls` read the strip note (6 s) and the New
              slide door's note (1.8 s) after the timer could clear them. Each file now drops exactly those timers (by
              delay and caller) and checks a signal. Two tests first counted here are G1, not G4: `studio.findings-fix`
              ("1 to address") and the `StudioShell` tablet tour row wait on no product timer (a 400 ms debounce and
              mocked work; a tour that starts in 827 ms alone), so under load they overrun Testing Library's 3 s budget
              the way G1 overruns the 20 s one.
measured  — CI: in merge-queue runs 2026-11-08 to 2026-11-22 (about 350), `docs-test` (`npm test -- --maxWorkers=4`, alone on
            its runner) failed 3 times, none of them G1: run 43376276820 (a persistent-surface focus assertion) and runs
            43994458532 and 43999565415 (a real scoped-resync assertion). So G1 is local-only.
            Full docs suite on this 4-core sandbox (2026-11-22, with the G2 guard; the run stopped after three rows):
            default alone 492 s, 13731 passed; default beside the Playwright run 4084 s, 102 failed; `--maxWorkers=2` alone
            703 s, 13731 passed (the flake desk's counts, on an earlier guard; #3398's own runs count 718 files and 13,664
            tests, so read 13731 as doubtful). On #3398's final guard (`17b9c09`): alone 499 s, 13,663 passed; a run that
            accidentally shared the box with a preview server and a Playwright run took 2,989 s with 64 failed: 56 Studio
            timeouts, 5 corpus-wide timeouts (`rendered-index` x3 at its 240 s limit, `payload-elision.oracle`,
            `deck-render.hole`) and 3 assertion misses (`editor-hold` x2, G4, now fixed; `findings-fix`, G1). Still to measure: `--maxWorkers=2` loaded, `--pool=forks` alone and loaded.
where     — `docs/vitest.config.ts` (`testTimeout`, pool, workers); the heaviest files are `studio.controls`, `StudioShell`,
            `studio.theme-depth` and `studio.fuzz`, plus `studio.findings-fix` and the `StudioShell` tour row on Testing
            Library's 3 s budget; under heavy load the corpus-wide `rendered-index`, `payload-elision.oracle`
            and `deck-render.hole` time out too.
done when — the owner has picked a config (or "accept: unit tests do not share the box with a browser run") from the full
            table, and the chosen change is in with the suite green alone and under the same load.
evidence  — the six-row table (wall time and failures for each config, alone and loaded), and the owner's answer.
verify    — tier 1: self-review with the gates; the owner's answer is the decision.
