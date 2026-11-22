---
origin: 3025
priority: P1
recorded: 2026-11-22
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §R4: url() strings the exports missed
deferred: off-path — logged from a session archive sweep; the export inliners are not touched by the PR that records it
source: https://github.com/Laticent/lattice/pull/3025
---

# An `image-set(var(--a))` address the export cannot embed is left out of its `gone` list

why now   — R4 left one shape as a documented gap: a string that reaches `image-set()` through a custom property
            (`--a:"photo.png"` then `image-set(var(--a))`). The reader cannot call every closed string in a custom
            property an address, since `--label:"photo.png"` behind `content:var(--label)` is text. What it costs
            (the note's words): the picture is missing from the shared file, and a local path in it ships as
            written. Nothing tells the author. The inversion review's middle option: keep not rewriting it, but
            report it, so the gap is no longer silent.
where     — lib/export/html-player.js (the inliner's `gone` list, returned as `missing`); the Studio's
            lib/export/inline-url-media.mjs; the reader's `imageSet` fact (lib/core/css-image-set-block.js).
done when — an export whose CSS reads a custom property's string inside `image-set()` names that property or string
            on its `gone` / `missing` list, in the CLI and the Studio export; a `content:var(--label)` string is not
            reported; both pinned in css-ref-url-arg.test.js and inline-url-media.test.js.
evidence  — the decision note's R4 paragraph "The third shape … is left as a documented gap" (main, 164ecfa).
verify    — export a deck with each shape and read the report; the inliner differential still shows 0 differences.
