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

why now   — owner ruling 2026-10-08 (library audit §6). No decision note records a library-level
            red team, inversion and checker pass for these three, and they publish in 1.0 as
            dependencies of @laticent/lattice. A published version cannot be taken back.
where     — docs/src/lib/ltt/, docs/src/lib/segno/, docs/src/lib/trama/; the shape of
            engineering/decisions/2026-07-18-library-adversarial-trio-backlog.md.
done when — each library has a trio verdict recorded in a decision note, and every finding on the
            published API is fixed or ruled on before slice E of 2026-10-07-first-npm-release.md.
evidence  — the decision note, with the findings and what happened to each.
verify    — the trio itself (HARD RULE #25); 9 agents, owner-approved 2026-10-08.
