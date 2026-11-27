---
origin: 3415
priority: P2
recorded: 2026-11-22
area: engine
severity: low
swimlane: engineering/decisions/2026-11-21-plain-english-key-renames.md §Q5
deferred: large — rides in the Q5 `drawing:` PR, as the owner chose
source: https://github.com/Laticent/lattice/pull/3415
---

# `drawing: sketch-headings` stamps one class (owner's choice A)

why now   — The owner chose A on 2026-11-22 ("sorry, i meant 1 A" in the command center at
            02:12 UTC). Today `mode: sketch-clean` stamps `sketch sketch-clean-body`. About 200
            rules key on `sketch` alone, so a lone new class would lose every hand-drawn style.
where     — lib/core/resolve-mode.js (`MODE_REGISTER`), lib/base/base.sketch.css (~190
            `section.sketch` selectors), the icons/pills/sparks styles, lib/core/rough-ink.js,
            lib/runtime/index.js (~2884), lib/core/diagram-look.js (`MODE_WANTS_HAND`,
            `CLEAN_BODY_TOKEN`), transform-utils.js `readsHandBody`, chart-phone.js, the Studio's
            slide-provenance.ts. The scout's full map is in PR #3415's handoff comment.
done when — `drawing: sketch-headings` stamps only `sketch-headings`; every `sketch` rule also
            matches it; `sketch-clean-body` is gone.
evidence  — `npm run identity:check` byte-identical over the sketch decks
            (examples/sketch*.md, hub-spoke-sketch, mermaid-sketch-labels, panes-sketch).
verify    — tier 1 checker.
