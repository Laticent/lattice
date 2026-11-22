---
origin: 3426
priority: P2
recorded: 2026-11-22
area: website
severity: medium
swimlane: engineering/decisions/2026-10-17-meta-record.md §15
deferred: blocked — an owner decision: which slice owns Lente's `_lens` writer and its paired reader (the meta desk proposed slice D; §15.3 names neither). They move together, because reading a lens from a record before the writer writes one would leave two tags on a slide after one toggle
source: https://github.com/Laticent/lattice/pull/3426
---

# Lente writes and reads `_lens` as a directive comment; move it to the `@meta` record before the cut

why now   — slice A (#3426) moved every reader of slide settings outside the engine onto the shared readers, and slice C
            (#3433) moves the writers. Lente's `_lens` tags were left out of both: its writer still emits
            `<!-- _lens: … -->` comments, and the readers paired with it parse that comment shape directly. After the cut
            (slice E) the engine stops reading authored directive comments, so a lens tag written in the old form would
            stop applying. #3426 moved Lente's CLASS read onto both forms (`slideClassSite` in tags.ts, held equal to the
            engine's `readRecord` by tags.test.ts); the `_lens` writer and the `_lens` reader paired with it stay, for the
            reason in `deferred`. The meta desk proposed slice D, the sweep, which runs after A, B and C and before the cut.
where     — docs/src/lib/lente/tags.ts (the `_lens` writer and reader; a published zero-dependency package, so it cannot
            import lib/core: `recordClassWords` there is the pattern, a strict own read held equal to `readRecord`), docs/src/pages/libraries/lente/index.astro
            (the demo page's inline deck and its class read, allowlisted in test/unit/core/directive-regex-readers.test.js
            as reading its own literals).
done when — Lente writes the lens tag in the record form the cut keeps, its readers read it, and the demo page's deck is
            written that way; the directive-regex-readers allowlist drops the Lente entry if its regex goes.
