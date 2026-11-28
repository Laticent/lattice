---
origin: 3581
priority: P2
recorded: 2026-11-27
area: website
severity: low
swimlane: docs/src/components/studio/Library.tsx
deferred: blocked — the only audio is narration-store.js's LRU cache, which slice 2 is moving into the vault; the owner picked (1), add Audio after slice 2b's vault read (2026-11-27, ~21:30 UTC, via the storage desk)
source: https://github.com/Laticent/lattice/issues/3581
---
# Audio under the Library's Media section

why now   — Design §7 puts Audio beside Images and Videos under Media. Media records are only 'image' | 'video'
            (media-store.ts), and the one audio store is narration-store.js, an LRU cache of generated speech (§2.1).
            Slice 2 (#3581) moves narration audio into the vault, so a Library read built today would sit on a cache that
            is about to move. Put to the owner at slice 4's 🚦 card: (1) add it after slice 2's vault read lands
            (recommended), (2) list narration clips from narration-store.js's current reads, (3) an empty Audio kind.
            The owner picked (1) (2026-11-27, ~21:30 UTC): Audio waits for slice 2b's vault read.
where     — docs/src/components/studio/panel-shells.tsx `LIBRARY_KINDS.media`; Library.tsx; slice 2's public vault read.
done when — Media's kind menu offers Audio, listing every kept clip with play and delete, and "All media" counts it.
evidence  — e2e on chromium, webkit-phone and gecko; screenshots at 1440, 820 and 390.
verify    — the Library e2e and the #34 arms.
