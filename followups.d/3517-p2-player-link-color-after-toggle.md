---
origin: 3517
priority: P2
recorded: 2026-11-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-23-cover-layout.md §7
deferred: off-path — the fix sets the link color on every slide of every deck, a visual design call for the owner; #3517 fixed it on the bookends it touches
source: https://github.com/Laticent/lattice/pull/3517
---

# A link on a content slide drops below AA after the player's scheme toggle

why now   — Lattice colors no link, so a link takes the browser's own color. The exported player
            repaints a slide when the viewer toggles the scheme, but it cannot move the browser's
            link color, which follows the page's `color-scheme`. Measured with
            `node tools/check-player-contrast.js` on a one-link content slide (2026-11-27):
            indaco `color-mode: system` toggled to dark 1.83:1 (rgb(0,0,238) on rgb(0,29,51)),
            concrete 1.85:1, indaco-dark toggled to light 2.39:1 (rgb(158,158,255) on white).
            Pre-existing on `main`. #3517 gave links on title, closing and divider `currentColor`
            (base.modifiers.css, "A LINK ON A BOOKEND"), which passes in both player schemes.
where     — lib/base/base.elements.css (no `a` rule today); lib/export/player-core.mjs
done when — a link on any slide clears 4.5:1 in the export as shipped and after the toggle,
            in both directions, and the owner has chosen the link treatment (currentColor and an
            underline, or `--accent` with a contrast check)
evidence  — check-player-contrast on a deck with a link on a content slide: 0 below AA
verify    — tier 1 checker; the export bytes change, so the owner signs off dark and light renders
