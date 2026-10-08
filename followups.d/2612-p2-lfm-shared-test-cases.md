---
origin: 2612
priority: P2
recorded: 2026-10-08
area: engine
severity: high
swimlane: engineering/decisions/2026-10-08-spec-audit.md
source: https://github.com/Laticent/lattice/pull/2612
---

# Start LFM's shared test cases, then ratify LFM 1.0 as the core it describes

why now   — spec audit §6 step 3. LFM has no conformance cases, so it cannot be brought up to
            date safely; the owner ruled (2026-10-08) that 1.0 ratifies as today's small core.
where     — a new spec/conformance/lfm/ (or similar) folder of small decks, each with its
            expected structure (slide classes, slots); a runner against the engine; spec/LFM-1.0.md
            status line and §8 ("forthcoming").
done when — a first set covers LFM §2–§3, the runner is in the unit tier, and LFM 1.0 is marked
            ratified with an Owner line.
evidence  — the runner's output, and a failing arm (a deck whose expected structure is wrong).
verify    — tier 1 checker, because it fixes what "conformant LFM" means for outside tools.
