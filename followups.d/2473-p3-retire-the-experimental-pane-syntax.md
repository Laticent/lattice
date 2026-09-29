---
origin: 2473
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2473
---

# Move the six example decks to the pane syntax, then retire the `panes:` / `pane:` alias

why now   — the alias renders byte-identical to the syntax (test/unit/core/pane-layouts.test.js
            "the alias still renders the same panes"), and the design note keeps it for one
            release. Six example decks still teach it: panes, panes-mermaid, panes-radar,
            panes-sketch, chart-lead-blocks, chart-lead-paragraphs.
where     — examples/*.md above (and their PDFs). The engine compiles the alias into its own
            internal `lat-pane:` / `lat-panes:` comments like the syntax (lib/core/panes.js
            `normalizePaneSyntax`), so retiring it is the `parseMarker` legacy branch and the
            `PANES_RE` arm there, plus the text readers that accept it (lib/core/pane-spec.js
            `scanPanes`, lib/core/bake-splits.js, docs/src/components/studio/slide-directives.ts,
            pane-pages.ts) — the carve never reads it.
done when — the six decks use `_class: columns|rows` and `_pane:`, their PDFs are re-rendered,
            and after the next release the alias either stays with a documented reason or goes,
            with `pane-syntax` promoted from a suggestion to a warning first.
evidence  — the decks' HTML renders identical before and after the rewrite (the same check this
            PR ran on all six); `lint:deck` reports no `pane-syntax` on them.
verify    — `npm run followups` no longer lists this file.
