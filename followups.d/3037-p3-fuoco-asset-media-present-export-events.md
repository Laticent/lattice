---
origin: 3037
priority: P3
recorded: 2026-11-05
area: website
severity: low
deferred: blocked — rides on slice 2's frame bridge.
swimlane: engineering/decisions/2026-11-05-fuoco-event-channel.md
---

# Fuoco event channel, slice 3: asset, media, presenting, export, editor and panel events

what      — §5 slice 3: `asset.loaded/failed` (images, video, audio), `media.played/paused/ended`, `present.*`, `stage.shown`, `export.*`, `lint.changed`, `editor.*`, `compose.*`, `panel.opened/closed`, `command.*`, `shortcut.fired`, `selection.settled/cleared`, `clipboard.*` (never the text), `drag.*`, `slide.moved`, `library.*` (saved, deleted, restored, imported, refused, applied; `plugin.saved/deleted` fold into it). Plus the cross-tab `BroadcastChannel` adapter for `library.*` only (owner said yes 2026-11-05). Also `live.*` (heard locally; a remote edit is `doc.changed` with `origin: 'peer:<id>'`; nothing new crosses Tavola) and `coach.*` (verdicts stamped with the `rev` they judged): no re-broadcast of another tab's event, metadata only, and Finish Studio's `storage` listener deleted in the same change. The editor and panel events need only slice 1, not the frame bridge. These ship before anything reads them, as the owner asked.
done when — each event fires from the real preview in Chromium, WebKit and Firefox, with a test per event.
