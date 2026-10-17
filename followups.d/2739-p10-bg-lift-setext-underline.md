---
origin: 2739
priority: P10
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.9
source: https://github.com/Laticent/lattice/pull/2739
---

# Read a setext underline as a heading, not a slide break, in the class-aware `![bg]` lift

why now   — the #2739 checker found `<!-- _class: image -->\n\nTitle\n---\n\n![bg left](a.jpg)`: the engine reads `Title\n---` as a setext heading and renders ONE slide stamped `image`, but `liftImageBgImages` (lib/core/bg-image.js) splits on every `---` line, puts the `![bg]` on a second slide with no class, and does not lift it. The picture paints full-bleed behind an image layout instead of filling its panel. main had the same split before #2739; only a `---` written directly under a text line, with no blank line, hits it.
where     — `SLIDE_SEPARATOR` in lib/core/bg-image.js `liftImageBgImages` (pass 1).
done when — a `---` that markdown-it reads as a setext underline does not start a slide in the lift, asserted by a unit test that compares the lift against the engine's section classes.
evidence  — the engine's section classes and the lift's result for the deck above, before and after.
verify    — tier 1 checker.
