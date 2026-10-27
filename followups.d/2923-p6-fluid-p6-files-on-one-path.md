---
origin: 2923
priority: P6
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P6
---

# Fluid P6: PDF and PPTX on the connector with budget rescue; delete the string path and token-level panes

why now   — until files use the connector, there are two paginators; the deletion table in §8 ends here.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P6.
done when — PDF/PPTX plan on the slide box (never the --paper sheet); a cold-font and a warm-font render give identical page hashes; the Node string assembly and installPaneSplit are deleted and SANCTIONED_PAGINATORS holds only the core and the connector; one box selector; owner signed off dark and light renders.
evidence  — the reproducibility arm and the export artifacts.
verify    — npm run build:check; the gate named in the §8 row for P6.
