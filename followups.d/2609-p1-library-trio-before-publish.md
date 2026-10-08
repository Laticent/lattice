---
origin: 2609
priority: P1
recorded: 2026-10-08
area: engine
severity: high
swimlane: engineering/decisions/2026-10-08-library-audit.md
source: https://github.com/Laticent/lattice/pull/2609
---

# Run the adversarial trio on LTT, Segno and Trama before their first npm version

why now   — owner ruling 2026-10-08 (library audit §6). None of the three has had the full trio
            over its code as a whole: LTT's trio reviewed its design note, Segno's review had no
            inversion, and Trama's two trios each reviewed one change (audit §3, row 7). They
            publish in 1.0 as dependencies of @laticent/lattice, and an npm version number can
            never be reused.
where     — docs/src/lib/ltt/, docs/src/lib/segno/, docs/src/lib/trama/; the shape of
            engineering/decisions/2026-07-18-library-adversarial-trio-backlog.md.
done when — each library has a trio verdict recorded in a decision note, and every finding on the
            published API is fixed or ruled on before slice E of 2026-10-07-first-npm-release.md.
evidence  — the decision note, with the findings and what happened to each.
verify    — the trio itself (HARD RULE #25); 9 agents, owner-approved 2026-10-08.
