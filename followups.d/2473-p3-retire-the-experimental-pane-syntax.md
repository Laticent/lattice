---
origin: 2473
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2473
---

# After the next release, retire the `panes:` / `pane:` alias, or keep it with a reason

why now   — the alias renders byte-identical to the syntax (test/unit/core/pane-layouts.test.js
            "the alias still renders the same panes"), and the design note keeps it for ONE release.
            Every shipped deck is on the syntax: the six on 2026-10-05, and panes-row-labels (#2476),
            which the first pass missed, later that day, each with byte-identical HTML. `lint:deck`
            over examples/ and the galleries finds no alias use. `pane-syntax` became a WARNING on
            2026-10-05, so the next release carries it. No release has shipped since v1.0.0
            (2026-08-09). What is left waits on that release.
where     — the engine compiles the alias into its own internal `lat-pane:` / `lat-panes:` comments
            like the syntax (lib/core/panes.js `normalizePaneSyntax`), so retiring it is the
            `parseMarker` legacy branch and the `PANES_RE` arm there, plus the text readers that
            accept it (lib/core/pane-spec.js `scanPanes`, lib/core/bake-splits.js,
            docs/src/components/studio/slide-directives.ts, pane-pages.ts). The carve never reads it.
done when — a release has carried the `pane-syntax` warning; then the alias either goes or stays with
            a documented reason in the design note §9.
verify    — `npm run followups` no longer lists this file.
