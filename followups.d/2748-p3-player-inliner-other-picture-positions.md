---
origin: 2748
priority: P3
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.11
source: https://github.com/Laticent/lattice/pull/2771
---

# The player inliner bakes three picture positions; a browser loads a few more

why now   — The checker on the DOM inliner (#2771) ran a hand-written corpus on real Chromium and found positions a browser loads that
            the inliner has never baked, in the old tokenizer and the new DOM route alike, so a `file://` address in one ships in the
            shared player: `srcset` on `<img>` and `<source>`, `<video poster>`, SVG `<image href>` / `xlink:href`, CSS
            `image-set('file://…' 1x)`, and an escaped address (`url(a\.png)`). None appears in engine output (nine decks export with
            no `file://` left), so this is hand-written HTML or CSS only. Not a regression of #2771, and not worsened by it.
where     — `lib/export/html-player.js` `inlineDocAssets` (the tree walk already visits every element) and `mapCssUrls`.
done when — each position above bakes or is refused by `confine`, with a test per position; a decision says whether `srcset` is parsed
            (candidates and descriptors) or refused with a report line.
verify    — render a deck whose raw HTML uses each position beside the deck's folder and grep the player for `file://`.
---
