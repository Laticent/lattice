---
origin: 2711
priority: P2
recorded: 2026-10-15
area: docs
severity: low
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §3.5
---

# design/skills/theme.md tells authors to edit a list that is now derived

why now   — An author or agent following the theme skill edits a THEMES array that no longer exists as a hand list.
where     — design/skills/theme.md:337; test/unit/palette/token-parity.test.js:34 (baseThemeNames())
done when — the skill describes the derived list, or says nothing needs adding
evidence  — token-parity.test.js derives THEMES from baseThemeNames()
verify    — grep -n THEMES design/skills/theme.md test/unit/palette/token-parity.test.js
