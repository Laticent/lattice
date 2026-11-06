---
origin: 3049
priority: P3
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §5
deferred: large — a storage migration of every deck's chat, per-conversation spend and target-deck apply
source: https://github.com/Laticent/lattice/pull/3049
---

# Make the chat one conversation for the workspace, not one per deck

why now   — create_deck shipped with per-deck history: the new deck's chat starts with a line pointing back. The owner
            chose a workspace chat (2026-11-06), and the trio showed copying a thread between decks carries pending edits.
where     — studio-store.ts (CHAT_PREFIX, saveChat, loadChat), ArchitectChat.tsx (deckId-keyed history, answerAction),
            architect.ts getSpendDeck, StudioShell.applyChatEdit (needs a target deck id).
done when — one conversation list with each message stamped by deck; the per-deck histories migrated once; Apply takes a
            target deck id and refuses a deck that is not open; spend per conversation, attributed per deck; PURPOSE speaks
            of the author's decks. Also move studio-commands.ts onto chat-actions.ts so the palette shares the registry.
evidence  — a migration test over real stored histories; storage size before and after.
verify    — tier 2, maker-checker (storage migration).
