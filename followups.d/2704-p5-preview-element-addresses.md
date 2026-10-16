---
origin: 2704
priority: P5
recorded: 2026-10-15
area: website
severity: medium
swimlane: engineering/decisions/2026-10-15-fuoco-focus-sync.md §11
source: https://github.com/Laticent/lattice/pull/2704
---

# Preview element addresses (click an element to select its source, then restyle it) are not built

why now   — the owner's stated next feature: click an element in the preview and change its look as Compose pills do; hub.pick already carries the address.
where     — decision note §5.5; FocusedPreview.tsx; the engine's source-span map.
done when — a click on a rendered element publishes hub.pick with its source span, and the editor selects it.
evidence  — a real Studio click on three element kinds (heading, list item, chart) with the selection shown.
verify    — design first (decision note), then maker-checker on the engine span map.
