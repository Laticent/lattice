---
origin: 3183
priority: P1
recorded: 2026-11-13
area: engine
severity: high
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §8
deferred: blocked — changes the bytes of every player export, so it waits for the owner's dark and light sign-off; the owner ordered lastra first
source: https://github.com/Laticent/lattice/pull/3183
---

# The webpage export stores every placed photo twice and the logo once per slide

why now   — The owner's 2026-10-16 ruling was "content-hashed assets stored once"; lib/export/player-assets.mjs did it for CSS
            backgrounds only and skips `<img src>`. The player holds each slide twice (the slide and its Read·Article copy), so
            measured from the real Studio on 2026-11-13: an 18-photo deck stores 36 copies (5.8 MB wasted of 13.9 MB), and a deck
            with `logo:` stores the logo 56 times (3.3 MB of 14.2 MB).
where     — lib/export/player-assets.mjs (the hoist), lib/export/player-core.mjs (assemblePlayer), the player runtime that reads
            an `<img>`'s source; the no-JavaScript floor must keep every picture.
done when — each distinct picture is stored once in a player export, on the CLI and the Studio, and the no-JS floor still shows
            every picture in all three engines; pixel-identical in Present, Slides and Article, light and dark.
evidence  — before/after file size and data-URI census on two photo decks; pixel diffs of all three views.
verify    — tier 1 checker; the owner's export sign-off.
