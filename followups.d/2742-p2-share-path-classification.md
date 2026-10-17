---
origin: 2742
priority: P2
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-15-conformance-harness.md
---

# tools/conformance-render.js changedComponents and tools/player-contrast-select.js classify changed paths with separate rules

why now   — two copies of "which paths can change a rendered component" drift apart; HARD RULE #15. They could not be shared while #2729 was unmerged (#17).
where     — tools/conformance-render.js changedComponents; tools/player-contrast-select.js selectGalleries and NON_RENDER
done when — one module exports the classification and both tools import it; the existing unit arms of both pass unchanged
evidence  — tier 0: test/unit/tools/player-contrast-select.test.js and the conformance unit tests
verify    — tier 0 gates, because the selector defaults to "all galleries" for unknown paths, so a merge only widens a selection
