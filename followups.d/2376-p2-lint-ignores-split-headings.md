---
origin: 2376
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2376
---

# lint:deck splits slides on `---` only, while the engine also splits on headings (the default)

why now   — `split: headings` is the engine's default (lib/core/resolve-split.js
            DEFAULT_SPLIT), so a second top-level `#`/`##` starts a new slide and pulls its
            lead-in comments with it (lib/integrations/markdown-it/plugins.js). The lint
            slide splitter (lib/authoring/slide-split.js → lib/core/slide-boundaries.mjs)
            breaks only on thematic breaks: `## A … # B …` is two slides in the render and
            one in lint, even with `split: headings` written in the front matter. Every
            lint rule reads the wrong slide there — found by the pane lint's fuzz on PR #2376,
            where a slide the engine split carried its panes on the second slide.
where     — lib/core/slide-boundaries.mjs (chunkBoundaryLines), lib/authoring/slide-split.js.
done when — the lint splitter breaks where the engine does under `split: headings`
            (default and explicit), and a test renders decks with multiple headings and
            requires the same slide count in lint and in the engine.
evidence  — `splitTopLevel('## A\n\ntext\n\n# B\n\ntext\n').length` is 1; the engine renders 2.
verify    — node -e with both, on the default and on `split: headings` / `split: rules`.
