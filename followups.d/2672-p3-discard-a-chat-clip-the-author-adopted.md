---
origin: 2672
priority: P3
recorded: 2026-10-14
area: website
severity: low
swimlane: engineering/decisions/2026-10-13-studio-chat-polish.md §4f
source: https://github.com/Laticent/lattice/pull/2672
---

# Taking a device clip off a message deletes it even after the author chose to keep it in the Library

why now   — `discardChatVideo` (`docs/src/components/studio/chat-photos.ts`) deletes by name. A clip added from the
            device is pending; the author opens the Library, sets it to "all decks" to keep it, then taps X on the chat
            strip; the clip they chose to keep is deleted. Found by the independent read of #2672 (§4f, finding 5).
where     — `addChatVideo` / `discardChatVideo` in chat-photos.ts; the pending clip's record in ArchitectChat.tsx.
done when — the save records the clip's id and scope, and a discard deletes only when the record still has both; a unit
            test re-scopes the record between add and discard and finds it still there.
evidence  — the unit test.
verify    — tier 0 gates.
