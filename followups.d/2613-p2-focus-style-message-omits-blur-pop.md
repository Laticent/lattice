---
origin: 2613
priority: P2
recorded: 2026-10-08
area: engine
severity: low
swimlane: spec/diagnostics.md
source: https://github.com/Laticent/lattice/pull/2613
---

# focus-style's message and fix name three styles; the linter accepts five

why now   — found by the registry checker on #2613. FOCUS_STYLES (lib/authoring/lint-core.js ~149)
            is spotlight, ring, list-fill, blur, pop, but the finding's message and fix (~4894-4896)
            say "is not spotlight | ring | list-fill" and "Use one of: spotlight, ring, list-fill",
            so an author is never told blur and pop exist.
where     — lib/authoring/lint-core.js focus-style finding; build the list from FOCUS_STYLES.
done when — the message and fix list every member of FOCUS_STYLES, from the set itself.
evidence  — a unit test that a typo'd style's finding names all five.
verify    — tier 0 gates.
