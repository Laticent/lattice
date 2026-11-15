---
origin: 3222
priority: P3
recorded: 2026-11-15
area: theming
severity: low
swimlane: engineering/decisions/2026-11-15-one-side-pane.md §3b
deferred: large — a new generated token, applied to every selected control in the Studio at once
source: https://github.com/Laticent/lattice/pull/3222
---

# Selected chips carry the brand accent (option D)

why now   — The owner's ideal selected look is the ink chip with a brand-accent label (gold on ink in Cuoio). The
            label has to be the OTHER mode's accent: the same-mode accent fails 4.5:1 in all 36 palette × mode
            combinations. Measured in the live Studio, the opposite-mode accent passes in all 36 (min 4.81:1) and
            shows in 19; the rest fall back to `--bg`, which is exactly what PR 3222 shipped (option B).
where     — the site token generator (lattice-tokens.generated.css), BarIcon in chrome-parts.tsx, PostureDial,
            PillTabs, the Compose/Source toggle, the Basic/Advanced toggle.
done when — one generated token (e.g. `--accent-on-inverse`) carries the opposite-mode accent where it clears
            4.5:1 against `--text-heading`, else `--bg`; every selected control uses it; a test sweeps all 36.
evidence  — the "Selected-State Options" artifact (option D) and its 36-combination matrix.
verify    — tier 1 sweep of 36 combinations plus light and dark screenshots of each control.
