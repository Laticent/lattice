---
origin: 3159
priority: P1
recorded: 2026-11-12
area: website
severity: medium
swimlane: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md §6
deferred: blocked — waits on #3152, which adds the spec's gecko registration and the draw-host fixes the case needs
source: https://github.com/Laticent/lattice/pull/3159
---

# Make the offline diagram case honest on gecko once #3152 lands

why now   — #3159 fixed the product; the spec change can only land on top of #3152 (the coordinator asked for it in #3159, not #3152)
where     — docs/e2e/studio-warm-offline.spec.ts "a diagram never rendered online draws offline"; followups.d/3152-p2-gecko-srcdoc-offline.md; #3152's entry in engineering/gotchas/browser-engine.md
done when — the case focuses the editor (Playwright's mouse hangs offline on Gecko) and reads the live frame through page.evaluate (a contentFrame() locator does not follow the re-inserted frame); the gecko fixme comes off; #3152's follow-up 3152-p2 and its gotcha entry are removed in favor of #3159's
evidence  — #3159 body: with that exact assertion and the Playwright patch, gecko, desktop and webkit-tablet 10/10 alone and under load; gecko red 3/3 with the fix reverted
verify    — cd docs && npx playwright test e2e/studio-warm-offline.spec.ts --grep 'never rendered online' --project=gecko --retries=0 --repeat-each=10
