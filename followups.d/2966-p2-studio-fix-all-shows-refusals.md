---
origin: 2966
priority: P2
recorded: 2026-10-29
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-squadra-lint-library/design.md §15.4
deferred: off-path — a Studio UI change (the Fix-all result surface), not the fix path this PR moved
source: https://github.com/Laticent/lattice/pull/2966
---

# The Studio's "Fix all" does not say which fixes the driver refused

why now   — "Fix all" now runs through Squadra's driver, which refuses a fix that would change the slide
            count, drop the front matter undeclared, or not resolve its finding, and reports each refusal
            with a reason (`fixAllDetailed().skipped`). `lint:deck --fix` prints them; the Studio and the
            Playground show only the fixed text, so a refused fix leaves its underline and no explanation.
            The fix diff found no refusal on 61,720 sources, so this is rare, not routine.
where     — docs/src/components/studio/Editor.tsx (the `applyAllFixes` call near "Fix all"),
            docs/src/playground/editor.js; lint-core `fixAllDetailed`.
done when — after "Fix all", each refused fix is named in the editor (a toast or the issue list) with its
            reason, on desktop, tablet and phone.
evidence  — screenshots at 1440, 820 and 390 px of a deck with a refused fix.
verify    — tier 1 checker; Playwright on the Studio.
