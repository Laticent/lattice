---
origin: 2518
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2518
---

# Run an independent checker over the Studio chat agent's last three commits

why now   — #2518 merged at "high" confidence, not "very high". The independent checker
            covered everything up to ccfdeaa. Three later commits were self-reviewed
            only: 743980b (the checker's own fixes), the main merge, and 4979af1. 4979af1
            changed the transport payload: a cache_control mark on tool messages, and
            edits that run the linter on every call.
where     — docs/src/components/studio/architect-agent.ts (withCheck, the edit tools),
            docs/src/components/studio/ai/or-cache.js (withCachedTail),
            docs/src/components/studio/ai/architect-model.js (cacheTail, the tools
            self-heal guard), docs/src/components/studio/chat-agent.ts. Diff on main:
            the squash 2b7f1b2 against its parent, restricted to those files.
done when — a checker's findings are fixed or answered in a PR, and every fix is
            pinned by a test in architect-agent.test.ts / architect-agent.chat.test.ts.
evidence  — the checker report plus the tests; any transport change re-driven on the real
            Studio (one Apply turn on the default model, one on a tool-less model).
verify    — tier 1 independent checker, because the change touches the model transport
            every cloud chat turn goes through.
