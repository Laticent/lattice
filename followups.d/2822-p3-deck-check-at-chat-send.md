---
origin: 2822
priority: P3
recorded: 2026-10-22
area: website
severity: low
swimlane: engineering/decisions/2026-10-22-preview-baseline-oct-8-vs-frame.md
---

# Run the deck-wide diagram check when a chat message is sent, not 3 s after typing stops.

why now   — the owner asked why a deck-wide syntax check runs while typing, and deferred the change ("we will
            revisit"). The slide you edit already shows its own error through the render; the check only grounds
            the Architect chat, and `checkDraft` already runs it on the Architect's drafts.
where     — docs/src/components/studio/StudioShell.tsx (the `diagramSignature` effect, ~line 3558).
progress  — 2026-10-23: engineering/decisions/2026-10-23-diagram-check-at-chat-send.md has the measured cost (1 preview draw + 6
            check draws per diagram edit) and recommends check-at-send; default keep. Waiting on the owner.
decided   — nothing. Deferred by the owner on 2026-10-22; this item is the record.
done when — the owner decides: delete the background effect and check at send, or keep it.
evidence  — a keystroke trace showing no draw job from the check while typing.
verify    — none beyond the gates.
