---
origin: 3049
priority: P3
recorded: 2026-11-06
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §4
deferred: large — an act-tier tool, a mode control and a workspace-wide chat; owes the adversarial trio
source: https://github.com/Laticent/lattice/pull/3049
---

# Give the chat an action registry, the three modes and create_deck

why now   — the owner cannot create a deck from chat. Three one-deck bindings block it: no tool, onApply writes
            the open deck, and history and spend are keyed per deck.
where     — studio-commands.ts (grow into actions with schema + tier + run(args)); architect-agent.ts tool list
            generated from it and filtered by mode; ArchitectChat.tsx / studio-store.ts (workspace history and spend);
            StudioShell applyChatEdit (target deck id); openImportedDeck for create_deck.
done when — Talk / Review / Auto on the composer bar, enforced by which tools are sent and by a host check on every
            call; create_deck asks in a Studio-drawn confirm showing title and outline; the chat follows the new deck;
            a test proves Talk cannot call draft or act tools and the model cannot press a confirm.
evidence  — measured cost per tool round from a real turn; screenshots of the mode button at 1440 / 820 / 390.
verify    — tier 2, the adversarial trio on the act tier (HARD RULE #25). Also closes the remaining done-when of
            2691-p2-chat-tools-that-act-on-lattice.
