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

what      — §5 slice 3: `asset.loaded/failed` (images, video, audio), `media.played/paused/ended`, `present.*`, `stage.shown`, `export.*`, `lint.changed`, `plugin.saved/deleted`, `editor.*`, `compose.*`, `panel.opened/closed`, `command.*`, `shortcut.fired`, `selection.settled/cleared`, `clipboard.*` (never the text). The editor and panel events need only slice 1, not the frame bridge. These ship before anything reads them, as the owner asked.
done when — each event fires from the real preview in Chromium, WebKit and Firefox, with a test per event.
