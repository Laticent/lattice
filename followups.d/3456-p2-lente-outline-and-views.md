---
origin: 3456
priority: P2
recorded: 2026-11-23
area: engine
severity: medium
swimlane: engineering/decisions/2026-07-13-lente-reader-lenses.md
deferred: large — post-1.0 direction set by the owner on 2026-11-23; a new subsystem that changes how the Studio, the CLI export and the chat read a deck, and CLAUDE.md "Design-before-code" requires a design note and an owner round first
source: https://github.com/Laticent/lattice/pull/3456
---

# Grow Lente into the deck's outline and its logical and physical views

why now   — The owner ruled on 2026-11-23: "lente will become more than it is today including being
            able to host outline and slice and dice a deck into views logically and physically (we
            have had trouble with this and the export)". Lente publishes with 1.0.0 as reader lenses
            only (approved slide subsets). The growth is post-1.0.
where     — Three jobs, as the ruling names them:
            (1) Host the outline: the deck's slide list, ids and order. Today that lives in
                docs/src/lib/deck-outline/ and docs/src/components/studio/deck-ops.ts, with about a
                dozen separate slide splitters elsewhere. followups.d/3287-p1-lente-slide-spine.md
                already scopes this part (the "slide spine"); this item is the wider direction it sits in.
            (2) Logical views: which slides a reader sees. Lente's lenses do this today
                (docs/src/lib/lente/project.ts). Ranges, sections and the chat's read are not views yet.
            (3) Physical views: how one logical slide becomes pages. Today the export counts its own
                pages (`split:` headings, on-screen splitting, hidden slides) apart from the editor, which
                is the export trouble the owner names. lib/core/slide-boundaries.mjs is where the CLI
                and the Studio already share boundaries.
done when — A design note, written before any code, names the axes (where Lente lives given the CLI
            needs it under HARD RULE #1; logical versus physical views; who owns page splitting; how
            approval hashes survive the change), lists candidate moves, recommends one, and the owner
            picks in one round. It then states the slices, each of which deletes what it replaces.
evidence  — The note cites the export cases that went wrong (lint, render and export disagreeing on
            slide or page numbers) and a test for each.
verify    — Adversarial trio on the design (HARD RULE #25): it changes a shared engine kernel.
