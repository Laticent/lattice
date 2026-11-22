---
origin: 3042
priority: P1
recorded: 2026-11-15
area: engine
severity: low
swimlane: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §7 step 4, §12
deferred: large — the first slice (23 single-value registers) landed in its own commit; the rest read several values, several lines or a structured vocabulary, each its own port with fixtures, and want the vocab bridge to carry the register axes
source: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md
---

# Step 4, first family: the rest of the front-matter rules

why now   — §12 landed the family's shape (one table of rows over `fm-key`, lib/authoring/rules/front-matter/) with the
            23 single-value registers, reference diff at 0. What is left of the family reads more than one value or
            more than one line, so each needs its own reading, and several need a structured vocabulary the bridge
            does not carry yet (`marksAxes`, `cardTagAxes`, the plugin and logo-finish axes, `typographyNames`).
where     — lint-core.js, each still to move to lib/authoring/rules/front-matter/:
            `findUnknownMarks` + `findMarksRenamed` (`marks:`, `chart-finish:`), `findRetiredBackdrop` +
            `findUnknownBackdrop`, `findUnknownCardTag` (`tag:`), `findUnknownAxisRegister` (the plugin registers,
            `image-card`, `logo-finish`, `progress-rail`, `agenda`), `findRetiredLogoKeys`, `findFitRegister`
            (`fit:` and `guards:`), `findRefusedDeckClass` + `findRetiredDeckSwitch` (the deck `class:`),
            `findBookendIssues` (`greeting:`, `closing:`, `lang:`), `findBadRenderTargetValues` +
            `findNestedRenderTargetKeys`, `findUnknownSettingKeys` (with `duplicate-key`), `findUnknownSettingValues`,
            `findUnknownImagesWords`, `findUnknownFontsWords`, `findFontsRenamed`, `findTypographyStyleOverride`.
done when — each is a `deck/` rule reading `fm-key` or a deck fact, its fixtures pass the strict build, and
            `npm run squadra:reference-diff -- --fix` holds the family at 0 or every difference is explained.
evidence  — the reference-diff report (lint and fix) in the PR body, with the count of sources the fix diff compared.
verify    — maker-checker on the family commit (the plan's tier for a family).
