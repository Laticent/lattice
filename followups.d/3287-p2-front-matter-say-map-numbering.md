---
origin: 3287
priority: P2
recorded: 2026-11-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-17-architect-tools-agent-readiness.md §8
deferred: blocked — the owner tabled it (2026-11-17) until the slide spine is designed (3287-p1-lente-slide-spine.md)
source: https://github.com/Laticent/lattice/pull/3287
---

# The front-matter `say:` map loses a slide's line when slides move in a split deck

why now   — Reproduced 2026-11-17 against the real functions: a deck with `split: headings`, slide A
            splitting into two on-screen slides, and `say: { 2: "line for B" }`. Moving B first with
            `moveSlide` rewrites the key to 3. The voice counts slides as written in the file
            (`parseSayMap`, `narration-bake.ts`), so it looks for slide 3, finds none, and B
            silently loses its line. `carrySay` (deck-ops.ts) counts on-screen slides instead.
            `say:` is the only front-matter key that points at a slide by number; every other
            per-slide fact (lens membership, `_class`) lives inside the slide. The owner's view:
            the map was a mistake. Tabled, not dropped, pending the spine.
where     — `carrySay` and `renumberFrontMatterSay` (`docs/src/components/studio/deck-ops.ts`,
            `lib/core/renumber-say.mjs`); `parseSayMap` (`lib/core/resolve-narration.mjs`); the
            export's drop under autosplit; Present's original-index lookup. Only
            `examples/read-along-captions.md` uses the map among committed decks.
done when — The owner picks one: retire the map (lint plus an auto-fix that moves each entry into
            its slide as `<!-- say: … -->`, counted the way the voice counts, then delete the four
            workarounds; a **Breaking:** changelog entry or one release of warning first), or keep
            it and make every reader and writer count slides one way, with a test on a split deck.
            Either way the spine can offer an "all spoken lines" view that writes back into slides.
evidence  — The reproduction above as a committed test, red before and green after.
verify    — tier 1 checker.
