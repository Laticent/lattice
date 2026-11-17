---
origin: 3287
priority: P1
recorded: 2026-11-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-17-architect-tools-agent-readiness.md §8
deferred: large — a new shared subsystem that replaces about a dozen slide splitters; it needs its own design note and an owner round first
source: https://github.com/Laticent/lattice/pull/3287
---

# A slide spine in Lente: one owner of "what are this deck's slides"

why now   — The agent-readiness audit (PR 3287) needs stable slide identity for the chat's tools,
            and found the deck is cut into slides by about a dozen separate functions that
            disagree on numbering. The repo says so itself: `rehearsal.js` ("the index spaces
            STILL do not line up") and `class-directive-scan.mjs` ("slide NUMBERING diverges from
            the renderer's"). The owner proposed (2026-11-17) one spine, preferably in Lente, that
            owns slide boundaries, ids, order, on-screen splitting, hidden slides and lens
            membership; makes every structural edit (insert, delete, move, duplicate); and hands
            out views (a lens, a range, an export, the chat's read) to the Studio, the CLI export
            and the chat alike, as the deck's one state machine.
where     — Existing parts to gather behind it: `docs/src/lib/deck-outline/` (ids that survive
            edits, incremental re-parse), `docs/src/components/studio/deck-ops.ts` (byte-preserving
            structural edits), `docs/src/lib/lente/` (views), `lib/core/slide-boundaries.mjs`
            (boundaries the CLI shares). Splitters to replace: `splitSlides` in review-core,
            slice-equivalence-core, coach-core and deck-lint; `deckSlides` (architect-agent);
            `splitTopLevel` / `sliceSlide` (architect-edits); the four `slideCount`s;
            `splitSlideChunks`; `buildDeckIndex` (some may already delegate; not traced).
done when — A design note settles three forks with the owner in one round: (1) where it lives, given
            the CLI needs it too (HARD RULE #1), so likely Lente's core moved to `lib/`; (2) whether
            slide ids are written into the file or stay in memory for the session (recommended:
            memory, with every per-slide fact stored inside its slide); (3) whether a view owns
            page splitting, so the export stops counting on its own. Then the slices land in the
            note's order, each deleting the splitters it replaces.
evidence  — The count of splitters before and after, and one test per former disagreement (lint,
            render and narration agree on a deck with `split: headings` and a hidden slide).
verify    — Adversarial trio on the design (HARD RULE #25): it changes a shared engine kernel.
