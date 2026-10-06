---
origin: 2532
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2532
---

# Studio PDF export: inline pills overlap their label on the KPI slide

why now   — found during the #2532 export sign-off. On slide 4 of examples/studio-present.md
            (`_class: kpi`), the `OPS` / `GAP` pills draw over the end of the caption text
            ("…EVERY QUARTER", "…RE-DOING CHROME") in the exported PDF, in both light and dark.
            The plain export has it too, so #2532 did not cause it: the embed step never
            touches page content.
where     — Studio PDF export of inline pills (shared pdf-compose writer); compare against the
            live preview to see whether the capture or the layout is at fault.
done when — the exported PDF shows the pill after its caption text, matching the preview.
evidence  — page 4 of a Share → PDF export of examples/studio-present.md.
verify    — pdftoppm page 4 and look; check light and dark.
