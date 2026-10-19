---
origin: 2788
priority: P1
recorded: 2026-10-19
area: website
severity: medium
swimlane: engineering/decisions/2026-10-19-studio-main-thread-jank.md
---

# Stop the agent's per-edit fit check from blocking the page for a whole-deck render

why now   — Every `edit_slides` result renders the entire draft in an offscreen frame and measures
            every slide. On a 40-slide gallery deck at 4x CPU throttle that was a 3.7 s gap in the
            page (about 0.9 s unthrottled), almost all layout and style recalculation inside the
            frame, which no chunking can split. It is the "slight hang while the agent works" that
            #2788's chat fix does not touch.
where     — docs/src/components/studio/draft-fit.ts `measureDraftFit`, export/deck-export.js
            `measureDeckFit`, and the wording at architect-agent.ts (~line 705) that says all N slides fit.
done when — the check measures the slides the agent touched (their rendered sections kept with the
            engine's own `data-lattice-slide` numbers), the agent's text claims only what was
            measured, and the same 40-slide trace shows no gap over 300 ms at 4x.
evidence  — the trace in engineering/decisions/2026-10-19-studio-main-thread-jank.md; method:
            built Studio, mocked model returning an `edit_slides` call, `Emulation.setCPUThrottlingRate` 4.
verify    — `npx playwright test` with a spec like docs/e2e/chat-agent-fit.spec.ts, plus the gap trace.
