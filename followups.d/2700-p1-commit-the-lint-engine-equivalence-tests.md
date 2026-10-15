---
origin: 2700
priority: P1
recorded: 2026-10-15
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-14-engine-spine.md §10
source: https://github.com/Laticent/lattice/pull/2700
---

# Commit the lint/engine equivalence checks as integration tests

why now   — #2700's proof that the shared build is safe ran from .scratch/ only: lint parity
            between esm/lint.js and authoring-core.generated.js (1,112 runs, 278 decks, perturbed
            copies, math on/off) and engine isolation (engine.js + lint.js in one realm, 0 of 279
            changed; a shared-parser control build changed 2). assertLintParserIsolated pins the
            module graph; nothing pins the behavior, so a future shared singleton would pass.
where     — test/integration/ (needs the built docs/public/playground/esm/), the scratch scripts
            described in the note §10; build the control (shared-parser) variant in the test.
done when — both checks run in the integration tier, the control arm proves each can fail, and
            the tier's wall clock grows by under ~2 minutes (measure it).
evidence  — the test output, plus a mutation: drop the lint's own parser and watch it go red.
verify    — tier 1 checker, because it adds a gate's finding on a shared kernel.
