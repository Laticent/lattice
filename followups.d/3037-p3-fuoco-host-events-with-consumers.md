---
origin: 3037
recorded: 2026-11-05
area: website
swimlane: engineering/decisions/2026-11-05-fuoco-event-channel.md
priority: P3
severity: low
deferred: blocked — needs build 1 (slice 1); no frame bridge needed.
---

# Fuoco event channel, build 3 (slice 3, host side): the events that already have a reader

what      — `library.*` emitted by the store layer once per logical operation (§5, The Library) and the cross-tab adapter the owner approved: `checkpoint-store.ts`'s module-singleton `BroadcastChannel` pattern, a per-tab nonce and a schema version, `library.*` only, no re-broadcast, no write in response, metadata only. Finish Studio's `storage` listener is a settings sync and STAYS. `export.*` (host side, no exported byte changes). `command.*` with one `runCommand(id, via)` that the palette, menus and shortcuts all call. `panel.*` as facts.
done when — an open Library panel updates when another tab saves (two real tabs, Playwright); the export strip reads `export.*`; a shortcut-run verb emits `command.ran`; each event has an emitter-level test.
