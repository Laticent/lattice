---
origin: 3037
priority: P4
recorded: 2026-11-05
area: website
severity: low
deferred: blocked — needs slice 1.
swimlane: engineering/decisions/2026-11-05-fuoco-event-channel.md
---

# Fuoco event channel, slice 4: move the ad-hoc `window` events onto the hub

what      — move `lattice-spend-changed`, `db-model-changed`, `db-voice-changed`, `cs-note-commit`, `cs-note-left`, `pg-*` and `lattice-chat-agent-ready` (11 files) onto typed hub events (`spend.changed`, `settings.changed`, `note.*`, `ai.*`), one commit each. With them, the chat's `chat.*` and `model.*` events (§5, The Architect chat), which replace `lattice-chat-agent-ready`.
done when — `grep -rn "new Event('lattice-\|new Event('db-\|CustomEvent('cs-" docs/src` finds only tests.
