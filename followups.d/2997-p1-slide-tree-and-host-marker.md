---
origin: 2997
priority: P1
recorded: 2026-11-02
area: engine
severity: high
swimlane: engineering/decisions/2026-11-02-declared-figure-semantics.md §3
deferred: large — step 2 of the gated order (regia-narrator §8); owner chose one PR per step, and it changes every chart's HTML (export sign-off)
source: https://github.com/Laticent/lattice/pull/2997
---

# Emit the slide tree as host data, with one host marker

why now   — every capability (narration, screen readers, Guide, steps) reads it; nothing else can move until it exists
where     — the engine render path; each chart kind returns its units beside its HTML; lib/plugins/author-markup.js
            HOST_MARKERS gains `data-lattice-semantics`
done when — the tree is produced at render on every path (CLI, Studio, player) before hydration, validated against
            each kind's declared units; a hydration amendment schema exists; Mermaid's tree comes from its parsed
            diagram; a forged `data-*` span cannot reach it (the red team's repro is a test)
evidence  — the one-time HTML diff reviewed; dark and light export renders for the owner's sign-off
verify    — tier 3 trio, because it adds a trust boundary
