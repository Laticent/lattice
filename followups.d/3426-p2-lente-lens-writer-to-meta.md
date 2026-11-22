---
origin: 3426
priority: P2
recorded: 2026-11-22
area: website
severity: medium
swimlane: engineering/decisions/2026-10-17-meta-record.md §15
deferred: off-path — writer slice; owned by meta slice D (the meta desk's assignment, 2026-11-22)
source: https://github.com/Laticent/lattice/pull/3426
---

# Lente writes and reads `_lens` as a directive comment; move it to the `@meta` record before the cut

why now   — slice A (#3426) moved every reader of slide settings outside the engine onto the shared readers, and slice C
            (#3433) moves the writers. Lente's `_lens` tags were left out of both: its writer still emits
            `<!-- _lens: … -->` comments, and the readers paired with it parse that comment shape directly. After the cut
            (slice E) the engine stops reading authored directive comments, so a lens tag written in the old form would
            stop applying. The meta desk assigned the writer and its paired raw readers to slice D, the sweep, which runs
            after A, B and C and before the cut.
where     — docs/src/lib/lente/tags.ts (the `_lens` writer and reader; a published zero-dependency package, so it cannot
            import lib/core and needs its own record form or a vendored reader), docs/src/pages/libraries/lente/index.astro
            (the demo page's inline deck and its class read, allowlisted in test/unit/core/directive-regex-readers.test.js
            as reading its own literals).
done when — Lente writes the lens tag in the record form the cut keeps, its readers read it, and the demo page's deck is
            written that way; the directive-regex-readers allowlist drops the Lente entry if its regex goes.
