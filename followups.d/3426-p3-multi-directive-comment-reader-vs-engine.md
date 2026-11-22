---
origin: 3426
priority: P3
recorded: 2026-11-22
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md §15
deferred: off-path — a disagreement between the engine and the shared reader that predates #3426, in a comment shape no repo deck uses; which side is right is an engine-grammar question
source: https://github.com/Laticent/lattice/pull/3426
---

# A comment that sets two directives: the engine folds the second into the first, the shared reader reads both

why now   — #3426 routes every reader outside the engine through `readMetaField` / `scanMetaSource`, so where they
            disagree with the engine, the Studio and the tools now disagree with the render. A checker found one shape:
            `<!-- footer: Q3\n_class: kpi -->` (on one comment, two `key: value` lines). The engine renders
            `data-footer="Q3\n_class: kpi"` and no class; `readMetaField(src, 'class')` returns `kpi`. The same holds
            with the lines spread over a multi-line comment. Present's section rail, the Coach and Lente's suggestions all
            read `kpi` there. No deck in `examples/`, `test/integration/baseline-decks/` or `docs/src/content` uses the
            shape, so nothing visible changed.
where     — lib/engine (how a directive comment's value is cut: at the first newline, or the whole comment) and
            lib/core/meta-scan.mjs (how the shared reader cuts it). Marp read such a comment as YAML, two keys.
done when — one rule is chosen (a comment holds one directive, or several as lines), the engine and the shared reader
            both follow it, and a test pins the shape in both. The cut (slice E) retires authored directive comments,
            which may make the answer moot; check that first.
