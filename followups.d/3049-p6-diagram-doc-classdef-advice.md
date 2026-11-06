---
origin: 3049
priority: P6
recorded: 2026-11-06
area: diagram
severity: low
swimlane: design/skills/diagram.md
deferred: off-path — lib/components/diagram docs; this PR adds skills, not diagram behavior
source: https://github.com/Laticent/lattice/pull/3049
---

# diagram.docs.md tells authors to highlight a node with Mermaid classDef, which cannot work

why now   — backlog.d/1973.md records that a classDef with var() is a parse error and one with hex is off-palette. The
            new diagram skill steers authors away; the component doc still recommends it.
where     — lib/components/diagram/diagram/ manifest or docs source (the .docs.md is generated: edit the source).
done when — the generated diagram.docs.md no longer recommends classDef, or #1973 lands a working highlight.
evidence  — the regenerated doc.
verify    — tier 1.
