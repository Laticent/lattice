---
origin: 2983
priority: P1
recorded: 2026-11-04
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-22-segno-deck-pipeline.md §Plan
deferred: blocked — needs Segno deck pipeline P2, a new parser stage that no session, PR, issue or follow-up schedules
source: https://github.com/Laticent/lattice/pull/2983
---

# Build Segno deck pipeline P2: `deckModel(source)`, so Squadra's M1b and spine S3 can start

why now   — Two plans on `main` wait on P2, and nothing tracks P2 itself. Squadra's M1b
            (`2026-10-26-squadra-lint-library.md` §M1b waits on the deck pipeline) needs P2's block pass
            for `lattice-deck`, then P3's front-matter and directive islands. The security spine's census rule
            (`2026-11-03-security-findings-spine.md` §4) allowlists lint-core's Markdown image regexes "until
            the deck pipeline's P4". Every Segno brief since 2026-10-29 has scheduled R3, R4 and the spine
            instead, and the pipeline's P2 to P4 are still unbuilt at `65f11fef`. This item is P2 alone.
where     — The pipeline note's P2 row: S0 and S1 for CommonMark. It replaces `slide-boundaries.mjs`,
            `boundary-parser.mjs`, `section-source-split.js` and the Studio deck outline's markdown-it
            boundary reader (`docs/src/lib/deck-outline/deck-outline.ts`).
done when — `deckModel(source)` exists on `main` and returns slides, boundaries, front matter, directive and
            fence ranges and leaf ranges, with incremental re-parse; and the readers the P2 row lists read
            from it.
evidence  — the pipeline note's §Acceptance for CommonMark: the corpus differential against markdown-it
            shows 0 boundary differences, and the speed matches the targets in its §Speed targets.
verify    — tier 2, the adversarial trio: it replaces how every surface splits a deck into slides.
