---
origin: 3208
priority: P1
recorded: 2026-11-19
area: website
severity: high
swimlane: engineering/decisions/2026-11-17-architect-tools-agent-readiness.md §5, §8
deferred: blocked — the outcome it reports is the change card's, and PR 3317 (per-edit apply, plus the per-slide card model in 2026-11-19-chat-card-apply-undo.md) is changing what that outcome is; build on whichever card model lands
source: https://github.com/Laticent/lattice/issues/3208
---

# Tell the chat whether its last edits landed (#3208 items 5 and 27)

why now   — In #3208's session the chat described edits (a divider at slide 47, title-style dividers at
            slide 36) that the deck did not contain, and the author could not tell what had landed. The
            readiness note reproduced it: the history the model gets is byte-identical whether the
            author applied or discarded the card, and discarding records nothing
            (`discardProposal` sets `proposed: undefined`).
where     — `docs/src/components/studio/ArchitectChat.tsx` (`applyProposal`, `discardProposal`, the
            history mapping), `chat-agent.ts` (where the deck is appended to the last user turn),
            `studio-store.ts` (the stored message; PR 3317 adds `skipped`), `chat-store.ts` and the
            workspace backup (the new field must travel with the thread).
done when — Each proposal records its outcome as a code (`applied | partial | discarded | pending |
            superseded`), never free text. The newest user turn ends with one present-state line:
            the deck's slide count, that earlier slide numbers no longer hold, and the outcome of the
            previous turn's card. It goes at the END of the last user message so the cached prefix is
            untouched (readiness note §8). The model can then say "applied" or "not applied" without
            re-reading the deck.
evidence  — A scripted-model turn through the real toolbox and history mapping (the readiness note's
            §5 harness) where the two histories now differ in exactly that line, for apply, discard
            and a partial apply; a mocked-model Playwright run that discards a card and checks the
            next request's last user message.
verify    — maker-checker: it adds persisted chat state, which the Yjs chat-thread migration
            (`followups.d/3147-p1-yjs-chat-store.md`) will also carry.
