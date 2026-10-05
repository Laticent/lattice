---
origin: 2539
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2539
---

# Measure the chat agent's first fit check on a cold page

why now   — #2539 gave the agent a fit check (draft-fit.ts → measureDeckFit), proven warm
            on the real Studio with a mocked model and with a live one. The FIRST check on a
            cold page is unmeasured: the capture frame's bounded waits (load, fonts, diagrams)
            can sum past the 15 s DRAFT_FIT_TIMEOUT_MS, which reports fit as "not measured" —
            honest, but it leaves the first edit of a session without a fit verdict.
where     — docs/src/components/studio/draft-fit.ts (DRAFT_FIT_TIMEOUT_MS),
            chat-agent.ts (withFit), export/deck-export.js (createCaptureFrame's waits).
done when — the cold first-check time is measured over 3 runs on the built Studio, and the
            timeout raised or the frame pre-warmed if the first check misses it.
evidence  — the cold timings, before/after if anything changes.
verify    — tier 0 gates plus the real-surface timing; tier 1 checker only if a pre-warm
            touches the startup path.
