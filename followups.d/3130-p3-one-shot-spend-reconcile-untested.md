---
origin: 3130
priority: P3
recorded: 2026-11-11
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §How the rule is held
deferred: off-path — #3130 touches neither architect.ts nor a test of its one-shot path; it fixed the chat path's twin of this check
---

# The one-shot Architect's exact-cost reconcile has no test

why now   — #3130's mutation check disabled the reconcile in `docs/src/components/studio/architect.ts` (~1659,
            `adjustSpend(exact - est, turnDeck)` after `openRouterGenerationCost`) and every test still passed:
            `openRouterGenerationCost` appears in no test of that path. A broken reconcile would leave the spend at
            the estimate, or move it the wrong way, and nothing would say so. The chat path's copy
            (`chat-agent.ts`) is now pinned by `architect-agent.chat.test.ts`, which asserts the exact total.
where     — `docs/src/components/studio/architect.ts`, the one-shot completion's pricing block.
how       — copy the chat test's shape: a backend that reports a generation id, an `openRouterGenerationCost` stub
            with a known figure, and `vi.waitFor` on `readSpend().session - before` equal to the exact cost. Show it
            failing with the `adjustSpend` line dropped and with its sign flipped.
done when — a test pins the one-shot reconcile to the exact figure and fails on both breaks.
