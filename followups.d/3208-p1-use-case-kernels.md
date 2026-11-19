---
origin: 3208
priority: P1
recorded: 2026-11-19
area: website
severity: medium
swimlane: engineering/decisions/2026-11-17-use-case-layer.md §5, §10
deferred: large — 19 handlers, each owing a golden and a differential run; the READ tools could move now (option B), but the EDIT tools are also blocked on two owner calls: the interim DeckModel adapter and op set that edit kernels return before the slide spine exists (§10 step 0b; the spine itself is followups.d/3287-p1-lente-slide-spine.md, deferred large), and whether a tool may leave SANCTIONED_LEGACY_USE_CASES before #3208 item 34's session replay, since tightening its schema changes what the model sees
source: https://github.com/Laticent/lattice/issues/3208
---

# The 19 legacy chat handlers become kernels (use-case-layer.md §10, steps 2 and after)

why now   — All 19 chat tools still run as closures in `createToolbox`
            (`docs/src/components/studio/architect-agent.ts`), on the toolbox's draft string. Until
            they are pure `(model, args) → Outcome` kernels, the MCP host and the palette (§10
            steps 6 and 7) cannot reuse them.
where     — `lib/use-cases/<id>/<id>.kernel.mjs`; `lib/use-cases/dispatch.mjs` (it has no kernel
            path yet: it calls `host.handlers[id]`); the Studio modules a kernel would import, which
            §5.3 moves to `lib/` first (`front-matter.ts`, and `deck-find.ts` with
            `deck-find-pattern.ts` for find and replace).
blocked   — (1) An EDIT kernel returns ops (§5.1), and ops belong to the spine (§5.2). Before the
            spine lands, §10 0b allows an interim adapter over today's slide splitting, but its shape
            (what a slide address is, which ops exist, who applies them) is not written down. That is
            an architectural fork, not a refactor. (2) The README says a tool leaves the legacy list
            only with a kernel AND a schema that meets the rules, and that tightening a schema waits
            for item 34's replay. So "the legacy list shrinks to 0" cannot be met without a
            model-visible change the README defers.
options   — A: write the interim-adapter note first (one owner round), then move tools in batches,
            reads first (they return `ops: []` and need no adapter decision). B: move the read tools
            now as kernels that keep `legacy: true` and their schemas, so nothing the model sees
            changes, and leave edits for the spine. C: wait for the spine.
            Recommendation: B now, A for the edits.
done when — Every chat tool runs through a kernel, the dispatcher has a kernel path, and the legacy
            list is empty, or holds only tools waiting on item 34, by name.
evidence  — Per tool: the golden fixture unchanged, and a differential run of the old handler
            against the kernel on the test decks (the step-1 trio ran 222 such calls).
verify    — maker-checker per batch, as the brief says.
