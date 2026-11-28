---
origin: 3563
priority: P2
recorded: 2026-11-27
area: engine
severity: high
swimlane: engineering/decisions/2026-10-17-meta-record.md §15
deferred: blocked — the owner chose its own PR, right after #3563 merges (2026-11-27)
source: https://github.com/Laticent/lattice/pull/3563
---

# One @meta record per slide, no `carry`, and a bare layout word

why now   — The owner's rulings of 2026-11-27, given in session_015KSkL6HUaJeocW8cKLdNWo:
            (1) A slide holds ONE record. With two, the LAST wins outright and the earlier one applies nothing;
                lint warns on the earlier one, and its fix removes it. Measured today: two records MERGE by field
                (`@meta{layout=kpi}` then `@meta{footer=Q3}` applies both), and only a repeated field warns
                (`meta-class-overridden`).
            (2) `carry` is retired. A front-matter value is the deck-wide default; a slide's record overrides it
                for that slide only. No deck uses `carry` (5 of 4,292 shipped records do today). Lint flags `carry`
                with a fix that copies the fields onto each slide it reached, so a deck renders the same after the fix.
                The Marp export sets Marp's global values and overrides them per slide (or writes header and footer
                on each slide), so Marp renders what Lattice renders.
            (3) A bare FIRST word that is a component name means `layout=`: `<!-- @meta{kpi, footer=Q3} -->`.
                Today it is `meta-unknown-key` and the slide gets the default layout. Autocomplete offers the
                component list right after `@meta{`; every writer (migration, Compose, the AI prompts) writes the
                short form; `layout=` keeps working.
where     — lib/core/meta-door.mjs (`readRecord`: the bare first word; `carry`), lib/engine/slides.js
            (`lattice_meta_expand` and `lattice_directives`: last record wins, no carry), lib/authoring/lint-core.js
            (the two new findings and their fixes), lib/authoring/meta-migrate.mjs (one record per slide, no `carry`),
            lib/core/meta-door.mjs `recordsToComments` and the Export-to-Marp path (global values plus per-slide
            overrides), docs/src/playground/grammar-vocab.js and context-sources.js (completion), the Compose
            settings writer, spec/LFM-1.0.md §2.3, the record note, the skills and docs, and a demo deck (HARD RULE #9).
done when — A slide with two records renders the last one only and lints the first with a removing fix;
            `carry` sets nothing beyond its slide and lints with a copying fix; `@meta{kpi}` renders `kpi`; the
            Marp export of a deck with a front-matter footer and one overriding slide renders the same in marp-cli;
            no shipped deck uses `carry` or two records on a slide.
evidence  — the identity proof (test/integration/invariants/meta-record-identity.test.js) still green; a corpus
            census of records per slide and `carry` uses, before and after; the demo deck's PDF in dark and light.
verify    — lint:deck --fix on a deck with two records and a `carry`; Compose's settings panel and the Source
            editor's completion on the real Studio; marp-cli on the exported bundle.
