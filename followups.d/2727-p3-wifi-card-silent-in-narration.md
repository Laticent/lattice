---
origin: 2727
priority: P3
recorded: 2026-10-16
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.10
source: https://github.com/Laticent/lattice/pull/2727
---

# The Wi-Fi card's network and password may be silent in narration

why now   — A narrated deck with a `wifi` slide would say only its heading ("Join the room."), never the network name
            or how to join, if a read-only probe is right. The probe used hand-written markup, not a real render.
where     — `lib/components/connect/wifi/wifi.transform.js:74` wraps each `dt`/`dd` pair in `div.qr-row` inside the
            `<dl>`; `projectDeckToScript`'s `DL` branch (`lib/transformers/prose-projection.mjs:1636`) reads only the
            `<dl>`'s direct `<dt>` children.
done when — Confirmed or refuted on a real render (CLI render of a `wifi` slide, its HTML through
            `projectDeckToScript`). If confirmed, the narration speaks the network name (never the password) and a
            test pins it.
verify    — render a `wifi` slide, run the projection on the output, read the script.
