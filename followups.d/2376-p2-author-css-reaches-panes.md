---
origin: 2376
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2376
---

# author and package CSS never reaches a pane outside the CLI front-matter `style:`

why now   — a deck with panes widens the SHIPPED sheet, the theme and (in the CLI) the
            front-matter `style:` block. Everything else an author or tool adds is not
            widened, so a rule like `section.list li { … }` styles a list slide and silently
            skips a list pane: installed component packages, the Studio's `extraCss`
            (DeckPreview, Fabricate, ReadArticle, CraftLab) and any engine-path author style.
where     — lib/engine/css.js composeCss (the extra-sheet inputs), docs/src/components/
            DeckPreview.tsx and the Studio callers that pass `extraCss`, the package loader.
done when — every author/package sheet a panes deck composes goes through `widenForPanes`,
            with a test per input showing `section.<component> …` reaching a pane.
evidence  — rework checker finding 3 on PR #2376; decision note §6.
verify    — render a panes deck with a package component and an `extraCss` rule in the
            Studio; the pane picks the rule up.
