---
origin: 3099
priority: P1
recorded: 2026-11-09
area: engine
severity: low
swimlane: engineering/decisions/2026-11-08-anchor-chrome.md §The page-number column
deferred: blocked — the column's six-character width is the owner's call in #3095; widening it moves the rail on every railed deck
source: https://github.com/Laticent/lattice/pull/3099
---

# A seven-character page number runs past the footer band on a slide with a rail

why now   — #3099's checker measured it: on a slide with a visible rail the page column is six
            characters of the chrome face plus the number's lead, so `1104.12` (a split run's
            page in a deck past 999 pages) is 69px in a 60px content box at hd and spills 9.3px
            past the band's right edge (ink 20.7px from the slide edge instead of 30). Same on
            main before #3099; #3099 neither causes nor worsens it. Without a rail the column
            now grows to fit, so only railed slides are affected.
where     — `lib/forms/cell/stage/stage.css`, the `:has(> .tile-progress)` page-column rule, and
            `--footer-pag-col` in `lib/base/base.tokens.css`.
done when — the owner picks: widen the column to seven characters (the rail moves ~0.7em left
            on every railed deck), or accept six as the bound and lint a deck that would print
            a seven-character number on a railed slide. Then do it and delete this file.
evidence  — the rail inset and the 1104.12 ink offset, before and after.
verify    — tier 1: footer-band.test.js plus one rendered page.
