---
origin: 2727
priority: P3
recorded: 2026-10-16
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.10
source: https://github.com/Laticent/lattice/pull/2727
---

# The Wi-Fi card's network name is silent in narration

why now   — A narrated deck with a `wifi` slide says only its heading ("Join the room."), never the network name
            or how to join. Confirmed on a CLI render with `--captions` (2026-10-16): the `.vtt` holds the heading only.
where     — `lib/components/connect/wifi/wifi.transform.js:74` wraps each `dt`/`dd` pair in `div.qr-row` inside the
            `<dl>`; `projectDeckToScript`'s `DL` branch (`lib/transformers/prose-projection.mjs:1634-1637`) reads only the
            `<dl>`'s direct `<dt>` children. That cause is likely, not yet confirmed.
done when — The narration speaks the network name (never the password) and a
            test pins it.
verify    — render a `wifi` slide, run the projection on the output, read the script.
