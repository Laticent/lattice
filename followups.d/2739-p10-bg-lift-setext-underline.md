---
origin: 2739
priority: P10
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.6
source: https://github.com/Laticent/lattice/pull/2776
---

# Lift `![bg]` to the image panel on the engine's own tokens, not a source pre-pass

why now   — `liftImageBgImages` (lib/core/bg-image.js) decides which slide a `![bg]` is on with a `---` line walk, and the engine disagrees on several shapes: a setext heading (`Title` over `---`), `***` and other rule forms, a `---` inside `$$` math, a directive indented as code, text after a directive's `-->`. Each puts the panel on the wrong slide or none (the picture then fills the canvas behind an image layout, or vanishes as an unstyled div on a `content form` slide). Measured with a differential fuzz (every `![bg]` swapped for a marker the engine renders as text): main's lift disagrees with the engine on 673 of 5,289 markers.
tried     — #2776 tried two fixes and took both out. (1) A better line walk: three checker rounds kept finding shapes it got wrong, and fixing setext broke the default `split: headings` divider (a setext `h2` is itself a slide boundary there). (2) Reading slides with `slideClassSpans` (the engine's markdown-it boundaries): 0 of 22,909 fuzzed markers differed, but it is a second markdown-it parse per render, it needed the host's plugin admission and the deck's front matter threaded into every caller, and it cost about 1.6 KB gz on the engine. `getting-started` sits ~100 bytes under its `engineJsGz` ceiling, so docs-build went red. (The first cut also put markdown-it in the viewer runtime, +23.7 KB gz, because lib/runtime/index.js requires bg-image.js.)
where     — do the lift where the engine already has the answer: a markdown-it core rule after `lattice_slide` and the directive pass in the engine's own pipeline (lib/integrations/markdown-it/plugins.js, lib/engine/slides.js), turning an `image` token whose alt starts `bg` into the panel markup on sections whose resolved class has `image`. One parse, no source offsets, no front-matter threading, near-zero bytes. The Marp export (tools/export-marp.js, docs/src/components/studio/export/deck-export.js) still needs a SOURCE rewrite; give it the same decision by reading the token rule's verdict back, or keep the source lift for export only.
done when — the fuzz harness reports 0 disagreements in both split modes and with math off; all committed decks byte-identical except where the engine's own slide classes say otherwise; `engineJsGz` and the viewer runtime do not grow.
evidence  — the fuzz counts before/after; the route-budget table; dark + light renders of any slide whose bytes change (export byte change: owner sign-off).
verify    — tier 1 checker on the token rule, plus the fuzz harness. Reuse the four cases the #2776 checkers pinned (in that PR's history, test/unit/core/bg-image.test.js at d753abe): setext + heading under `split: headings`, a list item's continuation paragraph above `---`, a body that opens with its own `---` block, and an engine with math off.
