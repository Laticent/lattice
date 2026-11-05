---
origin: 3037
recorded: 2026-11-05
area: website
swimlane: engineering/decisions/2026-11-05-fuoco-event-channel.md
priority: P2
severity: low
deferred: blocked — needs build 1 (slice 1).
---

# Fuoco event channel, build 2 (slice 4): fold the ad-hoc `window` events, plus `ai.*`, `chat.*` and `model.*`

what      — move the Studio's 17 files of ad-hoc `window` events (§2 of the note names them: `lattice-spend-changed`, `db-model-changed`, `db-voice-changed`, `cs-note-commit`, `cs-note-left`, `pg-tour-offer`, `pg-set-view`, `lattice-chat-agent-ready`, `SETTINGS_EVENT`, `lattice:notify-action`/`-dismiss`, `lattice:preview-zoom`, `COMMENTS_EVENT`, `CHROME_CHANGE_EVENT`, `DECKS_CLEARED_EVENT`, `FLUSH_EVENT`, `OPEN_CRASH_REPORT_EVENT`, `READY_EVENT`) onto typed hub events, one commit each; add `ai.*`, `chat.*`, `model.*` (§5, The Architect chat). A cross-tab `storage` listener is NOT a window event of ours and stays.
done when — the ledger test lists each folded event, and `grep -rlE "dispatchEvent\??\.?\(new (Custom)?Event\(" docs/src` finds only tests, the three site `.astro` pages the note leaves out of scope (`PwaHead.astro`, the Fuoco and Filo demo pages), and any event this build decides to keep, each named in the ledger with why.
