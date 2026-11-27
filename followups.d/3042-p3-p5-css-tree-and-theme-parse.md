---
origin: 3042
priority: P3
recorded: 2026-11-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §P5 census
deferred: blocked — waits on P5c; the owner decided on 2026-11-17 that css-tree and theme/parse.js stay until P5c lands, then the choice comes back to the owner
---
# Measure the P5 CSS reader against css-tree and theme/parse.js, then put the choice to the owner

why now   — P5 moves every hand-written CSS scan onto one tokenizer (lib/core/css-tokens.js). Two full-sheet readers
            stay outside it by the owner's decision of 2026-11-17: `css-tree` (export/player-prune.js and
            fonts/face-css.js, loaded lazily; face-css measured its cold `require` at 64 ms per CLI render) and
            theme/parse.js's own record parser. Left alone, the repo keeps three CSS readers after P5, which is what P5
            set out to end.
where     — lib/export/player-prune.js, lib/fonts/face-css.js, lib/theme/parse.js; lib/core/css-tokens.js.
done when — after P5c merges: the P5 reader is measured against both on the same inputs (the work each does, the
            bytes each adds to a route, and css-tree's cold require included), and the options go to the owner in one
            round with a recommendation.
evidence  — the measured table in the pipeline doc's §P5 census, and the owner's choice recorded there.
verify    — tier 0; a move that follows the choice is its own PR, held to identity:check --strict.
