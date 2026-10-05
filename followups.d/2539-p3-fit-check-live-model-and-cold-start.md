---
origin: 2539
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2539
---

# Prove the chat agent's fit check against a live model, and on a cold page

why now   — #2539 gave the agent a fit check (draft-fit.ts → measureDeckFit). It is proven
            on the real Studio only with a MOCKED model, and only warm. Two things are
            unmeasured: whether a real model acts on the verdict (cuts or splits the slide
            in its next round), and how long the FIRST check takes on a cold page — the
            capture frame's bounded waits can sum past the 15 s DRAFT_FIT_TIMEOUT_MS, which
            reports fit as "not measured" (honest, but useless).
where     — docs/src/components/studio/draft-fit.ts (DRAFT_FIT_TIMEOUT_MS),
            chat-agent.ts (withFit), architect-agent.ts (checkDeck fit block).
            The real-key harness pattern is in decision note §7 (.scratch/ only,
            HARD RULE #24); drive the built Studio with --proxy-server and the CCR CA SPKIs.
done when — one live-model turn (Sonnet, ~$0.05) that writes an overfull slide gets the
            verdict and fixes it before the turn ends; and the cold first-check time is
            measured, with the timeout raised or the frame pre-warmed if it misses.
evidence  — the turn's request log + the before/after draft; the cold timing over 3 runs.
verify    — tier 0 gates plus the real-surface run; tier 1 checker only if the timeout or
            pre-warm changes code on the startup path.
