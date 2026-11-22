---
origin: 3426
priority: P2
recorded: 2026-11-22
area: website
severity: medium
swimlane: engineering/decisions/2026-10-17-meta-record.md §15
deferred: off-path — owned by meta slice D (§15.3 names it, the meta desk's assignment, 2026-11-22); the `_lens` writer and its paired reader move together, because reading a lens from a record before the writer writes one would leave two tags on a slide after one toggle
source: https://github.com/Laticent/lattice/pull/3426
---

# Lente writes and reads `_lens` as a directive comment; move it to the `@meta` record before the cut

why now   — slice A (#3426) moved every reader of slide settings outside the engine onto the shared readers, and slice C
            (#3433) moves the writers. Lente's `_lens` tags were left out of both: its writer still emits
            `<!-- _lens: … -->` comments, and the readers paired with it parse that comment shape directly. After the cut
            (slice E) the engine stops reading authored directive comments, so a lens tag written in the old form would
            stop applying. #3426 gave Lente's suggester an injected class reader (`suggestMembership`'s `classOf`), and
            the Studio passes the engine's `readMetaField`, so a record counts there; the `_lens` writer and the `_lens`
            reader paired with it stay, for the reason in `deferred`. Slice D, the sweep, owns it (§15.3); it runs after A, B and C and before the cut.
where     — docs/src/lib/lente/tags.ts (the `_lens` writer and reader; a published zero-dependency package, so it cannot
            import lib/core. Do not re-implement the record grammar inside it: a hand-rolled copy tried in #3426 invented
            classes the engine rejects. Inject the host's reader and writer instead, as `classOf` does), docs/src/pages/libraries/lente/index.astro
            (the demo page's inline deck and its class read, allowlisted in test/unit/core/directive-regex-readers.test.js
            as reading its own literals).
done when — Lente writes the lens tag in the record form the cut keeps, its readers read it, and the demo page's deck is
            written that way; the directive-regex-readers allowlist drops the Lente entry if its regex goes.
