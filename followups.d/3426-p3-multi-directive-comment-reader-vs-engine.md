---
origin: 3426
priority: P3
recorded: 2026-11-22
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md §15
deferred: off-path — `readMetaField` and the two callers below already disagreed with the engine on main; every reader #3426 touched now reads the class through `slideClassValue`, which agrees, and changing the editor primitive's reading belongs to the writers slice (C)
source: https://github.com/Laticent/lattice/pull/3426
---

# A comment that sets two directives: the engine reads no class, meta-edit's `readMetaField` reads one

why now   — `<!-- footer: Q3\n_class: kpi -->` (one comment, two `key: value` lines, also when spread over a multi-line
            comment): the engine renders `data-footer="Q3\n_class: kpi"` and no `kpi` class. `readMetaField(src,
            'class')` (lib/core/meta-edit.mjs) returns `kpi`, because it reads a `_class:` line anywhere in a comment so
            the editor can write back to it, as Marp read a comment of several directives. A checker on #3426 found it.
            #3426's new readers use `slideClassValue` (lib/core/class-entries.mjs, the scan's resolved value), which
            gives `''` like the engine, and the tools that need the comment's span take the value from it too. The callers
            that still read the class through `readMetaField`, both untouched by #3426 and both on main: Present's section
            rail (`docs/src/components/studio/present-sections.ts`) and `docs/src/lib/slide-directives.ts`.
            No deck in `examples/`, `test/integration/baseline-decks/` or `docs/src/content` uses the shape.
where     — lib/core/meta-edit.mjs `readMetaFieldUncached` (the `lineRe` read), and the engine's directive-comment cut.
done when — one rule is chosen (a comment holds one directive, or several as lines), the engine and `readMetaField`
            follow it, and a test pins the shape in both. The cut (slice E) retires authored directive comments, which may
            make it moot; check that first.
