---
origin: 3048
priority: P5
recorded: 2026-11-06
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §4
deferred: large — six surfaces, each needs its own way to load a hostile deck in a real browser
source: https://github.com/Laticent/lattice/pull/3048
---
# Prove key isolation in a browser on the surfaces besides the Studio preview

why now   — byok-key-isolation.spec.ts proves the Studio preview only. The red team in
            #3048 traced six more same-origin surfaces to a sanitizer call but did not run
            a hostile deck on them: the Stage popup, Print, the export capture frame, the
            webpage-export prune frame (runs the assembled player on this origin), Read
            Article, and the Library scene art.
where     — stage-window.js buildStageDoc; deck-preview.js buildSrcdoc; deck-export.js;
            player-prune-browser.ts; ReadArticle.tsx; Library.tsx sanitizeSceneAssets.
done when — each surface renders the isolation deck in a real browser with a seeded
            canary key and nothing reads it.
evidence  — a spec per surface, each red with its sanitizer call removed.
verify    — tier 1 checker.
