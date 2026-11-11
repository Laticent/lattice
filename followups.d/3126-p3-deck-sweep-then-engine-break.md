---
origin: 3126
priority: P3
recorded: 2026-11-11
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: blocked — the owner holds the deck-wide sweep until meta step 5 (session_01DPMMjF1NbVWZDPei4MmEcJ, branch claude/meta-door-steps-2-6) is on main
source: https://github.com/Laticent/lattice/pull/3126
---

# Sweep the shipped decks off `![bg]`, then make the engine stop reading it

why now   — Slice 3 (#3114) and #3126 gave every picture a home that is not Marp's `![bg …]` keywords: the `@image{…}`
            record, and a lone `![title](src)` on an `image` or `bleed` slide. 27 shipped decks still write `![bg]`, so the
            engine still reads it. The owner split the break: the Studio stopped writing `![bg]` (#3126); the decks are
            swept next; the engine stops reading it last, with no compatibility period.
where     — `lint:deck --fix` (the `image-marp-keyword` rule, lib/plugins/image/image.lint.js and
            lib/plugins/image/shared/image-migrate.js); lib/engine/background-image.js and lib/core/bg-image.js (the `![bg]`
            readers); followups.d/3126-p2-one-placed-picture-rule.md lands FIRST, because the break sends every legacy photo
            through that rule.
done when — (1) `--fix` runs over the non-gallery decks, writing `![…](…)` plus the slide's class; (2) a separate
            post-review commit sweeps the six galleries (HARD RULE #8) and adds `image-marp-keyword` to the plugin's lint
            role; (3) the engine no longer reads `![bg]`, and `rg '!\[bg' examples lib` finds only migration tests.
evidence  — `npm run identity:check` before and after each step (every swept deck pixel-identical, or each difference
            named), and the image demo deck rendered dark and light for the owner (an export change: Quality Bar sign-off).
verify    — `npm run identity:check`; the shared placement table (test/fixtures/placed-picture-cases.json) still agrees
            across the engine, the export and Compose; tier 2 trio on the engine break, because it removes a reader every
            legacy deck depends on.
