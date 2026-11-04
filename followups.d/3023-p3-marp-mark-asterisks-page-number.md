---
origin: 3023
priority: P3
recorded: 2026-11-04
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-04-switch-vocabulary.md
deferred: blocked — the owner picks which one a Marp render keeps: the asterisks' second cluster or the page number; both need `section::after`
source: https://github.com/Laticent/lattice/pull/3023
---

# In a Marp render, mark-asterisks draws only one of its two clusters

why now   — `section.mark-asterisks` draws its top cluster on `section::before` and its bottom-left cluster on `section::after`. In Marp, `section::after` IS the page number, and Marp's CSS pipeline (marpit's postcss pagination plugin) comments out any `content` we set there, so the bottom-left cluster never paints and the page number shows instead. PR #3023 fixed the four page-number rules the same mask silenced (`no-pagination`/`silent`, collage, statement image, claim-bleed) by adding `:where(:not(* > .lat-never))`, which the mask does not match, and `test/unit/export/marp-pagination-mask.test.js` sanctions this one rule by name.
where     — `lib/base/base.treatments.css` (`section.mark-asterisks::after`).
options   — (a) the asterisks win: add the same suffix, and a Marp render of a `mark-asterisks` slide loses its page number; (b) the page number wins (today); (c) redraw both clusters inside `::before` as two mask layers, which changes the engine's pixels too and needs a visual review.
done when — the owner has picked, the sanction in the test is removed (a, c) or its comment names the decision (b).
verify    — export a deck with a `mark-asterisks` slide; `marp --no-stdin -c marp.config.cjs deck.md --images png`; compare with `npx lattice deck.md deck.pdf`.
