---
origin: 2612
priority: P3
recorded: 2026-10-08
area: docs
severity: medium
swimlane: engineering/decisions/2026-10-08-spec-audit.md
source: https://github.com/Laticent/lattice/pull/2612
---

# Write the theme contract and the .lattice file as public specs in spec/

why now   — owner ruling 2026-10-08 (spec audit §8.1) made both public. Today the theme contract is
            prose in design/theming.md and the .lattice file is defined in code and decision notes (2026-06-16, 2026-10-05).
where     — design/theming.md and themes/theme.schema.json → spec/THEME-1.0.md;
            docs/src/components/studio/lattice-file.ts, lib/core/reopenable.js,
            2026-06-16-lattice-export-format.md, 2026-10-05-reopenable-exports.md → spec/LATTICE-FILE-1.0.md; shared test cases for each.
done when — both are in spec/ with the four parts and an Owner line, and published on the site.
evidence  — /spec/ pages screenshotted; the shared test cases run in the unit tier.
verify    — tier 1 checker, because publishing freezes token names and the file shape.
