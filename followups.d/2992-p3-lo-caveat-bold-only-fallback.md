---
origin: 2992
priority: P3
recorded: 2026-11-03
area: engine
severity: low
swimlane: engineering/decisions/2026-11-01-icon-font.md
deferred: off-path — a pre-existing font-embedding defect (same render from main at 117ddbd), in Calco's font table, not in the icon or text-split path this PR changes
source: https://github.com/Laticent/lattice/pull/2992
---

# LibreOffice draws a sketch heading in a fallback sans, and it wraps onto its rule

```text
  P3 · [no ticket] make LibreOffice draw an editable PPTX's Caveat heading in Caveat
       why now   — examples/inline-icons.md slide 8 (a `_class: sketch` slide): the title is a Caveat bold run
                   in a wrap="none" box sized for Caveat. Calco embeds Caveat as a BOLD face only (no regular),
                   and LibreOffice draws the run in a wider fallback sans, so "hand." wraps onto the heading's
                   rule. Rendered the same from main at 117ddbd, so it predates PR 2992.
       where     — docs/src/lib/calco/fonts.ts (which faces are embedded, and under which family slot)
       done when — a LibreOffice render of a sketch slide's heading uses Caveat and stays on one line, or the
                   embedding is shown to be right and the fallback is LibreOffice's own (then documented).
       evidence  — a LibreOffice render of examples/inline-icons.md slide 8, before and after.
       verify    — tier 1 checker.
```
