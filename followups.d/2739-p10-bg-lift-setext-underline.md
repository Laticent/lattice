---
origin: 2739
priority: P10
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.9
source: https://github.com/Laticent/lattice/pull/2739
---

# Make the class-aware `![bg]` lift read markdown as markdown-it does: setext, indented code, trailing text

why now   — the #2739 checker found `<!-- _class: image -->\n\nTitle\n---\n\n![bg left](a.jpg)`: the engine reads `Title\n---` as a setext heading and renders ONE slide stamped `image`, but `liftImageBgImages` (lib/core/bg-image.js) splits on every `---` line, puts the `![bg]` on a second slide with no class, and does not lift it. The picture paints full-bleed behind an image layout instead of filling its panel. main had the same split before #2739; only a `---` written directly under a text line, with no blank line, hits it.
also      — the checker's third pass found two more, both on main too: a directive indented as code (a tab, or four spaces, before `<!--`) still lifts, though markdown-it reads it as an indented code block; and `<!-- _class: image --> trailing` lifts, though the engine does not apply a directive with text after its close. Each puts a `.lattice-bg` panel on a slide the engine classes `content form`.
where     — `SLIDE_SEPARATOR` in lib/core/bg-image.js `liftImageBgImages` (pass 1).
done when — the three cases above give the lift the engine's slide classes, asserted by a unit test that compares the lift against the engine's section classes.
evidence  — the engine's section classes and the lift's result for the deck above, before and after.
verify    — tier 1 checker.
