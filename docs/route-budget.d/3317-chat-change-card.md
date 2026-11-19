studio: +840
The Studio shell gains the chat change card's host side: one History entry per card, relabeled in place
(`applyChatEdit`, `saveCheckpointWithId`, `relabelCheckpoint`), and the hook and mount for the draft preview, whose
renderer itself is lazy (`ChatDraftPreview`). Measured +812 bytes against main (`cfc838e`) with
`measure-route-base.sh`: StudioIsland +918 and a split of lucide's settings-2 icon (+445), less a reshuffle of the
architect chunks (−677). Declared to +840 because CI's builds have read a few bytes off local ones
(engineering/gotchas/ci.md). Given back first: the card's logic and the shell's contract with it live in separate
modules (change-card.ts, change-card-types.ts), and the card draws its undo arrow and chevron inline, which took the
measured growth from +2878 to +812.
