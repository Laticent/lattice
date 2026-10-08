---
origin: 2612
priority: P3
recorded: 2026-10-08
area: docs
severity: medium
swimlane: engineering/decisions/2026-10-08-spec-audit.md
source: https://github.com/Laticent/lattice/pull/2612
---

# LFM 1.1: document the front-matter settings, the inline notation and the _lens tag

why now   — spec audit §4.2 and §6 step 4. LFM 1.0 names two front-matter keys; decks use about
            two dozen, plus pills, sparks, icons and _lens tags. Needs the shared test cases first
            (2612-p2-lfm-shared-test-cases.md).
where     — spec/LFM-1.0.md → LFM 1.1; lib/base/base.registers.docs.md; the Segno notation
            (docs/src/lib/segno/README.md); docs/src/lib/lente/tags.ts.
done when — every documented setting and notation form has at least one shared test case.
evidence  — the conformance runner covers each new section.
verify    — tier 1 checker, because it is the public contract outside tools implement.
