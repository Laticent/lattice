---
origin: 2687
priority: P8
recorded: 2026-10-14
area: website
severity: low
swimlane: engineering/decisions/2026-10-14-plugin-inline-door.md §4.5
source: https://github.com/Laticent/lattice/pull/2687
---

# Compose: a kind with a declared slot opens the generated panel

why now   — step 4 of the inline door, not built in #2687: Compose builds a panel from a Segno slot schema for pills
            and sparks (2026-10-13-compose-inline-notation-editors.md §5, B1); a zip kind declares the same schema, so it
            can have the same panel. It joins Compose's Insert menu when that menu exists (its phase 3). Update 2026-10-21: the Insert menu and a generic
            slot-schema writer (`lib/core/segno-edit.js`) now exist; what is left is `kindOf` reading `@kind{…}` and a generic panel
            built from a zip kind's `slot` (`engineering/decisions/2026-10-21-compose-point-and-click.md` §4 and §7).
where     — lib/authoring/inline-editors.js, docs/src/lib/compose/inline-objects.ts (`kindOf`, `isObjectSource` do not
            read `@kind{…}` yet), the Studio's zip plugin records (`kinds[].slot`).
done when — an `@kind{…}` span of a listed plugin with a slot opens a panel in Compose whose write-back changes only the
            edited words, and the named form of the built-ins (`@spark{…}`) opens the same panel as its alias.
evidence  — a Compose unit arm and the real Studio at 1440, 820 and 390.
verify    — tier 1 checker.
