---
origin: 2451
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2451
---

# Decide which three themes are the featured set, and what happens to the rest

why now   — the owner is considering featuring only three themes. The 2026-09-28 evaluation
            (14 base themes, a11y and the print mode excluded) ranked onyx 89, cuoio 84,
            indaco 81, carbone 73 (84.9 on the scorecard after #2451), then concrete 70,
            crepuscolo 69, laguna 68, burgundy 66 and the rest at 58-62. Five themes reuse
            another theme's chart cycle: carta = indaco (verbatim, per its header), mustard and
            atelier ~ cuoio, brina and ardesia ~ laguna, magnolia ~ burgundy.
where     — `tier` / `order` in themes/*.manifest.json (the palette picker reads them via
            `npm run theme-catalog:build`), themes/README.md's list, and the Studio picker.
done when — the owner has picked the three (recommendation: onyx, cuoio, indaco; carbone if a
            dark-first tech face is wanted) and said whether the others move to `tier: more`,
            stay, or are retired; the manifests and README match that decision.
evidence  — the picker screenshot via tools/screenshot.js at 1440/820/390 showing the new
            grouping; `npm run theme-catalog:check` green.
verify    — tier 0 gates, because it is manifest data and docs; this is an owner decision
            first (shared state other sessions read), so put the options to the owner before
            editing anything.
