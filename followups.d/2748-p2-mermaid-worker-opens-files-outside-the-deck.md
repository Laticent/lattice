---
origin: 2748
priority: P2
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.11
source: https://github.com/Laticent/lattice/pull/2748
---

# The Mermaid render worker page opens a `file:` picture outside the deck

why now   — The P1 follow-through confines the main CLI page, the player, logo marks and the SVG rasterizer by real path. The red
            team found the Mermaid worker (`lib/plugins/mermaid/shared/render-worker.js`) runs its own `file:` page with no guard: a
            flowchart image node `C@{ img: "file:///…/secret.png" }` made that Chrome open the file. The `href` is stripped before
            export, so no bytes leave, but Mermaid may size the node from the picture, a small side channel.
where     — `lib/plugins/mermaid/shared/render-worker.js`; reuse `lib/export/file-confine.js`.
done when — the worker answers a `file:` request outside the deck folder with the stand-in, as `lattice.js` does; a test shows it.
verify    — render a deck with a flowchart image node naming a file beside, not inside, the deck and strace or log the open.
---
