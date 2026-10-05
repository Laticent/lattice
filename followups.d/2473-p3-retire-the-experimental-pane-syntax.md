---
origin: 2473
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2473
---

# After the next release, retire the `panes:` / `pane:` alias, or keep it with a reason

why now   — the alias renders byte-identical to the syntax (test/unit/core/pane-layouts.test.js
            "the alias still renders the same panes"), and the design note keeps it for ONE release.
            The six example decks that taught it moved to the syntax on 2026-10-05, each with
            byte-identical HTML, so no shipped deck uses it now. What is left waits on a release.
where     — the engine compiles the alias into its own internal `lat-pane:` / `lat-panes:` comments
            like the syntax (lib/core/panes.js `normalizePaneSyntax`), so retiring it is the
            `parseMarker` legacy branch and the `PANES_RE` arm there, plus the text readers that
            accept it (lib/core/pane-spec.js `scanPanes`, lib/core/bake-splits.js,
            docs/src/components/studio/slide-directives.ts, pane-pages.ts). The carve never reads it.
done when — after the next release, the alias either stays with a documented reason or goes, with
            `pane-syntax` promoted from a suggestion to a warning first, for at least one release.
verify    — `npm run followups` no longer lists this file.
