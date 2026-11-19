studio: +1040
The Studio shell gains the chat change card's host side: one History entry per card, relabeled in place
(`applyChatEdit`, `saveCheckpointWithId`, `relabelCheckpoint`), the hook and mount for the draft preview, whose
renderer itself is lazy (`ChatDraftPreview`), and the per-deck "answer the waiting message after connecting" mark the
shell reads on the OpenRouter sign-in's return (`hasAnswerAfterConnect`, kept in studio-store). CI measured +996 bytes
against main (`ec4ff1f`, after #3322 reshaped the chat's tools): StudioIsland +919 and a split of lucide's settings-2
icon (+445), net of a reshuffle of the architect chunks (architect-edits +3336, architect −2755, diff-card −1262).
Declared to +1040 because CI's builds have read a few bytes off local ones (engineering/gotchas/ci.md). Given back
first: the card's logic, the shell's contract with it and the resume mark live where they add no chunk of their own
(change-card.ts, change-card-types.ts, studio-store.ts), and the card draws its undo arrow and chevron inline, which
took the measured growth from +2878 (and +1500 with the resume mark in its own module) down to under +1000.
